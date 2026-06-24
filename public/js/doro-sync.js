(function () {
  'use strict';
  var attachedVideos = [];
  var lastSeekTime   = 0;
  var lastCmdTime    = 0;
  var CMD_QUIET_MS   = 1500;
  var pendingCmd     = null;  // command queued while no video is attached yet

  function isCmdQuiet() { return (Date.now() - lastCmdTime) < CMD_QUIET_MS; }

  function postUp(data) {
    try { window.parent.postMessage(data, '*'); } catch (e) {}
  }

  function relayDown(data) {
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try { iframes[i].contentWindow.postMessage(data, '*'); } catch (e) {}
    }
  }

  function applyCmd(vid, cmd, currentTime) {
    switch (cmd) {
      case 'play':
        if (currentTime !== undefined) vid.currentTime = currentTime;
        vid.play().catch(function () {});
        break;
      case 'pause':
        if (currentTime !== undefined) vid.currentTime = currentTime;
        vid.pause();
        break;
      case 'seek':
        vid.currentTime = currentTime;
        break;
    }
  }

  window.addEventListener('message', function (e) {
    var data = e.data;
    if (!data) return;

    // Relay DORO_EVENT upward (from nested iframe)
    if (data.type === 'DORO_EVENT') {
      if (e.source !== window) postUp(data);
      return;
    }

    if (data.type !== 'DORO_CMD') return;
    lastCmdTime = Date.now();

    relayDown(data);

    var vid = attachedVideos[0] || document.querySelector('video');
    if (vid) {
      applyCmd(vid, data.cmd, data.currentTime);
    } else {
      // No video yet — save command and apply when video is found
      pendingCmd = { cmd: data.cmd, currentTime: data.currentTime };
    }
  });

  function attachToVideo(vid) {
    if (attachedVideos.indexOf(vid) !== -1) return;
    attachedVideos.push(vid);

    // Apply any command that arrived before this video was discovered
    if (pendingCmd) {
      applyCmd(vid, pendingCmd.cmd, pendingCmd.currentTime);
      pendingCmd = null;
    }

    vid.addEventListener('play', function () {
      if (isCmdQuiet()) return;
      postUp({ type: 'DORO_EVENT', event: 'play', currentTime: vid.currentTime });
    });

    vid.addEventListener('pause', function () {
      if (isCmdQuiet()) return;
      postUp({ type: 'DORO_EVENT', event: 'pause', currentTime: vid.currentTime });
    });

    vid.addEventListener('seeked', function () {
      if (isCmdQuiet()) return;
      var t = vid.currentTime;
      if (Math.abs(t - lastSeekTime) > 1) {
        postUp({ type: 'DORO_EVENT', event: 'seek', currentTime: t });
      }
      lastSeekTime = t;
    });

    postUp({ type: 'DORO_EVENT', event: 'ready' });
  }

  function scanForVideos() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) { attachToVideo(videos[i]); }
  }

  var observer = new MutationObserver(scanForVideos);

  function start() {
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    scanForVideos();
    setInterval(scanForVideos, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
