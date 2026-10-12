'use strict';

const DEFAULTS = { zonePercent: 33, holdMs: 350, speed: 3 };

browser.storage.local.get(DEFAULTS).then((stored) => {
  for (const [key, value] of Object.entries(stored)) {
    const input = document.getElementById(key);
    input.value = value;
    input.addEventListener('change', () => {
      if (input.checkValidity()) browser.storage.local.set({ [key]: Number(input.value) });
    });
  }
});
