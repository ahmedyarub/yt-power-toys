'use strict';

// Long press on the YouTube player: the left part rewinds, the rest fast-forwards, each at
// its own speed. Scrolling the wheel during the press changes that speed and saves it.
// This replaces YouTube's built-in hold-for-2x.
(() => {
  const settings = liveSettings();

  const SPEED_STEP = 0.25;
  const SPEED_KEY = { rewind: 'rewindSpeed', forward: 'forwardSpeed' };
  // Firefox's playbackRate tops out at 16x; rewinding is seek-driven, so it has no such cap.
  const SPEED_LIMITS = { rewind: [1, 20], forward: [0.25, 16] };

  // Player controls, menus, cards and end-screen links keep their normal behaviour.
  const EXCLUDED = '.ytp-chrome-bottom, .ytp-chrome-top, .ytp-popup, .ytp-ce-element, .ytp-endscreen-content, .ytp-cards-teaser, button, a';

  let press = null;         // the current long press on the player
  let blockMouseUp = false; // YouTube never saw the mousedown, so hide the mouseup too
  let swallowClick = false; // a long press must not toggle play/pause on release

  function pressTarget(e) {
    if (e.button !== 0) return null;
    const player = e.target.closest?.('#movie_player');
    if (!player || e.target.closest(EXCLUDED)) return null;
    const rect = player.getBoundingClientRect();
    const inRewindZone = settings.rewindEnabled &&
      e.clientX - rect.left <= rect.width * settings.rewindZonePercent / 100;
    if (inRewindZone) return { player, mode: 'rewind' };
    return settings.forwardEnabled ? { player, mode: 'forward' } : null;
  }

  // Window capture listeners run before any of YouTube's listeners on the player, so
  // stopping the press here also stops YouTube's own long-press 2x.
  window.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    const target = pressTarget(e);
    if (!target) return;
    e.stopImmediatePropagation();
    blockMouseUp = true;
    press = { ...target, active: false, timer: setTimeout(start, settings.holdMs) };
  }, true);

  window.addEventListener('mousedown', (e) => {
    if (press) e.stopImmediatePropagation();
  }, true);

  function release(e) {
    if (!press) return;
    e.stopImmediatePropagation();
    clearTimeout(press.timer);
    if (press.active) {
      stop(press);
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

  window.addEventListener('wheel', (e) => {
    const p = press;
    if (!p?.active) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const [min, max] = SPEED_LIMITS[p.mode];
    const next = Math.min(max, Math.max(min, p.speed + (e.deltaY < 0 ? SPEED_STEP : -SPEED_STEP)));
    if (next === p.speed) return;
    if (p.mode === 'rewind') {
      // Rebase so the new speed applies from here on, without a jump.
      p.from = rewindTarget(p);
      p.startedAt = performance.now();
    } else {
      p.video.playbackRate = next;
    }
    p.speed = next;
    updateBadge(p);
    browser.storage.local.set({ [SPEED_KEY[p.mode]]: next });
  }, { capture: true, passive: false });

  function start() {
    const p = press;
    const video = p.player.querySelector('video');
    if (!video) return;
    p.active = true;
    p.video = video;
    p.wasPlaying = !video.paused;
    p.speed = settings[SPEED_KEY[p.mode]];
    p.badge = createBadge(p.player);
    updateBadge(p);

    if (p.mode === 'forward') {
      p.previousRate = video.playbackRate;
      video.playbackRate = p.speed;
      if (video.paused) video.play();
      return;
    }

    // Browsers can't play backwards, so chain seeks: each new seek starts as soon as
    // the previous one has finished, aimed at where a backwards playback would be now.
    p.from = video.currentTime;
    p.startedAt = performance.now();
    video.pause();
    const tick = () => {
      if (!p.active) return;
      if (!video.seeking) video.currentTime = rewindTarget(p);
      p.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function rewindTarget(p) {
    const elapsed = (performance.now() - p.startedAt) / 1000;
    return Math.max(0, p.from - elapsed * p.speed);
  }

  function stop(p) {
    p.active = false;
    p.badge.remove();
    if (p.mode === 'forward') {
      p.video.playbackRate = p.previousRate;
      if (!p.wasPlaying) p.video.pause();
    } else {
      cancelAnimationFrame(p.raf);
      if (p.wasPlaying) p.video.play();
    }
  }

  function createBadge(player) {
    const badge = document.createElement('div');
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

  function updateBadge(p) {
    p.badge.textContent = `${p.mode === 'rewind' ? '⏪' : '⏩'} ${p.speed}x`;
  }
})();
