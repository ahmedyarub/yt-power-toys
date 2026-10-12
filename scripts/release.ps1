# Signs yt-power-toys with Mozilla (unlisted, private) and installs it into Firefox.
#
# Needs AMO API credentials in the environment (https://addons.mozilla.org/developers/addon/api/key/):
#   WEB_EXT_API_KEY, WEB_EXT_API_SECRET
# web-ext reads them itself; this script never prints them.
#
# Bump "version" in yt-power-toys/manifest.json before every release: AMO refuses to sign
# the same version twice.
$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot
$source = Join-Path $root 'yt-power-toys'
$artifacts = Join-Path $root 'web-ext-artifacts'
$firefox = 'C:\Program Files\Mozilla Firefox\firefox.exe'
$webExt = 'web-ext@10.7.0'

# A shell started before the keys were saved doesn't have them; read the user environment.
foreach ($name in 'WEB_EXT_API_KEY', 'WEB_EXT_API_SECRET') {
    if (-not [Environment]::GetEnvironmentVariable($name)) {
        [Environment]::SetEnvironmentVariable($name, [Environment]::GetEnvironmentVariable($name, 'User'))
    }
}
if (-not $env:WEB_EXT_API_KEY -or -not $env:WEB_EXT_API_SECRET) {
    throw 'WEB_EXT_API_KEY / WEB_EXT_API_SECRET are not set. Create them at https://addons.mozilla.org/developers/addon/api/key/'
}

# The global npm cache on this machine fails with EEXIST; use a project-local one.
$env:npm_config_cache = Join-Path $root '.npm-cache'

$version = (Get-Content (Join-Path $source 'manifest.json') -Raw | ConvertFrom-Json).version
Write-Host "Releasing yt-power-toys $version"

# The native host is registered once, by hand, with native-host\install.ps1: run from inside
# the Claude desktop app (an MSIX package) its registry write is virtualized and Firefox never sees it.

npx --yes $webExt lint --source-dir $source --warnings-as-errors
if ($LASTEXITCODE -ne 0) { throw 'web-ext lint failed' }

npx --yes $webExt sign --source-dir $source --artifacts-dir $artifacts --channel unlisted
if ($LASTEXITCODE -ne 0) { throw 'web-ext sign failed' }

$xpi = Get-ChildItem $artifacts -Filter "*-$version.xpi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $xpi) { throw "No signed .xpi for version $version in $artifacts" }

# Hands the signed add-on to the running default Firefox, which installs it.
Write-Host "Installing $($xpi.FullName)"
& $firefox $xpi.FullName
