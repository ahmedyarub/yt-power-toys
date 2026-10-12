'use strict';

// Volume guard: owns the connection to the native host (which reports the Windows
// volume) and decides whether YouTube playback is blocked. Content scripts and the
// options page receive the decision over runtime ports; they never compute it.

const HOST = 'yt_power_toys';
const RECONNECT_MS = 5000;

let host = { connected: false, volume: null, muted: false, error: 'Connecting to the native host…' };
const ports = new Set();
const settings = liveSettings(() => publish());

function snapshot() {
  const volumePercent = host.volume == null ? null : Math.round(host.volume * 100);
  const blocked = settings.volumeGuardEnabled && host.connected && volumePercent != null &&
    !host.muted && volumePercent > settings.volumeLimitPercent;
  return {
    ...host,
    volumePercent,
    blocked,
    enabled: settings.volumeGuardEnabled,
    limitPercent: settings.volumeLimitPercent,
    autoResume: settings.volumeAutoResume,
  };
}

function publish() {
  const s = snapshot();
  for (const port of ports) port.postMessage(s);

  if (!s.enabled) {
    browser.browserAction.setBadgeText({ text: '' });
    browser.browserAction.setTitle({ title: 'YT Power Toys' });
    return;
  }
  // The "!" warning shows even with the volume counter turned off.
  const healthy = s.connected && !s.error;
  const badge = !healthy ? '!' : !settings.volumeBadgeEnabled ? '' : s.muted ? 'M' : String(s.volumePercent);
  browser.browserAction.setBadgeText({ text: badge });
  browser.browserAction.setBadgeBackgroundColor({ color: !healthy ? '#80868b' : s.blocked ? '#d93025' : '#188038' });
  browser.browserAction.setTitle({
    title: !healthy
      ? `YT Power Toys: ${s.error}`
      : `YT Power Toys: volume ${s.muted ? 'muted' : `${s.volumePercent}%`}, limit ${s.limitPercent}%` +
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
    console.warn(`[yt-power-toys] native host ${HOST}: ${reason}; retrying in ${RECONNECT_MS} ms`);
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

browser.browserAction.onClicked.addListener(() => browser.runtime.openOptionsPage());

connect();
