[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)][string]$Version,
    [string]$Remote = 'survey-tentacles',
    [switch]$Preview
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repo = Split-Path $PSScriptRoot -Parent
$gitExecutable = (Get-Command git -CommandType Application | Select-Object -First 1).Source
function Git {
    $result = & $gitExecutable -C $repo @args
    if ($LASTEXITCODE -ne 0) { throw "git $($args[0]) failed. No automatic rollback was attempted." }
    return $result
}
if ($Version -cnotmatch '^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
    throw 'Use a release version such as v1.7.2 or 1.7.2. No -Bump argument is needed.'
}
$number = $Version.TrimStart('v')
$tag = "v$number"
if ($Remote.StartsWith('-')) { throw 'Invalid remote name.' }
$null = Git remote get-url $Remote
if (Git tag --list $tag) { throw "Tag $tag already exists locally. Choose a new version." }
if (Git ls-remote --tags $Remote "refs/tags/$tag") { throw "Tag $tag already exists on the remote. Choose a new version." }
if (Git status --porcelain --untracked-files=all) { throw 'Commit or stash existing changes before releasing.' }
if ((Git branch --show-current) -ne 'main') { throw 'Releases must be made from main.' }
$head = Git rev-parse HEAD
$remoteHead = @(Git ls-remote --heads $Remote refs/heads/main)
if ($remoteHead.Count -ne 1 -or ($remoteHead[0] -split '\s+')[0] -ne $head) {
    throw 'Local main must match remote main. Pull or push your reviewed changes first.'
}
$versionFile = Join-Path $repo 'backend/gradle.properties'
$content = [IO.File]::ReadAllText($versionFile)
$entries = [regex]::Matches($content, '(?m)^version=(\d+\.\d+\.\d+)\r?$')
if ($entries.Count -ne 1) { throw 'Expected one version entry in backend/gradle.properties.' }
$current = $entries[0].Groups[1].Value
if ([version]$number -le [version]$current) { throw "Choose a version newer than $current." }
Write-Host "Release $tag from main ($head) via $Remote."
Write-Host "Version: $current -> $number; image: ghcr.io/eiredrake/survey_tentacles:$tag"
if ($Preview) { Write-Host 'Preview only: no files, commits, tags, or remote refs changed.'; return }
$updated = [regex]::Replace($content, '(?m)^version=\d+\.\d+\.\d+\r?$', "version=$number")
[IO.File]::WriteAllText($versionFile, $updated, [Text.UTF8Encoding]::new($false))
$null = Git add -- backend/gradle.properties
$null = Git commit -m "Release $tag" --only -- backend/gradle.properties
$null = Git tag -a $tag -m "Release $tag"
try {
    $null = Git push --atomic $Remote 'HEAD:refs/heads/main' "refs/tags/${tag}:refs/tags/$tag"
} catch {
    throw "Push failed or its result is uncertain. The local release commit and $tag remain. Inspect remote refs before retrying; do not overwrite an existing tag. $($_.Exception.Message)"
}
Write-Host "Pushed $tag. GitHub Actions will test, publish the image, and create the release."
Write-Host "Watch https://github.com/eiredrake/survey-tentacles/actions before deploying."
Write-Host 'Production has not been changed.'
