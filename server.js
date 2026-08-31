const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// 2 ve 5 Kişilik Bekleme Odaları
let beklemeOdalari = { 2: [], 5: [] };

io.on('connection', (socket) => {
    console.log('Yeni oyuncu bağlandı:', socket.id);

    // Etkinlikler kısmından eşleşme arama
    socket.on('find_match', (data) => {
        // data.mode BURADA sayıya dönüştürülür
        const mode = Number(data.mode) || 2;
        
        // Yanlış mod gönderildiyse varsayılan 2 yap veya listede yoksa oluştur
        if (!beklemeOdalari[mode]) {
            beklemeOdalari[mode] = [];
        }

        // Oyuncu listede daha önceden varsa temizle
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

    // Sayfa kapandığında oyuncuyu havuzdan çıkar
    socket.on('disconnect', () => {
        for (let mode in beklemeOdalari) {
            beklemeOdalari[mode] = beklemeOdalari[mode].filter(o => o.id !== socket.id);
        }
    });
});

// Port dinleme (Örnek: 3000)
http.listen(3000, () => {
    console.log('Sunucu 3000 portunda çalışıyor');
});
        
