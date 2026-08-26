const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public')); // Frontend dosyalarının olduğu klasör

let beklemeOdalari = { 2: [], 5: [] };

io.on('connection', (socket) => {
    console.log('Bir oyuncu bağlandı:', socket.id);

    socket.on('find_match', (data) => {
        const mode = Number(data.mode) || 2;
        
        // Zaten listedeyse tekrar ekleme
        beklemeOdalari[mode] = beklemeOdalari[mode].filter(o => o.id !== socket.id);
        
        // Oyuncuyu bekleme listesine ekle
        beklemeOdalari[mode].push({ id: socket.id, isim: data.isim || "Oyuncu" });

        // Yeterli oyuncu sayısına ulaşıldıysa maçı kur
        if (beklemeOdalari[mode].length >= mode) {
            const roomId = "oda_" + Date.now();
            const oyuncular = beklemeOdalari[mode].splice(0, mode);

            // Odadaki her oyuncuya maçın başladığını bildir
            oyuncular.forEach((o, index) => {
                const playerSocket = io.sockets.sockets.get(o.id);
                if (playerSocket) {
                    playerSocket.join(roomId);
                }

                io.to(o.id).emit('match_found', { 
                    roomId: roomId, 
                    oyuncuIndex: index,
                    oyuncular: oyuncular 
                });
            });
        }
    });

    // İptal etme isteği
    socket.on('cancel_match', () => {
        for (let mode in beklemeOdalari) {
            beklemeOdalari[mode] = beklemeOdalari[mode].filter(o => o.id !== socket.id);
        }
    });

    // Çember atıldığında diğer oyunculara ilet
    socket.on('player_action', (data) => {
        socket.to(data.roomId).emit('update_game', data);
    });

    // Oyuncu ayrılırsa listeden çıkar
    socket.on('disconnect', () => {
        for (let mode in beklemeOdalari) {
            beklemeOdalari[mode] = beklemeOdalari[mode].filter(o => o.id !== socket.id);
        }
    });
});

// CANLI SUNUCU PORT AYARI
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda başarıyla çalışıyor...`);
});
