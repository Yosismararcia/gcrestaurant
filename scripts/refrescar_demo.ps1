# ============================================================
# refrescar_demo.ps1
#
# Recalcula las fechas de caducidad de inventario.json en
# funcion de HOY para que la demo de alertas y del "Especial
# del Día" siempre muestre datos frescos, manteniendo stock y
# costos originales.
#
# Uso:  .\scripts\refrescar_demo.ps1
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$ruta = Join-Path (Get-Location) "data\inventario.json"

# Offset en dias por id de insumo (respecto a la fecha semilla 2026-08-16)
$offsets = @{
    1 = 3; 2 = 10; 3 = 14; 4 = 8; 5 = 7; 6 = 4; 7 = 1; 8 = 9; 9 = 5; 10 = 2
    11 = 2; 12 = 6; 13 = 300; 14 = 275; 15 = 5; 16 = 3; 17 = 116; 18 = 12
}

$data = Get-Content -LiteralPath $ruta -Raw -Encoding UTF8 | ConvertFrom-Json
$hoy = Get-Date
foreach ($insumo in $data.insumos) {
    $offset = $offsets[[int]$insumo.id]
    if ($null -eq $offset) { $offset = 30 }
    $insumo.fecha_caducidad = $hoy.AddDays($offset).ToString("yyyy-MM-dd")
}
$data.ultima_actualizacion = $hoy.ToString("yyyy-MM-dd")
$data | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ruta -Encoding UTF8

Write-Host "OK: inventario.json refrescado con caducidades relativo a HOY ($hoy)." -ForegroundColor Cyan