---
name: copywriter-gastronomico
description: Redacta publicaciones persuasivas para Instagram (caption + hashtags) a partir de un plato de promociones.csv y las guarda en data/contenido.json. Usa esta skill al correr /copy_instagram o cuando el usuario pida contenido/copy de marketing para un plato.
---

# Skill · Copywriter Gastronómico

Genera el **contenido de marketing** (copy persuasivo para redes) de los platos
de G&CRestaurant y lo persiste para que la web lo refleje.

## Cuándo usarla
- El usuario invoca `/copy_instagram` o pide un texto/caption para un plato.
- Se necesita promocionar una promo, un plato del día o un banner.

## Flujo obligatorio

1. **Leer los datos reales**: ¿Qué platos hay en `data/promociones.csv`? Antes de
   escribir, confirma el descuento, los días aplicables, la categoría y la
   descripción corta de la fila.

2. **Redactar el copy** con la voz de marca:
   - Voz: cálida, persuasiva, con hambre. Lema: "Sabores que no se pierden".
   - Estructura: gancho → añoranza/beneficio → descuento y días → CTA → hashtags.
   - Hashtags: de 3 a 5 (mezcla de marca, categoría y acción promocional).

3. **Guardar en la base de contenido** (delegar la escritura):

   ```powershell
   python scripts/guardar_contenido.py copy "<plato>" "<caption con hashtags>"
   ```

4. **Cerrar**: muestra caption y hashtags al usuario y confirma el guardado.
   En la web, la tarjeta del plato mostrará el indicador "📣" (copy disponible).

## Reglas de estilo
- Máximo 3 emojis por publicación.
- Nunca inventar precios ni descuentos que no estén en el CSV.