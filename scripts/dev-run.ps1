param(
    [switch]$DebugJava
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env.dev"
$backendDir = Join-Path $repoRoot "backend"

if (-not (Test-Path $envFile)) {
    throw "Development environment file not found: $envFile"
}

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()

    if ($line -and -not $line.StartsWith("#")) {
        $name, $value = $line -split "=", 2

        if (-not $name -or $null -eq $value) {
            throw "Invalid entry in ${envFile}: $line"
        }

        [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
    }
}

Set-Location $backendDir

if ($DebugJava) {
    & .\gradlew.bat bootRun --debug-jvm
} else {
    & .\gradlew.bat bootRun
}

exit $LASTEXITCODE