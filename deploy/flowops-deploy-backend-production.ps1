$source = "C:\flowops\release\backend-dist"
$target = "C:\deploy\flowops\backend-dist"

New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item (Join-Path $source "*") $target -Recurse -Force

Write-Host "Backend release copied to production target:" -ForegroundColor Green
Write-Host $target
