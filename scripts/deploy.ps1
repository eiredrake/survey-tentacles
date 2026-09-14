[CmdletBinding()]
param(
    [string]$Version,
    [string]$EnvFile,
    [switch]$Preview
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repo = Split-Path $PSScriptRoot -Parent
$dockerExecutable = (Get-Command docker -CommandType Application | Select-Object -First 1).Source
if (!$Version) {
    $entry = @(Get-Content -LiteralPath (Join-Path $repo 'backend/gradle.properties') | Where-Object { $_ -match '^version=' })
    if ($entry.Count -ne 1) { throw 'Expected one version entry in backend/gradle.properties.' }
    $Version = $entry[0].Substring(8)
}
if ($Version -cnotmatch '^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') { throw 'Use a version such as v1.7.2.' }
$tag = 'v' + $Version.TrimStart('v')
if (!$EnvFile) { $EnvFile = Join-Path $repo '.env' }
$EnvFile = (Resolve-Path -LiteralPath $EnvFile).Path
$composeFile = Join-Path $repo 'infra/docker-compose.yml'
$image = "ghcr.io/eiredrake/survey_tentacles:$tag"
Write-Host "Target: existing survey-tentacles production app; image: $image"
if ($Preview) { Write-Host 'Preview only: would validate storage, pull the image, update only tentacles, and check port 8080.'; return }
function Docker {
    $result = & $dockerExecutable @args
    if ($LASTEXITCODE -ne 0) { throw "docker $($args[0]) failed; deployment stopped." }
    return $result
}
$oldVersion = [Environment]::GetEnvironmentVariable('TENTACLES_VERSION', 'Process')
try {
    $env:TENTACLES_VERSION = $tag
    $compose = @('compose', '--project-name', 'survey-tentacles', '--env-file', $EnvFile, '-f', $composeFile)
    # Capture the resolved configuration privately: it contains credentials.
    $config = (Docker @compose config --format json) | ConvertFrom-Json
    if ($config.services.tentacles.image -ne $image) { throw 'Resolved image does not match the requested release.' }
    $app = @((Docker inspect tentacles) | ConvertFrom-Json)[0]
    $db = @((Docker inspect tentacles-db) | ConvertFrom-Json)[0]
    foreach ($container in @($app, $db)) {
        if ($container.Config.Labels.'com.docker.compose.project' -ne 'survey-tentacles') { throw 'Existing containers belong to a different Compose project. Stop and reconcile the deployment configuration.' }
    }
    if (!$db.State.Running) { throw 'Production database is not running; this script will not start or replace it.' }
    foreach ($check in @(@{ Container = $app; Service = 'tentacles'; Target = '/app/uploads' }, @{ Container = $db; Service = 'tentacles-db'; Target = '/var/lib/postgresql/data' })) {
        $desired = @($config.services.($check.Service).volumes | Where-Object { $_.target -eq $check.Target })
        $actual = @($check.Container.Mounts | Where-Object { $_.Destination -eq $check.Target })
        if ($desired.Count -ne 1 -or $actual.Count -ne 1 -or $desired[0].type -ne 'volume' -or $actual[0].Type -ne 'volume') { throw 'Expected named production storage was not found. No containers changed.' }
        $expectedName = $config.volumes.($desired[0].source).name
        if ($actual[0].Name -ne $expectedName) { throw "Volume mismatch at $($check.Target). No containers changed." }
    }
    if ($config.services.tentacles.environment.TENTACLES_UPLOAD_DIR -ne '/app/uploads') { throw 'Production upload directory must match the /app/uploads volume.' }
    $previous = $app.Config.Image
    $null = Docker @compose pull tentacles
    # Pull failure leaves the running app alone. No build, database recreation, or volume removal.
    $null = Docker @compose up -d --no-deps --no-build --pull never tentacles
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $running = @((Docker inspect tentacles) | ConvertFrom-Json)[0]
        if ($running.State.Running -and $running.Config.Image -eq $image) {
            try {
                $health = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/health' -UseBasicParsing -TimeoutSec 3
                if ($health.StatusCode -eq 200 -and $health.Content.Trim() -eq 'Tentacles is alive.') { Write-Host "Healthy: $tag. Previous image: $previous"; return }
            } catch { }
        }
        Start-Sleep -Seconds 2
    }
    throw "Health check failed. Previous image: $previous. Inspect logs before rollback; a release may have changed the database schema."
} finally {
    [Environment]::SetEnvironmentVariable('TENTACLES_VERSION', $oldVersion, 'Process')
}
