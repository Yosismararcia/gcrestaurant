# -*- coding: utf-8 -*-
"""
guardar_contenido.py

Persiste el contenido generado por los agentes de OpenCode en data/contenido.json
para que el frontend lo muestre en vivo:
  - seccion "copy"    -> redactado por el Agente Copywriter Gastronomico (Instagram).
  - seccion "especial"-> redactado por el Agente Chef Zero-Waste (receta del dia).

Uso:
    python scripts/guardar_contenido.py copy "ceviche del dia" "Caption con hashtags aqui..."
    python scripts/guardar_contenido.py especial "Tacu Tacu de Choclo" "inspirado_en=Choclo,Camote" "receta=..."
"""
import json
import os
import sys
import unicodedata
from datetime import date

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(BASE, "data", "contenido.json")


def norm(texto):
    texto = unicodedata.normalize("NFKD", (texto or "").lower())
    return "".join(c for c in texto if not unicodedata.combining(c)).strip()


def cargar():
    try:
        with open(RUTA, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"copy": {}, "especial": {}}


def guardar(datos):
    with open(RUTA, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)


def parse_claves(pares):
    """'a=1;b=2' -> {'a':'1','b':'2'}"""
    resultado = {}
    for par in pares:
        if "=" in par:
            clave, _, valor = par.partition("=")
            resultado[clave.strip().lower()] = valor.strip()
    return resultado


def main():
    if len(sys.argv) < 3:
        print("Uso: python scripts/guardar_contenido.py <copy|especial> <clave> <texto... | campo=valor...>")
        sys.exit(1)

    seccion, clave, *resto = sys.argv[1:]
    clave_norm = norm(clave)
    datos = cargar()

    if seccion == "copy":
        texto = " ".join(resto)
        if not texto:
            print("Error: falta el texto del caption para 'copy'.")
            sys.exit(1)
        datos.setdefault("copy", {})[clave_norm] = {"texto": texto, "fecha": date.today().isoformat()}
    elif seccion == "especial":
        campos = parse_claves(resto)
        receta = campos.get("receta", "")
        if not receta:
            receta = " ".join(resto)
        datos.setdefault("especial", {})[clave_norm] = {
            "plato": campos.get("plato", clave),
            "imagen": campos.get("imagen", ""),
            "inspirado_en": [x.strip() for x in campos.get("inspirado_en", "").split(",") if x.strip()],
            "receta": receta,
            "hashtags": campos.get("hashtags", ""),
            "fecha": date.today().isoformat(),
        }
    else:
        print(f"Seccion desconocida: {seccion}")
        sys.exit(1)

    guardar(datos)
    print(f"OK: contenido guardado en data/contenido.json [{seccion}] ({clave_norm})")
    print("Recarga la web para verlo reflejado.")


if __name__ == "__main__":
    main()