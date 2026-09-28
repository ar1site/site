# Sobe (ou atualiza) a Evolution API + Postgres desta pasta com Docker Compose.
# Uso:  .\Subir-Docker.ps1            -> sobe em segundo plano
#       .\Subir-Docker.ps1 -Logs      -> sobe e mostra os logs da Evolution
#       .\Subir-Docker.ps1 -Parar     -> para os containers (dados ficam nos volumes)
param(
    [switch]$Logs,
    [switch]$Parar
)

$ErrorActionPreference = "Stop"
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $pasta

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker não encontrado. Instale/abra o Docker Desktop e tente de novo." -ForegroundColor Red
    exit 1
}

try {
    docker info *> $null
} catch {
    Write-Host "O Docker Desktop não está rodando. Abra-o, espere ficar 'Engine running' e rode de novo." -ForegroundColor Red
    exit 1
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "O Docker Desktop não está rodando. Abra-o, espere ficar 'Engine running' e rode de novo." -ForegroundColor Red
    exit 1
}

if ($Parar) {
    docker compose down
    exit $LASTEXITCODE
}

if (-not (Test-Path (Join-Path $pasta ".env"))) {
    Write-Host "Falta o arquivo .env nesta pasta. Copie .env.example para .env e preencha EVOLUTION_APIKEY." -ForegroundColor Yellow
    exit 1
}
$envTexto = Get-Content (Join-Path $pasta ".env") -Raw
if ($envTexto -notmatch '(?m)^\s*EVOLUTION_APIKEY\s*=\s*\S+') {
    Write-Host "EVOLUTION_APIKEY está vazio no .env. Preencha antes de subir." -ForegroundColor Yellow
    exit 1
}

Write-Host "Subindo Evolution API + Postgres..." -ForegroundColor Cyan
docker compose pull
docker compose up -d --remove-orphans
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
docker compose ps
Write-Host ""
Write-Host "Evolution API: http://127.0.0.1:8080  (só neste PC)" -ForegroundColor Green
Write-Host "Teste rápido:  Invoke-RestMethod http://127.0.0.1:8080/" -ForegroundColor Gray

if ($Logs) {
    docker compose logs -f evolution-api
}
