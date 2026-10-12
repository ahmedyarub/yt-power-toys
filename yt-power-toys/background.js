'use strict';

// Volume guard: owns the connection to the native host (which reports the Windows
// volume) and decides what happens to YouTube audio. Content scripts and the options page
// receive the decision over runtime ports; they never compute it.

const HOST = 'yt_power_toys';
const RECONNECT_MS = 5000;
const QUIET_CHECK_MS = 30000;

let host = { connected: false, volume: null, muted: false, error: 'Connecting to the native host…' };
const ports = new Set();
const settings = liveSettings(() => publish());
let lastQuiet = null;

function minutesOf(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Quiet hours may wrap past midnight (23:00–07:00).
function inQuietHours(now = new Date()) {
  if (!settings.quietHoursEnabled) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = minutesOf(settings.quietStart);
  const end = minutesOf(settings.quietEnd);
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

function snapshot() {
  const quiet = inQuietHours();
  const limitPercent = quiet ? settings.quietLimitPercent : settings.volumeLimitPercent;
  const volumePercent = host.volume == null ? null : Math.round(host.volume * 100);
  const blocked = settings.volumeGuardEnabled && host.connected && volumePercent != null &&
    !host.muted && volumePercent > limitPercent;
  return {
    ...host,
    volumePercent,
    blocked,
    // 'pause' stops audible media; 'lower' scales YouTube's own volume so that
    // Windows volume x YouTube volume stays at the limit.
    mode: settings.volumeLowerInstead ? 'lower' : 'pause',
    volumeTarget: blocked ? limitPercent / volumePercent : 1,
    enabled: settings.volumeGuardEnabled,
    limitPercent,
    quiet,
    autoResume: settings.volumeAutoResume,
  };
}

function publish() {
  const s = snapshot();
  lastQuiet = s.quiet;
  for (const port of ports) port.postMessage(s);

  if (!s.enabled) {
    browser.browserAction.setBadgeText({ text: '' });
    browser.browserAction.setTitle({ title: 'YT Power Toys' });
    return;
  }
  // The "!" warning shows even with the volume counter turned off.
  const healthy = s.connected && !s.error;
  const badge = !healthy ? '!' : !settings.volumeBadgeEnabled ? '' : s.muted ? 'M' : String(s.volumePercent);
  const color = !healthy ? '#80868b' : !s.blocked ? '#188038' : s.mode === 'lower' ? '#e37400' : '#d93025';
  browser.browserAction.setBadgeText({ text: badge });
  browser.browserAction.setBadgeBackgroundColor({ color });
  browser.browserAction.setTitle({
    title: !healthy
      ? `YT Power Toys: ${s.error}`
      : `YT Power Toys: volume ${s.muted ? 'muted' : `${s.volumePercent}%`}, ` +
        `limit ${s.limitPercent}%${s.quiet ? ' (quiet hours)' : ''}` +
        (!s.blocked ? '' : s.mode === 'lower' ? ` (YouTube turned down to ${Math.round(s.volumeTarget * 100)}%)` : ' (YouTube blocked)'),
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

// Quiet hours start and end on the clock, not on a volume change.
setInterval(() => { if (inQuietHours() !== lastQuiet) publish(); }, QUIET_CHECK_MS);

connect();
