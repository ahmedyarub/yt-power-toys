'use strict';

// Every input's id is a settings key; checkboxes hold booleans, time inputs "HH:MM"
// strings, the rest numbers.
browser.storage.local.get(DEFAULTS).then((stored) => {
  for (const [key, value] of Object.entries(stored)) {
    const input = document.getElementById(key);
    if (input.type === 'checkbox') input.checked = value;
    else input.value = value;
    input.addEventListener('change', () => {
      if (!input.checkValidity()) return;
      const newValue = input.type === 'checkbox' ? input.checked : input.type === 'time' ? input.value : Number(input.value);
      browser.storage.local.set({ [key]: newValue });
    });
  }
});

// The background script pushes the volume guard state, and every change after that.
const status = document.getElementById('status');
browser.runtime.connect().onMessage.addListener((s) => {
  status.className = !s.enabled ? '' : s.error ? 'error' : s.blocked ? 'blocked' : '';
  status.textContent = !s.enabled
    ? 'Volume guard is off.'
    : s.error
      ? `${s.error}. Run native-host\\install.ps1 from a terminal outside the Claude app; the extension reconnects within 5 seconds.`
      : `Windows volume: ${s.muted ? 'muted' : `${s.volumePercent}%`}, limit ${s.limitPercent}%` +
        `${s.quiet ? ' (quiet hours)' : ''}. ` +
        (!s.blocked ? 'YouTube is allowed.' : s.mode === 'lower'
          ? `YouTube is turned down to ${Math.round(s.volumeTarget * 100)}%.`
          : 'YouTube is BLOCKED.');
});
