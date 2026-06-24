/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Doro Party â€” Room logic (room.js)
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

(function () {
  'use strict';

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     1. Parse URL params
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const pathParts = window.location.pathname.split('/');
  const roomId    = pathParts[pathParts.length - 1];

  const params   = new URLSearchParams(window.location.search);
  let   videoUrl = params.get('url')      || '';
  let   username = params.get('username') || '';

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     2. DOM references
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const roomIdDisplay    = document.getElementById('room-id-display');
  const copyLinkBtn      = document.getElementById('copy-link-btn');
  const changeVideoBtn   = document.getElementById('change-video-btn');
  const playerContainer  = document.getElementById('player-container');
  const iframeWarning    = document.getElementById('iframe-warning');
  const customControls   = document.getElementById('custom-controls');
  const ctrlPlayPause    = document.getElementById('ctrl-play-pause');
  const playIcon         = document.getElementById('play-icon');
  const ctrlTime         = document.getElementById('ctrl-time');
  const ctrlSeek         = document.getElementById('ctrl-seek');
  const ctrlMute         = document.getElementById('ctrl-mute');
  const ctrlVolume       = document.getElementById('ctrl-volume');
  const usersList        = document.getElementById('users-list');
  const chatMessages     = document.getElementById('chat-messages');
  const chatInput        = document.getElementById('chat-input');
  const chatSendBtn      = document.getElementById('chat-send-btn');

  // Modals
  const usernameModal    = document.getElementById('username-modal');
  const usernameForm     = document.getElementById('username-form');
  const modalUsernameInput = document.getElementById('modal-username-input');
  const modalError       = document.getElementById('modal-error');

  const videoModal       = document.getElementById('video-modal');
  const videoForm        = document.getElementById('video-form');
  const modalVideoInput  = document.getElementById('modal-video-input');
  const videoModalError  = document.getElementById('video-modal-error');
  const videoModalCancel = document.getElementById('video-modal-cancel');

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     3. Room ID display & copy link
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  roomIdDisplay.textContent = roomId;

  copyLinkBtn.addEventListener('click', () => {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      copyLinkBtn.textContent = 'âœ“ Copied!';
      copyLinkBtn.classList.add('btn-copied');
      setTimeout(() => {
        copyLinkBtn.textContent = 'ðŸ”— Copy Link';
        copyLinkBtn.classList.remove('btn-copied');
      }, 2000);
    }).catch(() => {
      // Fallback for non-HTTPS
      prompt('Copy this link:', url);
    });
  });

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     4. Video type detection
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function detectVideoType(url) {
    if (!url) return 'unknown';
    try { new URL(url); } catch (_) { return 'unknown'; }

    if (/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/.test(url)) {
      return 'youtube';
    }
    if (/vimeo\.com\/(?:video\/)?(\d+)/.test(url)) {
      return 'vimeo';
    }
    if (/\.(mp4|webm|ogg|ogv|m3u8|mov|avi|mkv)(\?.*)?$/i.test(url)) {
      return 'direct';
    }
    return 'iframe';
  }

  function extractYouTubeId(url) {
    const m = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function extractVimeoId(url) {
    const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m ? m[1] : null;
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     5. Sync state flag
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  let isSyncing = false;
  let mySocketId = null;
  let isHost = false;

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     6. Player adapter
     Each type exposes: play(t), pause(t), seekTo(t), getCurrentTime(),
                        getDuration(), onPlay(cb), onPause(cb), onSeek(cb)
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  let player = null; // current adapter

  // â”€â”€ 6a. YouTube adapter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function createYouTubePlayer(videoId, startTime, autoplay) {
    playerContainer.innerHTML = '<div id="yt-player"></div>';
    playerContainer.classList.add('aspect-16-9');

    return new Promise((resolve) => {
      function onYTReady() {
        const ytPlayer = new YT.Player('yt-player', {
          videoId,
          playerVars: {
            autoplay: autoplay ? 1 : 0,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            start: Math.floor(startTime || 0)
          },
          events: {
            onReady(event) {
              resolve(buildYTAdapter(event.target));
            }
          }
        });
      }

      if (window.YT && window.YT.Player) {
        onYTReady();
      } else {
        window._doroYTReady = onYTReady;
        if (!document.getElementById('yt-api-script')) {
          const s = document.createElement('script');
          s.id  = 'yt-api-script';
          s.src = 'https://www.youtube.com/iframe_api';
          document.head.appendChild(s);
        }
      }
    });
  }

  // YouTube IFrame API calls onYouTubeIframeAPIReady globally
  window.onYouTubeIframeAPIReady = function () {
    if (window._doroYTReady) window._doroYTReady();
  };

  function buildYTAdapter(ytPlayer) {
    let playCallbacks  = [];
    let pauseCallbacks = [];
    let seekCallbacks  = [];
    let lastState      = -1;
    let lastTime       = 0;

    ytPlayer.addEventListener('onStateChange', (e) => {
      if (isSyncing) return;
      const state = e.data;
      const t     = ytPlayer.getCurrentTime();

      // Seek detection: if time jumped significantly while paused or playing
      if (Math.abs(t - lastTime) > 1.5 && state !== YT.PlayerState.ENDED) {
        seekCallbacks.forEach(cb => cb(t));
      }
      lastTime = t;

      if (state === YT.PlayerState.PLAYING && lastState !== YT.PlayerState.PLAYING) {
        playCallbacks.forEach(cb => cb(t));
      } else if (state === YT.PlayerState.PAUSED && lastState !== YT.PlayerState.PAUSED) {
        pauseCallbacks.forEach(cb => cb(t));
      }
      lastState = state;
    });

    return {
      play(t)          { if (t !== undefined) ytPlayer.seekTo(t, true); ytPlayer.playVideo(); },
      pause(t)         { if (t !== undefined) ytPlayer.seekTo(t, true); ytPlayer.pauseVideo(); },
      seekTo(t)        { ytPlayer.seekTo(t, true); },
      getCurrentTime() { return ytPlayer.getCurrentTime(); },
      getDuration()    { return ytPlayer.getDuration(); },
      onPlay(cb)       { playCallbacks.push(cb); },
      onPause(cb)      { pauseCallbacks.push(cb); },
      onSeek(cb)       { seekCallbacks.push(cb); }
    };
  }

  // â”€â”€ 6b. Vimeo adapter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function createVimeoPlayer(vimeoId, startTime, autoplay) {
    playerContainer.innerHTML = `<iframe id="vimeo-iframe"
      src="https://player.vimeo.com/video/${vimeoId}?autoplay=${autoplay ? 1 : 0}&title=0&byline=0&portrait=0"
      allow="autoplay; fullscreen; picture-in-picture"
      allowfullscreen></iframe>`;
    playerContainer.classList.add('aspect-16-9');

    return new Promise((resolve) => {
      if (!document.getElementById('vimeo-api-script')) {
        const s = document.createElement('script');
        s.id  = 'vimeo-api-script';
        s.src = 'https://player.vimeo.com/api/player.js';
        s.onload = () => initVimeo();
        document.head.appendChild(s);
      } else {
        initVimeo();
      }

      function initVimeo() {
        const iframe = document.getElementById('vimeo-iframe');
        const vp = new Vimeo.Player(iframe);
        if (startTime > 0) vp.setCurrentTime(startTime);

        let playCallbacks  = [];
        let pauseCallbacks = [];
        let seekCallbacks  = [];

        vp.on('play',   () => { if (!isSyncing) { vp.getCurrentTime().then(t => playCallbacks.forEach(cb => cb(t))); } });
        vp.on('pause',  () => { if (!isSyncing) { vp.getCurrentTime().then(t => pauseCallbacks.forEach(cb => cb(t))); } });
        vp.on('seeked', () => { if (!isSyncing) { vp.getCurrentTime().then(t => seekCallbacks.forEach(cb => cb(t))); } });

        resolve({
          play(t)  {
            const p = t !== undefined ? vp.setCurrentTime(t) : Promise.resolve();
            p.then(() => vp.play());
          },
          pause(t) {
            const p = t !== undefined ? vp.setCurrentTime(t) : Promise.resolve();
            p.then(() => vp.pause());
          },
          seekTo(t)        { vp.setCurrentTime(t); },
          getCurrentTime() { return vp.getCurrentTime(); }, // returns Promise
          getDuration()    { return vp.getDuration(); },     // returns Promise
          onPlay(cb)       { playCallbacks.push(cb); },
          onPause(cb)      { pauseCallbacks.push(cb); },
          onSeek(cb)       { seekCallbacks.push(cb); },
          _isVimeo: true
        });
      }
    });
  }

  // â”€â”€ 6c. Direct video adapter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function createDirectPlayer(url, startTime, autoplay) {
    playerContainer.innerHTML = `<video id="video-player" src="${escapeHtml(url)}" preload="metadata"></video>`;
    playerContainer.classList.remove('aspect-16-9');

    const vid = document.getElementById('video-player');
    if (startTime > 0) vid.currentTime = startTime;
    if (autoplay) vid.play().catch(() => {});

    // Show custom controls
    customControls.hidden = false;

    let playCallbacks  = [];
    let pauseCallbacks = [];
    let seekCallbacks  = [];
    let lastSeekTime   = 0;

    // Update seek bar + time display
    vid.addEventListener('timeupdate', () => {
      if (!isNaN(vid.duration) && vid.duration > 0) {
        ctrlSeek.value = (vid.currentTime / vid.duration) * 100;
      }
      ctrlTime.textContent = `${formatTime(vid.currentTime)} / ${formatTime(vid.duration || 0)}`;
    });

    vid.addEventListener('loadedmetadata', () => {
      ctrlSeek.max = 100;
      ctrlTime.textContent = `0:00 / ${formatTime(vid.duration)}`;
    });

    vid.addEventListener('play', () => {
      playIcon.textContent = 'â¸';
      if (!isSyncing) playCallbacks.forEach(cb => cb(vid.currentTime));
    });

    vid.addEventListener('pause', () => {
      playIcon.textContent = 'â–¶';
      if (!isSyncing) pauseCallbacks.forEach(cb => cb(vid.currentTime));
    });

    vid.addEventListener('seeked', () => {
      if (!isSyncing) {
        if (Math.abs(vid.currentTime - lastSeekTime) > 0.5) {
          seekCallbacks.forEach(cb => cb(vid.currentTime));
        }
      }
      lastSeekTime = vid.currentTime;
    });

    // Custom control interactions
    ctrlPlayPause.addEventListener('click', () => {
      if (vid.paused) vid.play().catch(() => {}); else vid.pause();
    });

    ctrlSeek.addEventListener('input', () => {
      if (!isNaN(vid.duration)) {
        vid.currentTime = (ctrlSeek.value / 100) * vid.duration;
      }
    });

    ctrlMute.addEventListener('click', () => {
      vid.muted = !vid.muted;
      ctrlMute.textContent = vid.muted ? 'ðŸ”‡' : 'ðŸ”Š';
    });

    ctrlVolume.addEventListener('input', () => {
      vid.volume = ctrlVolume.value;
      vid.muted  = vid.volume === 0;
      ctrlMute.textContent = vid.muted ? 'ðŸ”‡' : 'ðŸ”Š';
    });

    return Promise.resolve({
      play(t)  { if (t !== undefined) vid.currentTime = t; vid.play().catch(() => {}); },
      pause(t) { if (t !== undefined) vid.currentTime = t; vid.pause(); },
      seekTo(t)        { vid.currentTime = t; },
      getCurrentTime() { return vid.currentTime; },
      getDuration()    { return vid.duration; },
      onPlay(cb)       { playCallbacks.push(cb); },
      onPause(cb)      { pauseCallbacks.push(cb); },
      onSeek(cb)       { seekCallbacks.push(cb); }
    });
  }

  // -- 6d. Proxy-backed iframe adapter --------------------------------------
  // The server fetches the target page, strips X-Frame-Options / CSP, and
  // injects doro-sync.js which hooks into the page's <video> element and
  // communicates back via postMessage.
  function createIframePlayer(url) {
    const proxyUrl = '/proxy?url=' + encodeURIComponent(url);

    playerContainer.innerHTML = `<iframe
      id="proxy-iframe"
      src="${proxyUrl}"
      sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"
      allow="autoplay; fullscreen"
      allowfullscreen></iframe>`;
    playerContainer.classList.add('aspect-16-9');

    const iframe = document.getElementById('proxy-iframe');
    let playCallbacks  = [];
    let pauseCallbacks = [];
    let seekCallbacks  = [];

    function postCmd(cmd, currentTime) {
      if (!iframe.contentWindow) return;
      iframe.contentWindow.postMessage({ type: 'DORO_CMD', cmd, currentTime }, '*');
    }

    function handleMessage(e) {
      const data = e.data;
      if (!data || data.type !== 'DORO_EVENT') return;

      if (data.event === 'ready') {
        iframeWarning.textContent = 'Sync active — video detected on the page.';
        return;
      }

      if (isSyncing) return;
      if (data.event === 'play')  playCallbacks.forEach(cb  => cb(data.currentTime));
      if (data.event === 'pause') pauseCallbacks.forEach(cb => cb(data.currentTime));
      if (data.event === 'seek')  seekCallbacks.forEach(cb  => cb(data.currentTime));
    }

    window.addEventListener('message', handleMessage);

    iframeWarning.textContent = 'Loading via proxy… Sync activates once a video is detected on the page.';
    iframeWarning.hidden = false;

    return Promise.resolve({
      play(t)          { postCmd('play',  t); },
      pause(t)         { postCmd('pause', t); },
      seekTo(t)        { postCmd('seek',  t); },
      getCurrentTime() { return 0; },
      getDuration()    { return 0; },
      onPlay(cb)       { playCallbacks.push(cb); },
      onPause(cb)      { pauseCallbacks.push(cb); },
      onSeek(cb)       { seekCallbacks.push(cb); },
      destroy()        { window.removeEventListener('message', handleMessage); }
    });
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     7. Initialise / re-initialise the player
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  async function initPlayer(url, startTime, autoplay) {
    // Tear down previous player state
    customControls.hidden = true;
    iframeWarning.hidden  = true;
    playerContainer.innerHTML = '';
    playerContainer.classList.remove('aspect-16-9');

    if (!url) {
      playerContainer.innerHTML = `
        <div class="player-placeholder">
          <span class="placeholder-icon">ðŸŽ¬</span>
          <p>No video URL yet.</p>
        </div>`;
      player = null;
      return;
    }

    const type = detectVideoType(url);

    switch (type) {
      case 'youtube': {
        const vid = extractYouTubeId(url);
        if (!vid) { player = await createIframePlayer(url); break; }
        player = await createYouTubePlayer(vid, startTime, autoplay);
        break;
      }
      case 'vimeo': {
        const vid = extractVimeoId(url);
        if (!vid) { player = await createIframePlayer(url); break; }
        player = await createVimeoPlayer(vid, startTime, autoplay);
        break;
      }
      case 'direct':
        player = await createDirectPlayer(url, startTime, autoplay);
        break;
      default:
        player = await createIframePlayer(url);
        break;
    }

    attachPlayerListeners();
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     8. Attach Socket.io player event listeners
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function attachPlayerListeners() {
    if (!player) return;

    player.onPlay((t) => {
      if (isSyncing) return;
      socket.emit('play', { roomId, currentTime: t });
    });

    player.onPause((t) => {
      if (isSyncing) return;
      socket.emit('pause', { roomId, currentTime: t });
    });

    player.onSeek((t) => {
      if (isSyncing) return;
      socket.emit('seek', { roomId, currentTime: t });
    });
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     9. Socket.io setup
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const socket = io();

  function joinRoom() {
    socket.emit('join-room', { roomId, username, videoUrl });
  }

  socket.on('connect', () => {
    mySocketId = socket.id;
    joinRoom();
  });

  // â”€â”€ room-state (sent only to the joining socket) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('room-state', async (state) => {
    isHost = (state.hostId === mySocketId);
    changeVideoBtn.hidden = !isHost;

    renderUsers(state.users, state.hostId);

    // Use server's video URL if we didn't provide one in the query string
    const urlToLoad = videoUrl || state.videoUrl;
    videoUrl = urlToLoad;

    await initPlayer(urlToLoad, state.currentTime, state.isPlaying);
    appendSystemMessage('You joined the party ðŸŽ‰');
  });

  // â”€â”€ user-joined â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('user-joined', (data) => {
    renderUsers(data.users, /* hostId unknown here â€” re-use last */null);
    // hostId may not be sent; re-check
    if (data.users) renderUsers(data.users, null);
    appendSystemMessage(`${escapeHtml(data.username)} joined`);
  });

  // â”€â”€ user-left â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('user-left', (data) => {
    isHost = (data.hostId === mySocketId);
    changeVideoBtn.hidden = !isHost;
    renderUsers(data.users, data.hostId);
    appendSystemMessage(`${escapeHtml(data.username)} left`);
  });

  // â”€â”€ sync-play â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('sync-play', ({ currentTime }) => {
    if (!player) return;
    isSyncing = true;
    player.play(currentTime);
    setTimeout(() => { isSyncing = false; }, 300);
  });

  // â”€â”€ sync-pause â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('sync-pause', ({ currentTime }) => {
    if (!player) return;
    isSyncing = true;
    player.pause(currentTime);
    setTimeout(() => { isSyncing = false; }, 300);
  });

  // â”€â”€ sync-seek â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('sync-seek', ({ currentTime }) => {
    if (!player) return;
    isSyncing = true;
    player.seekTo(currentTime);
    setTimeout(() => { isSyncing = false; }, 300);
  });

  // â”€â”€ chat-message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('chat-message', ({ username: sender, message }) => {
    appendChatMessage(sender, message, sender === username ? 'self' : 'other');
  });

  // â”€â”€ video-changed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on('video-changed', async ({ videoUrl: newUrl }) => {
    videoUrl = newUrl;
    await initPlayer(newUrl, 0, false);
    appendSystemMessage(`Video changed`);
  });

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     10. Users list rendering
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  let lastKnownHostId = null;

  function renderUsers(users, hostId) {
    if (hostId !== null) lastKnownHostId = hostId;
    const effectiveHostId = (hostId !== null ? hostId : lastKnownHostId);

    usersList.innerHTML = '';
    (users || []).forEach(u => {
      const isSelf = (u.id === mySocketId);
      const isUserHost = (u.id === effectiveHostId);

      const li = document.createElement('li');
      li.className = 'user-item';

      const initials = u.username.slice(0, 2).toUpperCase();
      li.innerHTML = `
        <div class="user-avatar${isSelf ? ' self' : ''}">${escapeHtml(initials)}</div>
        <span class="user-name">${escapeHtml(u.username)}${isSelf ? ' (you)' : ''}</span>
        ${isUserHost ? '<span class="user-crown" title="Host">ðŸ‘‘</span>' : ''}
      `;
      usersList.appendChild(li);
    });
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     11. Chat
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function appendChatMessage(sender, message, type) {
    const div = document.createElement('div');
    div.className = `chat-msg ${type}`;

    if (type !== 'system') {
      const authorEl = document.createElement('div');
      authorEl.className = 'chat-msg-author';
      authorEl.textContent = type === 'self' ? 'You' : sender;
      div.appendChild(authorEl);
    }

    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble';
    bubble.textContent = message;
    div.appendChild(bubble);

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-msg system';
    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble';
    bubble.textContent = text;
    div.appendChild(bubble);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function sendChatMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    socket.emit('chat-message', { roomId, username, message: msg });
    chatInput.value = '';
  }

  chatSendBtn.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     12. Username modal
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  if (!username) {
    usernameModal.hidden = false;
    modalUsernameInput.focus();
  }

  usernameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = modalUsernameInput.value.trim();
    if (!val) {
      modalError.textContent = 'Please enter a name.';
      modalError.hidden = false;
      return;
    }
    username = val;
    usernameModal.hidden = true;
    // Connect and join â€” socket may already be connected
    if (socket.connected) joinRoom(); // else 'connect' event will fire joinRoom
  });

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     13. Change video modal (host only)
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  changeVideoBtn.addEventListener('click', () => {
    modalVideoInput.value = videoUrl || '';
    videoModalError.hidden = true;
    videoModal.hidden = false;
    modalVideoInput.focus();
  });

  videoModalCancel.addEventListener('click', () => {
    videoModal.hidden = true;
  });

  videoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newUrl = modalVideoInput.value.trim();
    if (!newUrl) {
      videoModalError.textContent = 'Please enter a URL.';
      videoModalError.hidden = false;
      return;
    }
    try { new URL(newUrl); } catch (_) {
      videoModalError.textContent = 'That doesn\'t look like a valid URL.';
      videoModalError.hidden = false;
      return;
    }
    socket.emit('set-video', { roomId, videoUrl: newUrl });
    videoModal.hidden = true;
  });

  // Close modals on backdrop click
  videoModal.addEventListener('click', (e) => {
    if (e.target === videoModal) videoModal.hidden = true;
  });

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     14. Helpers
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const s = Math.floor(seconds % 60);
    const m = Math.floor(seconds / 60) % 60;
    const h = Math.floor(seconds / 3600);
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${m}:${String(s).padStart(2,'0')}`;
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

})();
