$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Error 'Install Node.js 22.13+ and npm, then try again.'; exit 1 }
& node scripts/start.mjs @args
exit $LASTEXITCODE
