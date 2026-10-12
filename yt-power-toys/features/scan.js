'use strict';

// Scanning: rewind or fast-forward continuously while something is held.
//  - Long press on the player: the left part rewinds, the rest fast-forwards. This replaces
//    YouTube's built-in hold-for-2x.
//  - Holding J / Left (rewind) or L / Right (fast-forward). A tap keeps YouTube's normal
//    jump; holding past the hold time starts scanning.
// Scrolling the wheel during a scan changes its speed and saves it.
(() => {
  const settings = liveSettings();

  const SPEED_STEP = 0.25;
  const SPEED_KEY = { rewind: 'rewindSpeed', forward: 'forwardSpeed' };
  // Firefox's playbackRate tops out at 16x; rewinding is seek-driven, so it has no such cap.
  const SPEED_LIMITS = { rewind: [1, 20], forward: [0.25, 16] };
  const SCAN_KEYS = { j: 'rewind', ArrowLeft: 'rewind', l: 'forward', ArrowRight: 'forward' };

  // Player controls, menus, cards and end-screen links keep their normal behaviour.
  const EXCLUDED = '.ytp-chrome-bottom, .ytp-chrome-top, .ytp-popup, .ytp-ce-element, .ytp-endscreen-content, .ytp-cards-teaser, button, a';

  let scan = null;          // the pending or active scan: { source: 'pointer' | 'key', ... }
  let blockMouseUp = false; // YouTube never saw the mousedown, so hide the mouseup too
  let swallowClick = false; // a long press must not toggle play/pause on release

  function begin(s) {
    scan = s;
    s.timer = setTimeout(() => start(s), settings.holdMs);
  }

  function finish() {
    const s = scan;
    scan = null;
    clearTimeout(s.timer);
    if (!s.active) return false;
    stop(s);
    return true;
  }

  // ---- Long press on the player ----

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
    if (scan) return;
    const target = pressTarget(e);
    if (!target) return;
    e.stopImmediatePropagation();
    blockMouseUp = true;
    begin({ source: 'pointer', ...target, active: false });
  }, true);

  window.addEventListener('mousedown', (e) => {
    if (scan?.source === 'pointer') e.stopImmediatePropagation();
  }, true);

  function release(e) {
    if (scan?.source !== 'pointer') return;
    e.stopImmediatePropagation();
    if (finish()) swallowClick = true;
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

  // ---- Held keys ----

  function isTyping(el) {
    return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
      !!el.closest?.('[contenteditable], .ytp-volume-panel');
  }

  // Letters arrive upper-case with CapsLock on.
  const keyOf = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);

  window.addEventListener('keydown', (e) => {
    const key = keyOf(e);
    const mode = SCAN_KEYS[key];
    if (!mode) return;
    // While a key scan is running, YouTube must not also act on the auto-repeats.
    if (scan?.source === 'key' && scan.key === key) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    if (e.repeat || scan || !settings.keyScanEnabled || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (isTyping(e.target)) return;
    const player = document.querySelector('#movie_player');
    if (!player?.querySelector('video')) return;
    // This first keydown goes through, so a tap is YouTube's usual 5 s / 10 s jump.
    begin({ source: 'key', key, player, mode, active: false });
  }, true);

  window.addEventListener('keyup', (e) => {
    if (scan?.source === 'key' && scan.key === keyOf(e)) finish();
  }, true);

  window.addEventListener('blur', () => {
    if (scan?.source === 'key') finish();
  });

  // ---- Wheel: change the speed of the running scan ----

  window.addEventListener('wheel', (e) => {
    const s = scan;
    if (!s?.active) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const [min, max] = SPEED_LIMITS[s.mode];
    const next = Math.min(max, Math.max(min, s.speed + (e.deltaY < 0 ? SPEED_STEP : -SPEED_STEP)));
    if (next === s.speed) return;
    if (s.mode === 'rewind') {
      // Rebase so the new speed applies from here on, without a jump.
      s.from = rewindTarget(s);
      s.startedAt = performance.now();
    } else {
      s.video.playbackRate = next;
    }
    s.speed = next;
    updateBadge(s);
    browser.storage.local.set({ [SPEED_KEY[s.mode]]: next });
  }, { capture: true, passive: false });

  // ---- The scan itself ----

  function start(s) {
    if (scan !== s) return;
    const video = s.player.querySelector('video');
    if (!video) return;
    s.active = true;
    s.video = video;
    s.wasPlaying = !video.paused;
    s.speed = settings[SPEED_KEY[s.mode]];
    s.badge = createBadge(s.player);
    updateBadge(s);

    if (s.mode === 'forward') {
      s.previousRate = video.playbackRate;
      video.playbackRate = s.speed;
      if (video.paused) video.play();
      return;
    }

    // Browsers can't play backwards, so chain seeks: each new seek starts as soon as
    // the previous one has finished, aimed at where a backwards playback would be now.
    s.from = video.currentTime;
    s.startedAt = performance.now();
    video.pause();
    const tick = () => {
      if (!s.active) return;
      if (!video.seeking) video.currentTime = rewindTarget(s);
      s.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function rewindTarget(s) {
    const elapsed = (performance.now() - s.startedAt) / 1000;
    return Math.max(0, s.from - elapsed * s.speed);
  }

  function stop(s) {
    s.active = false;
    s.badge.remove();
    if (s.mode === 'forward') {
      s.video.playbackRate = s.previousRate;
      if (!s.wasPlaying) s.video.pause();
    } else {
      cancelAnimationFrame(s.raf);
      if (s.wasPlaying) s.video.play();
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

  function updateBadge(s) {
    s.badge.textContent = `${s.mode === 'rewind' ? '⏪' : '⏩'} ${s.speed}x`;
  }
})();
