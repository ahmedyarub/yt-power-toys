'use strict';

// While the main YouTube video is playing (popped out to Picture-in-Picture, or in the
// miniplayer), YouTube does not play hover previews on thumbnails. Show our own muted
// preview instead: an embed from youtube-nocookie.com, which runs in its own frame and
// never touches the main player.
(() => {
  const settings = liveSettings();
  let pending = null; // { anchor, timer } waiting for the hover delay
  let preview = null; // { anchor, box } currently shown

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
      autoplay: '1', mute: '1', controls: '0', disablekb: '1', fs: '0',
      iv_load_policy: '3', playsinline: '1', rel: '0', start: String(start),
    });
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params}`;
    frame.allow = 'autoplay; encrypted-media';
    Object.assign(frame.style, { width: '100%', height: '100%', border: '0' });
    frame.addEventListener('load', () => { box.style.opacity = '1'; });

    box.append(frame);
    document.body.append(box);
    preview = { anchor, box };
  }

  function clear() {
    if (pending) clearTimeout(pending.timer);
    preview?.box.remove();
    pending = null;
    preview = null;
  }

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

  window.addEventListener('scroll', clear, { capture: true, passive: true });
  document.addEventListener('yt-navigate-start', clear);
})();
