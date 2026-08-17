---
description: Genera la receta del "Especial del Día" aprovechando los insumos por vencer de inventario.json, a cargo del Chef Zero-Waste.
agent: chef-zero-waste
subtask: true
---

# /especial_del_dia

Aplica tu rol de **Chef Zero-Waste** (ver `.opencode/agent/chef-zero-waste.md`).

Contexto: `$ARGUMENTS` (un insumo concreto para priorizar, o vacío para que tú
decidas con los datos).

Flujo requerido:

1. Lee `data/inventario.json` y filtra los insumos **críticos** (menor días
   restantes antes de caducar).
2. Selecciona 2 a 4 que combinen y redacta la receta ejecutable del Especial del Día.
3. Guarda el resultado:

   ```powershell
   python scripts/guardar_contenido.py especial "<nombre del plato>" "inspirado_en=<Insumo1>,<Insumo2>;receta=<texto de la receta>;hashtags=<opcional>"
   ```

   Asegúrate de que el texto de la receta conserve los saltos de línea (enciérralo
   entre comillas simples dobles) para que se muestre bien en la web.

4. Responde al usuario con: nombre del plato, insumos rescatados, valor recuperado
   y confirmación de guardado.

La web mostrará la tarjeta del Especial del Día con la receta lista para abrir.