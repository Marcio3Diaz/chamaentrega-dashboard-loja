$ErrorActionPreference = "Stop"

Write-Host "ChamaEntrega - MySQL local" -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker nao foi encontrado. Instale e abra o Docker Desktop antes de continuar."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop nao esta em execucao."
}

Write-Host "Subindo MySQL 8.4..." -ForegroundColor Yellow
docker compose -f docker-compose.mysql.yml up -d

Write-Host "Aguardando o MySQL ficar saudavel..." -ForegroundColor Yellow
$healthy = $false

for ($i = 0; $i -lt 60; $i++) {
  $status = docker inspect --format='{{.State.Health.Status}}' chamaentrega-mysql 2>$null
  if ($status -eq "healthy") {
    $healthy = $true
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $healthy) {
  docker compose -f docker-compose.mysql.yml logs mysql --tail=80
  throw "O MySQL nao ficou saudavel no tempo esperado."
}

Write-Host ""
Write-Host "MYSQL_LOCAL_OK" -ForegroundColor Green
Write-Host "Banco: chamaentrega"
Write-Host "Host: 127.0.0.1"
Write-Host "Porta: 3307"
Write-Host ""
Write-Host "Use no .env.local:" -ForegroundColor Cyan
Write-Host 'DATABASE_PROVIDER=mysql'
Write-Host 'MYSQL_DATABASE_URL=mysql://chamaentrega:chamaentrega_dev@127.0.0.1:3307/chamaentrega'
Write-Host 'MYSQL_SYNC_FROM_SUPABASE=true'
Write-Host ""
Write-Host "Supabase continua necessario para Auth/Realtime durante a transicao."
