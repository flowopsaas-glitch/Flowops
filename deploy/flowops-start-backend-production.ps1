Set-Location "C:\deploy\flowops\backend-dist"

if (-not (Test-Path ".env")) {
  Copy-Item ".env.production" ".env" -Force
}

npm install --omit=dev
node dist\main.js
