# Script PowerShell pour copier les icônes vers Tauri

Write-Host "Configuration des icônes pour Tauri..." -ForegroundColor Green

# Créer le dossier icons s'il n'existe pas
$iconsDir = "icons"
if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null
    Write-Host "✓ Dossier icons créé" -ForegroundColor Green
}

# Copier l'icône principale depuis build/
$sourceIcon = "..\build\icon.ico"
$destIcon = "icons\icon.ico"

if (Test-Path $sourceIcon) {
    Copy-Item $sourceIcon $destIcon -Force
    Write-Host "✓ Icône copiée: icon.ico" -ForegroundColor Green
} else {
    Write-Host "⚠ Icône source non trouvée: $sourceIcon" -ForegroundColor Yellow
    Write-Host "  Veuillez placer une icône dans build/icon.ico" -ForegroundColor Yellow
}

# Créer des icônes PNG de base si elles n'existent pas (placeholders)
$pngSizes = @("32x32", "128x128", "128x128@2x")
foreach ($size in $pngSizes) {
    $pngFile = "icons\$size.png"
    if (-not (Test-Path $pngFile)) {
        Write-Host "⚠ PNG manquant: $size.png (utilisez 'npx @tauri-apps/cli icon' pour générer)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Configuration des icones terminee!" -ForegroundColor Green
Write-Host "Pour generer tous les formats, executez:" -ForegroundColor Cyan
Write-Host "npx @tauri-apps/cli icon chemin/vers/icone.png" -ForegroundColor Cyan
