Set-Location "C:\flowops"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "FlowOps Go-Live Build + Release Script" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot  = "C:\flowops"
$frontendRoot = Join-Path $projectRoot "frontend"
$backendRoot  = Join-Path $projectRoot "backend"
$releaseRoot  = Join-Path $projectRoot "release"
$releaseFrontendRoot = Join-Path $releaseRoot "frontend-dist"
$releaseBackendRoot  = Join-Path $releaseRoot "backend-dist"

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
New-Item -ItemType Directory -Force -Path $releaseFrontendRoot | Out-Null
New-Item -ItemType Directory -Force -Path $releaseBackendRoot | Out-Null

Write-Host "Building backend..." -ForegroundColor Yellow
Set-Location $backendRoot
npm run build
if ($LASTEXITCODE -ne 0) {
  throw "Backend build failed."
}

Write-Host "Building frontend..." -ForegroundColor Yellow
Set-Location $frontendRoot
npm run build
if ($LASTEXITCODE -ne 0) {
  throw "Frontend build failed."
}

Write-Host "Refreshing release folders..." -ForegroundColor Yellow
Remove-Item -Recurse -Force $releaseFrontendRoot -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $releaseBackendRoot -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $releaseFrontendRoot | Out-Null
New-Item -ItemType Directory -Force -Path $releaseBackendRoot | Out-Null

Copy-Item (Join-Path $frontendRoot "dist\*") $releaseFrontendRoot -Recurse -Force
Copy-Item (Join-Path $backendRoot "dist\*")  $releaseBackendRoot -Recurse -Force
Copy-Item (Join-Path $backendRoot "package.json") $releaseBackendRoot -Force
Copy-Item (Join-Path $backendRoot ".env.production") $releaseBackendRoot -Force

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "FlowOps release package prepared" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend release:" -ForegroundColor Yellow
Write-Host $releaseFrontendRoot
Write-Host ""
Write-Host "Backend release:" -ForegroundColor Yellow
Write-Host $releaseBackendRoot
Write-Host ""
