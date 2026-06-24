(function () {
  'use strict';

  var attachedVideos = [];
  var lastSeekTime = 0;

  function postUp(data) {
    try { window.parent.postMessage(data, '*'); } catch (e) {}
  }

  function relayDown(data) {
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try { iframes[i].contentWindow.postMessage(data, '*'); } catch (e) {}
    }
  }

  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data) return;

    if (data.type === 'DORO_EVENT') {
      if (e.source !== window) postUp(data);
      return;
    }

    if (data.type !== 'DORO_CMD') return;

    var vid = attachedVideos[0] || document.querySelector('video');
    if (vid) {
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
    }

    relayDown(data);
  });

  function attachToVideo(vid) {
    if (attachedVideos.indexOf(vid) !== -1) return;
    attachedVideos.push(vid);

    vid.addEventListener('play', function () {
      postUp({ type: 'DORO_EVENT', event: 'play', currentTime: vid.currentTime });
    });
    vid.addEventListener('pause', function () {
      postUp({ type: 'DORO_EVENT', event: 'pause', currentTime: vid.currentTime });
    });
    vid.addEventListener('seeked', function () {
      var t = vid.currentTime;
      if (Math.abs(t - lastSeekTime) > 0.5) {
        postUp({ type: 'DORO_EVENT', event: 'seek', currentTime: t });
      }
      lastSeekTime = t;
    });

    postUp({ type: 'DORO_EVENT', event: 'ready' });
  }

  function scanForVideos() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      attachToVideo(videos[i]);
    }
  }

  var observer = new MutationObserver(scanForVideos);

  function start() {
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
    scanForVideos();
    setInterval(scanForVideos, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
