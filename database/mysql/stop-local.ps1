$ErrorActionPreference = "Stop"
$composeFile = Join-Path $PSScriptRoot "docker-compose.yml"
docker compose -f $composeFile down
Write-Host "ChamaEntrega MySQL shadow container stopped." -ForegroundColor Green
