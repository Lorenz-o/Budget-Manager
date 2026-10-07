# ============================================================
#  MyBudget - avvio con auto-installazione (un solo comando)
#
#  Uso:  doppio click su Avvia-MyBudget.bat
#        Avvia-MyBudget.bat stop     -> chiude MyBudget
#
#  Cosa fa, in ordine (salta i passi gia' fatti):
#   1. Python: se manca scarica una copia PORTATILE in .runtime\python
#      (non tocca il Python di sistema, nessun diritto di admin)
#   2. Pacchetti Python (Flask...): li installa se mancano
#   3. Frontend: se dist\ manca o i sorgenti sono piu' recenti, lo compila.
#      Serve Node.js: usa quello di sistema (>= 18) oppure ne scarica
#      uno PORTATILE in .runtime\node
#   4. Avvia il server in background (nessuna finestra) e apre il browser
#
#  I dati restano in data\mybudget.db. Log in .runtime\setup.log e
#  data\server.log. Il file e' volutamente solo ASCII (PowerShell 5.1).
# ============================================================
param([string]$Action = '')

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'   # i download vanno molto piu' veloci
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

$Root     = $PSScriptRoot
$Rt       = Join-Path $Root '.runtime'
$PyDir    = Join-Path $Rt 'python'
$NodeDir  = Join-Path $Rt 'node'
$DataDir  = Join-Path $Root 'data'
$Py       = Join-Path $PyDir 'python.exe'
$Server   = Join-Path $Root 'backend\standalone_server.py'
$Dist     = Join-Path $Root 'dist\index.html'
$SetupLog = Join-Path $Rt 'setup.log'
$ServerLog= Join-Path $DataDir 'server.log'
$Port     = 5000
$Url      = "http://localhost:$Port"

$PythonVersion = '3.12.10'     # versione del Python portatile (embeddable)

New-Item -ItemType Directory -Force -Path $Rt, $DataDir | Out-Null

# ---------------------------------------------------------------- utilita'
function Say([string]$msg) {
    Write-Host $msg
    try { Add-Content -LiteralPath $SetupLog -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg) } catch { }
}

# Esegue un programma nativo scrivendo l'output nel log. Restituisce il codice
# di uscita. (EAP=Continue: in PowerShell 5.1 lo stderr dei programmi nativi
# altrimenti genera falsi errori fatali.)
function Invoke-Native([string]$Exe, [string[]]$Arguments, [string]$WorkDir = $Root) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location $WorkDir
    try {
        & $Exe @Arguments 2>&1 | ForEach-Object { "$_" } | Add-Content -LiteralPath $SetupLog
        return $LASTEXITCODE
    } finally {
        Pop-Location
        $ErrorActionPreference = $old
    }
}

function Download([string]$Uri, [string]$Dest) {
    $tmp = "$Dest.part"
    for ($i = 1; $i -le 3; $i++) {
        try {
            Invoke-WebRequest -Uri $Uri -OutFile $tmp -UseBasicParsing -TimeoutSec 600
            Move-Item -Force $tmp $Dest
            return
        } catch {
            Remove-Item -Force $tmp -ErrorAction SilentlyContinue
            if ($i -eq 3) { throw "Download fallito: $Uri ($($_.Exception.Message)). Controlla la connessione a Internet." }
            Start-Sleep -Seconds 2
        }
    }
}

function Unzip([string]$Zip, [string]$Dest) {
    # ZipFile (.NET) e' molto piu' veloce di Expand-Archive con migliaia di file
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
    [System.IO.Compression.ZipFile]::ExtractToDirectory($Zip, $Dest)
}

function Test-Server {
    try { Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2 | Out-Null; return $true }
    catch { return $false }
}

function Stop-MyBudget {
    $targets = @()
    try {
        $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        foreach ($l in $listeners) {
            $p = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $l.OwningProcess) -ErrorAction SilentlyContinue
            if ($p -and $p.CommandLine -and
                ($p.CommandLine -match 'standalone_server\.py' -or $p.CommandLine -match 'backend[\\/]app\.py')) {
                $targets += $p
            }
        }
    } catch { }
    if (-not $targets) {
        $targets = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Name -match '^pythonw?\.exe$' -and $_.CommandLine -and
                ($_.CommandLine -match 'standalone_server\.py' -or $_.CommandLine -match 'backend[\\/]app\.py')
            })
    }
    $targets = @($targets | Sort-Object ProcessId -Unique)
    foreach ($p in $targets) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    for ($i = 0; $i -lt 10; $i++) {
        try {
            if (@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -eq 0) { break }
        } catch { break }
        Start-Sleep -Milliseconds 200
    }
    return @($targets).Count
}

function Show-LogTail([string]$Path, [int]$Lines = 25) {
    if (Test-Path $Path) {
        Write-Host ''
        Write-Host "--- ultime righe di $Path ---"
        Get-Content -LiteralPath $Path -Tail $Lines | ForEach-Object { Write-Host $_ }
    }
}

# ---------------------------------------------------------------- passi
function Ensure-Python {
    if (Test-Path $Py) { return }
    Say '[1/4] Scarico Python portatile (solo la prima volta, ~10 MB)...'
    $arch = 'amd64'
    try { if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64') { $arch = 'arm64' } } catch { }
    $zipName = "python-$PythonVersion-embed-$arch.zip"
    $zip = Join-Path $Rt $zipName
    Download "https://www.python.org/ftp/python/$PythonVersion/$zipName" $zip
    Unzip $zip $PyDir
    Remove-Item -Force $zip -ErrorAction SilentlyContinue

    # Il Python "embeddable" ha 'import site' disattivato: serve per far
    # funzionare pip e i pacchetti installati in Lib\site-packages.
    $pth = Get-ChildItem $PyDir -Filter 'python*._pth' | Select-Object -First 1
    if (-not $pth) { throw 'File python*._pth non trovato nel Python portatile.' }
    $lines = Get-Content -LiteralPath $pth.FullName | ForEach-Object { $_ -replace '^\s*#\s*import site', 'import site' }
    Set-Content -LiteralPath $pth.FullName -Value $lines -Encoding ASCII

    Say '      Installo pip...'
    $gp = Join-Path $Rt 'get-pip.py'
    Download 'https://bootstrap.pypa.io/get-pip.py' $gp
    $rc = Invoke-Native $Py @($gp, '--no-warn-script-location')
    Remove-Item -Force $gp -ErrorAction SilentlyContinue
    if ($rc -ne 0) { throw "Installazione di pip fallita (codice $rc)." }
}

function Ensure-PythonPackages {
    $check = @('-c', 'import flask, flask_cors, sqlite3')
    if ((Invoke-Native $Py $check) -eq 0) { return }
    Say '[2/4] Installo i pacchetti Python (Flask)...'
    $req = Join-Path $Root 'backend\requirements.txt'
    $rc = Invoke-Native $Py @('-m', 'pip', 'install', '--no-warn-script-location', '-r', $req)
    if ($rc -ne 0) { throw "pip install fallito (codice $rc)." }
    if ((Invoke-Native $Py $check) -ne 0) { throw 'I pacchetti Python risultano ancora mancanti dopo l''installazione.' }
}

function Get-FrontendFingerprint {
    # I timestamp dei file non sono affidabili dopo un git pull/checkout:
    # Windows può assegnare a src/ e dist/ date che non riflettono l'ordine
    # reale delle modifiche. Usiamo quindi un fingerprint del CONTENUTO.
    $inputs = @()
    foreach ($f in 'package.json', 'package-lock.json', 'index.html', 'vite.config.js', 'tsconfig.json') {
        $p = Join-Path $Root $f
        if (Test-Path $p) { $inputs += Get-Item $p }
    }
    $srcRoot = Join-Path $Root 'src'
    if (Test-Path $srcRoot) {
        $inputs += Get-ChildItem $srcRoot -Recurse -File -ErrorAction SilentlyContinue
    }

    $rows = foreach ($i in ($inputs | Sort-Object FullName)) {
        $rel = $i.FullName.Substring($Root.Length).TrimStart('\').ToLowerInvariant()
        $hash = (Get-FileHash -LiteralPath $i.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $rel + ':' + $hash
    }
    $payload = [System.Text.Encoding]::UTF8.GetBytes(($rows -join "`n"))
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($payload))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Frontend-NeedsBuild {
    if (-not (Test-Path $Dist)) { return $true }

    $stamp = Join-Path (Split-Path $Dist -Parent) '.build-stamp'
    if (-not (Test-Path $stamp)) { return $true }

    try {
        $expected = (Get-Content -LiteralPath $stamp -Raw).Trim()
        $actual = Get-FrontendFingerprint
        return ($expected -ne $actual)
    } catch {
        # Se il fingerprint non è leggibile, meglio ricompilare che servire
        # un bundle potenzialmente vecchio.
        return $true
    }
}

# Restituisce la cartella che contiene node.exe e npm.cmd
function Ensure-Node {
    $local = Join-Path $NodeDir 'node.exe'
    if (Test-Path $local) { return $NodeDir }

    $n = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($n) {
        $v = ''
        try { $v = (& $n.Source --version) } catch { }
        if ("$v" -match '^v(\d+)\.' -and [int]$Matches[1] -ge 18) { return (Split-Path $n.Source) }
    }

    Say '      Scarico Node.js portatile (solo la prima volta, ~30 MB)...'
    $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30
    $lts = $releases | Where-Object { $_.lts } | Select-Object -First 1
    if (-not $lts) { throw 'Impossibile determinare la versione LTS di Node.js.' }
    $ver = $lts.version
    $arch = 'x64'
    try { if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64') { $arch = 'arm64' } } catch { }
    $zipName = "node-$ver-win-$arch.zip"
    $zip = Join-Path $Rt $zipName
    Download "https://nodejs.org/dist/$ver/$zipName" $zip

    $shas = Invoke-RestMethod -Uri "https://nodejs.org/dist/$ver/SHASUMS256.txt" -TimeoutSec 30
    $line = ($shas -split "`n" | Where-Object { $_ -match [regex]::Escape($zipName) } | Select-Object -First 1)
    if ($line) {
        $expected = ($line -split '\s+')[0].ToLower()
        $actual = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLower()
        if ($actual -ne $expected) { Remove-Item -Force $zip; throw 'Checksum di Node.js non valido (download corrotto). Riprova.' }
    }

    $tmp = Join-Path $Rt 'node-extract'
    Unzip $zip $tmp
    $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
    if (Test-Path $NodeDir) { Remove-Item -Recurse -Force $NodeDir }
    Move-Item $inner.FullName $NodeDir
    Remove-Item -Recurse -Force $tmp, $zip -ErrorAction SilentlyContinue
    if (-not (Test-Path $local)) { throw 'Node.js portatile non installato correttamente.' }
    return $NodeDir
}

function Ensure-Frontend {
    if (-not (Frontend-NeedsBuild)) { return }
    Say '[3/4] Preparo l''interfaccia (solo la prima volta o dopo un aggiornamento, qualche minuto)...'
    $nodeHome = Ensure-Node
    # node deve essere nel PATH: gli script di installazione di alcuni
    # pacchetti (esbuild...) lo cercano per nome.
    $env:PATH = "$nodeHome;$env:PATH"
    $npm = Join-Path $nodeHome 'npm.cmd'

    $vite = Join-Path $Root 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path $vite)) {
        $nm = Join-Path $Root 'node_modules'
        if (Test-Path $nm) {
            Say '      node_modules incompleto: lo ricreo da zero...'
            Remove-Item -Recurse -Force $nm
        }
        Say '      Installo le dipendenze npm...'
        $rc = Invoke-Native $npm @('install', '--no-audit', '--no-fund')
        if ($rc -ne 0 -or -not (Test-Path $vite)) {
            throw "npm install fallito (codice $rc). Se hai un antivirus, escludi la cartella del progetto e riprova."
        }
    }

    Say '      Compilo l''interfaccia...'
    $rc = Invoke-Native $npm @('run', 'build')
    if ($rc -ne 0 -or -not (Test-Path $Dist)) { throw "npm run build fallito (codice $rc)." }

    # Salva il fingerprint del bundle appena compilato: al prossimo avvio
    # possiamo capire con certezza se un git pull ha modificato il frontend,
    # senza affidarci ai timestamp del filesystem.
    $stamp = Join-Path (Split-Path $Dist -Parent) '.build-stamp'
    Set-Content -LiteralPath $stamp -Value (Get-FrontendFingerprint) -Encoding ASCII
}

function Start-MyBudgetServer {
    Say '[4/4] Avvio MyBudget...'
    $env:MYBUDGET_DB   = Join-Path $DataDir 'mybudget.db'
    $env:MYBUDGET_HOST = '127.0.0.1'          # raggiungibile solo da questo PC
    $env:PORT          = "$Port"
    Remove-Item -Force $ServerLog, "$ServerLog.err" -ErrorAction SilentlyContinue
    Start-Process -FilePath $Py -ArgumentList ('"{0}"' -f $Server) -WorkingDirectory $Root `
        -WindowStyle Hidden -RedirectStandardOutput $ServerLog -RedirectStandardError "$ServerLog.err" | Out-Null

    for ($i = 0; $i -lt 40; $i++) {
        if (Test-Server) { return }
        Start-Sleep -Milliseconds 500
    }
    Show-LogTail $ServerLog
    Show-LogTail "$ServerLog.err"
    Show-LogTail (Join-Path $DataDir 'server-error.log')
    throw "Il server non risponde su $Url. Se la porta $Port e' occupata da un altro programma, chiudilo e riprova."
}

# ---------------------------------------------------------------- main
try {
    if ($Action -eq 'stop') {
        $n = Stop-MyBudget
        if ($n -gt 0) { Write-Host 'MyBudget chiuso.' } else { Write-Host 'MyBudget non era in esecuzione.' }
        exit 0
    }

    if (-not (Test-Path $Server)) { throw "Non trovo $Server : avvia questo file dalla cartella del progetto." }

    # Non riutilizzare mai un'istanza già aperta: dopo un git pull potrebbe
    # essere il server della versione precedente e servire frontend/backend
    # vecchi. Il launcher deve sempre partire dal codice corrente del checkout.
    $stopped = Stop-MyBudget
    if ($stopped -gt 0) {
        for ($i = 0; $i -lt 20; $i++) {
            if (-not (Test-Server)) { break }
            Start-Sleep -Milliseconds 250
        }
    }
    if (Test-Server) {
        throw "La porta $Port e' gia' occupata da un altro programma. Chiudilo e riprova."
    }

    Ensure-Python
    Ensure-PythonPackages
    Ensure-Frontend
    Start-MyBudgetServer
    Start-Process $Url
    Write-Host "MyBudget e' aperto: $Url  (per chiuderlo: Avvia-MyBudget.bat stop)"
    Start-Sleep -Seconds 2
    exit 0
}
catch {
    Write-Host ''
    Write-Host ('*** ERRORE: ' + $_.Exception.Message)
    Write-Host "    Dettagli: $SetupLog"
    Show-LogTail $SetupLog 15
    exit 1
}
