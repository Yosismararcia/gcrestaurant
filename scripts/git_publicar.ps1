# ============================================================
# git_publicar.ps1  ·  Skill/Comando: /git_publicar
#
# Orquesta el ciclo completo de publicación:
#   1. Verifica/instala inicializa Git en el repositorio
#   2. Genera/verifica .gitignore (no subir archivos pesados)
#   3. Conecta al repositorio remoto de GitHub (crea si no existe via gh)
#   4. Stage + commit + push de todos los cambios
#   5. (Opcional) Despliegue directo en Vercel con -Deploy
#
# Uso:
#   .\scripts\git_publicar.ps1 "Mensaje del commit"
#   .\scripts\git_publicar.ps1 -Mensaje "feat: banners" -Repo "GCRestaurant" -Deploy
# ============================================================
param(
    [string]$Mensaje = "G&CRestaurant: promociones, banners y control de mermas",
    [string]$Repo = "GCRestaurant",
    [switch]$Deploy
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "== G&CRestaurant · Publicacion automatizada ==" -ForegroundColor Yellow

# 1) Git inicializado
if (-not (Test-Path ".git")) {
    Write-Host "* Inicializando repositorio git..." -ForegroundColor Cyan
    git init | Out-Null
    git branch -M main
} else {
    Write-Host "* Repositorio git ya inicializado." -ForegroundColor DarkGray
}

# 2) .gitignore de protección (archivos pesados / secretos)
$gitignore = @"
# Dependencias y entornos
node_modules/
__pycache__/
*.pyc
.venv/
venv/
env/

# Despliegue
.vercel/
.vercelignore.bak
.next/
out/
dist/
build/
public/assetfiles/

# Datos sensibles / locales
.env
.env.*
!.env.example
*.pem
*.key

# IDE y SO
.vscode/
.idea/
*.suo
Thumbs.db
.DS_Store
desktop.ini

# Logs
*.log
"@

$rutaIg = Join-Path (Get-Location) ".gitignore"
if (-not (Test-Path $rutaIg)) {
    Set-Content -LiteralPath $rutaIg -Value $gitignore -Encoding UTF8
    Write-Host "* .gitignore creado para proteger archivos pesados/secretos." -ForegroundColor Cyan
} else {
    Write-Host "* .gitignore ya existe (verificado)." -ForegroundColor DarkGray
}

# 3) Conectar remoto de GitHub
$hasGh = $null -ne (Get-Command gh -ErrorAction SilentlyContinue)
$remotos = git remote
if (-not $remotos) {
    if ($hasGh) {
        Write-Host "* Creando repositorio '$Repo' en GitHub..." -ForegroundColor Cyan
        gh repo create $Repo --source . --remote origin --push
    } else {
        Write-Host "! No hay remoto y no se encontro 'gh' (GitHub CLI)." -ForegroundColor Magenta
        Write-Host "  Crea el repositorio en https://github.com/new y luego ejecuta:" -ForegroundColor Magenta
        Write-Host "      git remote add origin https://github.com/TU_USUARIO/$Repo.git" -ForegroundColor Magenta
        Write-Host "  y vuelve a ejecutar este script." -ForegroundColor Magenta
        exit 1
    }
} else {
    Write-Host "* Remoto ya configurado: $remotos" -ForegroundColor DarkGray
}

# 4) Commit + push
git add -A
if (-not (git diff --cached --quiet)) {
    git commit -m $Mensaje
    Write-Host "* Commit creado: $Mensaje" -ForegroundColor Cyan
} else {
    Write-Host "* Sin cambios nuevos que commitear." -ForegroundColor DarkGray
}
git push -u origin main
Write-Host "* Push completado a origin/main." -ForegroundColor Green

# 5) Despliegue Vercel
if ($Deploy) {
    $hasVercel = $null -ne (Get-Command vercel -ErrorAction SilentlyContinue)
    if ($hasVercel) {
        Write-Host "* Desplegando en Vercel..." -ForegroundColor Cyan
        vercel --prod
    } else {
        Write-Host "! Cliente 'vercel' no instalado. Ejecuta:" -ForegroundColor Magenta
        Write-Host "      npm i -g vercel  ;  vercel" -ForegroundColor Magenta
        Write-Host "  o enlaza el repo desde https://vercel.com/new" -ForegroundColor Magenta
    }
}

Write-Host ""
Write-Host "== Listo. La web queda publicada cuando Vercel termine el build. ==" -ForegroundColor Green