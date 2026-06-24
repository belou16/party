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
const io     = new Server(server, {
  cors:       { origin: '*' },
  transports: ['polling', 'websocket'],
});

const PORT = process.env.PORT || 3000;
const SYNC_SCRIPT = fs.readFileSync(path.join(__dirname, 'public', 'js', 'doro-sync.js'), 'utf8');

// ── Room store ──────────────────────────────────────────────────────────────
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      isPlaying:     false,
      position:      0,         // seconds at the time of lastUpdatedAt
      lastUpdatedAt: Date.now(),
      hostId:        null,
      videoUrl:      '',
      users:         new Map(), // socketId → { id, username }
    });
  }
  return rooms.get(roomId);
}

// The server is the single source of truth. When the video is playing we must
// project the stored position forward by elapsed time so late-joiners never
// land seconds behind the current position.
function getProjectedPosition(room) {
  if (!room.isPlaying) return room.position;
  return room.position + (Date.now() - room.lastUpdatedAt) / 1000;
}

function getRoomUsers(room) {
  return Array.from(room.users.values());
}

// ── Static files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// ── Rumble embed resolver ────────────────────────────────────────────────────
// Rumble page IDs (v4wv296) differ from embed IDs (v4ue2sl); oEmbed bridges them.
app.get('/api/rumble-embed', (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: 'Missing url' });

  const oembedUrl =
    'https://rumble.com/api/Media/oembed.json?url=' + encodeURIComponent(rawUrl);

  const req2 = https.request(oembedUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DoroParty/1.0)',
      'Accept':     'application/json',
    },
    timeout: 8000,
  }, (r) => {
    let body = '';
    r.on('data', d => { body += d; });
    r.on('end', () => {
      try {
        const json = JSON.parse(body);
        const m = json.html && json.html.match(/\/embed\/(v[a-z0-9]+)/i);
        if (m) return res.json({ embedUrl: 'https://rumble.com/embed/' + m[1] + '/' });
        res.status(404).json({ error: 'Embed URL not found in oEmbed response' });
      } catch (_) {
        res.status(502).json({ error: 'Invalid oEmbed response' });
      }
    });
  });
  req2.on('error',   e  => res.status(502).json({ error: e.message }));
  req2.on('timeout', () => { req2.destroy(); res.status(504).json({ error: 'Timeout' }); });
  req2.end();
});

// ── Proxy endpoint ───────────────────────────────────────────────────────────
// Fetches a remote page server-side, strips X-Frame-Options / CSP,
// injects a <base> tag + our sync script so postMessage sync works.
app.get('/proxy', (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('Missing url parameter');

  let parsed;
  try { parsed = new URL(rawUrl); } catch (_) {
    return res.status(400).send('Invalid URL');
  }

  // Block SSRF attempts against local / private addresses
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost'      ||
    host.startsWith('127.')   ||
    host.startsWith('192.168.') ||
    host === '::1'
  ) {
    return res.status(403).send('Cannot proxy local addresses');
  }

  const transport = parsed.protocol === 'https:' ? https : http;

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
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Connection':      'close',
      'Referer':         parsed.origin + '/',
      'Origin':          parsed.origin,
    },
    timeout: 15000,
  };

  const proxyReq = transport.request(options, (proxyRes) => {
    if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
      const loc = proxyRes.headers['location'];
      if (loc) {
        const next = new URL(loc, rawUrl).toString();
        return sendOnce(() => res.redirect('/proxy?url=' + encodeURIComponent(next)));
      }
    }

    const contentType = proxyRes.headers['content-type'] || '';
    if (!contentType.includes('text/html')) {
      responded = true;
      const fwd = {};
      if (proxyRes.headers['content-type'])   fwd['content-type']   = proxyRes.headers['content-type'];
      if (proxyRes.headers['content-length']) fwd['content-length'] = proxyRes.headers['content-length'];
      if (proxyRes.headers['cache-control'])  fwd['cache-control']  = proxyRes.headers['cache-control'];
      res.set(fwd);
      return proxyRes.pipe(res);
    }

    let body = '';
    const enc = proxyRes.headers['content-encoding'];
    let stream = proxyRes;
    if (enc === 'gzip')    stream = proxyRes.pipe(zlib.createGunzip());
    else if (enc === 'br') stream = proxyRes.pipe(zlib.createBrotliDecompress());

    stream.setEncoding('utf8');
    stream.on('data', chunk => { body += chunk; });
    stream.on('error', err =>
      sendOnce(() => res.status(502).send('Decompress error: ' + err.message))
    );
    stream.on('end', () => {
      // Inject sync script BEFORE <base> so relative URLs don't break it
      const injection =
        '<script>\n' + SYNC_SCRIPT + '\n</script>\n' +
        '<base href="' + rawUrl + '" />';

      let modified = body;
      const headMatch = modified.match(/<head(\s[^>]*)?>/i);
      if (headMatch) {
        const idx = modified.indexOf(headMatch[0]) + headMatch[0].length;
        modified = modified.slice(0, idx) + '\n' + injection + '\n' + modified.slice(idx);
      } else {
        modified = injection + '\n' + modified;
      }

      // Rewrite video-embed iframes so they also go through the proxy
      modified = modified.replace(/<iframe([^>]*)>/gi, (match, attrs) => {
        if (!/allowfullscreen|allow\s*=\s*["'][^"']*(?:autoplay|fullscreen)/i.test(attrs)) {
          return match;
        }
        return match.replace(
          /(\bsrc\s*=\s*["'])(https?:\/\/[^"']+)(["'])/i,
          (m, prefix, iframeSrc, suffix) => {
            try {
              const resolved = new URL(iframeSrc, rawUrl).toString();
              return prefix + '/proxy?url=' + encodeURIComponent(resolved) + suffix;
            } catch (_) { return m; }
          }
        );
      });

      sendOnce(() => {
        res.removeHeader('Content-Security-Policy');
        res.removeHeader('X-Frame-Options');
        res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.send(modified);
      });
    });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    sendOnce(() => res.status(504).send('Proxy request timed out'));
  });
  proxyReq.on('error', err =>
    sendOnce(() => res.status(502).send('Proxy error: ' + err.message))
  );
  proxyReq.end();
});

// ── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let joinedRoom      = null;
  let currentUsername = null;

  socket.on('join', ({ roomId, username, videoUrl }) => {
    if (!roomId) return;
    joinedRoom      = roomId;
    currentUsername = (username || 'Viewer').slice(0, 32);

    socket.join(roomId);
    const room = getRoom(roomId);

    // First joiner becomes host
    if (!room.hostId) {
      room.hostId = socket.id;
      socket.emit('you_are_host');
    }

    if (videoUrl && !room.videoUrl) room.videoUrl = videoUrl;
    room.users.set(socket.id, { id: socket.id, username: currentUsername });

    // Send the joiner a projected current state (never raw stored position)
    socket.emit('sync', {
      isPlaying: room.isPlaying,
      position:  getProjectedPosition(room),
      sentAt:    Date.now(),
      isHost:    room.hostId === socket.id,
      videoUrl:  room.videoUrl,
      users:     getRoomUsers(room),
      hostId:    room.hostId,
    });

    // Tell everyone else a new viewer arrived
    const count = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
    socket.to(roomId).emit('viewer_joined', {
      count,
      user:  { id: socket.id, username: currentUsername },
      users: getRoomUsers(room),
    });
  });

  socket.on('play', ({ roomId, position }) => {
    const room = rooms.get(roomId); if (!room) return;
    Object.assign(room, { isPlaying: true, position, lastUpdatedAt: Date.now() });
    // Relay to others only — never echo back to sender
    socket.to(roomId).emit('play', { position, sentAt: Date.now() });
  });

  socket.on('pause', ({ roomId, position }) => {
    const room = rooms.get(roomId); if (!room) return;
    Object.assign(room, { isPlaying: false, position, lastUpdatedAt: Date.now() });
    socket.to(roomId).emit('pause', { position, sentAt: Date.now() });
  });

  socket.on('seek', ({ roomId, position, isPlaying }) => {
    const room = rooms.get(roomId); if (!room) return;
    Object.assign(room, {
      position,
      isPlaying:     isPlaying ?? room.isPlaying,
      lastUpdatedAt: Date.now(),
    });
    socket.to(roomId).emit('seek', { position, isPlaying: room.isPlaying, sentAt: Date.now() });
  });

  // Non-host clients poll every 5s for a projected tick to correct drift
  socket.on('request_sync', ({ roomId }) => {
    const room = rooms.get(roomId); if (!room) return;
    socket.emit('sync_tick', {
      isPlaying: room.isPlaying,
      position:  getProjectedPosition(room),
      sentAt:    Date.now(),
    });
  });

  // Chat is broadcast to ALL in the room (including sender)
  socket.on('chat', ({ roomId, name, msg }) => {
    if (!roomId || !msg?.trim()) return;
    io.to(roomId).emit('chat', { name: name || 'Anonymous', msg: msg.trim() });
  });

  // Host-only: change the video URL for everyone
  socket.on('set_video', ({ roomId, videoUrl }) => {
    const room = rooms.get(roomId); if (!room) return;
    if (room.hostId !== socket.id) return;
    Object.assign(room, { videoUrl, position: 0, isPlaying: false, lastUpdatedAt: Date.now() });
    io.to(roomId).emit('video_changed', { videoUrl });
  });

  socket.on('disconnect', () => {
    if (!joinedRoom) return;
    const room = rooms.get(joinedRoom); if (!room) return;

    room.users.delete(socket.id);

    if (room.hostId !== socket.id) {
      // Non-host left: just notify the room
      if (room.users.size === 0) {
        rooms.delete(joinedRoom);
      } else {
        io.to(joinedRoom).emit('user_left', {
          id:       socket.id,
          username: currentUsername,
          users:    getRoomUsers(room),
          hostId:   room.hostId,
        });
      }
      return;
    }

    // Host left: promote next viewer, or clean up the room
    const members = io.sockets.adapter.rooms.get(joinedRoom);
    if (members?.size > 0) {
      const newHostId = [...members][0];
      room.hostId     = newHostId;
      io.to(newHostId).emit('you_are_host');
      io.to(joinedRoom).emit('host_changed', {
        hostId: newHostId,
        users:  getRoomUsers(room),
      });
    } else {
      rooms.delete(joinedRoom);
    }
  });
});

server.listen(PORT, () => console.log(`✅  Server on http://localhost:${PORT}`));
