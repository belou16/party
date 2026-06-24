const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// ─── In-memory room store ───────────────────────────────────────────────────
// rooms: Map<roomId, { videoUrl, currentTime, isPlaying, hostId, users: Map<socketId, { username, id }> }>
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      videoUrl: '',
      currentTime: 0,
      isPlaying: false,
      hostId: null,
      users: new Map()
    });
  }
  return rooms.get(roomId);
}

function getRoomUsers(room) {
  return Array.from(room.users.values());
}

// ─── Static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// Room page — serve room.html for any /room/:roomId path
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// ─── Socket.io ──────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentUsername = null;

  // ── join-room ──────────────────────────────────────────────────────────
  socket.on('join-room', ({ roomId, username, videoUrl }) => {
    if (!roomId || !username) return;

    currentRoomId = roomId;
    currentUsername = username;

    socket.join(roomId);

    const room = getOrCreateRoom(roomId);

    // First user becomes host; if a videoUrl is provided and room has none, set it
    if (!room.hostId) {
      room.hostId = socket.id;
    }
    if (videoUrl && !room.videoUrl) {
      room.videoUrl = videoUrl;
    }

    room.users.set(socket.id, { id: socket.id, username });

    // Send current state to the joining user
    socket.emit('room-state', {
      videoUrl: room.videoUrl,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      hostId: room.hostId,
      users: getRoomUsers(room)
    });

    // Notify others
    socket.to(roomId).emit('user-joined', {
      id: socket.id,
      username,
      users: getRoomUsers(room)
    });
  });

  // ── play ──────────────────────────────────────────────────────────────
  socket.on('play', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.isPlaying = true;
    room.currentTime = currentTime;
    socket.to(roomId).emit('sync-play', { currentTime });
  });

  // ── pause ─────────────────────────────────────────────────────────────
  socket.on('pause', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.isPlaying = false;
    room.currentTime = currentTime;
    socket.to(roomId).emit('sync-pause', { currentTime });
  });

  // ── seek ──────────────────────────────────────────────────────────────
  socket.on('seek', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.currentTime = currentTime;
    socket.to(roomId).emit('sync-seek', { currentTime });
  });

  // ── chat-message ──────────────────────────────────────────────────────
  socket.on('chat-message', ({ roomId, username, message }) => {
    if (!roomId || !username || !message) return;
    const trimmed = message.trim();
    if (!trimmed) return;
    io.to(roomId).emit('chat-message', {
      username,
      message: trimmed,
      timestamp: Date.now()
    });
  });

  // ── set-video ─────────────────────────────────────────────────────────
  socket.on('set-video', ({ roomId, videoUrl }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    // Only the host may change the video
    if (room.hostId !== socket.id) return;
    room.videoUrl = videoUrl;
    room.currentTime = 0;
    room.isPlaying = false;
    io.to(roomId).emit('video-changed', { videoUrl });
  });

  // ── disconnect ────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.users.delete(socket.id);

    // Assign new host if the host left
    if (room.hostId === socket.id) {
      const remaining = Array.from(room.users.keys());
      room.hostId = remaining.length > 0 ? remaining[0] : null;
    }

    // Clean up empty rooms
    if (room.users.size === 0) {
      rooms.delete(currentRoomId);
    } else {
      io.to(currentRoomId).emit('user-left', {
        id: socket.id,
        username: currentUsername,
        hostId: room.hostId,
        users: getRoomUsers(room)
      });
    }
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
