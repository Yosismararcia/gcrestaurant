# -*- coding: utf-8 -*-
"""
alerta_vencimiento.py
Skill/Comando: /alerta_vencimiento

Filtra inventario.json por fecha de caducidad y genera tarjetas de advertencia
HTML en banners/alertas-*.html, registradas en data/banners.json (tipo alerta),
que la web muestra en la seccion "Alertas de vencimiento".

Uso:
    python scripts/alerta_vencimiento.py [dias]
    dias: ventana de alerta (por defecto 5)
"""
import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime, timedelta

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")
BANNERS = os.path.join(BASE, "banners")

VENTANA_DEFECTO = 5


def dias_para(fecha):
    try:
        f = datetime.strptime(fecha, "%Y-%m-%d").date()
        return (f - date.today()).days
    except (ValueError, TypeError):
        return 9999


def slug(texto):
    texto = unicodedata.normalize("NFKD", (texto or "").lower())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^a-z0-9]+", "-", texto).strip("-")
    return texto or "alerta"


def tarjeta_alerta(insumo, dias):
    urgente = dias <= 1
    estado = "VENCIDO" if dias < 0 else ("¡CADUCA HOY!" if dias == 0 else f"Expira en {dias}d")
    return f"""<div class="gc-alerta {('gc-alerta--urgente' if urgente else '')}">
  <div class="gc-alerta__icono">{"🚨" if urgente else "⚠️"}</div>
  <div>
    <div class="gc-alerta__estado">{estado}</div>
    <h4 class="gc-alerta__titulo">{insumo['nombre']}</h4>
    <p class="gc-alerta__texto">{insumo['stock']} {insumo['unidad']} · caduca {insumo['fecha_caducidad']} · S/ {insumo['costo_unitario']}/u</p>
  </div>
</div>
<style>
  .gc-alerta{{display:flex;gap:12px;align-items:center;border-radius:16px;padding:14px;height:100%;
    background:#fff;border:1.5px solid #ffcdd2;border-left:6px solid #c62828;}}
  .gc-alerta--urgente{{background:#ffecee;}}
  .gc-alerta__icono{{font-size:1.6rem;}}
  .gc-alerta__estado{{font-weight:800;font-size:.74rem;text-transform:uppercase;letter-spacing:.6px;color:#c62828;}}
  .gc-alerta__titulo{{font-family:'Fraunces',serif;font-weight:900;margin:.1rem 0;}}
  .gc-alerta__texto{{font-size:.82rem;color:#6b5240;margin:0;}}
</style>"""


def carga_manifesto():
    ruta = os.path.join(DATA, "banners.json")
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"generados": []}


def guarda_manifesto(manifesto):
    ruta = os.path.join(DATA, "banners.json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(manifesto, f, ensure_ascii=False, indent=2)


def main():
    ventana = VENTANA_DEFECTO
    if len(sys.argv) > 1:
        try:
            ventana = int(sys.argv[1])
        except ValueError:
            ventana = VENTANA_DEFECTO

    os.makedirs(BANNERS, exist_ok=True)
    ruta_inv = os.path.join(DATA, "inventario.json")
    with open(ruta_inv, encoding="utf-8") as f:
        data = json.load(f)

    criticos = [
        i for i in data.get("insumos", [])
        if (d := dias_para(i.get("fecha_caducidad"))) <= ventana
    ]
    criticos.sort(key=lambda x: dias_para(x.get("fecha_caducidad")))

    if not criticos:
        with open(os.path.join(BANNERS, "alertas.json"), "w", encoding="utf-8") as f:
            json.dump({"criticos": [], "ventana": ventana, "mensaje": "Sin alertas"}, f, ensure_ascii=False, indent=2)
        print("Sin insumos criticos en los proximos", ventana, "dias. Todo fresco. 🎉")
        return

    manifesto = carga_manifesto()
    for insumo in criticos:
        id_alert = f"alerta-{insumo['id']}-{slug(insumo['nombre'])}"
        archivo = os.path.join(BANNERS, f"{id_alert}.html")
        with open(archivo, "w", encoding="utf-8") as f:
            f.write(tarjeta_alerta(insumo, dias_para(insumo["fecha_caducidad"])))
        manifesto["generados"] = [b for b in manifesto.get("generados", []) if b.get("id") != id_alert]
        manifesto["generados"].append(
            {
                "id": id_alert,
                "titulo": insumo["nombre"],
                "archivo": f"banners/{id_alert}.html",
                "tipo": "alerta",
                "nota": f"S/ {float(insumo['stock']) * float(insumo['costo_unitario']):.2f} en riesgo",
                "fecha": datetime.now().isoformat(timespec="seconds"),
            }
        )
    guarda_manifesto(manifesto)

    print(f"Alertas generadas para {len(criticos)} insumo(s) criticos en {ventana} dias:")
    for i in criticos:
        print(f"  - {i['nombre']}: {i['stock']} {i['unidad']} caduca {i['fecha_caducidad']} ({dias_para(i['fecha_caducidad'])}d)")
    print("Recomendacion: usa /especial_del_dia para convertir estos insumos en el Especial del Día.")


if __name__ == "__main__":
    main()