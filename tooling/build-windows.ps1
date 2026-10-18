param([string]$PillxaNode = 'node')
$ErrorActionPreference = 'Stop'
$PillxaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$PillxaOldCargo = $env:CARGO_HOME
$PillxaOldRustup = $env:RUSTUP_HOME
$PillxaOldPath = $env:PATH
function Invoke-PillxaNode { & $PillxaNode @args; if ($LASTEXITCODE -ne 0) { throw "Node task failed ($LASTEXITCODE)" } }
Push-Location $PillxaRoot
try {
  $env:CARGO_HOME = Join-Path $PillxaRoot '.tools/cargo'
  $env:RUSTUP_HOME = Join-Path $PillxaRoot '.tools/rustup'
  $PillxaCargo = Join-Path $env:CARGO_HOME 'bin/cargo.exe'
  if (!(Test-Path -LiteralPath $PillxaCargo)) { throw 'Project Rust toolchain is missing; see docs/10-windows-first-edition.md.' }
  $env:PATH = (Join-Path $env:CARGO_HOME 'bin') + ';' + $PillxaOldPath
  Invoke-PillxaNode tooling/generate-contracts.mjs
  Invoke-PillxaNode node_modules/typescript/bin/tsc --noEmit
  Invoke-PillxaNode --test 'tests/policy/*.test.ts' 'tests/api/*.test.ts' 'tests/ui/*.test.ts'
  & $PillxaCargo test --locked --manifest-path native/Cargo.toml
  if ($LASTEXITCODE -ne 0) { throw 'Machine runtime tests failed.' }
  & $PillxaCargo build --locked --release --manifest-path native/Cargo.toml
  if ($LASTEXITCODE -ne 0) { throw 'Machine runtime build failed.' }
  Invoke-PillxaNode node_modules/vite/bin/vite.js build --config apps/web/vite.config.ts
  Invoke-PillxaNode tooling/package-resources.mjs
  Push-Location (Join-Path $PillxaRoot 'apps/desktop')
  try { Invoke-PillxaNode ../../node_modules/@tauri-apps/cli/tauri.js build --bundles nsis }
  finally { Pop-Location }
  $PillxaVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
  $PillxaRelease = Join-Path $PillxaRoot 'release'
  $PillxaStaging = Join-Path $PillxaRoot ('.var/package-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $PillxaRelease,$PillxaStaging -Force | Out-Null
  Copy-Item -LiteralPath 'apps/desktop/src-tauri/target/release/pillxa-dispenser.exe' -Destination (Join-Path $PillxaStaging 'Pillxai Dispenser.exe')
  Copy-Item -LiteralPath 'apps/desktop/src-tauri/resources' -Destination (Join-Path $PillxaStaging 'resources') -Recurse
  Set-Content -LiteralPath (Join-Path $PillxaStaging 'portable.flag') -Value 'Pillxai portable data stays beside the executable.' -Encoding utf8
  Copy-Item -LiteralPath 'docs/10-windows-first-edition.md' -Destination (Join-Path $PillxaStaging '首次使用.md')
  $PillxaInstaller = Join-Path $PillxaRelease "Pillxai-Dispenser-$PillxaVersion-windows-x64-setup.exe"
  Copy-Item -LiteralPath "apps/desktop/src-tauri/target/release/bundle/nsis/Pillxai Dispenser_${PillxaVersion}_x64-setup.exe" -Destination $PillxaInstaller -Force
  $PillxaZip = Join-Path $PillxaRelease "Pillxai-Dispenser-$PillxaVersion-windows-x64-portable.zip"
  Compress-Archive -Path (Join-Path $PillxaStaging '*') -DestinationPath $PillxaZip -Force
  $PillxaFiles = @($PillxaInstaller,$PillxaZip) | ForEach-Object { @{ name=[IO.Path]::GetFileName($_); bytes=(Get-Item -LiteralPath $_).Length; sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() } }
  @{ product='Pillxai Dispenser'; version=$PillxaVersion; builtAt=[DateTime]::UtcNow.ToString('o'); platform='windows-x64'; files=$PillxaFiles; sourceBranch='feat/pillxai-dispenser-NT'; updaterSigningConfigured=$false; hardwareTested=$false } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PillxaRelease 'manifest.json') -Encoding utf8
  Write-Output "Windows artifacts: $PillxaRelease"
} finally {
  $env:CARGO_HOME = $PillxaOldCargo
  $env:RUSTUP_HOME = $PillxaOldRustup
  $env:PATH = $PillxaOldPath
  Pop-Location
}
