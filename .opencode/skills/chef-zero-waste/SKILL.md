---
name: chef-zero-waste
description: Recibe los insumos por vencer de inventario.json y redacta la receta del "Especial del Día" guardándola en data/contenido.json. Usa esta skill al correr /especial_del_dia o cuando el usuario pida una receta/plato que aproveche insumos críticos.
---

# Skill · Chef Zero-Waste

Diseña el **Especial del Día**: un plato que convierte los insumos por vencer en
ventas, evitando mermas.

## Cuándo usarla
- El usuario invoca `/especial_del_dia` o pide crear el plato del día.
- Hay insumos críticos (alertas de vencimiento) que lanzar al menú.

## Flujo obligatorio

1. **Analizar inventario**: lee `data/inventario.json` y prioriza los insumos con
   menor `dias_para_caducar`. Cruza con las categorías de la web si hace falta.

2. **Diseñar el plato**: combina 2 a 4 insumos críticos que funcionen juntos.
   Redacta una receta completa y ejecutable en el día (ingredientes con unidades
   del inventario, pasos numerados, tiempo estimado, dato zero-waste).

3. **Guardar con el script oficial**:

   ```powershell
   python scripts/guardar_contenido.py especial "<plato>" "inspirado_en=<Insumo1>,<Insumo2>;receta=<texto con saltos de linea>;hashtags=<opcional>"
   ```

   Conserva los saltos de línea de la receta para una buena presentación en la web.

4. **Cerrar**: reporta nombre del plato, insumos rescatados y **valor recuperado**
   (stock × costo). La web muestra la tarjeta con botón "Ver receta".

## Regla de negocio
Un buen Especial del Día recupera el mayor valor monetario de los insumos más
urgentes sin desperdiciar nada.