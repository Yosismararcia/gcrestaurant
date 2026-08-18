import csv
import json
import os
import unicodedata
import urllib.request
from datetime import date, datetime, timedelta
from typing import Optional

from flask import Flask, Response, g, jsonify, redirect, render_template, request, send_from_directory, session, url_for
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text, create_engine, func, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker, Mapped, mapped_column
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
BANNERS_DIR = os.path.join(ROOT, "banners")
VENTANA_ALERTA_DIAS = 5
MARCAJE = 2.6

_CACHE_IMAGENES = {}

app = Flask(
    __name__,
    static_folder=os.path.join(ROOT, "static"),
    template_folder=os.path.join(ROOT, "templates"),
)
app.secret_key = os.environ.get("SECRET_KEY", "gc-restaurant-secret-dev")

ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "admin123")

# ============================================================
#  BASE DE DATOS (usuarios y pedidos)
#  - Producción (Vercel): variable de entorno DATABASE_URL
#    (PostgreSQL gratuito, p. ej. Neon o Supabase).
#  - Local: SQLite en data/ (o /tmp si estamos en Vercel y no hay URL).
# ============================================================
_DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if _DATABASE_URL:
    if _DATABASE_URL.startswith("postgres://"):
        _DATABASE_URL = _DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
    elif _DATABASE_URL.startswith("postgresql://"):
        _DATABASE_URL = _DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
else:
    base_sqlite = os.path.join(DATA_DIR if not os.environ.get("VERCEL") else "/tmp", "gcrestaurant.db")
    _DATABASE_URL = "sqlite:///" + base_sqlite.replace("\\", "/")

_CONNECT_ARGS = {"check_same_thread": False} if _DATABASE_URL.startswith("sqlite") else {}
_engine = create_engine(_DATABASE_URL, connect_args=_CONNECT_ARGS, pool_pre_ping=True)
_Base = declarative_base()
_SessionLocal = sessionmaker(bind=_engine)


class Usuario(_Base):
    __tablename__ = "usuarios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    rol: Mapped[str] = mapped_column(String(20), nullable=False, default="cliente")  # admin | cliente
    nombre: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    cedula: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    gasto_acumulado: Mapped[float] = mapped_column(Float, default=0)  # S/ acumulado por sus compras
    creado: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Pedido(_Base):
    __tablename__ = "pedidos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    numero_orden: Mapped[str] = mapped_column(String(24), unique=True, nullable=False)
    usuario_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cliente_nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    cliente_cedula: Mapped[str] = mapped_column(String(30), nullable=False)
    platos: Mapped[str] = mapped_column(Text, nullable=False, default="[]")  # JSON: [{plato, cantidad, precio}]
    total: Mapped[float] = mapped_column(Float, default=0)
    estado: Mapped[str] = mapped_column(String(24), default="nuevo")  # nuevo | en_preparacion | listo | entregado
    visto: Mapped[bool] = mapped_column(Boolean, default=False)
    creado: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Comentario(_Base):
    __tablename__ = "comentarios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    autor: Mapped[str] = mapped_column(String(120), nullable=False)
    estrellas: Mapped[int] = mapped_column(Integer, default=5)
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    creado: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


try:
    _Base.metadata.create_all(_engine)
    # Migración idempotente: si la tabla "usuarios" ya existía, añade
    # gasto_acumulado sin borrar los datos (SQLite local y Postgres en Vercel).
    with _engine.begin() as _conn:
        _columnas_usuarios = [c["name"] for c in inspect(_engine).get_columns("usuarios")]
        if "gasto_acumulado" not in _columnas_usuarios:
            _conn.execute(text("ALTER TABLE usuarios ADD COLUMN gasto_acumulado FLOAT DEFAULT 0"))
except Exception as _exc:
    print("AVISO: no se pudo inicializar la base de datos ->", _exc)


def _sembrar_admin():
    """Crea (si no existe) el usuario administrador por defecto."""
    with _SessionLocal() as db:
        if not db.query(Usuario).filter_by(username=ADMIN_USER).first():
            db.add(
                Usuario(
                    username=ADMIN_USER,
                    password_hash=generate_password_hash(ADMIN_PASS),
                    rol="admin",
                    nombre="Administrador",
                    cedula="",
                )
            )
            db.commit()


try:
    _sembrar_admin()
except Exception as _exc:
    print("AVISO: no se pudo sembrar el admin ->", _exc)


def _db():
    if "db" not in g:
        g.db = _SessionLocal()
    return g.db


@app.teardown_appcontext
def _cerrar_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


# ============================================================
#  UTILIDADES
# ============================================================
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
#  ANALÍTICA · VENTAS, RESCATE Y DESTACADAS
# ============================================================
def _conteo_ventas(db, dias=None):
    """Cuenta cuántas veces se pidió cada plato (opcional: últimos N días)."""
    conteo = {}
    query = db.query(Pedido)
    if dias is not None:
        query = query.filter(Pedido.creado >= datetime.utcnow() - timedelta(days=dias))
    for p in query.order_by(Pedido.id.desc()).limit(800).all():
        try:
            platos = json.loads(p.platos or "[]")
        except (ValueError, TypeError):
            continue
        for d in platos:
            k = _norm(d.get("plato", ""))
            if k:
                conteo[k] = conteo.get(k, 0) + 1
    return conteo


def _promos_destacadas(publicas, crudas, insumos, db):
    """Ranking: lo más vendido entre semanas + rescates de frescura + rotación semanal."""
    ventas7 = _conteo_ventas(db, 7)
    ventas_totales = _conteo_ventas(db, None)
    criticos = {_norm(i["nombre"]): i for i in insumos if i.get("critico") or i.get("vencido")}
    crudas_por = {_norm(p["plato"]): p for p in crudas}
    semana = date.today().isocalendar()[1]
    puntuados = []
    for p in publicas:
        k = _norm(p["plato"])
        cruda = crudas_por.get(k, {})
        rescata = sorted({criticos[n]["nombre"] for n in cruda.get("ingredientes", {}) if n in criticos})
        v7 = ventas7.get(k, 0)
        vT = ventas_totales.get(k, 0)
        semilla = sum(ord(c) for c in k) % 97
        rot = ((semana * 31 + semilla) % 100) / 100.0  # rotación determinista por semana
        score = v7 * 3 + (2.0 if rescata else 0) + rot
        if v7:
            razon = "Más vendido esta semana"
        elif rescata:
            razon = "Rescata frescura"
        else:
            razon = "Variedad de la semana"
        item = dict(p)
        item.update({"ventas_semana": v7, "ventas_total": vT, "razon": razon, "rescata": rescata, "score": round(score, 3)})
        puntuados.append(item)
    puntuados.sort(key=lambda x: -x["score"])
    seleccion = []
    categorias = set()
    for x in puntuados:
        if len(seleccion) >= 6:
            break
        if x["categoria"] not in categorias:
            seleccion.append(x)
            categorias.add(x["categoria"])
    for x in puntuados:
        if len(seleccion) >= 6:
            break
        if x not in seleccion:
            seleccion.append(x)
    return seleccion


def _propuestas_rescate(insumos, promos):
    """Platillos del menú que usan cada insumo crítico (para venderlo antes de vencer)."""
    criticos = [i for i in insumos if (i.get("critico") or i.get("vencido")) and float(i.get("stock", 0) or 0) > 0]
    propuestas = []
    for i in criticos:
        platos = [
            {"plato": p["plato"], "descuento": p["descuento"], "categoria": p["categoria"]}
            for p in promos if _norm(i["nombre"]) in p.get("ingredientes", {})
        ]
        propuestas.append({
            "insumo": i["nombre"],
            "unidad": i["unidad"],
            "stock": i["stock"],
            "valor": i["valor_linea"],
            "dias": i["dias_para_caducar"],
            "vencido": i.get("vencido", False),
            "platos": platos,
        })
    propuestas.sort(key=lambda x: (not x["vencido"], x["dias"]))
    return propuestas


def _combo_del_dia(insumos):
    """Propuesta automática zero-waste: combina 2-4 insumos críticos en un platillo sugerido."""
    criticos = sorted(
        [i for i in insumos if (i.get("critico") or i.get("vencido")) and float(i.get("stock", 0) or 0) > 0],
        key=lambda x: (x.get("vencido"), x["dias_para_caducar"]),
    )
    elegidos = []
    categorias = set()
    for i in criticos:
        if len(elegidos) >= 4:
            break
        if i["categoria"] in categorias and len(elegidos) >= 2:
            continue
        elegidos.append(i)
        categorias.add(i["categoria"])
    if not elegidos:
        return None
    plantilla = {
        "Mar y Pescado": "Especial del mar",
        "Proteina": "Del fondo de la casa",
        "Verdura": "Salteado de temporada",
        "Fruta": "Toque fresco de la casa",
        "Lácteo": "Cremoso del día",
        "Panadería": "Hornado de la casa",
        "Grano y Cereal": "Tradición del día",
    }
    nombre = plantilla.get(elegidos[0]["categoria"], "Combo del día")
    return {
        "nombre": f"{nombre} · rescate de hoy",
        "inspirado_en": [i["nombre"] for i in elegidos],
        "insumos": [{"nombre": i["nombre"], "cantidad": i["stock"], "unidad": i["unidad"]} for i in elegidos],
        "valor_recuperado": round(sum(float(i.get("valor_linea", 0)) for i in elegidos), 2),
        "sugerencia": "Prepáralo hoy y publícalo como banner para venderlo antes de que venza.",
    }


# ============================================================
#  SESIÓN Y USUARIOS
# ============================================================
def _usuario_actual():
    uid = session.get("uid")
    if not uid:
        return None
    return _db().query(Usuario).get(uid)


def _es_admin():
    u = _usuario_actual()
    return u is not None and u.rol == "admin"


def _con_api_protegida():
    return _es_admin()


def _publicar_usuario(u):
    return {
        "autenticado": u is not None,
        "admin": u is not None and u.rol == "admin",
        "rol": u.rol if u else "",
        "usuario": u.username if u else "",
        "nombre": u.nombre if u else "",
        "cedula": u.cedula if u else "",
    "gasto_acumulado": round(getattr(u, "gasto_acumulado", 0) or 0, 2) if u else 0,
    }


@app.route("/api/sesion")
def api_sesion():
    return jsonify(_publicar_usuario(_usuario_actual()))


@app.route("/api/login", methods=["POST"])
def api_login():
    datos = request.get_json(silent=True) or {}
    username = (datos.get("usuario") or datos.get("username") or "").strip()
    password = datos.get("password") or ""
    db = _db()
    u = db.query(Usuario).filter(Usuario.username == username).first()
    if not u or not check_password_hash(str(getattr(u, "password_hash", "") or ""), password):
        return jsonify({"ok": False, "error": "Credenciales inválidas."}), 401
    session.clear()
    session["uid"] = u.id
    return jsonify({"ok": True, **_publicar_usuario(u)})


@app.route("/api/registro", methods=["POST"])
def api_registro():
    datos = request.get_json(silent=True) or {}
    username = (datos.get("usuario") or datos.get("username") or "").strip()
    password = datos.get("password") or ""
    nombre = (datos.get("nombre") or "").strip()
    cedula = (datos.get("cedula") or "").strip()

    if len(username) < 3:
        return jsonify({"ok": False, "error": "El usuario debe tener al menos 3 caracteres."}), 400
    if len(password) < 4:
        return jsonify({"ok": False, "error": "La contraseña debe tener al menos 4 caracteres."}), 400
    if not nombre:
        return jsonify({"ok": False, "error": "Indica tu nombre completo."}), 400
    if not cedula:
        return jsonify({"ok": False, "error": "Indica tu cédula o DNI."}), 400

    db = _db()
    if db.query(Usuario).filter(Usuario.username == username).first():
        return jsonify({"ok": False, "error": "Ese usuario ya existe. Elige otro."}), 409

    u = Usuario(
        username=username,
        password_hash=generate_password_hash(password),
        rol="cliente",
        nombre=nombre,
        cedula=cedula,
    )
    db.add(u)
    db.commit()
    session.clear()
    session["uid"] = u.id
    return jsonify({"ok": True, "mensaje": "Cuenta creada. ¡Bienvenido a G&CRestaurant!", **_publicar_usuario(u)})


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})


# ============================================================
#  VISTAS
# ============================================================
@app.route("/")
def portada():
    return render_template("portada.html")


@app.route("/cliente")
def vista_cliente():
    u = _usuario_actual()
    if not u:
        return redirect(url_for("portada"))
    return render_template("cliente.html")


@app.route("/admin")
def panel_admin():
    return render_template("admin.html")


def _serializar_comentario(c):
    return {
        "id": c.id,
        "autor": c.autor,
        "estrellas": c.estrellas,
        "texto": c.texto,
        "creado": c.creado.isoformat() if c.creado else "",
    }


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

    destacadas = _promos_destacadas(publicas, promos, _decorar_inventario(insumos), _db())

    return jsonify(
        {
            "proyecto": "G&CRestaurant",
            "promociones": publicas,
            "banners": banners,
            "contenido": {"copy": contenido.get("copy", {}), "especial": especial_publico},
            "destacadas": destacadas,
            "comentarios": [_serializar_comentario(c) for c in _db().query(Comentario).order_by(Comentario.id.desc()).limit(30).all()],
            "resumen": {
                "total_promociones": len(publicas),
                "total_banners": len(banners),
                "total_comentarios": _db().query(Comentario).count(),
            },
            "sesion": _publicar_usuario(_usuario_actual()),
        }
    )


@app.route("/api/comentario", methods=["POST"])
def api_comentario():
    u = _usuario_actual()
    if not u:
        return jsonify({"ok": False, "error": "Inicia sesión para comentar."}), 401

    datos = request.get_json(silent=True) or {}
    texto = (datos.get("texto") or "").strip()
    try:
        estrellas = int(datos.get("estrellas", 5))
    except (TypeError, ValueError):
        estrellas = 5
    estrellas = max(1, min(5, estrellas))

    if len(texto) < 3:
        return jsonify({"ok": False, "error": "Escribe un comentario más completo."}), 400

    c = Comentario(usuario_id=u.id, autor=u.nombre or u.username, estrellas=estrellas, texto=texto)
    db = _db()
    db.add(c)
    db.commit()
    return jsonify({"ok": True, "mensaje": "Gracias por compartir tu experiencia. 🎉", "comentario": _serializar_comentario(c)})


@app.route("/api/mis-pedidos")
def api_mis_pedidos():
    u = _usuario_actual()
    if not u:
        return jsonify({"ok": False, "error": "Inicia sesión para ver tus pedidos."}), 401
    db = _db()
    pedidos = db.query(Pedido).filter(Pedido.usuario_id == u.id).order_by(Pedido.id.desc()).limit(50).all()
    return jsonify({"ok": True, "pedidos": [_serializar_pedido(p) for p in pedidos]})


# ============================================================
#  PEDIDOS DE CLIENTES (descuentan inventario del restaurante)
# ============================================================
def _generar_numero_orden(db):
    prefijo = "GC-" + date.today().strftime("%Y%m%d") + "-"
    n = db.query(Pedido).filter(Pedido.numero_orden.like(prefijo + "%")).count() + 1
    numero = prefijo + f"{n:04d}"
    intento = 0
    while db.query(Pedido).filter_by(numero_orden=numero).first() and intento < 5:
        n += 1
        numero = prefijo + f"{n:04d}"
        intento += 1
    return numero


@app.route("/api/pedido", methods=["POST"])
def registrar_pedido():
    u = _usuario_actual()
    if not u:
        return jsonify({"ok": False, "error": "Debes iniciar sesión para hacer tu pedido."}), 401

    datos = request.get_json(silent=True) or {}
    platos_pedidos = datos.get("platos", [])
    if not platos_pedidos:
        return jsonify({"ok": False, "error": "No se recibieron platos."}), 400

    promociones = _cargar_promociones()
    por_plato = {_norm(p["plato"]): p for p in promociones}
    insumos = _cargar_inventario()
    por_insumo = {_norm(i["nombre"]): i for i in insumos}
    mapa_costos = {_norm(i["nombre"]): i for i in insumos}

    detalle = []
    errores = []
    for nombre in platos_pedidos:
        plato = por_plato.get(_norm(nombre))
        if not plato:
            errores.append(f"'{nombre}' no está en las promociones.")
            continue
        _, precio_final = _precio_de(plato, mapa_costos)
        detalle.append(
            {
                "plato": plato["plato"],
                "descuento": plato["descuento"],
                "precio": precio_final,
            }
        )
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

    total = round(sum(float(d.get("precio") or 0) for d in detalle), 2)
    numero = _generar_numero_orden(_db())
    pedido = Pedido(
        numero_orden=numero,
        usuario_id=u.id,
        cliente_nombre=u.nombre or u.username,
        cliente_cedula=u.cedula or "",
        platos=json.dumps(detalle, ensure_ascii=False),
        total=total,
        estado="nuevo",
        visto=False,
    )
    db = _db()
    db.add(pedido)
    db.commit()

    # Acumula el gasto del cliente (lo que pide el admin en su panel).
    setattr(u, "gasto_acumulado", round((getattr(u, "gasto_acumulado", 0) or 0) + total, 2))
    db.commit()

    return jsonify(
        {
            "ok": True,
            "numero_orden": numero,
            "mensaje": f"Pedido {numero} registrado: {len(detalle)} plato(s). El restaurante actualiza su inventario.",
            "detalle": detalle,
            "total": total,
        }
    )


# ============================================================
#  API DE ADMINISTRADOR (inventario, recetas, avisos y pedidos)
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
    pedidos_nuevos = _db().query(Pedido).filter(Pedido.visto.is_(False)).count()
    ventas = round(float(_db().query(func.coalesce(func.sum(Pedido.total), 0)).scalar() or 0), 2)

    # Dinero acumulado por cada cliente (para el panel del admin).
    clientes = []
    for u in _db().query(Usuario).filter(Usuario.rol == "cliente").order_by(Usuario.gasto_acumulado.desc(), Usuario.id):
        clientes.append(
            {
                "id": u.id,
                "nombre": u.nombre or u.username,
                "usuario": u.username,
                "cedula": u.cedula or "",
                "pedidos": _db().query(Pedido).filter(Pedido.usuario_id == u.id).count(),
                "gasto_acumulado": round(getattr(u, "gasto_acumulado", 0) or 0, 2),
            }
        )

    return jsonify(
        {
            "proyecto": "G&CRestaurant · Panel admin",
            "fecha": date.today().isoformat(),
            "ventana_alertas": VENTANA_ALERTA_DIAS,
            "promociones": promociones,
            "inventario": insumos,
            "banners": banners,
            "contenido": _cargar_contenido(),
            "clientes": clientes,
            "propuestas": _propuestas_rescate(insumos, promociones),
            "combo_del_dia": _combo_del_dia(insumos),
            "destacadas": _promos_destacadas(promociones, promociones, insumos, _db()),
            "sesion": _publicar_usuario(_usuario_actual()),
            "resumen": {
                "total_promociones": len(promociones),
                "total_insumos": len(insumos),
                "insumos_criticos": len(criticos),
                "valor_inventario": valor_total,
                "pedidos_nuevos": pedidos_nuevos,
                "ventas": ventas,
            },
            "especiales": criticos,
        }
    )


@app.route("/api/admin/generar-banner", methods=["POST"])
def api_admin_generar_banner():
    if not _con_api_protegida():
        return jsonify({"ok": False, "error": "Acceso no autorizado."}), 401
    datos = request.get_json(silent=True) or {}
    plato = (datos.get("plato") or "").strip()
    promos = _cargar_promociones()
    objetivo = _norm(plato)
    seleccion = next((p for p in promos if _norm(p["plato"]) == objetivo), None)
    if not seleccion:
        return jsonify({"ok": False, "error": "Plato no encontrado en promociones.csv."}), 404
    try:
        import importlib
        import sys

        if str(ROOT) not in sys.path:
            sys.path.insert(0, str(ROOT))
        generar_banner = importlib.import_module("scripts.generar_banner")
        id_banner = f"banner-{generar_banner.slug(seleccion['plato'])}"
        html = generar_banner.plantilla_banner(seleccion)
        guardado = True
        try:
            os.makedirs(os.path.join(ROOT, "banners"), exist_ok=True)
            with open(os.path.join(ROOT, "banners", f"{id_banner}.html"), "w", encoding="utf-8") as f:
                f.write(html)
            generar_banner.registrar_en_manifesto(
                id_banner,
                titulo=seleccion["plato"],
                archivo=f"{id_banner}.html",
                tipo="banner",
                nota=f"-{seleccion['descuento']}% · {seleccion['categoria']}",
            )
        except OSError:
            guardado = False
        return jsonify({"ok": True, "guardado": guardado, "id": id_banner, "html": html})
    except Exception as _exc:
        return jsonify({"ok": False, "error": f"No se pudo generar el banner: {_exc}"}), 500


@app.route("/api/admin/generar-banners-semana", methods=["POST"])
def api_admin_generar_banners_semana():
    if not _con_api_protegida():
        return jsonify({"ok": False, "error": "Acceso no autorizado."}), 401
    promos = _cargar_promociones()
    insumos = _decorar_inventario(_cargar_inventario())
    destacadas = _promos_destacadas(promos, promos, insumos, _db())
    elegidas = [d for d in destacadas if not d.get("oculta")][:3]
    if not elegidas:
        return jsonify({"ok": True, "generados": [], "mensaje": "No hay promos destacadas para esta semana."})
    import importlib
    import sys

    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    generar_banner = importlib.import_module("scripts.generar_banner")
    generados = []
    for d in elegidas:
        seleccion = next((p for p in promos if _norm(p["plato"]) == _norm(d["plato"])), None)
        if not seleccion:
            continue
        id_banner = f"banner-{generar_banner.slug(seleccion['plato'])}"
        html = generar_banner.plantilla_banner(seleccion)
        try:
            os.makedirs(os.path.join(ROOT, "banners"), exist_ok=True)
            with open(os.path.join(ROOT, "banners", f"{id_banner}.html"), "w", encoding="utf-8") as f:
                f.write(html)
            generar_banner.registrar_en_manifesto(
                id_banner,
                titulo=seleccion["plato"],
                archivo=f"{id_banner}.html",
                tipo="banner",
                nota=f"-{seleccion['descuento']}% · {seleccion['categoria']} · {d.get('razon', '')}",
            )
            generados.append({"id": id_banner, "plato": seleccion["plato"]})
        except OSError:
            pass
    return jsonify({"ok": True, "generados": generados, "mensaje": f"{len(generados)} banner(s) de la semana generado(s)."})


def _serializar_pedido(p):
    try:
        platos = json.loads(p.platos or "[]")
    except (ValueError, TypeError):
        platos = []
    return {
        "id": p.id,
        "numero_orden": p.numero_orden,
        "cliente_nombre": p.cliente_nombre,
        "cliente_cedula": p.cliente_cedula,
        "platos": platos,
        "total": round(float(getattr(p, "total", 0) or 0), 2),
        "estado": p.estado,
        "visto": bool(getattr(p, "visto", False)),
        "creado": p.creado.isoformat() if p.creado else "",
    }


@app.route("/api/admin/pedidos")
def api_admin_pedidos():
    if not _con_api_protegida():
        return jsonify({"ok": False, "error": "Acceso no autorizado."}), 401
    db = _db()
    pedidos = db.query(Pedido).order_by(Pedido.id.desc()).limit(100).all()
    return jsonify({"ok": True, "pedidos": [_serializar_pedido(p) for p in pedidos]})


@app.route("/api/admin/pedidos/nuevos")
def api_admin_pedidos_nuevos():
    if not _con_api_protegida():
        return jsonify({"ok": False, "error": "Acceso no autorizado."}), 401
    db = _db()
    nuevos = db.query(Pedido).filter(Pedido.visto.is_(False)).order_by(Pedido.id.desc()).all()
    return jsonify({"ok": True, "total_nuevos": len(nuevos), "pedidos": [_serializar_pedido(p) for p in nuevos]})


@app.route("/api/admin/pedidos/visto", methods=["POST"])
def api_admin_pedido_visto():
    if not _con_api_protegida():
        return jsonify({"ok": False, "error": "Acceso no autorizado."}), 401
    datos = request.get_json(silent=True) or {}
    pedido_id = datos.get("id")
    db = _db()
    pedido = db.query(Pedido).get(pedido_id) if pedido_id else None
    if pedido:
        setattr(pedido, "visto", True)
        db.commit()
    return jsonify({"ok": True})


@app.route("/api/admin/pedidos/estado", methods=["POST"])
def api_admin_pedido_estado():
    if not _con_api_protegida():
        return jsonify({"ok": False, "error": "Acceso no autorizado."}), 401
    datos = request.get_json(silent=True) or {}
    pedido_id = datos.get("id")
    estado = (datos.get("estado") or "").strip()
    if estado not in ("nuevo", "en_preparacion", "listo", "entregado"):
        return jsonify({"ok": False, "error": "Estado inválido."}), 400
    db = _db()
    pedido = db.query(Pedido).get(pedido_id) if pedido_id else None
    if not pedido:
        return jsonify({"ok": False, "error": "Pedido no encontrado."}), 404
    pedido.estado = estado
    db.commit()
    return jsonify({"ok": True, "estado": estado})


# ============================================================
#  PROXY DE IMÁGENES (Wikimedia) para flyers y tarjetas
# ============================================================
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
#  ARCHIVOS
# ============================================================
@app.route("/banners/<path:nombre>")
def servir_banners(nombre):
    return send_from_directory(BANNERS_DIR, nombre)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)