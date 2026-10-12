# Unregisters the YT Power Toys native host from Firefox.
$key = 'HKCU:\Software\Mozilla\NativeMessagingHosts\yt_power_toys'
if (Test-Path $key) { Remove-Item -Path $key }
Write-Host 'Unregistered yt_power_toys. VolumeHost.exe and yt_power_toys.json can now be deleted.'
