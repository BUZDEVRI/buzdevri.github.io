const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));
// 2 ve 5 Kişilik Bekleme Odaları
let beklemeOdalari = { 2: [], 5: [] };

io.on('connection', (socket) => {
    console.log('Yeni oyuncu bağlandı:', socket.id);

    // Etkinlikler kısmından eşleşme arama
    socket.on('find_match', (data) => {
        const mode = Number(data.mode) || 2;
        
        // Oyuncuyu listede daha önceden varsa temizle
        beklemeOdalari[mode] = beklemeOdalari[mode].filter(o => o.id !== socket.id);
        
        // Yeni oyuncuyu ekle
        beklemeOdalari[mode].push({ 
            id: socket.id, 
            isim: data.isim || "Oyuncu" 
        });

        console.log(`${mode} kişilik moda yeni biri katıldı. Toplam: ${beklemeOdalari[mode].length}`);

        // Yeterli sayıya ulaşıldıysa maçı kur
        if (beklemeOdalari[mode].length >= mode) {
            const roomId = "oda_" + Date.now();
            const oyuncular = beklemeOdalari[mode].splice(0, mode);

            // Odadaki tüm arkadaşları odaya al ve maçı başlat
            oyuncular.forEach((o, index) => {
                const playerSocket = io.sockets.sockets.get(o.id);
                if (playerSocket) playerSocket.join(roomId);

                io.to(o.id).emit('match_found', { 
                    roomId: roomId, 
                    oyuncuIndex: index,
                    oyuncular: oyuncular 
                });
            });
        }
    });

    // Aramayı İptal Etme
    socket.on('cancel_match', () => {
        for (let mode in beklemeOdalari) {
            beklemeOdalari[mode] = beklemeOdalari[mode].filter(o => o.id !== socket.id);
        }
    });

    // Oyuncu Bağlantıyı Kestiğinde (Sayfayı kapatırsa/yenilerse)
    socket.on('disconnect', () => {
        for (let mode in beklemeOdalari) {
            beklemeOdalari[mode] = beklemeOdalari[mode].filter(o => o.id !== socket.id);
        }
    });
});

    // Oyun İçi Çember Atma Hamlesini Diğer Oyunculara İletme
    socket.on('player_action', (data) => {
        socket.to(data.roomId).emit('update_game', data);
    });

    // Oyuncu Bağlantıyı Keserse Listeden Çıkar
    socket.on('disconnect', () => {
        for (let mode in beklemeOdalari) {
            beklemeOdalari[mode] = beklemeOdalari[mode].filter(o => o.id !== socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif!`);
});
                    
