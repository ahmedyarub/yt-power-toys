'use strict';

// Pauses audible YouTube media while the background script says the Windows volume is
// above the limit. Muted media (e.g. hover previews) is left alone: it makes no sound.

let state = { blocked: false };
const pausedByUs = new Set();
let banner = null;

function enforce(media) {
  if (!state.blocked || media.paused || media.muted || media.volume === 0) return;
  media.pause();
  pausedByUs.add(media);
  render();
}

// Media events don't bubble, but capture listeners on the document still see them.
document.addEventListener('play', (e) => enforce(e.target), true);
document.addEventListener('volumechange', (e) => enforce(e.target), true);

browser.runtime.connect().onMessage.addListener((next) => {
  const wasBlocked = state.blocked;
  state = next;
  if (state.blocked) {
    document.querySelectorAll('video, audio').forEach(enforce);
  } else if (wasBlocked) {
    if (state.autoResume) {
      for (const media of pausedByUs) {
        if (media.isConnected) media.play().catch((err) => console.warn('[volume-guard] resume failed:', err));
      }
    }
    pausedByUs.clear();
  }
  render();
});

function render() {
  if (!state.blocked || pausedByUs.size === 0) {
    banner?.remove();
    banner = null;
    return;
  }
  if (!banner) {
    banner = document.createElement('div');
    Object.assign(banner.style, {
      position: 'fixed',
      top: '64px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      padding: '10px 18px',
      borderRadius: '8px',
      background: '#d93025',
      color: '#fff',
      font: '500 14px Roboto, Arial, sans-serif',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      pointerEvents: 'none',
    });
    (document.body || document.documentElement).append(banner);
  }
  banner.textContent = `Paused: Windows volume is ${state.volumePercent}% (limit ${state.limitPercent}%). ` +
    (state.autoResume ? 'Lower it and playback resumes.' : 'Lower it to play.');
}
