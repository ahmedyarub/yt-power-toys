'use strict';

// Applies the background script's volume guard decision to audible YouTube media while the
// Windows volume is above the limit. Muted media (e.g. hover previews) is left alone.
//  - mode 'pause': pause it, and resume it afterwards if autoResume is on.
//  - mode 'lower': scale its volume down to volumeTarget, and restore it afterwards.
(() => {
  let state = { blocked: false, mode: 'pause' };
  const pausedByUs = new Set();
  const lowered = new Map();       // media -> the volume to restore
  const ourVolume = new WeakMap(); // media -> the volume we last set, to tell our changes apart
  let banner = null;

  const pausing = () => state.blocked && state.mode === 'pause';
  const lowering = () => state.blocked && state.mode === 'lower';

  function setVolume(media, volume) {
    if (media.volume === volume) return;
    ourVolume.set(media, volume);
    media.volume = volume;
  }

  function enforce(media) {
    if (media.muted || media.volume === 0) return;
    if (pausing() && !media.paused) {
      media.pause();
      pausedByUs.add(media);
      render();
    } else if (lowering()) {
      if (!lowered.has(media)) lowered.set(media, media.volume);
      setVolume(media, Math.min(lowered.get(media), state.volumeTarget));
    }
  }

  // Media events don't bubble, but capture listeners on the document still see them.
  document.addEventListener('play', (e) => enforce(e.target), true);
  document.addEventListener('volumechange', (e) => {
    const media = e.target;
    // A change we didn't make (the user's slider, or YouTube loading the next video) is the
    // volume to come back to.
    if (lowered.has(media) && ourVolume.get(media) !== media.volume) lowered.set(media, media.volume);
    enforce(media);
  }, true);

  browser.runtime.connect().onMessage.addListener((next) => {
    const wasPausing = pausing();
    const wasLowering = lowering();
    state = next;
    if (wasPausing && !pausing()) {
      if (state.autoResume) {
        for (const media of pausedByUs) {
          if (media.isConnected) media.play().catch((err) => console.warn('[yt-power-toys] resume failed:', err));
        }
      }
      pausedByUs.clear();
    }
    if (wasLowering && !lowering()) {
      for (const [media, volume] of lowered) {
        if (media.isConnected) setVolume(media, volume);
      }
      lowered.clear();
    }
    document.querySelectorAll('video, audio').forEach(enforce);
    render();
  });

  function render() {
    if (!pausing() || pausedByUs.size === 0) {
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
    banner.textContent = `Paused: Windows volume is ${state.volumePercent}% ` +
      `(${state.quiet ? 'quiet hours ' : ''}limit ${state.limitPercent}%). ` +
      (state.autoResume ? 'Lower it and playback resumes.' : 'Lower it to play.');
  }
})();
