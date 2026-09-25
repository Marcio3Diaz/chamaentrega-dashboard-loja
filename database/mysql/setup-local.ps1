$ErrorActionPreference = "Stop"

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
  "database\mysql\004_text_capacity.sql"
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
