# Floatie installer for Windows 10/11. Run in PowerShell:
#   irm https://raw.githubusercontent.com/ZirkoMirkoLabs/floatie/main/install.ps1 | iex
# Downloads the newest installer from GitHub Releases, installs it for the current user (no admin) and starts Floatie.
# Re-run it any time to update; your tasks and clipboard history are kept.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$repo = 'ZirkoMirkoLabs/floatie'

$rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'floatie-installer' }
$asset = $rel.assets | Where-Object { $_.name -like 'Floatie-Setup-*.exe' } | Select-Object -First 1
if (-not $asset) { throw "No Windows installer found in release $($rel.tag_name)." }

$exe = Join-Path $env:TEMP $asset.name
Write-Host "Downloading Floatie $($rel.tag_name)..."
Invoke-WebRequest $asset.browser_download_url -OutFile $exe -UseBasicParsing
Write-Host 'Installing...'
$p = Start-Process $exe -ArgumentList '/S' -Wait -PassThru
Remove-Item $exe -Force -ErrorAction SilentlyContinue
$app = Join-Path $env:LOCALAPPDATA 'Programs\Floatie\Floatie.exe'
if ($p.ExitCode -ne 0 -or -not (Test-Path $app)) { throw "The installer didn't finish (exit code $($p.ExitCode)). Try again, or download it from https://github.com/$repo/releases/latest" }

Start-Process $app
Write-Host 'Floatie is installed. Find it in the Start Menu; press Ctrl+Alt+Space to show or hide it.'
