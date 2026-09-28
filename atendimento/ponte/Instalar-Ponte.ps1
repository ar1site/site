# Cria/atualiza a tarefa agendada do Windows "AR1-Ponte-WhatsApp":
#   - dispara ao iniciar a sessão do usuário atual (e ao instalar);
#   - roda "node ponte.mjs" sem janela (via iniciar-oculto.vbs);
#   - reinicia sozinha se cair (até 999 vezes, a cada 1 minuto);
#   - sem limite de tempo de execução.
#
# Uso:  .\Instalar-Ponte.ps1              -> instala/atualiza e inicia agora
#       .\Instalar-Ponte.ps1 -Remover     -> remove a tarefa (e para a ponte)
#       .\Instalar-Ponte.ps1 -SemIniciar  -> só registra, não inicia agora
param(
    [switch]$Remover,
    [switch]$SemIniciar
)

$ErrorActionPreference = "Stop"
$nomeTarefa = "AR1-Ponte-WhatsApp"
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $pasta "iniciar-oculto.vbs"
$ponte = Join-Path $pasta "ponte.mjs"

if ($Remover) {
    $existente = Get-ScheduledTask -TaskName $nomeTarefa -ErrorAction SilentlyContinue
    if ($existente) {
        try { Stop-ScheduledTask -TaskName $nomeTarefa -ErrorAction SilentlyContinue } catch {}
        Unregister-ScheduledTask -TaskName $nomeTarefa -Confirm:$false
        Write-Host "Tarefa '$nomeTarefa' removida." -ForegroundColor Green
    } else {
        Write-Host "Tarefa '$nomeTarefa' não existia." -ForegroundColor Yellow
    }
    # A ponte pode continuar viva se foi iniciada fora da tarefa; encerra pelo processo.
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object { $_.CommandLine -like "*ponte.mjs*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    exit 0
}

# ------------------------------------------------------------- pré-requisitos
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "Node.js não encontrado no PATH. Instale o Node 24 (https://nodejs.org) e rode de novo." -ForegroundColor Red
    exit 1
}
$nodeExe = $nodeCmd.Source
$versao = (& $nodeExe --version)
if ($versao -notmatch '^v(2[4-9]|[3-9]\d)\.') {
    Write-Host "Node $versao encontrado; a ponte precisa do Node 24 ou mais novo." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $ponte)) { throw "Não achei $ponte" }
if (-not (Test-Path $vbs)) { throw "Não achei $vbs" }

$arquivoEnv = Join-Path $env:LOCALAPPDATA "SistemaACM\ar1-ponte.env"
if (-not (Test-Path $arquivoEnv)) {
    Write-Host "Aviso: ainda não existe $arquivoEnv" -ForegroundColor Yellow
    Write-Host "A ponte vai sair com erro até esse arquivo existir (veja LEIA-ME.md)." -ForegroundColor Yellow
}

# ------------------------------------------------------------------- tarefa
$usuario = "$env:USERDOMAIN\$env:USERNAME"

$acao = New-ScheduledTaskAction -Execute "wscript.exe" `
    -Argument ('//B //Nologo "{0}" "{1}"' -f $vbs, $nodeExe) `
    -WorkingDirectory $pasta

$gatilhoLogon = New-ScheduledTaskTrigger -AtLogOn -User $usuario
$gatilhoLogon.Delay = "PT20S"   # dá tempo do Docker Desktop começar a subir

$config = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -Hidden

# Interactive: roda na sessão do usuário (assim o QR pode abrir na tela).
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited

$existente = Get-ScheduledTask -TaskName $nomeTarefa -ErrorAction SilentlyContinue
if ($existente) {
    try { Stop-ScheduledTask -TaskName $nomeTarefa -ErrorAction SilentlyContinue } catch {}
    Set-ScheduledTask -TaskName $nomeTarefa -Action $acao -Trigger $gatilhoLogon -Settings $config -Principal $principal | Out-Null
    Write-Host "Tarefa '$nomeTarefa' atualizada." -ForegroundColor Green
} else {
    Register-ScheduledTask -TaskName $nomeTarefa -Action $acao -Trigger $gatilhoLogon -Settings $config -Principal $principal `
        -Description "Ponte local do WhatsApp da AR1 Films (Evolution API -> painel de atendimento)." | Out-Null
    Write-Host "Tarefa '$nomeTarefa' criada." -ForegroundColor Green
}

if (-not $SemIniciar) {
    Start-ScheduledTask -TaskName $nomeTarefa
    Start-Sleep -Seconds 3
    $info = Get-ScheduledTaskInfo -TaskName $nomeTarefa
    $tarefa = Get-ScheduledTask -TaskName $nomeTarefa
    Write-Host ("Estado: {0} (último resultado: {1})" -f $tarefa.State, $info.LastTaskResult)
    Write-Host "Log da ponte: $env:LOCALAPPDATA\SistemaACM\ar1-ponte.log"
    Write-Host "Saúde:        Invoke-RestMethod http://127.0.0.1:3901/saude"
}
