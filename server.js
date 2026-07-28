const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// Rooms: code -> { hostId, users: Map, video: { src, time, paused } }
const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let userName = '';
  let isHost = false;

  // Crear sala
  socket.on('create-room', ({ name }, cb) => {
    let code;
    do { code = generateCode(); } while (rooms.has(code));

    rooms.set(code, {
      hostId: socket.id,
      users: new Map([[socket.id, { name, isHost: true }]]),
      video: { src: '', time: 0, paused: true }
    });

    currentRoom = code;
    userName = name;
    isHost = true;
    socket.join(code);

    cb({ ok: true, code });
    socket.to(code).emit('system', `${name} creó la sala`);
  });

  // Unirse a sala
  socket.on('join-room', ({ code, name }, cb) => {
    code = code.toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: 'Sala no encontrada' });
    if (room.users.size >= 2) return cb({ ok: false, error: 'La sala está llena (máx 2)' });

    room.users.set(socket.id, { name, isHost: false });
    currentRoom = code;
    userName = name;
    isHost = false;
    socket.join(code);

    // Avisar al anfitrión
    io.to(room.hostId).emit('guest-joined', { name });

    // Enviar estado actual del video al invitado
    socket.emit('video-state', room.video);

    cb({ ok: true, code, isHost: false });
    io.to(code).emit('system', `${name} entró a la sala`);
    io.to(code).emit('users-update', Array.from(room.users.values()));
  });

  // Chat
  socket.on('chat', (text) => {
    if (!currentRoom || !text?.trim()) return;
    io.to(currentRoom).emit('chat', {
      name: userName,
      text: text.trim(),
      isMine: false, // el cliente lo marca
      time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Solo anfitrión controla el video
  socket.on('video-action', (data) => {
    if (!currentRoom || !isHost) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    if (data.type === 'source') {
      room.video = { src: data.src, time: 0, paused: true };
    } else if (data.type === 'play') {
      room.video.paused = false;
      room.video.time = data.time ?? room.video.time;
    } else if (data.type === 'pause') {
      room.video.paused = true;
      room.video.time = data.time ?? room.video.time;
    } else if (data.type === 'seek') {
      room.video.time = data.time;
    }

    // Reenviar a todos (incluido el anfitrión para confirmar)
    io.to(currentRoom).emit('video-state', room.video);
  });

  // Señalización WebRTC (solo voz)
  socket.on('webrtc-signal', (data) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('webrtc-signal', data);
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    room.users.delete(socket.id);
    io.to(currentRoom).emit('system', `${userName} salió de la sala`);

    if (room.users.size === 0) {
      rooms.delete(currentRoom);
    } else if (isHost) {
      // Si se va el anfitrión, la sala se cierra
      io.to(currentRoom).emit('host-left');
      rooms.delete(currentRoom);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Cine Juntos corriendo en puerto ${PORT}`));
