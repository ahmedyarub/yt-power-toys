'use strict';

// Owns the connection to the native host (which reports the Windows volume) and decides
// whether YouTube playback is blocked. Content scripts and the options page receive the
// decision over runtime ports; they never compute it themselves.

const HOST = 'yt_volume_guard';
const RECONNECT_MS = 5000;
const DEFAULTS = { limitPercent: 50, autoResume: true };

let settings = { ...DEFAULTS };
let host = { connected: false, volume: null, muted: false, error: 'Connecting to the native host…' };
const ports = new Set();

function snapshot() {
  const volumePercent = host.volume == null ? null : Math.round(host.volume * 100);
  const blocked = host.connected && volumePercent != null && !host.muted && volumePercent > settings.limitPercent;
  return { ...host, volumePercent, blocked, ...settings };
}

function publish() {
  const s = snapshot();
  for (const port of ports) port.postMessage(s);

  const healthy = s.connected && !s.error;
  browser.browserAction.setBadgeText({ text: !healthy ? '!' : s.muted ? 'M' : String(s.volumePercent) });
  browser.browserAction.setBadgeBackgroundColor({ color: !healthy ? '#80868b' : s.blocked ? '#d93025' : '#188038' });
  browser.browserAction.setTitle({
    title: !healthy
      ? `YouTube Volume Guard: ${s.error}`
      : `YouTube Volume Guard: volume ${s.muted ? 'muted' : `${s.volumePercent}%`}, limit ${s.limitPercent}%` +
        (s.blocked ? ' (YouTube blocked)' : ''),
  });
}

function connect() {
  const port = browser.runtime.connectNative(HOST);
  port.onMessage.addListener((msg) => {
    host = { connected: true, volume: msg.volume ?? null, muted: !!msg.muted, error: msg.error ?? null };
    publish();
  });
  port.onDisconnect.addListener((p) => {
    const reason = p.error?.message || 'disconnected';
    console.warn(`[volume-guard] native host ${HOST}: ${reason}; retrying in ${RECONNECT_MS} ms`);
    host = { connected: false, volume: null, muted: false, error: `Native host not available: ${reason}` };
    publish();
    setTimeout(connect, RECONNECT_MS);
  });
}

browser.runtime.onConnect.addListener((port) => {
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.postMessage(snapshot());
});

browser.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in DEFAULTS) settings[key] = newValue;
  }
  publish();
});

browser.browserAction.onClicked.addListener(() => browser.runtime.openOptionsPage());

browser.storage.local.get(DEFAULTS).then((stored) => {
  settings = stored;
  publish();
  connect();
});
