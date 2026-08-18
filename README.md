# G&CRestaurant 🍊 · Startup Foodtech

**Generador de Promociones y Marketing Express + Control de Mermas e Inventario Fresco.**

> *"Sabores que no se pierden, promos que sí se venden."*

Aplicación web **responsive** (móvil, tablet y PC) construida con **Python (Flask)**,
**HTML, CSS y JavaScript**, publicada en **Vercel**, que:

- Convierte el inventario fresco en **ofertas atractivas e imágenes promocionales en segundos**.
- Detecta insumos **a punto de vencer** y propone el **Especial del Día** para reducir mermas.
- Permite a los clientes **elegir los platillos** en promoción y **descuenta el inventario consumido**.

Todo el código es generado con herramientas de IA generativa (OpenCode, agentes,
skills y comandos personalizados) — **cero código manual**.

---

## 🧠 Arquitectura (Cero Código Manual)

**Dos roles de acceso (separación de tareas):**

| Rol | Acceso | URL |
|---|---|---|
| 👨‍🍳 **Administrador** (restaurante) | Inventario, recetas, avisos de vencimiento, copy y artefactos | `/admin` (login) |
| 🍽️ **Cliente** | Solo promociones, banners y Especial del Día | `/` (pública) |

- El administrador puede **ocultar/mostrar cualquier anuncio** (promoción o banner)
  desde el panel; el cambio es persistente (`data/visibilidad.json`) y se refleja
  al instante en el sitio público. Útil para retirar ofertas agotadas o en suspension.

- La API pública `/api/datos` **nunca** expone inventario, recetas ni avisos: calcula los
  precios en el servidor y omite `ingredientes`, stock y caducidades.
- La API de administrador `/api/admin/datos` devuelve todo, **protegida por sesión**.
- Credenciales por defecto: `admin` / `admin123`, configurables con variables de entorno
  `ADMIN_USER`, `ADMIN_PASS` y `SECRET_KEY` (define `SECRET_KEY` en producción).

```
GCRestaurant/
├── api/
│   └── index.py              ← Backend Flask (servidor para Vercel) + API pública y de admin
├── static/
│   ├── css/styles.css        ← Diseño responsive, paleta cálida
│   ├── css/admin.css         ← Estilos del panel administrador
│   ├── js/app.js             ← Interfaz pública (clientes)
│   └── js/admin.js           ← Panel administrador (login + dashboard)
├── templates/
│   ├── index.html            ← Página pública (promociones)
│   └── admin.html            ← Panel del restaurante (inventario, recetas, avisos)
├── data/                     ← ⭐ BASE DE DATOS (contexto inyectado al Agente)
│   ├── promociones.csv       ← Promos: plato, descuento, días, descripción, ingredientes
│   ├── inventario.json       ← Insumos: caducidad, stock, costo unitario
│   ├── banners.json          ← Artefactos generados por la skill /generar_banner
│   └── contenido.json        ← Copy (Instagram) y receta del Especial del Día
├── banners/                  ← Banners y tarjetas de alerta generados (HTML)
├── scripts/                  ← Orquestación (Python/PowerShell) para los agentes
├── .opencode/
│   ├── agent/                ← Agentes personalizados
│   ├── command/              ← Comandos /personalizados
│   ├── skills/               ← Skills de OpenCode
│   └── opencode.json         ← Configuración del entorno
├── requirements.txt          ← Flask
├── vercel.json               ← Mapeo de build/deploy en Vercel
└── .gitignore / .vercelignore ← Protección de archivos pesados
```

### Flujo de datos (MCP de contexto)
1. `data/promociones.csv` y `data/inventario.json` son la fuente de verdad.
2. `api/index.py` los lee y los expone por `GET /api/datos`.
3. `static/js/app.js` renderiza tarjetas, alertas, banners, tabla y pedidos a partir
   de esa respuesta.
4. `POST /api/pedido` descuenta del inventario los insumos de cada plato elegido.

---

## 🛠️ Ejecutar en local

```powershell
cd GCRestaurant
pip install -r requirements.txt
python api/index.py          # → http://localhost:5000
```

- **Web pública (clientes):** http://localhost:5000
- **Panel administrador:** http://localhost:5000/admin  → `admin` / `admin123`

> Para una demo "siempre fresca" (fechas relativas a hoy): `.\scripts\refrescar_demo.ps1`

---

## 🚀 Despliegue en Vercel

Opciones:

1. **Desde el terminal** (recomendado), usando el comando `/git_publicar`:
   ```powershell
   npm i -g vercel
   vercel link
   vercel --prod
   ```
2. **Desde GitHub**: sube este repositorio y en [vercel.com/new](https://vercel.com/new)
   importa el proyecto. Vercel detecta `requirements.txt` + `vercel.json` automáticamente.

> ⚠️ En Vercel configura las variables de entorno: `SECRET_KEY` (obligatoria para la
> sesión de admin) y, si cambias las credenciales, `ADMIN_USER` / `ADMIN_PASS`.

O usa el comando automatizado en OpenCode:

```
/git_publicar "feat: G&CRestaurant v1.0"   (añade -Deploy para desplegar al push)
```

---

## 🤖 Entorno OpenCode (Skills, Comandos y Agentes)

### Comandos personalizados
| Comando | Qué hace |
|---|---|
| `/generar_banner "Plato"` | Convierte una fila del CSV en una tarjeta-anuncio estilizada (`scripts/generar_banner.py`) y la publica en la galería de la web. |
| `/alerta_vencimiento [días]` | Filtra el inventario y genera tarjetas de advertencia para los insumos críticos (`scripts/alerta_vencimiento.py`). |
| `/copy_instagram "Plato"` | El **Agente Copywriter Gastronómico** redacta la publicación para Instagram (caption + hashtags) y la guarda en `data/contenido.json`. |
| `/especial_del_dia` | El **Agente Chef Zero-Waste** redacta la receta del Especial del Día a partir de los insumos por vencer. |
| `/git_publicar "mensaje" [-Deploy]` | Conecta el repositorio, `.gitignore`, commit y push a GitHub; opcionalmentamente despliega en Vercel (`scripts/git_publicar.ps1`). |

### Agentes especializados
| Agente | Rol |
|---|---|
| `copywriter-gastronomico` | Redacta publicaciones persuasivas para Instagram según el plato seleccionado. |
| `chef-zero-waste` | Recibe los insumos por vencer y redacta la receta propuesta para el Especial del Día. |

⚠️ **Importante:** tras crear/editar skills, comandos o agentes, **reinicia OpenCode**
para que recargue la configuración.

---

## 📦 Esquema de datos

### `data/promociones.csv`
```
Nombre del plato, Descuento, Días aplicables, Descripción corta, Categoría, Imagen, Ingredientes
```
- `Imagen`: URL opcional (si está vacía se usa un banner de gradiente + emoji).
- `Ingredientes`: lista separada por `|` : `insumo:cantidad` que referencia los
  nombres de `inventario.json` (sin distinguir mayúsculas ni acentos).

### `data/inventario.json`
```json
{ "id": 1, "nombre": "Pescado fresco", "stock": 12.5, "unidad": "kg",
  "costo_unitario": 28.00, "fecha_caducidad": "2026-08-19", "categoria": "Proteina" }
```

---

## ✅ Cumplimiento de las normativas del curso

1. **Cero código manual** — toda la lógica se genera delegando en los agentes Build/plan y las skills. Los scripts de `scripts/` se ejecutan mediante comandos de OpenCode.
2. **Contexto de datos (MCP)** — CSV + JSON son inyectados como contexto; la interfaz se construye en función de sus estructuras.
3. **Skills / comandos personalizados** — 5 skills y 5 comandos instalados en `.opencode/` (`/generar_banner`, `/alerta_vencimiento`, `/copy_instagram`, `/especial_del_dia`, `/git_publicar`).
4. **Agentes personalizados** — Copywriter Gastronómico y Chef Zero-Waste gestionan partes específicas del proyecto.
5. **Refactorización y depuración autónoma** — ante errores se consulta al Agente de opencode: pide el porqué, rastrea en consola y aplica la corrección automática (recomendado: `open`en la terminal y pedir diagnóstico).
6. **Despliegue a producción** — Vercel genera el enlace público (`*.vercel.app`).

**Separación de tareas (roles):** el cliente solo consume la API pública (promociones);
el inventario, las recetas y los avisos quedan protegidos en `/admin` con sesión.

---

## 🔎 Solución de problemas

| Problema | Solución |
|---|---|
| No accede al `/admin` | Usa las credenciales por defecto `admin` / `admin123` (o las variables de entorno que hayas definido). |
| La web pública no muestra datos | Asegúrate de ejecutar `python api/index.py` (el frontend depende de `/api/datos`). |
| Fechas de caducidad pasadas (demo vieja) | `.\scripts\refrescar_demo.ps1` recalcula las fechas relativas a hoy. |
| No aparece la galería de banners | Ejecuta `/generar_banner "Nombre del plato"` en OpenCode. |
| Pedido rechazado por stock | El plato requiere insumos que ya se agotaron; repón stock en `inventario.json` o ajusta cantidades. |
| Escritura efímera en Vercel | En Vercel los archivos son de solo lectura entre peticiones (función serverless). El flujo complete funciona en local; en producción usa el esquema con `contenido.json`/`banners.json` generados desde GitHub.