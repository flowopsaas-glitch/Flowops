$source = "C:\flowops\release\frontend-dist"
$target = "C:\deploy\flowops\frontend-dist"

New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item (Join-Path $source "*") $target -Recurse -Force

Write-Host "Frontend release copied to production target:" -ForegroundColor Green
Write-Host $target
