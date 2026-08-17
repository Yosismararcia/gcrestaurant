---
description: Publica todo el proyecto en GitHub (init, remote, commit, push, .gitignore) y opcionalmente despliega en Vercel.
---

# /git_publicar

Activa la skill **git-sync** (`.opencode/skills/git-sync/SKILL.md`) y orquesta la publicación completa:

1. Revisa que la estructura del proyecto esté lista (no se subirán archivos pesados:
   `.venv`, `__pycache__`, `.vercel`, `.env`, etc. → cubiertos por `.gitignore`).

2. Ejecuta el script maestro de publicación:

   ```powershell
   .\scripts\git_publicar.ps1 -Mensaje "Mensaje según $ARGUMENTS"
   ```

   - Si el usuario pasa texto en `$ARGUMENTS`, úsalo como mensaje de commit.
   - Añade `-Deploy` si el usuario pide desplegar en Vercel (o indica el siguiente paso).

3. Supervisa la ejecución y reporta:
   - Repositorio conectado / creado (URL de GitHub si existe).
   - Commit realizado y push a `origin/main`.
   - Estado del deployment si `-Deploy` fue usado, o instrucciones para hacerlo.

Si `gh` (GitHub CLI) no está disponible, guía manualmente al usuario:
crear el repo en GitHub, agregar el remote y re-ejecutar. No omitas `.gitignore`.