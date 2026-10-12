# Builds the YouTube Volume Guard native host and registers it with Firefox (current user only).
$ErrorActionPreference = 'Stop'

$name = 'yt_volume_guard'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$exe = Join-Path $PSScriptRoot 'VolumeHost.exe'
$manifestPath = Join-Path $PSScriptRoot "$name.json"

& $csc /nologo /optimize+ /target:exe "/out:$exe" (Join-Path $PSScriptRoot 'VolumeHost.cs')
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }

$manifest = [ordered]@{
    name               = $name
    description        = 'Reports the Windows output volume to YouTube Volume Guard'
    path               = $exe
    type               = 'stdio'
    allowed_extensions = @('yt-volume-guard@local')
} | ConvertTo-Json
# Firefox rejects a manifest with a UTF-8 BOM, which Windows PowerShell 5.1 would add.
[IO.File]::WriteAllText($manifestPath, $manifest, [Text.UTF8Encoding]::new($false))

$key = "HKCU:\Software\Mozilla\NativeMessagingHosts\$name"
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name '(default)' -Value $manifestPath

Write-Host "Installed $name -> $manifestPath"
Write-Host 'Reload the extension (or restart Firefox) to connect.'
