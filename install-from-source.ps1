# Windows, run-from-source install: dependencies + Desktop and Start Menu shortcuts, then launch.
# (For a normal installer instead, run `npm run dist:win` and use dist\Floatie Setup <version>.exe.)
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
Set-Location $dir

if (-not (Test-Path "$dir\node_modules\electron")) { npm ci }

$electron = "$dir\node_modules\electron\dist\electron.exe"
$sh = New-Object -ComObject WScript.Shell
foreach ($lnk in @("$([Environment]::GetFolderPath('Desktop'))\Floatie.lnk", "$([Environment]::GetFolderPath('Programs'))\Floatie.lnk")) {
  $s = $sh.CreateShortcut($lnk)
  $s.TargetPath = $electron; $s.Arguments = "`"$dir`""; $s.WorkingDirectory = $dir
  $s.IconLocation = "$dir\icon.ico"; $s.Description = 'Floatie - floating tasks and timers'; $s.Save()
}

Write-Host "Installed. Launch 'Floatie' from the Desktop or Start Menu. Toggle anytime with Ctrl+Alt+Space (or the fallback shown in the tray menu)."
Start-Process $electron "`"$dir`"" -WorkingDirectory $dir
