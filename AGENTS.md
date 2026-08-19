# AGENTS.md · G&CRestaurant

Flask (Python) de un solo archivo + frontend HTML/CSS/JS estático + SQLAlchemy/SQLite, publicado en Vercel. Sin suite de tests: la "verificación" es sintaxis. Todo el código se genera delegando en `.opencode/` (comandos, skills y agentes).

## Comandos
- **Run local:** `python api/index.py` → http://localhost:5000 · Admin: `/admin` (`admin`/`admin123`, o env `ADMIN_USER`/`ADMIN_PASS`; define `SECRET_KEY`).
- **Reloader de Flask DESACTIVADO por defecto** (`use_reloader` solo con `FLASK_RELOAD=1`). El Python de Microsoft Store (`C:\Program Files\WindowsApps\...Python 3.12`) causa reinicios falsos —"Detected change in ...unicode_escape.py"— que cortan los fetch → "TypeError: Failed to fetch". Tras editar código, reinicia el servidor a mano. Debug: `FLASK_DEBUG=0`.
- **Verificación previa a commit:** `node --check static/js/*.js` y `ast.parse` de `api/index.py`; los JSON de `data/` deben parsear.
- **Fechas demo frescas:** `.\scripts\refrescar_demo.ps1`.

## Git (clave: en Windows NO hay git)
- Git e identidad viven en **WSL2**. Ejecutar así:
  `wsl -- git -C "/mnt/c/Users/Windows/Documents/Default Project/GCRestaurant" status`
- Remote: `origin https://github.com/Yosismararcia/gcrestaurant.git`. No hay `gh`, llaves SSH ni credential helper → push HTTPS pide un PAT (usuario `Yosismararcia`).
- `data/gcrestaurant.db` NO se commitea (`.gitignore`: `data/*.db`); el servidor la regenera sola. No pushear la BD con datos reales de clientes.
- Flujo de publicación: comando `/git_publicar` (`scripts/git_publicar.ps1`, requiere `gh`) o `/guardar-en-git` (revisa, verifica, stage selectivo, commit en español, push).

## Arquitectura
- **Backend** `api/index.py` (todas las rutas). Fuentes de verdad: `data/promociones.csv` (menú; columna `Ingredientes` = `insumo:cantidad`, nombres normalizados contra `inventario.json`), `data/inventario.json` (stock/caducidad/costo), `data/banners.json`, `data/contenido.json`, `data/visibilidad.json`. SQLAlchemy `data/gcrestaurant.db` (usuarios/pedidos/comentarios); en producción `DATABASE_URL` (Postgres).
- **Frontend:** `templates/portada.html`, `cliente.html`, `admin.html` (Jinja + `url_for`); `static/js/app.js` (cliente), `admin.js` (panel), `auth.js`, `flyer.js`; `static/css/styles.css` + `admin.css`. JS = IIFE con helpers `$`, `norm` (normaliza acentos), `formatear` (S/, es-PE).
- **Login unificado:** `auth.js` expone `window.GCAuth` (`abrir/cerrar/cerrarSesion/sincronizar`). Los modales son contenedores VACÍOS `#modalAcceso` + `#overlayAcceso`; auth.js inyecta su HTML. No crear cajas de login propias.
- **Roles/rutas:** `/cliente` y `/api/mis-pedidos` requieren sesión (redirigen a `/` si no). `/api/login` redirige por rol (admin→`/admin`, cliente→`/cliente`). `/api/admin/*` protegido; ante 401 el front usa `GCAuth.abrir("login")`.
- **Dinero acumulado:** `Usuario.gasto_acumulado`; `registrar_pedido` lo suma; el admin lo ve en `resumen.ventas` + lista `clientes`.
- **Mermas/destacadas (tiempo real):** `_conteo_ventas`, `_promos_destacadas` (top semanal + rescate + rotación determinista por semana), `_propuestas_rescate`, `_combo_del_dia`. El cliente pinta `destacadas` en `#gridDestacadas` (banda del hero); el admin en la vista Mermas.

## Gotchas de Vercel (serverless)
- Filesystem de solo lectura entre peticiones: escribir `data/*.json` o `banners/*.html` funciona local, FALLA en producción. Preferir datos calculados por API y Postgres. Los endpoints de generar banner devuelven `guardado=false` + vista previa HTML en Vercel.

## Verificación manual
- Chrome headless `--dump-dom` devuelve 0 caracteres (inservible): validar HTML servido con `Invoke-WebRequest` + `.Contains(...)`.
- Smoke test del backend: BD temporal con `DATABASE_URL=sqlite:///... SECRET_KEY=... PORT=<libre>` y un launcher `.py` (no `Start-Process python -c`: rompe el quoting en esta shell). Respaldar `data/inventario.json` y `data/banners.json` antes de pedidos/banners y restaurar después.
- `/cliente` sin sesión redirige a `/`: para inspeccionarlo hay que loguearse.