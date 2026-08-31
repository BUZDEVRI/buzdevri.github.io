const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Bekleme havuzları (2'li, 3'lü vb. modlar için)
let waitingPlayers = {}; 

io.on('connection', (socket) => {
    console.log('Yeni oyuncu bağlandı:', socket.id);

    // Eşleşme Arama
    socket.on('find_match', (data) => {
        const mode = data.mode || 2; // Kaç kişilik mod olduğu
        const playerName = data.isim || "Oyuncu";

        // Oyuncu verisini hazırla
        const player = {
            socketId: socket.id,
            isim: playerName
        };

        if (!waitingPlayers[mode]) {
            waitingPlayers[mode] = [];
        }

        // Oyucunun daha önce listede olmadığından emin ol
        waitingPlayers[mode] = waitingPlayers[mode].filter(p => p.socketId !== socket.id);
        waitingPlayers[mode].push(player);

        console.log(`[Mod ${mode}] Kuyruktaki oyuncu sayısı: ${waitingPlayers[mode].length}`);

        // Odadaki oyuncu sayısı mod kapasitesine ulaştı mı?
        if (waitingPlayers[mode].length >= mode) {
            const roomPlayers = waitingPlayers[mode].splice(0, mode);
            const roomId = "room_" + Date.now();

            // Tüm giren oyuncuları aynı odaya al ve bilgilendir
            roomPlayers.forEach((p, index) => {
                const clientSocket = io.sockets.sockets.get(p.socketId);
                if (clientSocket) {
                    clientSocket.join(roomId);
                    clientSocket.emit('match_found', {
                        roomId: roomId,
                        oyuncuIndex: index,
                        oyuncular: roomPlayers
                    });
                }
            });

            console.log(`🎉 Eşleşme Tamamlandı! Oda ID: ${roomId}`);
        }
    });

    // Oyuncu Çember Atma veya Şişe Güncelleme Hamlesi Yaparsa
    socket.on('player_action', (data) => {
        if (data.roomId) {
            // Hamleyi odadaki diğer oyunculara ilet
            socket.to(data.roomId).emit('update_game', data);
        }
    });

    // Eşleşmeyi İptal Etme
    socket.on('cancel_match', () => {
        for (let mode in waitingPlayers) {
            waitingPlayers[mode] = waitingPlayers[mode].filter(p => p.socketId !== socket.id);
        }
        console.log('Eşleşme iptal edildi:', socket.id);
    });

    // Bağlantı Kopması
    socket.on('disconnect', () => {
        for (let mode in waitingPlayers) {
            waitingPlayers[mode] = waitingPlayers[mode].filter(p => p.socketId !== socket.id);
        }
        console.log('Oyuncu ayrıldı:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif!`);
});
             
