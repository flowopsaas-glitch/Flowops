param(
  [string]$PgRestorePath = "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe",
  [string]$Host = "localhost",
  [int]$Port = 5432,
  [string]$Database = "flowops",
  [string]$Username = "flowops",
  [string]$BackupFile = "C:\flowops\database-backups\REPLACE_ME.backup"
)

if (-not (Test-Path $PgRestorePath)) {
  throw "pg_restore not found at $PgRestorePath"
}

if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "FlowOps PostgreSQL Restore Template" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

& $PgRestorePath `
  --clean `
  --if-exists `
  --no-owner `
  --host=$Host `
  --port=$Port `
  --username=$Username `
  --dbname=$Database `
  $BackupFile

if ($LASTEXITCODE -ne 0) {
  throw "pg_restore failed."
}

Write-Host "Restore completed." -ForegroundColor Green
Write-Host ""
