---
description: Transforma una fila de promociones.csv en una tarjeta-anuncio (banner) estilizada y visible en la galería de la web.
---

# /generar_banner

Activa la skill **generar-banner** (`.opencode/skills/generar-banner/SKILL.md`) y ejecuta el flujo completo:

1. Identifica el plato objetivo:
   - Si el usuario pasó un argumento (`$ARGUMENTS`), úsalo como nombre del plato.
   - Si no, lee `data/promociones.csv`, lista las opciones y pide elegir una.

2. Genera el banner ejecutando el script de orquestación:

   ```powershell
   python scripts/generar_banner.py "<nombre del plato>"
   ```

3. Revisa el HTML generado en `banners/banner-<slug>.html`. Verifica que:
   - El descuento, los días aplicables y la descripción corta coincidan con el CSV.
   - Los estilos usen la paleta cálida de G&CRestaurant (naranja `#ea580c`, crema, ámbar).
   - Sea **responsive** (escala bien en móvil, tablet y PC).

4. Si el layout se ve correcto, informa al usuario:
   - Ruta del archivo HTML generado.
   - Registro actualizado en `data/banners.json`.
   - Recarga la web para ver el banner en "Galería de banners".

No escribas HTML manualmente: delega todo al script y solo mejora el resultado
con pequeños ajustes de estilo si el usuario lo pide.