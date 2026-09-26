# Script de instalação do BMAD Studio para VS Code
# Compatível com PowerShell 5.1 e versões superiores (Windows / macOS / Linux)
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Instalação do BMAD Studio no VS Code  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[INFO] Diretório raiz: $RepoRoot" -ForegroundColor Gray

# 1. Configurar arquivo .env inicial se não existir
$EnvFile = Join-Path $RepoRoot ".env"
$EnvExample = Join-Path $RepoRoot ".env.example"

if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
        Copy-Item $EnvExample $EnvFile
        Write-Host "[OK] Arquivo .env criado a partir de .env.example" -ForegroundColor Green
    } else {
        Write-Host "[AVISO] Arquivo .env.example não encontrado." -ForegroundColor Yellow
    }
} else {
    Write-Host "[INFO] Arquivo .env existente detectado." -ForegroundColor Gray
}

# 2. Gravar .env-location com caminho absoluto (UTF-8 sem BOM)
$EnvLocationFile = Join-Path $RepoRoot ".env-location"
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
$ResolvedEnvPath = [System.IO.Path]::GetFullPath($EnvFile)
[System.IO.File]::WriteAllText($EnvLocationFile, $ResolvedEnvPath, $Utf8NoBom)
Write-Host "[OK] Arquivo .env-location gerado com sucesso: $ResolvedEnvPath" -ForegroundColor Green

# 3. Empacotar VSIX da extensão
Write-Host "[INFO] Empacotando extensão com vsce..." -ForegroundColor Cyan
npx --yes @vscode/vsce package --no-dependencies --allow-missing-repository --skip-license -o bmad-studio.vsix
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] Falha ao empacotar a extensão (vsce retornou código $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "[OK] Pacote bmad-studio.vsix gerado com sucesso." -ForegroundColor Green

# 4. Instalar extensão no VS Code
Write-Host "[INFO] Instalando extensão no VS Code via CLI 'code'..." -ForegroundColor Cyan
code --install-extension bmad-studio.vsix --force
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] Falha ao instalar a extensão no VS Code (code retornou código $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "[OK] Extensão instalada com sucesso!" -ForegroundColor Green
Write-Host "Recarregue o VS Code (Developer: Reload Window) e use Ctrl+Alt+B" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Green
