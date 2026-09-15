# Exercise deployment against a fake Docker executable, never the host daemon.
$ErrorActionPreference = 'Stop'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('tentacles-deploy-test-' + [guid]::NewGuid())
$oldPath = $env:PATH
$oldRoot = $env:TENTACLES_TEST_DOCKER_ROOT
$oldScenario = $env:TENTACLES_TEST_DOCKER_SCENARIO
$oldVersion = $env:TENTACLES_VERSION
$null = New-Item -ItemType Directory -Path "$temp/scripts", "$temp/backend", "$temp/infra", "$temp/bin" -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'deploy.ps1') -Destination "$temp/scripts/deploy.ps1"
Set-Content "$temp/backend/gradle.properties" 'version=1.7.2'
Set-Content "$temp/.env" '# Fake deployment credentials'
Set-Content "$temp/infra/docker-compose.yml" '# Resolved by fake Docker'
$fake = @'
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.TENTACLES_TEST_DOCKER_ROOT;
const scenario = process.env.TENTACLES_TEST_DOCKER_SCENARIO;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify(args) + '\n');
const image = 'ghcr.io/eiredrake/survey_tentacles:' + process.env.TENTACLES_VERSION;
const upload = 'survey-tentacles_tentacles-upload-data';
const database = 'survey-tentacles_tentacles-postgres-data';
const updated = path.join(root, 'updated');
if (args[0] === 'compose' && args.includes('config')) {
  console.log(JSON.stringify({ services: {
    tentacles: { image, networks: { proxy: null }, environment: { TENTACLES_UPLOAD_DIR: '/app/uploads' }, volumes: [{ type: 'volume', source: 'uploads', target: '/app/uploads' }] },
    'tentacles-db': { networks: { proxy: null }, volumes: [{ type: 'volume', source: 'database', target: '/var/lib/postgresql/data' }] }
  }, networks: { proxy: { name: scenario === 'wrong-network' ? 'wrong-default-network' : 'proxy-tier' } }, volumes: { uploads: { name: upload }, database: { name: database } } }));
} else if (args[0] === 'inspect') {
  const app = args[1] === 'tentacles';
  console.log(JSON.stringify([{ Config: { Image: app && fs.existsSync(updated) ? image : 'previous-image', Env: ['TENTACLES_UPLOAD_DIR=' + (scenario === 'wrong-env' ? '/wrong' : '/app/uploads')], Labels: { 'com.docker.compose.project.config_files': path.join(root, 'infra/docker-compose.yml'), 'com.docker.compose.project': scenario === 'wrong-project' ? 'other-project' : 'survey-tentacles' } }, NetworkSettings: { Networks: { 'proxy-tier': {} } },
    State: { Running: true }, Mounts: [{ Type: 'volume', Name: scenario === 'wrong-volume' ? 'unexpected-volume' : app ? upload : database, Destination: app ? '/app/uploads' : '/var/lib/postgresql/data' }] }]));
} else if (args[0] === 'compose' && args.includes('pull')) {
  if (scenario === 'pull-fails') process.exit(1);
} else if (args[0] === 'compose' && args.includes('up')) {
  if (!args.includes('--no-deps') || !args.includes('--no-build') || args.at(-1) !== 'tentacles') process.exit(2);
  fs.writeFileSync(updated, 'yes');
} else process.exit(3);
'@
[IO.File]::WriteAllText("$temp/bin/fake-docker.cjs", $fake)
if ([Environment]::OSVersion.Platform -eq 'Win32NT') {
    [IO.File]::WriteAllText("$temp/bin/docker.cmd", "@echo off`r`nnode `"%~dp0fake-docker.cjs`" %*`r`n")
} else {
    [IO.File]::WriteAllText("$temp/bin/docker", "#!/bin/sh`nexec node `"$temp/bin/fake-docker.cjs`" `"`$@`"`n")
    & chmod +x "$temp/bin/docker"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare fake Docker executable' }
}
function Invoke-WebRequest { return [pscustomobject]@{ StatusCode = 200; Content = 'Tentacles is alive.' } }
try {
    $env:PATH = "$temp/bin" + [IO.Path]::PathSeparator + $oldPath
    $env:TENTACLES_TEST_DOCKER_ROOT = $temp
    $env:TENTACLES_VERSION = 'restore-this-value'
    $selected = (Get-Command docker -CommandType Application | Select-Object -First 1).Source
    if (!$selected.StartsWith($temp)) { throw 'Fake Docker was not selected; refusing to test' }
    Copy-Item "$temp/.env" "$temp/infra/.env"
    & "$temp/scripts/deploy.ps1" -Preview
    if ((Get-Content -Raw "$temp/calls.jsonl") -match '"pull"|"up"') { throw 'Preview mutated Docker' }
    foreach ($scenario in @('wrong-project', 'wrong-volume', 'wrong-network', 'wrong-env', 'pull-fails', 'success')) {
        $env:TENTACLES_TEST_DOCKER_SCENARIO = $scenario
        Set-Content "$temp/calls.jsonl" ''
        $failed = $false
        try { & "$temp/scripts/deploy.ps1" } catch { $failed = $true }
        if ($failed -eq ($scenario -eq 'success')) { throw "Unexpected result for $scenario" }
        if ($env:TENTACLES_VERSION -ne 'restore-this-value') { throw 'Deployment leaked environment changes' }
        $calls = @(Get-Content "$temp/calls.jsonl" | Where-Object { $_ } | ForEach-Object { ,($_ | ConvertFrom-Json) })
        $updates = @($calls | Where-Object { $_ -contains 'up' })
        if ($updates.Count -ne [int]($scenario -eq 'success')) { throw "Unexpected update for $scenario" }
        if ($scenario -eq 'success' -and !(Test-Path "$temp/updated")) { throw 'Successful deployment did not update the app' }
    }
    Write-Host 'PASS: production config discovery, preview, project/volume/network/environment guards, pull failure, app-only update, health check, and environment restoration.'
} finally {
    $env:PATH = $oldPath
    [Environment]::SetEnvironmentVariable('TENTACLES_TEST_DOCKER_ROOT', $oldRoot, 'Process')
    [Environment]::SetEnvironmentVariable('TENTACLES_TEST_DOCKER_SCENARIO', $oldScenario, 'Process')
    [Environment]::SetEnvironmentVariable('TENTACLES_VERSION', $oldVersion, 'Process')
    $resolved = [IO.Path]::GetFullPath($temp)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (!$resolved.StartsWith($tempRoot) -or !([IO.Path]::GetFileName($resolved).StartsWith('tentacles-deploy-test-'))) { throw 'Unsafe test cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
