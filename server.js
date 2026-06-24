const express = require('express');
const http    = require('http');
const https   = require('https');
const zlib    = require('zlib');
const { Server } = require('socket.io');
const path    = require('path');
const { URL } = require('url');
const fs      = require('fs');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// Load the sync script once so we can inline it into proxied pages
const SYNC_SCRIPT = fs.readFileSync(path.join(__dirname, 'public', 'js', 'doro-sync.js'), 'utf8');

// --- In-memory room store ---
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      videoUrl: '', currentTime: 0, isPlaying: false, hostId: null,
      users: new Map()
    });
  }
  return rooms.get(roomId);
}

function getRoomUsers(room) { return Array.from(room.users.values()); }

// --- Static files ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Room page ---
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// --- Proxy endpoint ---
// Fetches a remote page server-side, strips X-Frame-Options / CSP,
// injects a <base> tag (so relative URLs still resolve) and our sync
// script (inlined so there are no origin issues with the base tag).
app.get('/proxy', (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('Missing url parameter');

  let parsed;
  try { parsed = new URL(rawUrl); } catch (_) {
    return res.status(400).send('Invalid URL');
  }

  const transport = parsed.protocol === 'https:' ? https : http;

  const options = {
    hostname: parsed.hostname,
    port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path:     parsed.pathname + parsed.search,
    method:   'GET',
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'identity',   // avoid gzip so we can edit the body easily
    },
    timeout: 15000,
  };

  const proxyReq = transport.request(options, (proxyRes) => {
    // Follow redirects
    if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
      const loc = proxyRes.headers['location'];
      if (loc) {
        const next = new URL(loc, rawUrl).toString();
        return res.redirect(`/proxy?url=${encodeURIComponent(next)}`);
      }
    }

    const contentType = proxyRes.headers['content-type'] || '';

    // Non-HTML content (video files, images, etc.) — pipe straight through
    if (!contentType.includes('text/html')) {
      const passHeaders = {};
      if (proxyRes.headers['content-type'])   passHeaders['content-type']   = proxyRes.headers['content-type'];
      if (proxyRes.headers['content-length']) passHeaders['content-length'] = proxyRes.headers['content-length'];
      res.set(passHeaders);
      proxyRes.pipe(res);
      return;
    }

    // HTML — collect, strip security headers, inject sync code
    let body = '';
    const encoding = proxyRes.headers['content-encoding'];
    let stream = proxyRes;
    if (encoding === 'gzip')    stream = proxyRes.pipe(zlib.createGunzip());
    else if (encoding === 'br') stream = proxyRes.pipe(zlib.createBrotliDecompress());

    stream.setEncoding('utf8');
    stream.on('data', chunk => { body += chunk; });
    stream.on('error', err => { res.status(502).send('Proxy decompress error: ' + err.message); });
    stream.on('end', () => {
      // Build the injected block: base tag + inline sync script
      const injection = `<base href="${rawUrl}" />\n<script>\n${SYNC_SCRIPT}\n</script>`;

      // Insert right after the opening <head> tag (any variant)
      let modified = body;
      const headMatch = modified.match(/<head(\s[^>]*)?>/i);
      if (headMatch) {
        const idx = modified.indexOf(headMatch[0]) + headMatch[0].length;
        modified = modified.slice(0, idx) + '\n' + injection + '\n' + modified.slice(idx);
      } else {
        // No <head> — prepend
        modified = injection + '\n' + modified;
      }

      res.set({
        'Content-Type':   'text/html; charset=utf-8',
        'Cache-Control':  'no-store',
        // Explicitly clear headers that would block the iframe
        'X-Frame-Options': '',
      });
      // Remove CSP via removeHeader (cannot be set to empty string via res.set)
      res.removeHeader('Content-Security-Policy');
      res.removeHeader('X-Frame-Options');
      res.send(modified);
    });
  });

  proxyReq.on('error', err => { res.status(502).send('Proxy request failed: ' + err.message); });
  proxyReq.on('timeout', () => { proxyReq.destroy(); res.status(504).send('Proxy request timed out'); });
  proxyReq.end();
});

// --- Socket.io ---
io.on('connection', (socket) => {
  let currentRoomId  = null;
  let currentUsername = null;

  socket.on('join-room', ({ roomId, username, videoUrl }) => {
    if (!roomId || !username) return;
    currentRoomId   = roomId;
    currentUsername = username;
    socket.join(roomId);
    const room = getOrCreateRoom(roomId);
    if (!room.hostId) room.hostId = socket.id;
    if (videoUrl && !room.videoUrl) room.videoUrl = videoUrl;
    room.users.set(socket.id, { id: socket.id, username });
    socket.emit('room-state', {
      videoUrl: room.videoUrl, currentTime: room.currentTime,
      isPlaying: room.isPlaying, hostId: room.hostId, users: getRoomUsers(room)
    });
    socket.to(roomId).emit('user-joined', { id: socket.id, username, users: getRoomUsers(room) });
  });

  socket.on('play', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId); if (!room) return;
    room.isPlaying = true; room.currentTime = currentTime;
    socket.to(roomId).emit('sync-play', { currentTime });
  });

  socket.on('pause', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId); if (!room) return;
    room.isPlaying = false; room.currentTime = currentTime;
    socket.to(roomId).emit('sync-pause', { currentTime });
  });

  socket.on('seek', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId); if (!room) return;
    room.currentTime = currentTime;
    socket.to(roomId).emit('sync-seek', { currentTime });
  });

  socket.on('chat-message', ({ roomId, username, message }) => {
    if (!roomId || !username || !message) return;
    const trimmed = message.trim(); if (!trimmed) return;
    io.to(roomId).emit('chat-message', { username, message: trimmed, timestamp: Date.now() });
  });

  socket.on('set-video', ({ roomId, videoUrl }) => {
    const room = rooms.get(roomId); if (!room) return;
    if (room.hostId !== socket.id) return;
    room.videoUrl = videoUrl; room.currentTime = 0; room.isPlaying = false;
    io.to(roomId).emit('video-changed', { videoUrl });
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId); if (!room) return;
    room.users.delete(socket.id);
    if (room.hostId === socket.id) {
      const remaining = Array.from(room.users.keys());
      room.hostId = remaining.length > 0 ? remaining[0] : null;
    }
    if (room.users.size === 0) {
      rooms.delete(currentRoomId);
    } else {
      io.to(currentRoomId).emit('user-left', {
        id: socket.id, username: currentUsername,
        hostId: room.hostId, users: getRoomUsers(room)
      });
    }
  });
});

server.listen(PORT, () => { console.log(`Server running on http://localhost:${PORT}`); });
