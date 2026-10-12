# YouTube Firefox extensions

Three independent Firefox extensions (Manifest V2, Firefox 115+).

| Folder | What it does |
| --- | --- |
| `yt-long-press-rewind` | Press and hold on the **left third** of the player to rewind continuously (default 3x). Short clicks still play/pause, and YouTube's own hold-for-2x still works on the rest of the player. The zone width, hold time and speed are in the add-on's options. |
| `yt-pip-preview` | While the main video is playing (in Picture-in-Picture or the miniplayer), YouTube stops showing hover previews on thumbnails. This shows a muted preview after 500 ms of hovering. The preview is a `youtube-nocookie.com` embed, so it never touches the PiP video. |
| `yt-volume-guard` | Pauses audible YouTube videos while the **Windows** output volume is above a limit (default 50%), and resumes them when the volume comes back down. Set the limit in the options, or click the toolbar button. The badge shows the current volume. |

## Install

### Try them out (removed when Firefox restarts)

`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick the `manifest.json` in each folder
(for the volume guard: `yt-volume-guard/extension/manifest.json`).

### Install permanently

Release Firefox only installs signed add-ons. Choose one of these:

- **Sign them yourself (unlisted, free).** Get API keys from https://addons.mozilla.org/developers/addon/api/key/, then for each folder run:
  ```bash
  npx web-ext sign --channel=unlisted --api-key=$AMO_JWT_ISSUER --api-secret=$AMO_JWT_SECRET
  ```
  Then install the `.xpi` it produces.
- **Use Firefox Developer Edition, Nightly or ESR.** Set `xpinstall.signatures.required = false` in `about:config`, zip the folder's contents into an `.xpi`, and install it from `about:addons`.

### Volume guard native host (required, one time)

Firefox extensions cannot read the Windows volume. `yt-volume-guard/native-host` contains a small helper that reports it.
`install.ps1` compiles that helper with the .NET Framework `csc.exe` that ships with Windows. It then registers the helper for Firefox under `HKCU` (current user, no admin):

```powershell
powershell -ExecutionPolicy Bypass -File yt-volume-guard\native-host\install.ps1
```

Then reload the extension. If the toolbar badge shows `!`, the helper is not connected; open the options page to see the error.
To remove the helper, run `uninstall.ps1`.

## Notes

- **Volume guard:** muted media is never blocked. This covers YouTube's mute button and hover previews. If the helper is missing, nothing is blocked, and the badge shows `!`.
- **Volume guard:** "Volume" means the Windows master volume of the default output device: the number on the Windows volume slider. Switching output devices is picked up within 250 ms.
- **PiP preview:** a page cannot tell that Firefox's Picture-in-Picture is open. The preview therefore runs whenever the main YouTube video is playing and YouTube is not already showing its own preview over that thumbnail.
- **PiP preview:** videos whose owners have turned off embedding show YouTube's "Video unavailable" card.
