---
name: alerta-vencimiento
description: Filtra data/inventario.json por fecha de caducidad y genera tarjetas de advertencia HTML para los insumos críticos, con valor monetario en riesgo. Usa esta skill cuando se corra /alerta_vencimiento o el usuario pida avisar/reportar insumos por vencer.
---

# Skill · Alerta de Vencimiento

Detecta qué insumos del inventario están **a punto de caducar**, cuantifica el
riesgo económico y genera tarjetas de advertencia para la web.

## Cuándo usarla
- El usuario invoca `/alerta_vencimiento` o pide alertas de caducidad.
- Se necesita la lista de ingredientes críticos para crear el Especial del Día
  o una promo express de rescate.

## Flujo obligatorio

1. **Definir ventana de días** (por defecto `5`, como la web).

2. **Delegar el análisis**:

   ```powershell
   python scripts/alerta_vencimiento.py <dias>
   ```

   El script lee `data/inventario.json`, calcula `dias_para_caducar`, filtra los
   insumos dentro de la ventana y:
   - Genera `banners/alerta-*.html` (tarjetas de advertencia con estado vencido/hoy/próximamente).
   - Registra cada artefacto en `data/banners.json` con su valor en riesgo.
   - Escribe un reporte en consola con el ranking de urgencia.

3. **Interpretar y recomendar**
   - Repórtale al usuario: insumos críticos ordenados por urgencia y **total de
     dinero en riesgo** (stock × costo unitario).
   - Sugiere: `/especial_del_dia` para receta de rescate o `/generar_banner`
     para promocionar un plato que use esos insumos.

4. **Verificar** que las tarjetas queden visibles en la sección "Alertas de
   vencimiento" de la web.

## Regla
Prohibido resolver el análisis en código manual: todo pasa por el script.