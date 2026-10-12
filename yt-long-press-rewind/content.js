'use strict';

// Press and hold on the left part of the YouTube player to rewind continuously.
// YouTube's own "hold for 2x" keeps working on the rest of the player.

const DEFAULTS = { zonePercent: 33, holdMs: 350, speed: 3 };
let settings = { ...DEFAULTS };
browser.storage.local.get(DEFAULTS).then((stored) => { settings = stored; });
browser.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in DEFAULTS) settings[key] = newValue;
  }
});

// Player controls, menus, cards and end-screen links keep their normal behaviour.
const EXCLUDED = '.ytp-chrome-bottom, .ytp-chrome-top, .ytp-popup, .ytp-ce-element, .ytp-endscreen-content, .ytp-cards-teaser, button, a';

let press = null;         // the current press inside the rewind zone
let blockMouseUp = false; // YouTube never saw the mousedown, so hide the mouseup too
let swallowClick = false; // a long press must not toggle play/pause on release

function rewindZonePlayer(e) {
  if (e.button !== 0) return null;
  const player = e.target.closest?.('#movie_player');
  if (!player || e.target.closest(EXCLUDED)) return null;
  const rect = player.getBoundingClientRect();
  return e.clientX - rect.left <= rect.width * settings.zonePercent / 100 ? player : null;
}

// Window capture listeners run before any of YouTube's listeners on the player, so
// stopping the press here also stops YouTube's long-press 2x speed-up.
window.addEventListener('pointerdown', (e) => {
  swallowClick = false;
  const player = rewindZonePlayer(e);
  if (!player) return;
  e.stopImmediatePropagation();
  blockMouseUp = true;
  press = { player, rewinding: false, timer: setTimeout(startRewind, settings.holdMs) };
}, true);

window.addEventListener('mousedown', (e) => {
  if (press) e.stopImmediatePropagation();
}, true);

function release(e) {
  if (!press) return;
  e.stopImmediatePropagation();
  clearTimeout(press.timer);
  if (press.rewinding) {
    stopRewind(press);
    swallowClick = true;
  }
  press = null;
}
window.addEventListener('pointerup', release, true);
window.addEventListener('pointercancel', release, true);

window.addEventListener('mouseup', (e) => {
  if (!blockMouseUp) return;
  blockMouseUp = false;
  e.stopImmediatePropagation();
}, true);

window.addEventListener('click', (e) => {
  if (!swallowClick) return;
  swallowClick = false;
  e.stopImmediatePropagation();
  e.preventDefault();
}, true);

function startRewind() {
  const p = press;
  const video = p.player.querySelector('video');
  if (!video) return;
  p.rewinding = true;
  p.video = video;
  p.wasPlaying = !video.paused;
  p.from = video.currentTime;
  p.startedAt = performance.now();
  video.pause();
  p.badge = showBadge(p.player);

  // Browsers can't play backwards, so chain seeks: each new seek starts as soon as
  // the previous one has finished, aimed at where a backwards playback would be now.
  const tick = () => {
    if (!p.rewinding) return;
    if (!video.seeking) {
      const elapsed = (performance.now() - p.startedAt) / 1000;
      video.currentTime = Math.max(0, p.from - elapsed * settings.speed);
    }
    p.raf = requestAnimationFrame(tick);
  };
  tick();
}

function stopRewind(p) {
  p.rewinding = false;
  cancelAnimationFrame(p.raf);
  p.badge.remove();
  if (p.wasPlaying) p.video.play();
}

function showBadge(player) {
  const badge = document.createElement('div');
  badge.textContent = `⏪ ${settings.speed}x`;
  Object.assign(badge.style, {
    position: 'absolute',
    top: '12%',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '70',
    padding: '6px 14px',
    borderRadius: '18px',
    background: 'rgba(0, 0, 0, 0.6)',
    color: '#fff',
    font: '500 15px Roboto, Arial, sans-serif',
    pointerEvents: 'none',
  });
  player.append(badge);
  return badge;
}
