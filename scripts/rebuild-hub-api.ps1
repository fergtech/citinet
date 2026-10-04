# Kept so the old command still works. The real logic now lives in deploy-hub.ps1,
# which also covers the citinet-admin sidecar image and verifies the result.
#
#   .\scripts\rebuild-hub-api.ps1            ->  deploys ONLY the API (as before)
#   .\scripts\deploy-hub.ps1                 ->  deploys API + sidecar (recommended)
param(
    [string]$ComposeFile = (Join-Path $env:USERPROFILE 'citinet-hub\docker-compose.yml')
)
& (Join-Path $PSScriptRoot 'deploy-hub.ps1') -Service api -ComposeFile $ComposeFile
exit $LASTEXITCODE
