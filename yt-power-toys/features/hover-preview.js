'use strict';

// While the main YouTube video is playing (popped out to Picture-in-Picture, or in the
// miniplayer), YouTube does not play hover previews on thumbnails. Show our own muted
// preview instead: an embed from youtube-nocookie.com, which runs in its own frame and
// never touches the main player. The embed's iframe API (enablejsapi) drives it:
//  - M while a preview shows toggles its sound (kept for the next previews on this page),
//    instead of muting the main video.
//  - Moving the mouse across the thumbnail scrubs through the video.
(() => {
  const settings = liveSettings();
  const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
  const SCRUB_START_PX = 8; // horizontal movement before scrubbing kicks in, so a still hand doesn't seek
  const SCRUB_THROTTLE_MS = 120;

  let pending = null; // { anchor, timer } waiting for the hover delay
  let preview = null; // the preview currently shown
  let soundOn = false;

  function mainVideoPlaying() {
    const video = document.querySelector('#movie_player video');
    return !!video && !video.paused && !video.ended;
  }

  // The thumbnail link of a video card (the title link has no image).
  function thumbnailAnchor(el) {
    const anchor = el.closest?.('a[href*="/watch?v="], a[href^="/shorts/"]');
    return anchor && anchor.querySelector('img') && !anchor.closest('#movie_player') ? anchor : null;
  }

  function videoOf(anchor) {
    const url = new URL(anchor.href);
    if (url.pathname === '/watch') {
      return { id: url.searchParams.get('v'), start: parseInt(url.searchParams.get('t'), 10) || 0 };
    }
    return { id: url.pathname.split('/')[2], start: 0 };
  }

  // If YouTube does play its own preview over this thumbnail, don't stack ours on top.
  function youtubePreviewPlaying(rect) {
    for (const video of document.querySelectorAll('video')) {
      if (video.paused || video.closest('#movie_player')) continue;
      const r = video.getBoundingClientRect();
      if (r.width && r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top) {
        return true;
      }
    }
    return false;
  }

  function command(p, func, args = []) {
    p.frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), EMBED_ORIGIN);
  }

  function show(anchor) {
    const rect = anchor.getBoundingClientRect();
    if (!mainVideoPlaying() || youtubePreviewPlaying(rect)) return;

    const { id, start } = videoOf(anchor);
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: '1000',
      borderRadius: '12px',
      overflow: 'hidden',
      background: '#000',
      pointerEvents: 'none', // clicks and hover stay on the thumbnail link underneath
      opacity: '0',
      transition: 'opacity 150ms',
    });

    const frame = document.createElement('iframe');
    const params = new URLSearchParams({
      autoplay: '1', mute: '1', controls: '0', disablekb: '1', fs: '0', enablejsapi: '1',
      iv_load_policy: '3', playsinline: '1', rel: '0', start: String(start),
    });
    frame.src = `${EMBED_ORIGIN}/embed/${encodeURIComponent(id)}?${params}`;
    frame.allow = 'autoplay; encrypted-media';
    Object.assign(frame.style, { width: '100%', height: '100%', border: '0' });

    const progress = document.createElement('div');
    Object.assign(progress.style, {
      position: 'absolute', left: '0', bottom: '0', height: '3px', width: '0', background: '#f00',
    });
    const sound = document.createElement('div');
    Object.assign(sound.style, {
      position: 'absolute', right: '8px', top: '8px', padding: '2px 8px', borderRadius: '10px',
      background: 'rgba(0, 0, 0, 0.6)', color: '#fff', font: '500 12px Roboto, Arial, sans-serif',
    });

    const p = { anchor, box, frame, progress, sound, duration: 0, originX: null, scrubbing: false, lastSeek: 0, seekTimer: null };
    frame.addEventListener('load', () => {
      box.style.opacity = '1';
      // Ask the embed to report its state (duration, current time) to us.
      frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'yt-power-toys', channel: 'widget' }), EMBED_ORIGIN);
    });

    box.append(frame, progress, sound);
    document.body.append(box);
    preview = p;
    renderSound(p);
  }

  function renderSound(p) {
    p.sound.textContent = soundOn ? '\u{1F50A} M' : '\u{1F507} M';
  }

  function clear() {
    if (pending) clearTimeout(pending.timer);
    if (preview) {
      clearTimeout(preview.seekTimer);
      preview.box.remove();
    }
    pending = null;
    preview = null;
  }

  window.addEventListener('message', (e) => {
    const p = preview;
    // Only one preview frame exists at a time, so its origin identifies it.
    if (!p || e.origin !== EMBED_ORIGIN) return;
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.event === 'onReady' && soundOn) command(p, 'unMute');
    const info = msg.info;
    if (!info) return;
    if (info.duration) p.duration = info.duration;
    // Follow playback, except right after a scrub, where the bar shows the mouse position.
    if (p.duration && typeof info.currentTime === 'number' && performance.now() - p.lastSeek > 500) {
      p.progress.style.width = `${Math.min(100, info.currentTime / p.duration * 100)}%`;
    }
  });

  document.addEventListener('mouseover', (e) => {
    if (!settings.previewEnabled) return;
    const anchor = thumbnailAnchor(e.target);
    if (!anchor || anchor === pending?.anchor || anchor === preview?.anchor) return;
    clear();
    pending = {
      anchor,
      timer: setTimeout(() => { pending = null; show(anchor); }, settings.previewDelayMs),
    };
  });

  document.addEventListener('mouseout', (e) => {
    const anchor = pending?.anchor || preview?.anchor;
    if (anchor && !anchor.contains(e.relatedTarget)) clear();
  });

  document.addEventListener('mousemove', (e) => {
    const p = preview;
    if (!p || !p.duration || !settings.previewScrubEnabled) return;
    if (p.originX == null) p.originX = e.clientX;
    if (!p.scrubbing && Math.abs(e.clientX - p.originX) < SCRUB_START_PX) return;
    p.scrubbing = true;
    const rect = p.anchor.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    p.progress.style.width = `${fraction * 100}%`;
    clearTimeout(p.seekTimer);
    const seek = () => { p.lastSeek = performance.now(); command(p, 'seekTo', [fraction * p.duration, true]); };
    const wait = SCRUB_THROTTLE_MS - (performance.now() - p.lastSeek);
    if (wait <= 0) seek();
    else p.seekTimer = setTimeout(seek, wait);
  });

  window.addEventListener('keydown', (e) => {
    const p = preview;
    if (!p || e.key.toLowerCase() !== 'm' || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    const el = e.target;
    if (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    // M would otherwise mute the main (PiP) video.
    e.stopImmediatePropagation();
    e.preventDefault();
    soundOn = !soundOn;
    command(p, soundOn ? 'unMute' : 'mute');
    renderSound(p);
  }, true);

  window.addEventListener('scroll', clear, { capture: true, passive: true });
  document.addEventListener('yt-navigate-start', clear);
})();
