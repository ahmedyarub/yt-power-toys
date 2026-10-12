'use strict';

// Hover previews are youtube-nocookie.com embeds placed inside youtube.com pages. YouTube
// refuses embeds whose embedding page is youtube.com itself: with that Referer the embed
// comes back as PLAYABILITY_ERROR_CODE_EMBEDDER_IDENTITY_DENIED ("Error 152-4"), and with no
// Referer as ..._MISSING_REFERRER (153). Present those frames as embedded from
// youtube-nocookie.com, which YouTube accepts.
//
// Firefox only lets this listener modify the request when the extension has host permission
// for the requesting page (youtube.com) as well as the request URL; content-script matches
// don't count. Without "https://www.youtube.com/*" in permissions it silently does nothing.

const PREVIEW_REFERER = 'https://www.youtube-nocookie.com/';

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!details.documentUrl?.startsWith('https://www.youtube.com/')) return {};
    const requestHeaders = details.requestHeaders.filter((h) => h.name.toLowerCase() !== 'referer');
    requestHeaders.push({ name: 'Referer', value: PREVIEW_REFERER });
    return { requestHeaders };
  },
  { urls: ['https://www.youtube-nocookie.com/embed/*'], types: ['sub_frame'] },
  ['blocking', 'requestHeaders'],
);
