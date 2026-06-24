/* ═══════════════════════════════════════════════════════════════════════════
   WatchPartySync — client-side sync manager for native HTML5 <video>
   Implements all 7 bug fixes from the architecture spec.
   ═══════════════════════════════════════════════════════════════════════════ */

class WatchPartySync {
  constructor({ videoEl, socket, roomId }) {
    this.video  = videoEl;
    this.socket = socket;
    this.roomId = roomId;

    // _isApplyingRemote is the suppression flag (Bug 1).
    // Set to true before ANY programmatic video change; cleared after 150ms
    // so the browser's queued events can fire and be silently discarded.
    this._isApplyingRemote = false;

    this._isHost         = false;
    this._pendingPlay    = false;   // Bug 4: blocked autoplay pending a user gesture
    this._driftTimer     = null;
    this._rateResetTimer = null;
    this._boundGesture   = this._onUserGesture.bind(this);

    this._setupVideoListeners();
    this._setupSocketListeners();
    this._setupDriftCorrection();
    this._setupGestureListener();
  }

  // ── PUBLIC: called by room.js after the video element is ready ───────────
  // room.js owns the 'sync' socket event (it creates the player first).
  // This method applies the initial latency-compensated state after creation.
  applyInitialState({ isPlaying, position, sentAt, isHost }) {
    this._isHost = isHost ?? false;
    const latency = (Date.now() - sentAt) / 1000;
    this._applyRemoteState({
      isPlaying,
      position: isPlaying ? position + latency : position,
    });
  }

  // ── VIDEO → SERVER ───────────────────────────────────────────────────────

  _setupVideoListeners() {
    const v = this.video;

    v.addEventListener('play', () => {
      if (this._isApplyingRemote) return; // suppression flag — abort re-broadcast
      this.socket.emit('play', { roomId: this.roomId, position: v.currentTime });
    });

    v.addEventListener('pause', () => {
      if (this._isApplyingRemote) return;

      // Bug 3: the browser fires 'pause' both for intentional pauses AND for
      // seek scrubbing (seeking=true) and buffer stalls (readyState < 3).
      // Only emit for genuine user-initiated pauses.
      if (v.seeking) return;
      if (v.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;

      this.socket.emit('pause', { roomId: this.roomId, position: v.currentTime });
    });

    v.addEventListener('seeked', () => {
      if (this._isApplyingRemote) return; // Bug 7: suppress echo from remote seeks
      this.socket.emit('seek', {
        roomId:    this.roomId,
        position:  v.currentTime,
        isPlaying: !v.paused,
      });
    });
  }

  // ── SERVER → VIDEO ───────────────────────────────────────────────────────

  _setupSocketListeners() {
    // play: compensate for network latency so the joiner lands at the right time
    this.socket.on('play', ({ position, sentAt }) => {
      const latency = (Date.now() - sentAt) / 1000; // Bug 2 fix
      this._applyRemoteState({ isPlaying: true, position: position + latency });
    });

    this.socket.on('pause', ({ position }) => {
      // No latency compensation for pause — a paused position doesn't drift
      this._applyRemoteState({ isPlaying: false, position });
    });

    this.socket.on('seek', ({ position, isPlaying, sentAt }) => {
      const latency = isPlaying ? (Date.now() - sentAt) / 1000 : 0;
      this._applyRemoteState({ isPlaying, position: position + latency });
    });

    this.socket.on('you_are_host', () => {
      this._isHost = true;
    });

    // Drift correction tick — only non-host clients use this
    this.socket.on('sync_tick', ({ isPlaying, position, sentAt }) => {
      if (this._isHost || this._isApplyingRemote) return;

      const latency = (Date.now() - sentAt) / 1000;
      const target  = isPlaying ? position + latency : position;
      const drift   = this.video.currentTime - target; // + means we're ahead

      if (Math.abs(drift) < 0.3) return; // Bug 6: < 300ms is perfect, do nothing

      if (Math.abs(drift) < 2.0) {
        // Bug 6: 300ms–2s — soft nudge via playbackRate, no seek, no buffer flush
        clearTimeout(this._rateResetTimer);
        this.video.playbackRate = drift > 0 ? 0.92 : 1.08;
        this._rateResetTimer = setTimeout(() => { this.video.playbackRate = 1.0; }, 3000);
      } else {
        // > 2s — hard seek (the skip is acceptable at this drift level)
        this._applyRemoteState({ isPlaying, position: target });
      }
    });
  }

  // ── APPLY REMOTE STATE (atomic, suppressed) ──────────────────────────────

  async _applyRemoteState({ isPlaying, position }) {
    const v = this.video;
    this._isApplyingRemote = true; // 🔒 lock — all video events ignored until unlock

    try {
      if (Math.abs(v.currentTime - position) > 0.5) {
        v.currentTime = position;

        // Bug 7: wait for 'seeked' before applying play/pause, or the pause
        // event from the seek can interrupt a subsequent play() call.
        await new Promise(resolve => {
          v.addEventListener('seeked', resolve, { once: true });
          setTimeout(resolve, 800); // safety timeout
        });
      }

      if (isPlaying && v.paused) {
        try {
          await v.play();
        } catch (err) {
          // Bug 4: browsers block programmatic play() without a prior user gesture
          if (err.name === 'NotAllowedError') {
            this._pendingPlay = true;
            this._showTapToPlayOverlay();
          }
          // Do NOT rethrow — this is expected browser behaviour
        }
      } else if (!isPlaying && !v.paused) {
        v.pause();
      }
    } catch (err) {
      console.warn('[WatchPartySync] applyRemoteState error:', err);
    } finally {
      // 🔓 unlock after 150ms — gives the player time to fire queued events
      // so they can be suppressed rather than re-broadcast
      setTimeout(() => { this._isApplyingRemote = false; }, 150);
    }
  }

  // ── DRIFT CORRECTION ─────────────────────────────────────────────────────

  _setupDriftCorrection() {
    // Non-host clients request a projected tick every 5s
    this._driftTimer = setInterval(() => {
      if (this._isHost || this.video.paused) return;
      this.socket.emit('request_sync', { roomId: this.roomId });
    }, 5000);
  }

  // ── USER GESTURE LISTENER ────────────────────────────────────────────────

  _setupGestureListener() {
    ['click', 'keydown', 'touchstart'].forEach(evt =>
      document.addEventListener(evt, this._boundGesture, { passive: true })
    );
  }

  _onUserGesture() {
    // Bug 4: if a previous play() was blocked by autoplay policy, retry now
    // that we have a confirmed user gesture
    if (this._pendingPlay) {
      this._pendingPlay      = false;
      this._isApplyingRemote = true;
      this.video.play()
        .catch(() => {})
        .finally(() => setTimeout(() => { this._isApplyingRemote = false; }, 150));
    }

    // Bug 5: resume Web Audio API context if the browser suspended it
    // (tabs backgrounded or idle can silently lose audio output)
    if (window.__watchPartyAudioCtx?.state === 'suspended') {
      window.__watchPartyAudioCtx.resume().catch(() => {});
    }
  }

  // ── TAP TO PLAY OVERLAY ──────────────────────────────────────────────────

  _showTapToPlayOverlay() {
    let el = document.getElementById('_wps_overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = '_wps_overlay';
      el.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,0.78);display:flex;' +
        'align-items:center;justify-content:center;z-index:99999;cursor:pointer';
      el.innerHTML =
        '<button style="background:#fff;color:#111;border:none;' +
        'padding:18px 44px;font-size:20px;border-radius:10px;cursor:pointer;' +
        'font-weight:700;box-shadow:0 4px 24px rgba(0,0,0,0.5)">▶ Tap to join the party</button>';
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
    el.addEventListener('click', () => { el.style.display = 'none'; }, { once: true });
  }

  // ── CLEANUP ──────────────────────────────────────────────────────────────

  destroy() {
    clearInterval(this._driftTimer);
    clearTimeout(this._rateResetTimer);
    ['play', 'pause', 'seek', 'you_are_host', 'sync_tick']
      .forEach(e => this.socket.off(e));
    ['click', 'keydown', 'touchstart']
      .forEach(e => document.removeEventListener(e, this._boundGesture));
    const overlay = document.getElementById('_wps_overlay');
    if (overlay) overlay.remove();
  }
}

// Export for both Node.js (tests) and browser
if (typeof module !== 'undefined') module.exports = WatchPartySync;
else window.WatchPartySync = WatchPartySync;
