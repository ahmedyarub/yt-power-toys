# Unregisters the YouTube Volume Guard native host from Firefox.
$key = 'HKCU:\Software\Mozilla\NativeMessagingHosts\yt_volume_guard'
if (Test-Path $key) { Remove-Item -Path $key }
Write-Host 'Unregistered yt_volume_guard. VolumeHost.exe and yt_volume_guard.json can now be deleted.'
