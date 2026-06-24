const express    = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path       = require('path');

const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      isPlaying:     false,
      position:      0,
      lastUpdatedAt: Date.now(),
      hostId:        null,
    });
  }
  return rooms.get(roomId);
}

// Projects the stored position forward by elapsed time so late-joiners
// never land behind where the video actually is.
function getProjectedPosition(room) {
  if (!room.isPlaying) return room.position;
  return room.position + (Date.now() - room.lastUpdatedAt) / 1000;
}

io.on('connection', (socket) => {
  let joinedRoom = null;

  socket.on('join', ({ roomId }) => {
    if (!roomId) return;
    if (joinedRoom) socket.leave(joinedRoom);
    joinedRoom = roomId;
    socket.join(roomId);

    const room = getRoom(roomId);
    if (!room.hostId) {
      room.hostId = socket.id;
      socket.emit('you_are_host');
    }

    socket.emit('sync', {
      isPlaying: room.isPlaying,
      position:  getProjectedPosition(room),
      sentAt:    Date.now(),
      isHost:    room.hostId === socket.id,
    });

    const count = io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
    io.to(roomId).emit('viewer_count', { count });
  });

  // Any client can play/pause/seek — no host-only guard
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

  // Non-host clients poll every 5s; server replies with a projected tick
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

  // Chat is broadcast to everyone in the room (including the sender)
  socket.on('chat', ({ roomId, name, msg }) => {
    if (!roomId || !msg?.trim()) return;
    io.to(roomId).emit('chat', {
      name: String(name || 'Anonymous').slice(0, 30),
      msg:  String(msg).slice(0, 300),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  });

  socket.on('disconnect', () => {
    if (!joinedRoom) return;
    const room = rooms.get(joinedRoom);
    if (!room) return;

    const members = io.sockets.adapter.rooms.get(joinedRoom);
    const count   = members?.size ?? 0;
    io.to(joinedRoom).emit('viewer_count', { count });

    if (room.hostId === socket.id) {
      if (count > 0) {
        const newHostId = [...members][0];
        room.hostId     = newHostId;
        io.to(newHostId).emit('you_are_host');
        io.to(joinedRoom).emit('system_msg', { msg: '👑 Host parti — nouveau host assigné.' });
      } else {
        rooms.delete(joinedRoom);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () =>
  console.log(`\n✅  Watch Party  →  http://localhost:${PORT}\n`)
);
