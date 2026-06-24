/* doro-sync.js — injected by the proxy into every proxied page.
   Finds any <video> element and bridges play/pause/seek events
   to/from the parent room via postMessage. */
(function () {
  'use strict';

  var attached = false;
  var lastSeekTime = 0;
  var video = null;

  // ---- Commands from parent → video ----
  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data || data.type !== 'DORO_CMD') return;

    // Try to get the video element fresh in case it changed
    var vid = video || document.querySelector('video');
    if (!vid) return;

    switch (data.cmd) {
      case 'play':
        if (data.currentTime !== undefined) vid.currentTime = data.currentTime;
        vid.play().catch(function () {});
        break;
      case 'pause':
        if (data.currentTime !== undefined) vid.currentTime = data.currentTime;
        vid.pause();
        break;
      case 'seek':
        vid.currentTime = data.currentTime;
        break;
    }
  });

  // ---- Video events → parent ----
  function attachToVideo(vid) {
    video = vid;

    vid.addEventListener('play', function () {
      window.parent.postMessage({ type: 'DORO_EVENT', event: 'play', currentTime: vid.currentTime }, '*');
    });

    vid.addEventListener('pause', function () {
      window.parent.postMessage({ type: 'DORO_EVENT', event: 'pause', currentTime: vid.currentTime }, '*');
    });

    vid.addEventListener('seeked', function () {
      var t = vid.currentTime;
      if (Math.abs(t - lastSeekTime) > 0.5) {
        window.parent.postMessage({ type: 'DORO_EVENT', event: 'seek', currentTime: t }, '*');
      }
      lastSeekTime = t;
    });

    // Tell the parent the sync bridge is active
    window.parent.postMessage({ type: 'DORO_EVENT', event: 'ready' }, '*');
  }

  // ---- Find the video (may appear after page load) ----
  function tryAttach() {
    if (attached) return;
    var vid = document.querySelector('video');
    if (vid) {
      attached = true;
      attachToVideo(vid);
    }
  }

  // Watch for dynamically inserted video elements
  var observer = new MutationObserver(function () { if (!attached) tryAttach(); });

  function startObserving() {
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    tryAttach();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserving);
  } else {
    startObserving();
  }
})();
