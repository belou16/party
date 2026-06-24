const express    = require('express');
const https      = require('https');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path       = require('path');

const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// Résout l'embed ID Rumble via l'API oEmbed (page ID != embed ID)
app.get('/api/rumble-embed', (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: 'Missing url' });
  const oembedUrl = 'https://rumble.com/api/Media/oembed.json?url=' + encodeURIComponent(rawUrl);
  const req2 = https.request(oembedUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WatchParty/1.0)', 'Accept': 'application/json' },
    timeout: 8000,
  }, (r) => {
    let body = '';
    r.on('data', d => { body += d; });
    r.on('end', () => {
      try {
        const json = JSON.parse(body);
        const m = json.html && json.html.match(/\/embed\/(v[a-z0-9]+)/i);
        if (m) return res.json({ embedId: m[1], embedUrl: 'https://rumble.com/embed/' + m[1] + '/' });
        res.status(404).json({ error: 'Embed ID not found' });
      } catch (_) { res.status(502).json({ error: 'Invalid oEmbed response' }); }
    });
  });
  req2.on('error', e => res.status(502).json({ error: e.message }));
  req2.on('timeout', () => { req2.destroy(); res.status(504).json({ error: 'Timeout' }); });
  req2.end();
});

const rooms = new Map();
// nom par socket (pour les logs)
const socketNames = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      isPlaying: false, position: 0, lastUpdatedAt: Date.now(),
      hostId: null, mode: 'direct', videoId: null, embedUrl: null,
    });
  }
  return rooms.get(roomId);
}

function getProjectedPosition(room) {
  if (!room.isPlaying) return room.position;
  return room.position + (Date.now() - room.lastUpdatedAt) / 1000;
}

io.on('connection', (socket) => {
  let joinedRoom = null;

  socket.on('join', ({ roomId, name }) => {
    if (!roomId) return;
    if (joinedRoom) socket.leave(joinedRoom);
    joinedRoom = roomId;
    socket.join(roomId);

    const displayName = String(name || 'Viewer').slice(0, 30);
    socketNames.set(socket.id, displayName);

    const room = getRoom(roomId);
    const isNewHost = !room.hostId;
    if (isNewHost) {
      room.hostId = socket.id;
      socket.emit('you_are_host');
    }

    // Log "X a rejoint" pour tous ceux déjà dans la room
    socket.to(roomId).emit('system_msg', { msg: displayName + ' a rejoint la room 👋' });

    socket.emit('sync', {
      isPlaying: room.isPlaying,
      position:  getProjectedPosition(room),
      sentAt:    Date.now(),
      isHost:    room.hostId === socket.id,
      mode:      room.mode,
      videoId:   room.videoId,
      embedUrl:  room.embedUrl,
    });

    const count = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
    io.to(roomId).emit('viewer_count', { count });
  });

  socket.on('play', ({ roomId, position }) => {
    if (!roomId) return;
    const room = getRoom(roomId);
    Object.assign(room, { isPlaying: true, position, lastUpdatedAt: Date.now() });
    socket.to(roomId).emit('play', { position, sentAt: Date.now() });
  });

  socket.on('pause', ({ roomId, position }) => {
    if (!roomId) return;
    const room = getRoom(roomId);
    Object.assign(room, { isPlaying: false, position, lastUpdatedAt: Date.now() });
    socket.to(roomId).emit('pause', { position, sentAt: Date.now() });
  });

  socket.on('seek', ({ roomId, position, isPlaying }) => {
    if (!roomId) return;
    const room = getRoom(roomId);
    Object.assign(room, { position, isPlaying, lastUpdatedAt: Date.now() });
    socket.to(roomId).emit('seek', { position, isPlaying, sentAt: Date.now() });
  });

  socket.on('request_sync', ({ roomId }) => {
    if (!roomId) return;
    const room = getRoom(roomId);
    if (!room) return;
    socket.emit('sync_tick', {
      isPlaying: room.isPlaying,
      position:  getProjectedPosition(room),
      sentAt:    Date.now(),
    });
  });

  socket.on('chat', ({ roomId, name, msg }) => {
    if (!roomId || !msg?.trim()) return;
    io.to(roomId).emit('chat', {
      name: String(name || 'Anonymous').slice(0, 30),
      msg:  String(msg).slice(0, 300),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  });

  socket.on('set_video', ({ roomId, url, mode, videoId, embedUrl }) => {
    if (!roomId) return;
    const room = getRoom(roomId);
    Object.assign(room, {
      mode: mode || 'direct', videoId: videoId || null, embedUrl: embedUrl || null,
      position: 0, isPlaying: false, lastUpdatedAt: Date.now(),
    });
    io.to(roomId).emit('video_set', { url, mode, videoId, embedUrl });
  });

  socket.on('disconnect', () => {
    if (!joinedRoom) return;
    const room = rooms.get(joinedRoom);
    if (!room) return;

    const displayName = socketNames.get(socket.id) || 'Viewer';
    socketNames.delete(socket.id);

    const members = io.sockets.adapter.rooms.get(joinedRoom);
    const count   = members?.size ?? 0;
    io.to(joinedRoom).emit('viewer_count', { count });

    if (count > 0) {
      io.to(joinedRoom).emit('system_msg', { msg: displayName + ' a quitté la room 👋' });
    }

    if (room.hostId === socket.id) {
      if (count > 0) {
        const newHostId = [...members][0];
        room.hostId     = newHostId;
        io.to(newHostId).emit('you_are_host');
        io.to(joinedRoom).emit('system_msg', { msg: '👑 ' + (socketNames.get(newHostId) || 'Quelqu\'un') + ' est maintenant le host.' });
      } else {
        rooms.delete(joinedRoom);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () =>
  console.log('\n✅  Watch Party  →  http://localhost:' + PORT + '\n')
);
