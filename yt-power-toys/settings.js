'use strict';

// Shared by the background page, the options page and every content script.
const DEFAULTS = {
  holdMs: 350,
  rewindEnabled: true,
  rewindZonePercent: 33,
  rewindSpeed: 3,
  forwardEnabled: true,
  forwardSpeed: 2,
  keyScanEnabled: true,

  previewEnabled: true,
  previewDelayMs: 500,
  previewScrubEnabled: true,

  volumeGuardEnabled: true,
  volumeLimitPercent: 50,
  volumeLowerInstead: false,
  volumeAutoResume: true,
  volumeBadgeEnabled: true,
  quietHoursEnabled: true,
  quietStart: '23:00',
  quietEnd: '07:00',
  quietLimitPercent: 25,
};

// Returns a settings object kept in sync with storage. `onChange` runs after the
// initial load and after every later change.
function liveSettings(onChange) {
  const settings = { ...DEFAULTS };
  browser.storage.local.get(DEFAULTS).then((stored) => {
    Object.assign(settings, stored);
    onChange?.(settings);
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in DEFAULTS) settings[key] = newValue;
    }
    onChange?.(settings);
  });
  return settings;
}
