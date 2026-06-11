# PowerShell script to create FlowOps desktop shortcut

$WScriptShell = New-Object -ComObject WScript.Shell
$Desktop = [System.Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $Desktop "FlowOps.lnk"

# Get the current directory (should be installer folder)
$CurrentDir = Get-Location
$RootDir = Split-Path -Parent $CurrentDir

# Create shortcut
$Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "cmd.exe"
$Shortcut.Arguments = "/k cd /d `"$RootDir`" && start_flowops.bat"
$Shortcut.WorkingDirectory = $RootDir
$Shortcut.Description = "FlowOps - Logistics Management Platform"
$Shortcut.IconLocation = Join-Path $RootDir "frontend\public\favicon.ico"
$Shortcut.Save()

Write-Host "Desktop shortcut created at: $ShortcutPath"
