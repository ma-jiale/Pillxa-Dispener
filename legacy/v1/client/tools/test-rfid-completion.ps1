param()
$ErrorActionPreference = 'Stop'
$clientRoot = Split-Path $PSScriptRoot -Parent
$monitorMeta = Get-Content -LiteralPath (Join-Path $clientRoot 'Assets/Scripts/Hardware/RfidRemovalMonitor.cs.meta') -Raw
if (-not [regex]::IsMatch($monitorMeta, '(?m)^guid: [a-f0-9]{32}\r?$') -or
    -not [regex]::IsMatch($monitorMeta, '(?m)^MonoImporter:\r?$')) {
    throw 'RFID monitor has invalid Unity import metadata; its script would be ignored.'
}
Write-Output 'PASS Unity script import metadata (32-character GUID and MonoImporter)'
$uiSource = Get-Content -LiteralPath (Join-Path $clientRoot 'Assets/Scripts/UIManager.cs') -Raw
$deviceSource = Get-Content -LiteralPath (Join-Path $clientRoot 'Assets/Scripts/DispenserController.cs') -Raw

function Get-MethodSource([string]$source, [string]$name) {
    $match = [regex]::Match($source, '(?m)^        private (?:async )?[^\r\n]+\b' + $name + '\(')
    if (-not $match.Success) { throw "Production method not found: $name" }
    $startBrace = $source.IndexOf('{', $match.Index)
    $depth = 0
    for ($index = $startBrace; $index -lt $source.Length; $index++) {
        if ($source[$index] -eq '{') { $depth++ }
        if ($source[$index] -eq '}') {
            $depth--
            if ($depth -eq 0) { return $source.Substring($match.Index, $index - $match.Index + 1) }
        }
    }
    throw "Unbalanced production method: $name"
}

# Execute the real completion and feedback methods with in-memory platform doubles.
# No Unity window, camera, network connection, serial port or physical command is used.
$uiMethods = @('BeginCompletionRfidMonitoring', 'EndCompletionRfidMonitoring',
    'WaitForCompletionTrayClearAsync', 'EnableCompletionRetryButton',
    'ShowCompletionAsync', 'ShowCompletionCoreAsync', 'ReturnHomeAsync') | ForEach-Object { Get-MethodSource $uiSource $_ }
$deviceMethods = @('HandleRfidUid', 'HandleRfidNoCard', 'ClearRfidStateWithoutEvent') |
    ForEach-Object { Get-MethodSource $deviceSource $_ }
$monitorSource = Get-Content -LiteralPath (Join-Path $clientRoot 'Assets/Scripts/Hardware/RfidRemovalMonitor.cs') -Raw
$testSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tests/RfidCompletionTests.cs') -Raw
$source = $testSource.Replace('/* PRODUCTION_MONITOR */', $monitorSource.Replace('using System;', '').Replace('using System.Diagnostics;', ''))
$source = $source.Replace('/* PRODUCTION_UI_METHODS */', ($uiMethods -join "`n"))
$source = $source.Replace('/* PRODUCTION_DEVICE_METHODS */', ($deviceMethods -join "`n"))
$stabilityProperty = [regex]::Match($uiSource, '(?m)^        private int CompletionRfidClearStabilityMilliseconds => [^;]+;')
if (-not $stabilityProperty.Success) { throw 'RFID stability setting property not found.' }
$source = $source.Replace('/* PRODUCTION_STABILITY_PROPERTY */', $stabilityProperty.Value)
Add-Type -TypeDefinition $source -Language CSharp
$null = [EZDose.Regression.RfidCompletionTests]::RunAsync().GetAwaiter().GetResult()
