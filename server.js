const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingPlayers2 = [];
let waitingPlayers4 = [];

io.on('connection', (socket) => {
    console.log('Bir oyuncu bağlandı:', socket.id);

    // ==========================================
    // 2 KİŞİLİK EŞLEŞTİRME
    // ==========================================
    socket.on('find_match_2', (playerData) => {
        console.log('2 kişilik eşleştirme isteği:', socket.id);

        waitingPlayers2.push({
            socket: socket,
            id: socket.id,
            data: playerData
        });

        console.log('2 kişilik bekleyen oyuncu:', waitingPlayers2.length);

        if (waitingPlayers2.length >= 2) {
            const p1 = waitingPlayers2.shift();
            const p2 = waitingPlayers2.shift();

            const roomId = 'room_2_' + Date.now();

            p1.socket.join(roomId);
            p2.socket.join(roomId);

            console.log('2 kişilik oda oluşturuldu:', roomId);

            io.to(roomId).emit('match_found', {
                roomId: roomId,
                players: [p1.data, p2.data]
            });
        }
    });

    // ==========================================
    // 4 KİŞİLİK EŞLEŞTİRME
    // ==========================================
    socket.on('find_match_4', (playerData) => {
        console.log('4 kişilik eşleştirme isteği:', socket.id);

        waitingPlayers4.push({
            socket: socket,
            id: socket.id,
            data: playerData
        });

        console.log('4 kişilik bekleyen oyuncu:', waitingPlayers4.length);

        if (waitingPlayers4.length >= 4) {
            const roomPlayers = waitingPlayers4.splice(0, 4);
            const roomId = 'room_4_' + Date.now();

            roomPlayers.forEach((player) => {
                player.socket.join(roomId);
            });

            console.log('4 kişilik oda oluşturuldu:', roomId);

            io.to(roomId).emit('match_found', {
                roomId: roomId,
                players: roomPlayers.map(player => player.data)
            });
        }
    });

    // ==========================================
    // OYUNCU HAMLELERİ / ETKİNLİKLER
    // ==========================================
    socket.on('player_action', (data) => {
        if (!data || !data.roomId) {
            console.log('Geçersiz player_action:', data);
            return;
        }

        socket.to(data.roomId).emit('update_game', data);
    });

    // ==========================================
    // EŞLEŞTİRME İPTAL
    // ==========================================
    socket.on('cancel_match', () => {
        waitingPlayers2 = waitingPlayers2.filter(
            player => player.id !== socket.id
        );

        waitingPlayers4 = waitingPlayers4.filter(
            player => player.id !== socket.id
        );

        console.log('Eşleştirme iptal edildi:', socket.id);
    });

    // ==========================================
    // OYUNCU BAĞLANTISI KESİLİRSE
    // ==========================================
    socket.on('disconnect', () => {
        console.log('Oyuncu ayrıldı:', socket.id);

        waitingPlayers2 = waitingPlayers2.filter(
            player => player.id !== socket.id
        );

        waitingPlayers4 = waitingPlayers4.filter(
            player => player.id !== socket.id
        );
    });
});

// ==========================================
// SUNUCUYU BAŞLAT
// ==========================================
server.listen(3000, () => {
    console.log('Sunucu 3000 portunda çalışıyor...');
});
