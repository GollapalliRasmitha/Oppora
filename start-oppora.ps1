<#
.SYNOPSIS
  Starts Oppora locally: Docker (Postgres + Redis), database migrations, the
  Django backend and the Next.js frontend, then opens http://localhost:3000.

.DESCRIPTION
  Safe to run again at any time: services that are already running are left
  alone. On the first run it also creates .env, the Python virtual environment
  and node_modules.

.PARAMETER RefreshDemo
  Reloads the demo data (manage.py seed_demo) before starting, so the demo's
  dates are relative to today again. Replaces the demo account's data.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\start-oppora.ps1

.PARAMETER NoBrowser
  Don't open the browser at the end.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\start-oppora.ps1 -RefreshDemo
#>
param([switch]$RefreshDemo, [switch]$NoBrowser)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

function Test-Port([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try { $client.Connect("127.0.0.1", $Port); return $true } catch { return $false } finally { $client.Close() }
}

function Invoke-Checked([string]$What, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { Fail "$What failed (exit code $LASTEXITCODE)." }
}

# --- Prerequisites -------------------------------------------------------------
Step "Checking prerequisites"
foreach ($tool in @("docker", "node", "npm", "py")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Fail "'$tool' was not found. Install it first (see README.md > Run Oppora on Windows)."
  }
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker is not running. Start Docker Desktop, wait until it says 'Engine running', then run this script again." }

# --- .env ----------------------------------------------------------------------
$EnvFile = Join-Path $Root ".env"
if (-not (Test-Path $EnvFile)) {
  Step "Creating .env from .env.example (with fresh random keys)"
  Copy-Item (Join-Path $Root ".env.example") $EnvFile
}

# --- Python virtual environment --------------------------------------------------
$Marker = Join-Path $Backend ".venv\.installed"
$Reqs = Join-Path $Backend "requirements-dev.txt"
if (-not (Test-Path $Python)) {
  Step "Creating the Python virtual environment (backend\.venv)"
  Invoke-Checked "Creating the venv" { py -3.14 -m venv (Join-Path $Backend ".venv") }
}
$reqFiles = Get-ChildItem (Join-Path $Backend "requirements*.txt")
if (-not (Test-Path $Marker) -or ($reqFiles | Where-Object { $_.LastWriteTime -gt (Get-Item $Marker).LastWriteTime })) {
  Step "Installing backend packages"
  Invoke-Checked "pip install" { & $Python -m pip install --quiet --disable-pip-version-check -r $Reqs }
  New-Item -ItemType File -Force $Marker | Out-Null
}

# Fill in secrets that are still blank or placeholders. They never leave this machine.
$text = Get-Content $EnvFile -Raw
$before = $text
if ($text -match "(?m)^DJANGO_SECRET_KEY=(change-me)?\s*$") {
  $secret = & $Python -c "import secrets; print(secrets.token_urlsafe(50))"
  $text = $text -replace "(?m)^DJANGO_SECRET_KEY=.*$", "DJANGO_SECRET_KEY=$secret"
}
if ($text -match "(?m)^TOKEN_ENCRYPTION_KEY=\s*$") {
  $fernet = & $Python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  $text = $text -replace "(?m)^TOKEN_ENCRYPTION_KEY=.*$", "TOKEN_ENCRYPTION_KEY=$fernet"
}
if ($text -ne $before) {
  Step "Generated missing secret keys in .env"
  [System.IO.File]::WriteAllText($EnvFile, $text)
}

# --- Frontend packages ----------------------------------------------------------
$NodeModules = Join-Path $Frontend "node_modules"
$Lock = Join-Path $Frontend "package-lock.json"
if (-not (Test-Path $NodeModules) -or (Get-Item $Lock).LastWriteTime -gt (Get-Item $NodeModules).LastWriteTime) {
  Step "Installing frontend packages (npm install)"
  Push-Location $Frontend
  try { Invoke-Checked "npm install" { npm install --no-fund --no-audit } } finally { Pop-Location }
  (Get-Item $NodeModules).LastWriteTime = Get-Date
}

# --- Database --------------------------------------------------------------------
Step "Starting Postgres and Redis (Docker)"
Push-Location $Root
try { Invoke-Checked "docker compose up" { docker compose up -d --wait } } finally { Pop-Location }

Step "Applying database migrations"
Push-Location $Backend
try {
  Invoke-Checked "migrate" { & $Python manage.py migrate --no-input -v 0 }
  if ($RefreshDemo) {
    Step "Refreshing the demo data (seed_demo)"
    Invoke-Checked "seed_demo" { & $Python manage.py seed_demo }
  }
} finally { Pop-Location }

# --- Servers -----------------------------------------------------------------------
if (Test-Port 8000) {
  Step "Backend already running on port 8000"
} else {
  Step "Starting the Django backend in a new window (port 8000)"
  $cmd = "`$Host.UI.RawUI.WindowTitle = 'Oppora backend'; & '$Python' manage.py runserver 127.0.0.1:8000"
  Start-Process powershell -WorkingDirectory $Backend -ArgumentList "-NoExit", "-Command", $cmd
}

if (Test-Port 3000) {
  Step "Frontend already running on port 3000"
} else {
  Step "Starting the Next.js frontend in a new window (port 3000)"
  $cmd = "`$Host.UI.RawUI.WindowTitle = 'Oppora frontend'; npm run dev"
  Start-Process powershell -WorkingDirectory $Frontend -ArgumentList "-NoExit", "-Command", $cmd
}

Step "Waiting for http://localhost:3000"
$deadline = (Get-Date).AddSeconds(120)
while (-not (Test-Port 3000)) {
  if ((Get-Date) -gt $deadline) { Fail "The frontend didn't start within 2 minutes. Check the 'Oppora frontend' window." }
  Start-Sleep -Seconds 1
}
if (-not $NoBrowser) { Start-Process "http://localhost:3000" }
Write-Host ""
Write-Host "Oppora is running at http://localhost:3000" -ForegroundColor Green
Write-Host "To stop it, close the 'Oppora backend' and 'Oppora frontend' windows. 'docker compose stop' stops the database."
