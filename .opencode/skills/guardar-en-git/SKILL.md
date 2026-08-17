---
name: guardar-en-git
description: Use when the user asks to save, commit, push or sync project changes to the repository ("guardar en git", "subir cambios", "commit", "hacer push", "guardar en github"). Applies the proven G&CRestaurant git workflow: review, verify, stage, commit, push.
---

# Guardar en Git · G&CRestaurant

Procedimiento estándar para aplicar los cambios del proyecto a Git/GitHub.
Usarlo SIEMPRE que se pida guardar, commitear, pushear o sincronizar cambios.

## Reglas previas

- No hacer commit salvo que el usuario lo pida.
- Nunca subir secretos: revisar que no existan archivos `.env`, `.pem`, `.key` o tokens en el stage.
- No incluir en el commit: `.opencode/` (config del editor), `__pycache__/`, `.venv/`, `data/` con datos locales volátiles si el repo los excluye (revisar `.gitignore`).

## Pasos (en este orden)

1. **Estado del repo** (desde la raíz con git):
   - `git status --short`
   - `git diff --stat` y `git diff` para revisar qué cambia.
   - `git log --oneline -10` para conocer el estilo de mensajes del repo.
2. **Verificación** (antes de commitear), el flujo usado en el proyecto:
   - JS: `node --check static/js/app.js`, `static/js/admin.js`, `static/js/flyer.js`.
   - Python: parsear `api/index.py` (p. ej. `python -c "import ast; ast.parse(open('api/index.py',encoding='utf-8').read())"`) y validar JSON de `data/` (`json.load`).
   - Smoke del servidor (Windows/PowerShell) si aplica: `Start-Job` con `$env:PORT=5xxx`, pedir `/`, `/cliente`, `/admin`, `/api/datos` y `/img?url=…`, luego `Stop-Job`.
3. **Stage selectivo**: `git add` solo de los archivos que tocan el cambio pedido. `git status` para confirmar.
4. **Commit**: mensaje conciso en español, estilo: `G&CRestaurant: <qué cambio>` (p. ej. "G&CRestaurant: buscador de inventario y flyers con proxy /img").
5. **Push**: `git push` a la rama por defecto (`main`). Si es PR: usar `gh pr create` con resumen de qué cambia.

## Recordatorios

- Si `git` no está instalado en la máquina, indicarlo y dar los comandos exactos para ejecutar donde sí exista Git; no intentar instalar sin permiso.
- Después de cada refactor/feature, este flujo es el único usado para publicar los cambios.