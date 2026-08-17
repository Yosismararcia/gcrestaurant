---
description: Redacta una publicación persuasiva para Instagram del plato seleccionado, con hashtags, y la guarda en la web.
agent: copywriter-gastronomico
subtask: true
---

# /copy_instagram

Aplica tu rol de **Copywriter Gastronómico** (ver `.opencode/agent/copywriter-gastronomico.md`) para el plato:

- Plato objetivo: `$ARGUMENTS` (si el usuario no indicó ninguno, elige el plato
  más destacado de `data/promociones.csv`).

Flujo requerido:

1. Lee `data/promociones.csv` y toma los datos reales del plato (descuento, días,
   categoría, descripción corta).
2. Redacta el caption persuasivo con hashtags siguiendo las reglas de tu agente.
3. Guarda el texto definitivo:

   ```powershell
   python scripts/guardar_contenido.py copy "<nombre del plato>" "<caption completo con hashtags>"
   ```

4. Responde al usuario con: caption, hashtags y confirmación de guardado.

El caption quedará disponible para el cliente desde la web (la tarjeta del plato
mostrará el indicador "📣").