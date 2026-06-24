/* ═══════════════════════════════════════════════════════════════════════════
   Doro Party — Room logic (room.js)
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── 1. Parse URL params ────────────────────────────────────────────────── */
  const pathParts = window.location.pathname.split('/');
  const roomId    = pathParts[pathParts.length - 1];
  const params    = new URLSearchParams(window.location.search);
  let   videoUrl  = params.get('url')      || '';
  let   username  = params.get('username') || '';

  /* ─── 2. DOM references ──────────────────────────────────────────────────── */
  const roomIdDisplay    = document.getElementById('room-id-display');
  const copyLinkBtn      = document.getElementById('copy-link-btn');
  const changeVideoBtn   = document.getElementById('change-video-btn');
  const statusBadge      = document.getElementById('status-badge');
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
  const usernameModal      = document.getElementById('username-modal');
  const usernameForm       = document.getElementById('username-form');
  const modalUsernameInput = document.getElementById('modal-username-input');
  const modalError         = document.getElementById('modal-error');
  const videoModal         = document.getElementById('video-modal');
  const videoForm          = document.getElementById('video-form');
  const modalVideoInput    = document.getElementById('modal-video-input');
  const videoModalError    = document.getElementById('video-modal-error');
  const videoModalCancel   = document.getElementById('video-modal-cancel');

  /* ─── 3. Room ID display & copy link ─────────────────────────────────────── */
  roomIdDisplay.textContent = roomId;

  copyLinkBtn.addEventListener('click', () => {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      copyLinkBtn.textContent = '✔ Copied!';
      copyLinkBtn.classList.add('btn-copied');
      setTimeout(() => {
        copyLinkBtn.textContent = '🔗 Copy Link';
        copyLinkBtn.classList.remove('btn-copied');
      }, 2000);
    }).catch(() => { prompt('Copy this link:', url); });
  });

  /* ─── 4. Video type detection ────────────────────────────────────────────── */
  function detectVideoType(url) {
    if (!url) return 'unknown';
    try { new URL(url); } catch (_) { return 'unknown'; }
    if (/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/.test(url)) return 'youtube';
    if (/vimeo\.com\/(?:video\/)?(\d+)/.test(url)) return 'vimeo';
    if (/rumble\.com\/(v[a-z0-9]+)/i.test(url)) return 'rumble';
    if (/\.(mp4|webm|ogg|ogv|m3u8|mov|avi|mkv)(\?.*)?$/i.test(url)) return 'direct';
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

  function extractRumbleId(url) {
    const m = url.match(/rumble\.com\/(v[a-z0-9]+)/i);
    return m ? m[1] : null;
  }

  /* ─── 5. Sync state ──────────────────────────────────────────────────────── */
  // syncClient is WatchPartySync — active only for direct (native) video.
  // isSyncing is the suppression flag for adapter-based players (YT/Vimeo).
  let syncClient  = null;
  let isSyncing   = false;
  let mySocketId  = null;
  let isHost      = false;

  /* ─── 6. Player adapters ─────────────────────────────────────────────────── */
  // Each adapter exposes: play(t), pause(t), seekTo(t), getCurrentTime(),
  //                       getDuration(), onPlay(cb), onPause(cb), onSeek(cb)
  let player = null;

  // ── 6a. YouTube adapter ──────────────────────────────────────────────────
  function createYouTubePlayer(videoId, startTime, autoplay) {
    playerContainer.innerHTML = '<div id="yt-player"></div>';
    playerContainer.classList.add('aspect-16-9');

    return new Promise((resolve) => {
      function onYTReady() {
        const ytPlayer = new YT.Player('yt-player', {
          videoId,
          playerVars: {
            autoplay: autoplay ? 1 : 0,
            controls: 1, rel: 0, modestbranding: 1,
            start: Math.floor(startTime || 0),
          },
          events: {
            onReady(event) { resolve(buildYTAdapter(event.target)); }
          },
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
      onSeek(cb)       { seekCallbacks.push(cb); },
    };
  }

  // ── 6b. Vimeo adapter ───────────────────────────────────────────────────
  function createVimeoPlayer(vimeoId, startTime, autoplay) {
    playerContainer.innerHTML = `<iframe id="vimeo-iframe"
      src="https://player.vimeo.com/video/${vimeoId}?autoplay=${autoplay ? 1 : 0}&title=0&byline=0&portrait=0"
      allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    playerContainer.classList.add('aspect-16-9');

    return new Promise((resolve) => {
      function initVimeo() {
        const vp = new Vimeo.Player(document.getElementById('vimeo-iframe'));
        if (startTime > 0) vp.setCurrentTime(startTime);

        let playCallbacks  = [];
        let pauseCallbacks = [];
        let seekCallbacks  = [];

        vp.on('play',   () => { if (!isSyncing) vp.getCurrentTime().then(t => playCallbacks.forEach(cb => cb(t))); });
        vp.on('pause',  () => { if (!isSyncing) vp.getCurrentTime().then(t => pauseCallbacks.forEach(cb => cb(t))); });
        vp.on('seeked', () => { if (!isSyncing) vp.getCurrentTime().then(t => seekCallbacks.forEach(cb => cb(t))); });

        resolve({
          play(t)  { (t !== undefined ? vp.setCurrentTime(t) : Promise.resolve()).then(() => vp.play()); },
          pause(t) { (t !== undefined ? vp.setCurrentTime(t) : Promise.resolve()).then(() => vp.pause()); },
          seekTo(t)        { vp.setCurrentTime(t); },
          getCurrentTime() { return vp.getCurrentTime(); },
          getDuration()    { return vp.getDuration(); },
          onPlay(cb)       { playCallbacks.push(cb); },
          onPause(cb)      { pauseCallbacks.push(cb); },
          onSeek(cb)       { seekCallbacks.push(cb); },
          _isVimeo: true,
        });
      }

      if (!document.getElementById('vimeo-api-script')) {
        const s = document.createElement('script');
        s.id    = 'vimeo-api-script';
        s.src   = 'https://player.vimeo.com/api/player.js';
        s.onload = initVimeo;
        document.head.appendChild(s);
      } else {
        initVimeo();
      }
    });
  }

  // ── 6c. Direct video adapter ─────────────────────────────────────────────
  // WatchPartySync owns the play/pause/seek socket events for this player type.
  // The adapter only exposes UI callbacks (icon updates, time display) —
  // it does NOT emit to the socket (attachPlayerListeners is not called for direct).
  function createDirectPlayer(url, startTime) {
    playerContainer.innerHTML = `<video id="video-player" src="${escapeHtml(url)}" preload="metadata"></video>`;
    playerContainer.classList.remove('aspect-16-9');

    const vid = document.getElementById('video-player');
    if (startTime > 0) vid.currentTime = startTime;

    customControls.hidden = false;

    // No play/pause/seek callbacks — WatchPartySync handles socket events.
    // We only wire up the custom control UI.
    vid.addEventListener('play',  () => { playIcon.textContent = '⏸'; });
    vid.addEventListener('pause', () => { playIcon.textContent = '▶'; });

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

    ctrlPlayPause.addEventListener('click', () => {
      if (vid.paused) vid.play().catch(() => {}); else vid.pause();
    });
    ctrlSeek.addEventListener('input', () => {
      if (!isNaN(vid.duration)) vid.currentTime = (ctrlSeek.value / 100) * vid.duration;
    });
    ctrlMute.addEventListener('click', () => {
      vid.muted = !vid.muted;
      ctrlMute.textContent = vid.muted ? '🔇' : '🔊';
    });
    ctrlVolume.addEventListener('input', () => {
      vid.volume = ctrlVolume.value;
      vid.muted  = vid.volume === 0;
      ctrlMute.textContent = vid.muted ? '🔇' : '🔊';
    });

    // Return a minimal adapter — callers can still query duration/time
    return Promise.resolve({
      play()           { /* WatchPartySync handles this */ },
      pause()          { /* WatchPartySync handles this */ },
      seekTo()         { /* WatchPartySync handles this */ },
      getCurrentTime() { return vid.currentTime; },
      getDuration()    { return vid.duration; },
      onPlay()         { /* not used — WatchPartySync owns events */ },
      onPause()        { /* not used */ },
      onSeek()         { /* not used */ },
    });
  }

  // ── 6d. Proxy-backed iframe adapter ─────────────────────────────────────
  function createIframePlayer(url) {
    const proxyUrl = '/proxy?url=' + encodeURIComponent(url);
    playerContainer.innerHTML = `<iframe id="proxy-iframe"
      src="${proxyUrl}"
      sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"
      allow="autoplay; fullscreen" allowfullscreen></iframe>`;
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
    iframeWarning.hidden      = false;

    return Promise.resolve({
      play(t)          { postCmd('play',  t); },
      pause(t)         { postCmd('pause', t); },
      seekTo(t)        { postCmd('seek',  t); },
      getCurrentTime() { return 0; },
      getDuration()    { return 0; },
      onPlay(cb)       { playCallbacks.push(cb); },
      onPause(cb)      { pauseCallbacks.push(cb); },
      onSeek(cb)       { seekCallbacks.push(cb); },
      destroy()        { window.removeEventListener('message', handleMessage); },
    });
  }

  /* ─── 7. Initialise / re-initialise the player ───────────────────────────── */
  async function initPlayer(url, startTime) {
    // Tear down WatchPartySync before destroying the video element
    if (syncClient) { syncClient.destroy(); syncClient = null; }

    customControls.hidden = true;
    iframeWarning.hidden  = true;
    playerContainer.innerHTML = '';
    playerContainer.classList.remove('aspect-16-9');

    if (!url) {
      playerContainer.innerHTML = `
        <div class="player-placeholder">
          <span class="placeholder-icon">🎬</span>
          <p>No video URL yet.</p>
        </div>`;
      player = null;
      return;
    }

    const type = detectVideoType(url);
    switch (type) {
      case 'youtube': {
        const vid = extractYouTubeId(url);
        player = vid ? await createYouTubePlayer(vid, startTime, false)
                     : await createIframePlayer(url);
        break;
      }
      case 'vimeo': {
        const vid = extractVimeoId(url);
        player = vid ? await createVimeoPlayer(vid, startTime, false)
                     : await createIframePlayer(url);
        break;
      }
      case 'rumble': {
        let embedUrl = url;
        try {
          const resp = await fetch('/api/rumble-embed?url=' + encodeURIComponent(url));
          const data = await resp.json();
          if (data.embedUrl) embedUrl = data.embedUrl;
        } catch (_) {}
        player = await createIframePlayer(embedUrl, startTime, false);
        break;
      }
      case 'direct':
        player = await createDirectPlayer(url, startTime);
        break;
      default:
        player = await createIframePlayer(url);
    }
    // Caller decides whether to attach listeners (not done here)
  }

  /* ─── 8. Attach socket → adapter listeners (YT / Vimeo / iframe only) ───── */
  function attachPlayerListeners() {
    if (!player) return;

    player.onPlay((t) => {
      if (isSyncing) return;
      socket.emit('play', { roomId, position: t });
    });
    player.onPause((t) => {
      if (isSyncing) return;
      socket.emit('pause', { roomId, position: t });
    });
    player.onSeek((t) => {
      if (isSyncing) return;
      // We don't know if the adapter was playing; default to current state
      const playing = player.getCurrentTime ? true : false;
      socket.emit('seek', { roomId, position: t, isPlaying: playing });
    });
  }

  /* ─── 9. Socket.io setup ─────────────────────────────────────────────────── */
  const socket = io();

  function joinRoom() {
    socket.emit('join', { roomId, username, videoUrl });
  }

  socket.on('connect', () => {
    mySocketId = socket.id;
    if (username) joinRoom();
  });

  // ── Initial state on join ───────────────────────────────────────────────
  socket.on('sync', async (state) => {
    isHost = state.isHost;
    updateStatusBadge();
    changeVideoBtn.hidden = !isHost;
    renderUsers(state.users, state.hostId);

    const urlToLoad = videoUrl || state.videoUrl || '';
    videoUrl = urlToLoad;

    await initPlayer(urlToLoad, state.position);
    appendSystemMessage('You joined the party 🎉');

    if (!urlToLoad) return;

    if (detectVideoType(urlToLoad) === 'direct') {
      // WatchPartySync handles all sync for native video
      const vid = document.getElementById('video-player');
      if (vid) {
        syncClient = new WatchPartySync({ videoEl: vid, socket, roomId });
        syncClient.applyInitialState(state);
      }
    } else {
      // Adapter-based players: attach listeners and apply state manually
      attachPlayerListeners();
      const latency = (Date.now() - state.sentAt) / 1000;
      const pos     = state.isPlaying ? state.position + latency : state.position;
      isSyncing = true;
      if (state.isPlaying) player?.play(pos);
      else                 player?.pause(pos);
      setTimeout(() => { isSyncing = false; }, 300);
    }
  });

  // ── Viewer count / user list updates ────────────────────────────────────
  socket.on('viewer_joined', (data) => {
    renderUsers(data.users, null);
    appendSystemMessage(`${escapeHtml(data.user?.username || '?')} joined`);
  });

  socket.on('user_left', (data) => {
    isHost = (data.hostId === mySocketId);
    updateStatusBadge();
    changeVideoBtn.hidden = !isHost;
    renderUsers(data.users, data.hostId);
    appendSystemMessage(`${escapeHtml(data.username || '?')} left`);
  });

  socket.on('host_changed', (data) => {
    isHost = (data.hostId === mySocketId);
    updateStatusBadge();
    changeVideoBtn.hidden = !isHost;
    if (syncClient) syncClient._isHost = isHost; // keep WatchPartySync in sync
    renderUsers(data.users, data.hostId);
    appendSystemMessage('The host left — a new host has been assigned');
  });

  socket.on('you_are_host', () => {
    isHost = true;
    updateStatusBadge();
    changeVideoBtn.hidden = false;
    // WatchPartySync also listens to 'you_are_host' and sets _isHost internally
  });

  // ── Sync events — WatchPartySync handles these for direct video ──────────
  socket.on('play', ({ position, sentAt }) => {
    if (syncClient) return; // WatchPartySync handles direct video
    if (!player) return;
    isSyncing = true;
    const latency = (Date.now() - sentAt) / 1000;
    player.play(position + latency);
    setTimeout(() => { isSyncing = false; }, 300);
  });

  socket.on('pause', ({ position }) => {
    if (syncClient) return;
    if (!player) return;
    isSyncing = true;
    player.pause(position);
    setTimeout(() => { isSyncing = false; }, 300);
  });

  socket.on('seek', ({ position, isPlaying, sentAt }) => {
    if (syncClient) return;
    if (!player) return;
    isSyncing = true;
    const latency = isPlaying ? (Date.now() - sentAt) / 1000 : 0;
    if (isPlaying) player.play(position + latency);
    else           player.seekTo(position);
    setTimeout(() => { isSyncing = false; }, 300);
  });

  socket.on('sync_tick', () => {
    // WatchPartySync handles drift correction for direct video
    if (syncClient) return;
    // No additional drift correction for adapter players (YT/Vimeo)
  });

  // ── Chat ─────────────────────────────────────────────────────────────────
  socket.on('chat', ({ name, msg }) => {
    appendChatMessage(name, msg, name === username ? 'self' : 'other');
  });

  // ── Video URL change (host only) ─────────────────────────────────────────
  socket.on('video_changed', async ({ videoUrl: newUrl }) => {
    videoUrl = newUrl;
    await initPlayer(newUrl, 0);
    appendSystemMessage('Video changed');

    if (detectVideoType(newUrl) === 'direct') {
      const vid = document.getElementById('video-player');
      if (vid) {
        syncClient = new WatchPartySync({ videoEl: vid, socket, roomId });
        syncClient._isHost = isHost;
      }
    } else {
      attachPlayerListeners();
    }
  });

  /* ─── 10. Users list rendering ───────────────────────────────────────────── */
  let lastKnownHostId = null;

  function renderUsers(users, hostId) {
    if (hostId !== null) lastKnownHostId = hostId;
    const effectiveHostId = hostId !== null ? hostId : lastKnownHostId;

    usersList.innerHTML = '';
    (users || []).forEach(u => {
      const isSelf     = (u.id === mySocketId);
      const isUserHost = (u.id === effectiveHostId);
      const li         = document.createElement('li');
      li.className     = 'user-item';
      const initials   = (u.username || '?').slice(0, 2).toUpperCase();
      li.innerHTML = `
        <div class="user-avatar${isSelf ? ' self' : ''}">${escapeHtml(initials)}</div>
        <span class="user-name">${escapeHtml(u.username)}${isSelf ? ' (you)' : ''}</span>
        ${isUserHost ? '<span class="user-crown" title="Host">👑</span>' : ''}
      `;
      usersList.appendChild(li);
    });
  }

  /* ─── 11. Status badge ───────────────────────────────────────────────────── */
  function updateStatusBadge() {
    if (!statusBadge) return;
    if (isHost) {
      statusBadge.textContent  = '👑 You are the host';
      statusBadge.className    = 'status-badge status-host';
    } else {
      statusBadge.textContent  = '✅ Joined';
      statusBadge.className    = 'status-badge status-viewer';
    }
  }

  /* ─── 12. Chat ───────────────────────────────────────────────────────────── */
  function appendChatMessage(sender, msg, type) {
    const div    = document.createElement('div');
    div.className = `chat-msg ${type}`;

    if (type !== 'system') {
      const authorEl       = document.createElement('div');
      authorEl.className   = 'chat-msg-author';
      authorEl.textContent = type === 'self' ? 'You' : sender;
      div.appendChild(authorEl);
    }

    const bubble       = document.createElement('div');
    bubble.className   = 'chat-msg-bubble';
    bubble.textContent = msg;
    div.appendChild(bubble);

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendSystemMessage(text) {
    const div  = document.createElement('div');
    div.className = 'chat-msg system';
    const bubble  = document.createElement('div');
    bubble.className   = 'chat-msg-bubble';
    bubble.textContent = text;
    div.appendChild(bubble);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function sendChatMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    socket.emit('chat', { roomId, name: username, msg });
    chatInput.value = '';
  }

  chatSendBtn.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  /* ─── 13. Username modal ─────────────────────────────────────────────────── */
  if (!username) {
    usernameModal.hidden = false;
    modalUsernameInput.focus();
  }

  usernameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = modalUsernameInput.value.trim();
    if (!val) {
      modalError.textContent = 'Please enter a name.';
      modalError.hidden      = false;
      return;
    }
    username                = val;
    usernameModal.hidden    = true;
    if (socket.connected) joinRoom();
  });

  /* ─── 14. Change video modal (host only) ─────────────────────────────────── */
  changeVideoBtn.addEventListener('click', () => {
    modalVideoInput.value    = videoUrl || '';
    videoModalError.hidden   = true;
    videoModal.hidden        = false;
    modalVideoInput.focus();
  });

  videoModalCancel.addEventListener('click', () => { videoModal.hidden = true; });

  videoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newUrl = modalVideoInput.value.trim();
    if (!newUrl) {
      videoModalError.textContent = 'Please enter a URL.';
      videoModalError.hidden      = false;
      return;
    }
    try { new URL(newUrl); } catch (_) {
      videoModalError.textContent = "That doesn't look like a valid URL.";
      videoModalError.hidden      = false;
      return;
    }
    socket.emit('set_video', { roomId, videoUrl: newUrl });
    videoModal.hidden = true;
  });

  videoModal.addEventListener('click', (e) => {
    if (e.target === videoModal) videoModal.hidden = true;
  });

  /* ─── 15. Helpers ────────────────────────────────────────────────────────── */
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
    return str
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

})();
