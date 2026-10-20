param([string]$CompilerPath)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$outputDir = Join-Path $repoRoot '.tools/v1-prescription-date-tests'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

# Reuse an installed compiler; all generated files stay inside this repository.
if (-not $CompilerPath) {
    $CompilerPath = Get-ChildItem "${env:ProgramFiles}/Microsoft Visual Studio/*/*/MSBuild/Current/Bin/Roslyn/csc.exe" |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $CompilerPath -or -not (Test-Path -LiteralPath $CompilerPath)) {
    throw 'A Roslyn C# compiler is required. Pass its existing path with -CompilerPath.'
}

$source = Join-Path $PSScriptRoot '../Assets/Scripts/PrescriptionManager.cs'
$tests = Join-Path $PSScriptRoot 'tests/PrescriptionDateTests.cs'
$exe = Join-Path $outputDir 'PrescriptionDateTests.exe'
& $CompilerPath /nologo /target:exe /langversion:latest /nowarn:0649 "/out:$exe" $source $tests
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $exe
exit $LASTEXITCODE
