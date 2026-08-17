---
name: git-sync
description: Orquesta el ciclo completo de publicación a GitHub (init, remote, commit, push, verificación de .gitignore) y despliegue opcional a Vercel. Usa esta skill al correr /git_publicar o cuando el usuario pida conectar/commitar/pushear el proyecto o desplegar la web.
---

# Skill · Git Sync & Publicación

Centraliza el flujo **de cero a producción**: repositorio de GitHub, commits
limpios, protección de archivos pesados y despliegue en Vercel.

## Cuándo usarla
- El usuario invoca `/git_publicar` o pide subir/commitar el proyecto.
- Se necesita conectar un repositorio remoto o desplegar la web.

## Flujo obligatorio

1. **Preflight**
   - Verifica que la estructura del proyecto esté completa.
   - Revisa que `.gitignore` exista y cubra: `.venv`, `__pycache__`, `*.pyc`,
     `.vercel`, `node_modules`, `.env`, `.next`, logs, etc.
   - Confirma que no se suban archivos pesados ni tokens.

2. **Publicar con el script maestro** (delegar, no ejecutar git paso a paso manual):

   ```powershell
   .\scripts\git_publicar.ps1 -Mensaje "<mensaje>" [-Deploy]
   ```

   El script hace en orden: `git init`/`branch -M main`, `.gitignore` si falta,
   conexión/creación del remoto con `gh`, `git add -A`, `commit`, `push -u origin main`
   y — si se usa `-Deploy` — `vercel --prod`.

3. **Si falta `gh`** (GitHub CLI): indica al usuario crear el repositorio en
   https://github.com/new, agregar el remote manualmente y re-ejecutar.

4. **Cerrar el ciclo**
   - Reporta: URL del repositorio, hash del commit y, si hay despliegue, la URL
     pública (`*.vercel.app`).
   - Recuerda que Vercel puede terminar el build unos segundos después del push.

## Regla de seguridad
Nunca commitear `.env`, claves ni la carpeta `.vercel`. Verifica siempre con
`git status` antes de confirmar.