---
description: Filtra inventario.json por caducidad y genera tarjetas de advertencia para los ingredientes críticos.
---

# /alerta_vencimiento

Activa la skill **alerta-vencimiento** (`.opencode/skills/alerta-vencimiento/SKILL.md`) y ejecuta el flujo completo:

1. Detecta la ventana de días:
   - Si el usuario pasa un número (`$ARGUMENTS`), úsalo como ventana (ej. `7`).
   - Si no, usa la ventana por defecto de `5` días (misma que la web).

2. Ejecuta el script de orquestación:

   ```powershell
   python scripts/alerta_vencimiento.py <dias>
   ```

3. Interpreta la salida y entrega al usuario un **resumen accionable**:
   - Lista de insumos críticos (nombre, stock, fecha de caducidad, días restantes).
   - Valor total en riesgo (stock × costo unitario).
   - Recomendación: invocar `/especial_del_dia` para convertir esos insumos en el
     plato del día, o `/generar_banner` para lanzar una promo express de rescate.

4. Confirma qué tarjetas de advertencia se generaron en `banners/` y que la web
   las mostrará en "Alertas de vencimiento".

No filtres manualmente los datos: delega el análisis al script.