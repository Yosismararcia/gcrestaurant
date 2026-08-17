import csv
import json
import os
import unicodedata
import urllib.request
from datetime import date, datetime

from flask import Flask, Response, jsonify, render_template, request, send_from_directory, session

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
BANNERS_DIR = os.path.join(ROOT, "banners")
VENTANA_ALERTA_DIAS = 5
MARCAJE = 2.6

app = Flask(
    __name__,
    static_folder=os.path.join(ROOT, "static"),
    template_folder=os.path.join(ROOT, "templates"),
)
app.secret_key = os.environ.get("SECRET_KEY", "gc-restaurant-secret-dev")

ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "admin123")

_CACHE_IMAGENES = {}


def _norm(texto):
    if not texto:
        return ""
    texto = unicodedata.normalize("NFKD", str(texto).lower())
    return "".join(c for c in texto if not unicodedata.combining(c)).strip()


def _dias_para(fecha):
    if not fecha:
        return 9999
    try:
        f = datetime.strptime(fecha, "%Y-%m-%d").date()
        return (f - date.today()).days
    except (ValueError, TypeError):
        return 9999


def _a_numero(valor):
    try:
        return int(float(str(valor).replace("%", "").strip()))
    except (ValueError, TypeError):
        return 0


def _parse_ingredientes(raw):
    ingredientes = {}
    for parte in (raw or "").split("|"):
        parte = parte.strip()
        if not parte:
            continue
        if ":" in parte:
            nombre, cantidad = parte.rsplit(":", 1)
            try:
                ingredientes[_norm(nombre)] = float(cantidad)
            except ValueError:
                continue
        else:
            ingredientes[_norm(parte)] = 1.0
    return ingredientes


def _cargar_promociones():
    ruta = os.path.join(DATA_DIR, "promociones.csv")
    filas = []
    with open(ruta, encoding="utf-8", newline="") as archivo:
        lector = csv.DictReader(archivo)
        for fila in lector:
            filas.append(
                {
                    "plato": fila.get("Nombre del plato", "").strip(),
                    "descuento": _a_numero(fila.get("Descuento")) or 0,
                    "dias": fila.get("Días aplicables", "").strip(),
                    "descripcion": fila.get("Descripcion corta", "").strip(),
                    "categoria": fila.get("Categoría", "").strip() or "Menu",
                    "imagen": fila.get("Imagen", "").strip() or "",
                    "ingredientes": _parse_ingredientes(fila.get("Ingredientes", "")),
                }
            )
    return filas


def _leer_json(nombre, por_defecto):
    ruta = os.path.join(DATA_DIR, nombre)
    try:
        with open(ruta, encoding="utf-8") as archivo:
            return json.load(archivo)
    except (FileNotFoundError, json.JSONDecodeError):
        return por_defecto


def _cargar_inventario():
    return _leer_json("inventario.json", {"insumos": []}).get("insumos", [])


def _cargar_banners():
    return _leer_json("banners.json", {"generados": []}).get("generados", [])


def _cargar_contenido():
    return _leer_json("contenido.json", {"copy": {}, "especial": {}})


def _cargar_visibilidad():
    return _leer_json("visibilidad.json", {"promos_ocultas": [], "banners_ocultos": []})


def _guardar_visibilidad(visibilidad):
    try:
        ruta = os.path.join(DATA_DIR, "visibilidad.json")
        with open(ruta, "w", encoding="utf-8") as archivo:
            json.dump(visibilidad, archivo, ensure_ascii=False, indent=2)
    except OSError:
        return


def _normalizada_en(lista, valor):
    return _norm(valor) in {_norm(x) for x in lista}


def _guardar_inventario(insumos):
    try:
        ruta = os.path.join(DATA_DIR, "inventario.json")
        with open(ruta, "w", encoding="utf-8") as archivo:
            json.dump(
                {"ultima_actualizacion": date.today().isoformat(), "moneda": "PEN", "insumos": insumos},
                archivo,
                ensure_ascii=False,
                indent=2,
            )
    except OSError:
        return


def _con_api_protegida():
    if not session.get("admin"):
        return False
    return True


def _precio_de(promo, mapa_insumos):
    costo = 0.0
    for nombre, cantidad in promo.get("ingredientes", {}).items():
        insumo = mapa_insumos.get(nombre)
        if insumo:
            costo += cantidad * float(insumo.get("costo_unitario", 0))
    if costo <= 0:
        return None, None
    base = costo * MARCAJE
    final = base * (1 - float(promo.get("descuento", 0)) / 100)
    return round(base, 2), round(final, 2)


def _decorar_inventario(insumos):
    for insumo in insumos:
        insumo["dias_para_caducar"] = _dias_para(insumo.get("fecha_caducidad"))
        insumo["critico"] = 0 <= insumo["dias_para_caducar"] <= VENTANA_ALERTA_DIAS
        insumo["vencido"] = insumo["dias_para_caducar"] < 0
        insumo["valor_linea"] = round(float(insumo.get("stock", 0)) * float(insumo.get("costo_unitario", 0)), 2)
    return insumos


# ============================================================
#  VISTAS
# ============================================================
@app.route("/")
def portada():
    return render_template("portada.html")


@app.route("/cliente")
def vista_cliente():
    return render_template("cliente.html")


@app.route("/admin")
def panel_admin():
    return render_template("admin.html")


# ============================================================
#  API PÚBLICA (solo lo que el cliente debe ver: promociones)
# ============================================================
@app.route("/api/datos")
def api_datos():
    promos = _cargar_promociones()
    insumos = _cargar_inventario()
    visibilidad = _cargar_visibilidad()
    mapa = {_norm(i["nombre"]): i for i in insumos}

    publicas = []
    for p in promos:
        if _normalizada_en(visibilidad.get("promos_ocultas", []), p["plato"]):
            continue
        base, final = _precio_de(p, mapa)
        publicas.append(
            {
                "plato": p["plato"],
                "descuento": p["descuento"],
                "dias": p["dias"],
                "descripcion": p["descripcion"],
                "categoria": p["categoria"],
                "imagen": p["imagen"],
                "precio_base": base,
                "precio_final": final,
            }
        )

    banners = [b for b in _cargar_banners() if not _normalizada_en(visibilidad.get("banners_ocultos", []), b.get("id", ""))]
    contenido = _cargar_contenido()
    especial_publico = {
        clave: {
            "plato": e.get("plato", clave),
            "imagen": e.get("imagen", ""),
            "inspirado_en": e.get("inspirado_en", []),
            "fecha": e.get("fecha", ""),
        }
        for clave, e in contenido.get("especial", {}).items()
    }

    return jsonify(
        {
            "proyecto": "G&CRestaurant",
            "promociones": publicas,
            "banners": banners,
            "contenido": {"copy": contenido.get("copy", {}), "especial": especial_publico},
            "resumen": {"total_promociones": len(publicas), "total_banners": len(banners)},
        }
    )


# ============================================================
#  AUTENTICACIÓN DE ADMINISTRADOR
# ============================================================
@app.route("/api/sesion")
def api_sesion():
    return jsonify({"admin": _con_api_protegida()})


@app.route("/api/login", methods=["POST"])
def api_login():
    datos = request.get_json(silent=True) or {}
    if datos.get("usuario") == ADMIN_USER and datos.get("password") == ADMIN_PASS:
        session["admin"] = True
        return jsonify({"ok": True, "usuario": ADMIN_USER})
    return jsonify({"ok": False, "error": "Credenciales inválidas."}), 401


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.pop("admin", None)
    return jsonify({"ok": True})


# ============================================================
#  API DE ADMINISTRADOR (inventario, recetas y avisos)
# ============================================================
@app.route("/api/admin/datos")
def api_admin_datos():
    if not _con_api_protegida():
        return jsonify({"ok": False, "error": "Acceso no autorizado."}), 401

    promociones = _cargar_promociones()
    insumos = _decorar_inventario(_cargar_inventario())
    visibilidad = _cargar_visibilidad()
    banners = _cargar_banners()

    for p in promociones:
        p["oculta"] = _normalizada_en(visibilidad.get("promos_ocultas", []), p["plato"])
    for b in banners:
        b["oculto"] = _normalizada_en(visibilidad.get("banners_ocultos", []), b.get("id", ""))

    criticos = sorted(
        [i for i in insumos if i.get("critico") or i.get("vencido")],
        key=lambda x: (x.get("vencido"), x.get("dias_para_caducar")),
    )
    valor_total = round(sum(float(i.get("valor_linea", 0)) for i in insumos), 2)

    return jsonify(
        {
            "proyecto": "G&CRestaurant · Panel admin",
            "fecha": date.today().isoformat(),
            "ventana_alertas": VENTANA_ALERTA_DIAS,
            "promociones": promociones,
            "inventario": insumos,
            "banners": banners,
            "contenido": _cargar_contenido(),
            "resumen": {
                "total_promociones": len(promociones),
                "total_insumos": len(insumos),
                "insumos_criticos": len(criticos),
                "valor_inventario": valor_total,
            },
            "especiales": criticos,
        }
    )


@app.route("/img")
def proxy_imagen():
    """Proxy de imágenes (Wikimedia) con caché en memoria.

    Permite dibujar las fotos en el canvas del flyer sin depender de CORS
    ni de límites de velocidad de Wikimedia desde el navegador.
    """
    url = request.args.get("url", "").strip()
    permitida = (
        url.startswith("https://commons.wikimedia.org/")
        or url.startswith("https://upload.wikimedia.org/")
    )
    if not permitida:
        return "Fuente no permitida", 400

    datos = _CACHE_IMAGENES.get(url)
    if datos is None:
        try:
            _req = urllib.request.Request(
                url,
                headers={"User-Agent": "GCRestaurant/1.0 (pedidos@crestaurant.local)"},
            )
            with urllib.request.urlopen(_req, timeout=15) as r:
                datos = r.read()
        except Exception:
            return "No se pudo obtener la imagen", 502
        _CACHE_IMAGENES[url] = datos

    base = url.split("?")[0].lower()
    if base.endswith(".png"):
        mime = "image/png"
    elif base.endswith((".jpg", ".jpeg")):
        mime = "image/jpeg"
    else:
        mime = "image/webp"
    resp = Response(datos, mimetype=mime)
    resp.headers["Cache-Control"] = "public, max-age=86400"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route("/api/admin/visibilidad", methods=["POST"])
def api_admin_visibilidad():
    if not _con_api_protegida():
        return jsonify({"ok": False, "error": "Acceso no autorizado."}), 401

    datos = request.get_json(silent=True) or {}
    tipo = datos.get("tipo")  # "promo" | "banner"
    identificador = datos.get("id")
    ocultar = bool(datos.get("ocultar"))

    if tipo not in ("promo", "banner") or not identificador:
        return jsonify({"ok": False, "error": "Parámetros inválidos."}), 400

    visibilidad = _cargar_visibilidad()
    lista_clave = "promos_ocultas" if tipo == "promo" else "banners_ocultos"
    lista = visibilidad.setdefault(lista_clave, [])

    encontrado = next((x for x in lista if _norm(x) == _norm(identificador)), None)
    if ocultar and not encontrado:
        lista.append(identificador)
    elif not ocultar and encontrado:
        lista.remove(encontrado)
    _guardar_visibilidad(visibilidad)

    return jsonify(
        {
            "ok": True,
            "mensaje": "Anuncio ocultado del sitio." if ocultar else "Anuncio visible de nuevo.",
            "visibilidad": visibilidad,
        }
    )


# ============================================================
#  PEDIDOS DE CLIENTES (descuentan inventario del restaurante)
# ============================================================
@app.route("/api/pedido", methods=["POST"])
def registrar_pedido():
    datos = request.get_json(silent=True) or {}
    platos_pedidos = datos.get("platos", [])
    if not platos_pedidos:
        return jsonify({"ok": False, "error": "No se recibieron platos."}), 400

    promociones = _cargar_promociones()
    por_plato = {_norm(p["plato"]): p for p in promociones}
    insumos = _cargar_inventario()
    por_insumo = {_norm(i["nombre"]): i for i in insumos}

    detalle = []
    errores = []
    for nombre in platos_pedidos:
        plato = por_plato.get(_norm(nombre))
        if not plato:
            errores.append(f"'{nombre}' no está en las promociones.")
            continue
        detalle.append({"plato": plato["plato"], "descuento": plato["descuento"]})
        for ingreso_nombre, cantidad in plato.get("ingredientes", {}).items():
            insumo = por_insumo.get(ingreso_nombre)
            if not insumo:
                errores.append(f"Falta mapear el insumo '{ingreso_nombre}' de {plato['plato']}.")
                continue
            if float(insumo.get("stock", 0)) < cantidad:
                errores.append(
                    f"Stock insuficiente de {insumo['nombre']} para {plato['plato']} "
                    f"(solo {insumo['stock']} {insumo['unidad']})."
                )
                continue
            insumo["stock"] = round(float(insumo["stock"]) - cantidad, 3)

    if errores:
        return jsonify({"ok": False, "error": " | ".join(errores[:5])}), 409

    _guardar_inventario(insumos)
    return jsonify(
        {
            "ok": True,
            "mensaje": f"Pedido registrado: {len(detalle)} plato(s). El restaurante actualiza su inventario.",
            "detalle": detalle,
        }
    )


# ============================================================
#  ARCHIVOS
# ============================================================
@app.route("/data/<path:nombre>")
def servir_datos(nombre):
    return send_from_directory(DATA_DIR, nombre)


@app.route("/banners/<path:nombre>")
def servir_banners(nombre):
    return send_from_directory(BANNERS_DIR, nombre)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)