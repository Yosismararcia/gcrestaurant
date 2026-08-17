---
name: generar-banner
description: Convierte una fila de promociones.csv en una tarjeta-anuncio HTML estilizada (banner promocional) visible en la galería de la web. Usa esta skill cuando se corra el comando /generar_banner o cuando el usuario pida crear un banner/anuncio para un plato del CSV.
---

# Skill · Generar Banner Promocional

Orquesta la creación de un **banner publicitario** a partir de la base de datos
`data/promociones.csv`, sin escribir HTML a mano.

## Cuándo usarla
- El usuario invoca `/generar_banner` o pide un banner/anuncio para un plato.
- El usuario quiere una tarjeta visual "tipo publicidad" para las promociones.

## Flujo obligatorio

1. **Localizar el plato**
   - Usa el argumento del usuario como nombre del plato.
   - Si no viene, lista los platos de `data/promociones.csv` y deja elegir.

2. **Delegar la generación** (prohibido escribir HTML manualmente):

   ```powershell
   python scripts/generar_banner.py "<nombre del plato>"
   ```

   El script:
   - Lee la fila real del CSV (nombre, descuento, días, descripción, categoría).
   - Escribe `banners/banner-<slug>.html` con el banner estilizado.
   - Registra el artefacto en `data/banners.json` (la web lo inyecta solo).

3. **Verificar calidad del artefacto**
   - Lee el HTML generado y comprueba: descuento, días y descripción coinciden
     con el CSV; paleta cálida de la marca; diseño responsive.
   - Ajusta solo detalles finos de estilo si es necesario (nunca reescribe la lógica).

4. **Cerrar el ciclo**
   - Reporta la ruta del banner, el registro en el manifiesto y el refresco de la
     sección "Galería de banners" de la web.

## Especificación visual (paleta de marca)
- Fondo: gradiente `#ea580c → #9a3412` con sombra cálida.
- Insignia de descuento: rojo `#e53935`, tipografía en negrita.
- Emoji de categoría como protagonista; título con `Fraunces`.
- Debe verse bien en 280px (móvil) y 380px (desktop).