param(
    [string]$Bundles = "nsis"
)

Set-Location -Path $PSScriptRoot

foreach ($cmd in @("node", "npm", "cargo")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "'$cmd' not found in PATH"
        exit 1
    }
}

if (-not (Test-Path "node_modules")) {
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "==> Building Windows bundles: $Bundles"
npx tauri build --bundles $Bundles
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Artifacts:"
Get-ChildItem "src-tauri\target\release\bundle" -Recurse -File | Select-Object FullName, Length
