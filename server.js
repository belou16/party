const express  = require('express');
const http     = require('http');
const https    = require('https');
const zlib     = require('zlib');
const { Server } = require('socket.io');
const path     = require('path');
const { URL }  = require('url');
const fs       = require('fs');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' },
  transports: ['polling', 'websocket'],
});

const PORT = process.env.PORT || 3000;

const SYNC_SCRIPT = fs.readFileSync(
  path.join(__dirname, 'public', 'js', 'doro-sync.js'), 'utf8'
);

// ── Rooms ─────────────────────────────────────────────────────────────────
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      videoUrl: '', currentTime: 0, isPlaying: false,
      hostId: null, users: new Map(),
    });
  }
  return rooms.get(roomId);
}
function getRoomUsers(room) { return Array.from(room.users.values()); }

// ── Static files ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('/room/:roomId', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'room.html'))
);

// ── Proxy endpoint ────────────────────────────────────────────────────────
// Fetches any URL server-side, strips X-Frame-Options / CSP, injects our
// sync bridge inline so the iframe can control the page video via postMessage.
app.get('/proxy', (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('Missing url parameter');

  let parsed;
  try { parsed = new URL(rawUrl); }
  catch (_) { return res.status(400).send('Invalid URL'); }

  // Block loopback / private addresses
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost'     ||
    host.startsWith('127.') ||
    host.startsWith('192.168.') ||
    host === '::1'
  ) {
    return res.status(403).send('Cannot proxy local addresses');
  }

  const transport = parsed.protocol === 'https:' ? https : http;

  // Guard: prevent ERR_HTTP_HEADERS_SENT when timeout + error both fire
  let responded = false;
  function sendOnce(fn) {
    if (responded || res.headersSent) return;
    responded = true;
    fn();
  }

  const options = {
    hostname: parsed.hostname,
    port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path:     parsed.pathname + parsed.search,
    method:   'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'identity',
      'Connection':      'close',
    },
    timeout: 12000,
  };

  const proxyReq = transport.request(options, (proxyRes) => {
    // Redirect handling
    if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
      const loc = proxyRes.headers['location'];
      if (loc) {
        const next = new URL(loc, rawUrl).toString();
        return sendOnce(() =>
          res.redirect('/proxy?url=' + encodeURIComponent(next))
        );
      }
    }

    const contentType = proxyRes.headers['content-type'] || '';

    // Non-HTML: pipe straight through
    if (!contentType.includes('text/html')) {
      responded = true;
      const fwd = {};
      if (proxyRes.headers['content-type'])   fwd['content-type']   = proxyRes.headers['content-type'];
      if (proxyRes.headers['content-length']) fwd['content-length'] = proxyRes.headers['content-length'];
      if (proxyRes.headers['cache-control'])  fwd['cache-control']  = proxyRes.headers['cache-control'];
      res.set(fwd);
      return proxyRes.pipe(res);
    }

    // HTML: collect, inject sync bridge, strip security headers
    let body = '';
    let stream = proxyRes;
    const enc = proxyRes.headers['content-encoding'];
    if (enc === 'gzip')    stream = proxyRes.pipe(zlib.createGunzip());
    else if (enc === 'br') stream = proxyRes.pipe(zlib.createBrotliDecompress());

    stream.setEncoding('utf8');
    stream.on('data', chunk => { body += chunk; });
    stream.on('error', err =>
      sendOnce(() => res.status(502).send('Decompress error: ' + err.message))
    );
    stream.on('end', () => {
      // Inject sync script BEFORE <base> tag so it always loads from our origin
      const injection =
        '<script>\n' + SYNC_SCRIPT + '\n</script>\n' +
        '<base href="' + rawUrl + '" />';

      let modified = body;
      const headMatch = modified.match(/<head(\s[^>]*)?>/i);
      if (headMatch) {
        const idx = modified.indexOf(headMatch[0]) + headMatch[0].length;
        modified =
          modified.slice(0, idx) + '\n' + injection + '\n' +
          modified.slice(idx);
      } else {
        modified = injection + '\n' + modified;
      }

      sendOnce(() => {
        res.removeHeader('Content-Security-Policy');
        res.removeHeader('X-Frame-Options');
        res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.send(modified);
      });
    });
  });

  // destroy() also fires 'error' — sendOnce prevents the double-send crash
  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    sendOnce(() => res.status(504).send('Proxy request timed out'));
  });
  proxyReq.on('error', err =>
    sendOnce(() => res.status(502).send('Proxy error: ' + err.message))
  );

  proxyReq.end();
});

// ── Socket.io ─────────────────────────────────────────────────────────────
io.on('connection', socket => {
  let currentRoomId   = null;
  let currentUsername = null;

  socket.on('join-room', ({ roomId, username, videoUrl }) => {
    if (!roomId || !username) return;
    currentRoomId   = roomId;
    currentUsername = username;
    socket.join(roomId);

    const room = getOrCreateRoom(roomId);
    if (!room.hostId)             room.hostId  = socket.id;
    if (videoUrl && !room.videoUrl) room.videoUrl = videoUrl;
    room.users.set(socket.id, { id: socket.id, username });

    socket.emit('room-state', {
      videoUrl:    room.videoUrl,
      currentTime: room.currentTime,
      isPlaying:   room.isPlaying,
      hostId:      room.hostId,
      users:       getRoomUsers(room),
    });
    socket.to(roomId).emit('user-joined', {
      id: socket.id, username, users: getRoomUsers(room),
    });
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
    io.to(roomId).emit('chat-message', {
      username, message: trimmed, timestamp: Date.now(),
    });
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
      const next = Array.from(room.users.keys());
      room.hostId = next.length ? next[0] : null;
    }
    if (room.users.size === 0) {
      rooms.delete(currentRoomId);
    } else {
      io.to(currentRoomId).emit('user-left', {
        id: socket.id, username: currentUsername,
        hostId: room.hostId, users: getRoomUsers(room),
      });
    }
  });
});

// ── Start ─────────────────────────────────────────────────────────────────
server.listen(PORT, () =>
  console.log('Server running on http://localhost:' + PORT)
);
