const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); // Oyun dosyalarınız burada duracak

let waitingPlayers2 = []; // 2 kişilik eşleştirme kuyruğu
let waitingPlayers4 = []; // 4 kişilik eşleştirme kuyruğu

io.on('connection', (socket) => {
    console.log('Bir oyuncu bağlandı:', socket.id);

    // 2 Kişilik Eşleştirme
    socket.on('find_match_2', (playerData) => {
        waitingPlayers2.push({ id: socket.id, data: playerData });
        if (waitingPlayers2.length >= 2) {
            let p1 = waitingPlayers2.shift();
            let p2 = waitingPlayers2.shift();
            let roomId = 'room_2_' + Date.now();

            p1.socket.join(roomId);
            p2.socket.join(roomId);

            io.to(roomId).emit('match_found', { roomId, players: [p1, p2] });
        }
    });

    // 4 Kişilik Eşleştirme
    socket.on('find_match_4', (playerData) => {
        waitingPlayers4.push({ id: socket.id, data: playerData });
        if (waitingPlayers4.length >= 4) {
            let roomPlayers = waitingPlayers4.splice(0, 4);
            let roomId = 'room_4_' + Date.now();

            roomPlayers.forEach(p => p.socket.join(roomId));
            io.to(roomId).emit('match_found', { roomId, players: roomPlayers });
        }
    });

    // Hamleleri Senkronize Etme (Çember Atma vb.)
    socket.on('player_action', (data) => {
        socket.to(data.roomId).emit('update_game', data);
    });

    socket.on('disconnect', () => {
        console.log('Oyuncu ayrıldı:', socket.id);
        waitingPlayers2 = waitingPlayers2.filter(p => p.id !== socket.id);
        waitingPlayers4 = waitingPlayers4.filter(p => p.id !== socket.id);
    });
});

server.listen(3000, () => {
    console.log('Sunucu 3000 portunda çalışıyor...');
});
      
