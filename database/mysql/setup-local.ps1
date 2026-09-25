$ErrorActionPreference = "Stop"

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
  Write-Host ""
  Write-Host "Docker CLI was not found on this Windows installation." -ForegroundColor Red
  Write-Host "Install Docker Desktop, restart PowerShell, open Docker Desktop and wait until it says Docker is running." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Quick install with winget:" -ForegroundColor Cyan
  Write-Host "  winget install -e --id Docker.DockerDesktop"
  Write-Host ""
  Write-Host "After installation, restart Windows if Docker/WSL asks for it, then run this script again." -ForegroundColor Cyan
  exit 2
}

try {
  docker info *> $null
} catch {
  Write-Host ""
  Write-Host "Docker is installed, but the Docker engine is not running." -ForegroundColor Red
  Write-Host "Open Docker Desktop and wait until the engine is running, then run this script again." -ForegroundColor Yellow
  exit 3
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$composeFile = Join-Path $PSScriptRoot "docker-compose.yml"
$container = "chamaentrega-mysql-shadow"

Write-Host "Starting isolated ChamaEntrega MySQL..." -ForegroundColor Cyan
docker compose -f $composeFile up -d

Write-Host "Waiting for MySQL health check..." -ForegroundColor Cyan
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
  $status = docker inspect --format "{{.State.Health.Status}}" $container 2>$null
  if ($status -eq "healthy") {
    $healthy = $true
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $healthy) {
  throw "MySQL container did not become healthy."
}

$migrations = @(
  "database\mysql\schema.sql",
  "database\mysql\002_runtime_foundation.sql",
  "database\mysql\003_mysql_compatibility_fixes.sql",
  "database\mysql\004_text_capacity.sql",
  "database\mysql\005_api_sessions_realtime.sql"
)

foreach ($relative in $migrations) {
  $path = Join-Path $repoRoot $relative
  if (-not (Test-Path $path)) {
    throw "Migration not found: $path"
  }
  Write-Host "Applying $relative..." -ForegroundColor Yellow
  Get-Content -Raw -Encoding UTF8 $path |
    docker exec -i $container mysql --default-character-set=utf8mb4 -uchamaentrega -pchamaentrega-dev chamaentrega
  if ($LASTEXITCODE -ne 0) {
    throw "Migration failed: $relative"
  }
}

Write-Host ""
Write-Host "MySQL shadow environment is ready." -ForegroundColor Green
Write-Host "MYSQL_URL=mysql://chamaentrega:chamaentrega-dev@127.0.0.1:3307/chamaentrega?ssl=false"
Write-Host ""
Write-Host "This database is development-only. Do not use these credentials in production." -ForegroundColor DarkYellow
