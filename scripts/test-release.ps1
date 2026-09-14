# Integration checks run only against a disposable local repository and bare remote.
$ErrorActionPreference = 'Stop'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('tentacles-release-test-' + [guid]::NewGuid())
$repo = Join-Path $temp 'repo'
$remote = Join-Path $temp 'remote.git'
$null = New-Item -ItemType Directory -Path "$repo/scripts", "$repo/backend" -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'release.ps1') -Destination "$repo/scripts/release.ps1"
function CheckGit {
    $output = & git @args
    if ($LASTEXITCODE -ne 0) { throw "Fixture git failed: $args" }
    return $output
}
function ExpectFailure([scriptblock]$Action, [string]$Message) {
    try { & $Action } catch { if ($_.Exception.Message -notlike "*$Message*") { throw }; return }
    throw "Expected rejection: $Message"
}
try {
    $null = CheckGit init --bare $remote
    $null = CheckGit -C $repo init -b main
    $null = CheckGit -C $repo config user.name 'Release Test'
    $null = CheckGit -C $repo config user.email 'release-test@example.invalid'
    $null = CheckGit -C $repo config commit.gpgSign false
    $null = CheckGit -C $repo config tag.gpgSign false
    $null = CheckGit -C $repo config core.hooksPath (Join-Path $temp 'no-hooks')
    Set-Content -LiteralPath "$repo/backend/gradle.properties" -Value 'version=1.7.1'
    $null = CheckGit -C $repo add .
    $null = CheckGit -C $repo commit -m Initial
    $null = CheckGit -C $repo remote add survey-tentacles $remote
    $null = CheckGit -C $repo push survey-tentacles main
    $before = CheckGit -C $repo rev-parse HEAD
    & "$repo/scripts/release.ps1" -Version v1.7.2 -Preview
    if ((CheckGit -C $repo rev-parse HEAD) -ne $before -or (Get-Content "$repo/backend/gradle.properties") -ne 'version=1.7.1') { throw 'Preview mutated repository' }
    ExpectFailure { & "$repo/scripts/release.ps1" -Version 'v1.7.02' } 'Use a release version'
    ExpectFailure { & "$repo/scripts/release.ps1" -Version v1.6.0 } 'newer than'
    Set-Content "$repo/uncommitted.txt" 'dirty'
    ExpectFailure { & "$repo/scripts/release.ps1" -Version v1.7.2 } 'Commit or stash'
    Remove-Item -LiteralPath "$repo/uncommitted.txt"
    $null = CheckGit -C $repo tag unrelated-tag
    & "$repo/scripts/release.ps1" -Version v1.7.2
    $local = CheckGit -C $repo rev-parse HEAD
    $published = CheckGit --git-dir=$remote rev-parse refs/heads/main
    $tagged = CheckGit --git-dir=$remote rev-parse 'refs/tags/v1.7.2^{}'
    if ($local -ne $published -or $tagged -ne $local) { throw 'Branch and tag did not publish the same commit' }
    if (CheckGit --git-dir=$remote tag --list unrelated-tag) { throw 'Unrelated tag was pushed' }
    if ((Get-Content "$repo/backend/gradle.properties") -ne 'version=1.7.2') { throw 'Version not updated' }
    ExpectFailure { & "$repo/scripts/release.ps1" -Version v1.7.2 } 'already exists locally'
    $null = CheckGit -C $repo tag -d v1.7.2
    ExpectFailure { & "$repo/scripts/release.ps1" -Version v1.7.2 } 'already exists on the remote'
    $null = CheckGit -C $repo switch -c feature
    ExpectFailure { & "$repo/scripts/release.ps1" -Version v1.7.3 } 'must be made from main'
    $null = CheckGit -C $repo switch main
    $null = CheckGit -C $repo commit --allow-empty -m Ahead
    ExpectFailure { & "$repo/scripts/release.ps1" -Version v1.7.3 } 'must match remote main'
    Write-Host 'PASS: preview, validation, dirty tree, branch checks, version update, atomic push, and local/remote duplicate detection.'
} finally {
    $resolved = [IO.Path]::GetFullPath($temp)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (!$resolved.StartsWith($tempRoot) -or !([IO.Path]::GetFileName($resolved).StartsWith('tentacles-release-test-'))) { throw 'Unsafe test cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
