$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$jsTestDir = Join-Path $backendDir "src\test\js"

$javaPassed = 0
$javaFailed = 0
$javaSkipped = 0
$jsPassed = 0
$jsFailed = 0
$jsSkipped = 0

Write-Host ""
Write-Host "Running Java tests..."
Write-Host ""

Push-Location $backendDir
try {
    & .\gradlew.bat test --rerun-tasks
    $javaExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($javaExitCode -ne 0) {
    throw "Java test suite failed."
}

Write-Host ""
Write-Host "Running JavaScript tests..."
Write-Host ""

Push-Location $jsTestDir
try {
    $jsOutput = @(& npm test 2>&1 | Tee-Object -Variable jsTestOutput)
    $jsExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($jsExitCode -ne 0) {
    throw "JavaScript test suite failed."
}

$jsPassed = 0
$jsFailed = 0
$jsSkipped = 0

foreach ($line in $jsTestOutput) {
    $text = $line.ToString()
    $text = $text -replace "`e\[[0-9;]*m", ""

    if ($text -match '\bpass\s+(\d+)\s*$') {
        $jsPassed = [int]$Matches[1]
    } elseif ($text -match '\bfail\s+(\d+)\s*$') {
        $jsFailed = [int]$Matches[1]
    } elseif ($text -match '\bskipped\s+(\d+)\s*$') {
        $jsSkipped = [int]$Matches[1]
    }
}

$javaResultFiles = Get-ChildItem (Join-Path $backendDir "build\test-results\test\TEST-*.xml")

$javaPassed = 0
$javaFailed = 0
$javaSkipped = 0

foreach ($resultFile in $javaResultFiles) {
    [xml]$result = Get-Content $resultFile.FullName
    $suite = $result.testsuite

    $tests = [int]$suite.tests
    $failures = [int]$suite.failures
    $errors = [int]$suite.errors
    $skipped = [int]$suite.skipped

    $javaPassed += $tests - $failures - $errors - $skipped
    $javaFailed += $failures + $errors
    $javaSkipped += $skipped
}

$totalPassed = $javaPassed + $jsPassed
$totalFailed = $javaFailed + $jsFailed
$totalSkipped = $javaSkipped + $jsSkipped

Write-Host ""
Write-Host "========================================"
Write-Host "TENTACLES TEST SUMMARY"
Write-Host ("Java:        {0} passed, {1} failed, {2} skipped" -f $javaPassed, $javaFailed, $javaSkipped)
Write-Host ("JavaScript:  {0} passed, {1} failed, {2} skipped" -f $jsPassed, $jsFailed, $jsSkipped)
Write-Host "----------------------------------------"
Write-Host ("TOTAL:       {0} passed, {1} failed, {2} skipped" -f $totalPassed, $totalFailed, $totalSkipped)
Write-Host "========================================"