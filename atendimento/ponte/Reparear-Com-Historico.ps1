# Reinicia a Evolution API com a gravação de histórico ligada, encerra a sessão do
# WhatsApp e abre um QR novo para parear de novo (o WhatsApp só envia as conversas
# recentes no momento do pareamento). O celular continua funcionando o tempo todo.
#
# Uso: botão direito neste arquivo -> "Executar com o PowerShell"
#      ou, numa janela do PowerShell:  & "<caminho>\Reparear-Com-Historico.ps1"
$ErrorActionPreference = "Continue"
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $pasta

$key = (Get-Content (Join-Path $pasta ".env") | Where-Object { $_ -like "EVOLUTION_APIKEY=*" }) -replace "EVOLUTION_APIKEY=", ""
if (-not $key) { Write-Host "Nao achei EVOLUTION_APIKEY em $pasta\.env" -ForegroundColor Red; Read-Host "Enter para sair"; exit 1 }
$qr = Join-Path $env:LOCALAPPDATA "SistemaACM\ar1-qr.png"
$antes = if (Test-Path $qr) { (Get-Item $qr).LastWriteTime } else { Get-Date "2000-01-01" }

Write-Host "1/4 Reiniciando a Evolution com historico ligado..." -ForegroundColor Cyan
docker compose up -d 2>&1 | Select-String -Pattern "Recreated|Started|Error" | ForEach-Object { "   " + $_.Line.Trim() }

Write-Host "2/4 Esperando a Evolution responder..." -ForegroundColor Cyan
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep 3
    $r = curl.exe -s -o NUL -w "%{http_code}" -H "apikey: $key" http://127.0.0.1:8080/instance/connectionState/ar1
    if ($r -eq "200") { $ok = $true; break }
}
if (-not $ok) { Write-Host "   A Evolution nao respondeu em 3 minutos. Avise o Claude." -ForegroundColor Red; Read-Host "Enter para sair"; exit 1 }
$hist = docker exec ar1-evolution printenv DATABASE_SAVE_DATA_HISTORIC
Write-Host "   Evolution no ar. Gravacao de historico: $hist"

Write-Host "3/4 Encerrando a sessao atual do WhatsApp no sistema..." -ForegroundColor Cyan
$r = curl.exe -s -o NUL -w "%{http_code}" -X DELETE -H "apikey: $key" http://127.0.0.1:8080/instance/logout/ar1
Write-Host "   logout: http $r"

Write-Host "4/4 Esperando o QR novo (ate 90 s)..." -ForegroundColor Cyan
$novo = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep 3
    if ((Test-Path $qr) -and (Get-Item $qr).LastWriteTime -gt $antes) { $novo = $true; break }
}
if ($novo) {
    Start-Process $qr
    Write-Host ""
    Write-Host "QR aberto na tela. No celular da SOBI: WhatsApp Business > Menu (3 pontos) > Dispositivos conectados > Conectar dispositivo." -ForegroundColor Green
    Write-Host "O QR se renova a cada ~20 s; se expirar, feche a imagem e abra de novo: $qr"
} else {
    Write-Host "   O QR nao apareceu. Veja o log: $env:LOCALAPPDATA\SistemaACM\ar1-ponte.log" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Esperando o celular conectar (ate 5 min)..." -ForegroundColor Cyan
$conectado = $false
for ($i = 0; $i -lt 100; $i++) {
    Start-Sleep 3
    try { $s = Invoke-RestMethod http://127.0.0.1:3901/saude -TimeoutSec 5 } catch { $s = $null }
    if ($s -and $s.conectado) { $conectado = $true; break }
}
if ($conectado) {
    Write-Host "Conectado! Agora volte ao Claude e diga: conectado, pode importar" -ForegroundColor Green
} else {
    Write-Host "Ainda nao conectou. Se ja leu o QR, aguarde mais um pouco e avise o Claude." -ForegroundColor Yellow
}
Read-Host "Enter para fechar"
