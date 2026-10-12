# YT Power Toys

A single Firefox extension (Manifest V2, Firefox 142+) with three YouTube tools. Each one can be turned on or off on the options page (click the toolbar button).

| Tool | What it does |
| --- | --- |
| Long press | Press and hold on the **left third** of the player to rewind continuously (default 3x), or anywhere else on it to fast-forward (default 2x, up to 16x). This replaces YouTube's fixed hold-for-2x. **Scroll the wheel while holding** to change the speed in 0.25x steps; the new speed is saved. Short clicks still play/pause. |
| Hover previews during PiP | While the main video is playing (in Picture-in-Picture or the miniplayer), YouTube stops showing hover previews on thumbnails. This shows a muted preview instead. The preview is a `youtube-nocookie.com` embed, so it never touches the PiP video. |
| Windows volume guard | Pauses audible YouTube videos while the **Windows** output volume is above a limit (default 50%), and resumes them when the volume comes back down. The toolbar badge shows the current volume. |

## Layout

- `yt-power-toys/`: the extension. `settings.js` holds the shared defaults, and each tool lives in `features/`.
- `native-host/`: a small Windows helper that reports the system volume to the volume guard. Firefox extensions cannot read it on their own.
- `scripts/release.ps1`: signs the extension and installs it.

## Release and install

Release Firefox only installs add-ons that Mozilla has signed. `scripts/release.ps1` does the whole flow:

1. Lints the extension with `web-ext`.
2. Gets Mozilla to sign it as an **unlisted** add-on: private, and never shown on addons.mozilla.org.
3. Opens the signed `.xpi` in Firefox, which asks you to confirm the install.

**One-time native host setup.** Run `native-host\install.ps1` from your own terminal, **not from inside the Claude desktop app**. It compiles the helper with the .NET Framework `csc.exe` that ships with Windows, then registers it for Firefox under `HKCU` (current user only, no admin). Claude runs as an MSIX package, so registry writes from processes it starts go to a private copy of the registry that Firefox never sees.

It needs AMO API credentials in the user environment as `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET`. Create them at https://addons.mozilla.org/developers/addon/api/key/.
**Bump `version` in `yt-power-toys/manifest.json` before every release**: AMO never signs the same version twice.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\release.ps1
```

## Notes

- **Volume guard:** muted media is never blocked. This covers YouTube's mute button and hover previews. If the native host is missing, nothing is blocked, the badge shows `!`, and the options page shows the error.
- **Volume guard:** "Volume" means the Windows master volume of the default output device: the number on the Windows volume slider. Switching output devices is picked up within 250 ms.
- **Hover previews:** a page cannot tell that Firefox's Picture-in-Picture is open. The preview therefore runs whenever the main YouTube video is playing and YouTube is not already showing its own preview over that thumbnail.
- **Hover previews:** videos whose owners have turned off embedding show YouTube's "Video unavailable" card.
- **Hover previews:** YouTube refuses embeds whose embedding page is youtube.com itself ("Error 152-4", `EMBEDDER_IDENTITY_DENIED`), and the previews are embedded in youtube.com pages. `preview-referer.js` therefore sends `Referer: https://www.youtube-nocookie.com/` for those preview frames only. This is why the extension needs the `webRequest` permission.
