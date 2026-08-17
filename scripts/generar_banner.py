# -*- coding: utf-8 -*-
"""
generar_banner.py
Skill/Comando: /generar_banner

Convierte una fila de promociones.csv en una tarjeta-anuncio HTML estilizada
(estilo "banner promocional") y la registra en data/banners.json para que la
galería del frontend la muestre.

Uso:
    python scripts/generar_banner.py "Nombre del plato"
    python scripts/generar_banner.py            # usa el primer plato disponible

El template esta pensado para que el Agente Build pueda inyectar mejora por IA.
"""
import csv
import csv as _csv
import json
import os
import re
import sys
import unicodedata
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")
BANNERS = os.path.join(BASE, "banners")

EMOJIS = {
    "especial del mar": "🐟",
    "cocina fusión": "🥘",
    "breakfast": "🥐",
    "zero waste": "🌿",
    "light": "🥗",
    "clásicos": "🍗",
    "sopas": "🍲",
    "bebidas": "🍹",
}


def leer_platos(ruta_csv):
    platos = []
    with open(ruta_csv, encoding="utf-8", newline="") as f:
        for fila in csv.DictReader(f):
            platos.append(
                {
                    "plato": fila.get("Nombre del plato", "").strip(),
                    "descuento": fila.get("Descuento", "0").strip(),
                    "dias": fila.get("Días aplicables", "").strip(),
                    "descripcion": fila.get("Descripcion corta", "").strip(),
                    "categoria": (fila.get("Categoría", "").strip() or "Menú"),
                }
            )
    return platos


def emoji_de(categoria):
    for clave, emoji in EMOJIS.items():
        if clave in categoria.lower():
            return emoji
    return "🍽️"


def slug(texto):
    texto = unicodedata.normalize("NFKD", (texto or "").lower())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^a-z0-9]+", "-", texto).strip("-")
    return texto or "promocion"


def plantilla_banner(plato):
    return f"""<div class="gc-banner">
  <div class="gc-banner__tag">{plato['descuento']}% OFF</div>
  <div class="gc-banner__emoji">{emoji_de(plato['categoria'])}</div>
  <h4 class="gc-banner__titulo">{plato['plato']}</h4>
  <p class="gc-banner__texto">{plato['descripcion']}</p>
  <div class="gc-banner__pie">
    <span>{plato['dias']}</span>
    <span>{plato['categoria']}</span>
  </div>
</div>
<style>
  .gc-banner{{
    border-radius:18px;padding:20px;color:#fff;text-align:center;height:100%;
    background:linear-gradient(140deg,#ea580c,#9a3412);box-shadow:0 14px 30px -12px rgba(154,52,18,.7);
  }}
  .gc-banner__tag{{display:inline-block;background:#e53935;color:#fff;font-weight:800;font-size:.8rem;
    padding:4px 14px;border-radius:999px;letter-spacing:.5px;}}
  .gc-banner__emoji{{font-size:2.6rem;line-height:1.4;}}
  .gc-banner__titulo{{font-family:'Fraunces',serif;font-weight:900;font-size:1.25rem;margin:.3rem 0;}}
  .gc-banner__texto{{font-size:.88rem;opacity:.92;margin-bottom:.6rem;}}
  .gc-banner__pie{{display:flex;justify-content:center;gap:10px;font-weight:700;font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;}}
  .gc-banner__pie span{{background:rgba(255,255,255,.18);padding:3px 10px;border-radius:999px;}}
</style>"""


def registrar_en_manifesto(id_banner, titulo, archivo, tipo="banner", nota=""):
    ruta_manifesto = os.path.join(DATA, "banners.json")
    try:
        with open(ruta_manifesto, encoding="utf-8") as f:
            manifesto = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        manifesto = {"generados": []}

    vigentes = []
    for existente in manifesto.get("generados", []):
        ruta_artefacto = os.path.join(BASE, existente.get("archivo", ""))
        if os.path.isfile(ruta_artefacto) and existente.get("id") != id_banner:
            vigentes.append(existente)
    manifesto["generados"] = vigentes
    manifesto["generados"].append(
        {
            "id": id_banner,
            "titulo": titulo,
            "archivo": f"banners/{id_banner}.html",
            "tipo": tipo,
            "nota": nota,
            "fecha": datetime.now().isoformat(timespec="seconds"),
        }
    )
    with open(ruta_manifesto, "w", encoding="utf-8") as f:
        json.dump(manifesto, f, ensure_ascii=False, indent=2)


def main():
    os.makedirs(BANNERS, exist_ok=True)
    ruta_csv = os.path.join(DATA, "promociones.csv")
    platos = leer_platos(ruta_csv)
    if not platos:
        print("No se encontraron platos en promociones.csv.")
        sys.exit(1)

    objetivo = " ".join(sys.argv[1:]).strip().lower()
    seleccion = next((p for p in platos if objetivo in p["plato"].lower()), platos[0] if not objetivo else None)
    if not seleccion:
        print(f"No se encontro '{objetivo}'. Platos disponibles: {[p['plato'] for p in platos]}")
        sys.exit(1)

    id_banner = f"banner-{slug(seleccion['plato'])}"
    archivo_html = os.path.join(BANNERS, f"{id_banner}.html")
    with open(archivo_html, "w", encoding="utf-8") as f:
        f.write(plantilla_banner(seleccion))

    registrar_en_manifesto(
        id_banner,
        titulo=seleccion["plato"],
        archivo=f"{id_banner}.html",
        tipo="banner",
        nota=f"-{seleccion['descuento']}% · {seleccion['categoria']}",
    )

    print(f"OK: banner generado para '{seleccion['plato']}'")
    print(f"  HTML -> {archivo_html}")
    print(f"  Manifesto -> {os.path.join(DATA, 'banners.json')}")
    print("Recarga la web: la seccion 'Galería de banners' ya lo inyecta.")


if __name__ == "__main__":
    main()