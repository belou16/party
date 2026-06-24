/* ═══════════════════════════════════════════════════════════════════════════
   Doro Party — Landing page logic (main.js)
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const form          = document.getElementById('create-form');
  const urlInput      = document.getElementById('url-input');
  const usernameInput = document.getElementById('username-input');
  const errorBox      = document.getElementById('form-error');

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }
  function clearError() {
    errorBox.textContent = '';
    errorBox.hidden = true;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();

    const videoUrl = urlInput.value.trim();
    const username = usernameInput.value.trim();

    if (!username) {
      showError('Please enter your name.');
      usernameInput.focus();
      return;
    }
    if (!videoUrl) {
      showError('Please paste a video URL.');
      urlInput.focus();
      return;
    }

    // Basic URL sanity check
    try {
      new URL(videoUrl);
    } catch (_) {
      showError('That doesn\'t look like a valid URL. Make sure it starts with http:// or https://');
      urlInput.focus();
      return;
    }

    // Generate a room ID in the browser — no server round-trip needed
    const roomId = crypto.randomUUID();

    const target = `/room/${roomId}?url=${encodeURIComponent(videoUrl)}&username=${encodeURIComponent(username)}`;
    window.location.href = target;
  });
})();
