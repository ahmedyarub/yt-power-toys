# Builds the YT Power Toys native host and registers it with Firefox (current user only).
$ErrorActionPreference = 'Stop'

$name = 'yt_power_toys'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$exe = Join-Path $PSScriptRoot 'VolumeHost.exe'
$manifestPath = Join-Path $PSScriptRoot "$name.json"

& $csc /nologo /optimize+ /target:exe "/out:$exe" (Join-Path $PSScriptRoot 'VolumeHost.cs')
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }

$manifest = [ordered]@{
    name               = $name
    description        = 'Reports the Windows output volume to YT Power Toys'
    path               = $exe
    type               = 'stdio'
    allowed_extensions = @('yt-power-toys@local')
} | ConvertTo-Json
# Firefox rejects a manifest with a UTF-8 BOM, which Windows PowerShell 5.1 would add.
[IO.File]::WriteAllText($manifestPath, $manifest, [Text.UTF8Encoding]::new($false))

$key = "HKCU:\Software\Mozilla\NativeMessagingHosts\$name"
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name '(default)' -Value $manifestPath

Write-Host "Installed $name -> $manifestPath"
Write-Host 'The extension reconnects to it within 5 seconds.'
