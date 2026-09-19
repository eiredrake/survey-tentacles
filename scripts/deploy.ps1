[CmdletBinding()]
param(
    [string]$Version,
    [string]$EnvFile,
    [string[]]$ComposeFile,
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
$image = "ghcr.io/eiredrake/survey_tentacles:$tag"
Write-Host "Target: existing survey-tentacles production app; image: $image"
function Docker {
    $result = & $dockerExecutable @args
    if ($LASTEXITCODE -ne 0) { throw "docker $($args[0]) failed; deployment stopped." }
    return $result
}
$oldVersion = [Environment]::GetEnvironmentVariable('TENTACLES_VERSION', 'Process')
$overrideFile = $null
try {
    $env:TENTACLES_VERSION = $tag
    $app = @((Docker inspect tentacles) | ConvertFrom-Json)[0]
    $db = @((Docker inspect tentacles-db) | ConvertFrom-Json)[0]
    if (!$ComposeFile) {
        $source = $app.Config.Labels.'com.docker.compose.project.config_files'
        if (!$source) { throw 'Cannot discover the production Compose file. Supply -ComposeFile explicitly.' }
        $ComposeFile = @($source.Split(',') | Where-Object { $_ -notmatch 'tentacles-image-override-' })
    }
    $ComposeFile = @($ComposeFile | ForEach-Object { (Resolve-Path -LiteralPath $_).Path })
    if (!$ComposeFile.Count) { throw 'No production Compose file found.' }
    if (!$EnvFile) { $EnvFile = Join-Path (Split-Path $ComposeFile[0] -Parent) '.env' }
    $EnvFile = (Resolve-Path -LiteralPath $EnvFile).Path
    Write-Host "Production Compose: $($ComposeFile -join ', ')"
    Write-Host "Environment file: $EnvFile"
    $overrideFile = Join-Path ([IO.Path]::GetTempPath()) ('tentacles-image-override-' + [guid]::NewGuid() + '.json')
    $override = @{ services = @{ tentacles = @{ image = $image } } }
    [IO.File]::WriteAllText($overrideFile, ($override | ConvertTo-Json -Depth 8))
    $compose = @('compose', '--project-name', 'survey-tentacles', '--env-file', $EnvFile)
    foreach ($file in $ComposeFile) { $compose += @('-f', $file) }
    $compose += @('-f', $overrideFile)
    # Capture the resolved configuration privately: it contains credentials.
    $config = (Docker @compose config --format json) | ConvertFrom-Json
    if ($config.services.tentacles.image -ne $image) { throw 'Resolved image does not match the requested release.' }
    foreach ($container in @($app, $db)) {
        if ($container.Config.Labels.'com.docker.compose.project' -ne 'survey-tentacles') { throw 'Existing containers belong to a different Compose project. Stop and reconcile the deployment configuration.' }
    }
    if (!$db.State.Running) { throw 'Production database is not running; this script will not start or replace it.' }
    foreach ($check in @(@{ Container = $app; Service = 'tentacles' }, @{ Container = $db; Service = 'tentacles-db' })) {
        $expectedNetworks = @($config.services.($check.Service).networks.PSObject.Properties.Name | ForEach-Object { $config.networks.$_.name } | Sort-Object)
        $actualNetworks = @($check.Container.NetworkSettings.Networks.PSObject.Properties.Name | Sort-Object)
        if (!$expectedNetworks.Count -or (Compare-Object $expectedNetworks $actualNetworks)) { throw "Network mismatch for $($check.Service). No containers changed." }
    }
    $sharedNetworks = @($app.NetworkSettings.Networks.PSObject.Properties.Name | Where-Object { $db.NetworkSettings.Networks.PSObject.Properties.Name -contains $_ })
    if (!$sharedNetworks.Count) { throw 'The app and database have no shared network. No containers changed.' }
    foreach ($entry in $config.services.tentacles.environment.PSObject.Properties) {
        $existing = @($app.Config.Env | Where-Object { $_.StartsWith($entry.Name + '=') })
        if ($existing.Count -ne 1 -or $existing[0] -cne ($entry.Name + '=' + [string]$entry.Value)) { throw "Environment mismatch for $($entry.Name). Check the production .env. No containers changed." }
    }
    foreach ($check in @(@{ Container = $app; Service = 'tentacles'; Target = '/app/uploads' }, @{ Container = $db; Service = 'tentacles-db'; Target = '/var/lib/postgresql/data' })) {
        $desired = @($config.services.($check.Service).volumes | Where-Object { $_.target -eq $check.Target })
        $actual = @($check.Container.Mounts | Where-Object { $_.Destination -eq $check.Target })
        if ($desired.Count -ne 1 -or $actual.Count -ne 1 -or $desired[0].type -ne 'volume' -or $actual[0].Type -ne 'volume') { throw 'Expected named production storage was not found. No containers changed.' }
        $expectedName = $config.volumes.($desired[0].source).name
        if ($actual[0].Name -ne $expectedName) { throw "Volume mismatch at $($check.Target). No containers changed." }
    }
    if ($config.services.tentacles.environment.TENTACLES_UPLOAD_DIR -ne '/app/uploads') { throw 'Production upload directory must match the /app/uploads volume.' }
    if ($Preview) { Write-Host 'Preview passed: production configuration, networks, environment, and storage match. No image pulled or containers changed.'; return }
    $previous = $app.Config.Image
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $pullOutput = @(& $dockerExecutable @compose pull tentacles 2>&1)
        $pullExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($pullExitCode -ne 0) {
        $pullText = $pullOutput -join [Environment]::NewLine
        if ($pullText -match 'manifest unknown') {
            Write-Host '|----------------------------------------------------------------------------------------------------------------------------|'
            Write-Host '|Image is not available yet. If you just released the version, wait for the GitHub release build to finish before deploying. |'
            Write-Host '|----------------------------------------------------------------------------------------------------------------------------|'
            throw "Image $image is not available yet. If you just released $tag, wait for the GitHub release build to finish before deploying."
        }
        throw "docker compose pull failed; deployment stopped.`n$pullText"
    }
    # Pull failure leaves the running app alone. No build, database recreation, or volume removal.
    $null = Docker @compose up -d --no-deps --no-build --pull never tentacles
    Write-Host 'Waiting for the application health check (up to about 150 seconds)...'
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $running = @((Docker inspect tentacles) | ConvertFrom-Json)[0]
        if ($running.State.Running -and $running.Config.Image -eq $image) {
            try {
                $health = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/health' -UseBasicParsing -TimeoutSec 3
                if ($health.StatusCode -eq 200 -and $health.Content.Trim() -eq 'Tentacles is alive.') { Write-Host "Healthy: $tag. Previous image: $previous"; return }
            } catch { }
        }
        Start-Sleep -Seconds 2
        if (($attempt + 1) % 5 -eq 0) { Write-Host "Still waiting for /health; check $($attempt + 1) of 30." }
    }
    throw "Health check failed. Previous image: $previous. Inspect logs before rollback; a release may have changed the database schema."
} finally {
    [Environment]::SetEnvironmentVariable('TENTACLES_VERSION', $oldVersion, 'Process')
    if ($overrideFile -and (Test-Path -LiteralPath $overrideFile)) { Remove-Item -LiteralPath $overrideFile }
}
