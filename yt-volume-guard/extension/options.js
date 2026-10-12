'use strict';

const limit = document.getElementById('limitPercent');
const autoResume = document.getElementById('autoResume');
const status = document.getElementById('status');

limit.addEventListener('change', () => {
  if (limit.checkValidity()) browser.storage.local.set({ limitPercent: Number(limit.value) });
});
autoResume.addEventListener('change', () => browser.storage.local.set({ autoResume: autoResume.checked }));

// The background script pushes its current state, and every change after that.
browser.runtime.connect().onMessage.addListener((s) => {
  if (document.activeElement !== limit) limit.value = s.limitPercent;
  autoResume.checked = s.autoResume;

  status.className = s.error ? 'error' : s.blocked ? 'blocked' : '';
  status.textContent = s.error
    ? `${s.error}. Run native-host\\install.ps1, then reload this extension.`
    : `Windows volume: ${s.muted ? 'muted' : `${s.volumePercent}%`} — YouTube is ${s.blocked ? 'BLOCKED' : 'allowed'}.`;
});
