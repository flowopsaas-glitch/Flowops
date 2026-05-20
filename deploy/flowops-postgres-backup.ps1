param(
  [string]$PgDumpPath = "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
  [string]$DbHost = "localhost",
  [int]$Port = 5432,
  [string]$Database = "flowops",
  [string]$Username = "postgres",
  [string]$BackupFolder = "C:\flowops\database-backups"
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $BackupFolder | Out-Null

$backupFile = Join-Path $BackupFolder ("flowops-" + $timestamp + ".backup")

if (-not (Test-Path $PgDumpPath)) {
  throw "pg_dump not found at $PgDumpPath"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "FlowOps PostgreSQL Backup" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

& $PgDumpPath `
  --format=custom `
  --host=$DbHost `
  --port=$Port `
  --username=$Username `
  --dbname=$Database `
  --file=$backupFile

if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed."
}

Write-Host "Backup created:" -ForegroundColor Yellow
Write-Host $backupFile
Write-Host ""

