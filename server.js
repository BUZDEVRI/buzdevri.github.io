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

// --- TÜM BEKLEME HAVUZLARI (Diziler En Üstte) ---
let waitingPlayers = {}; 
const eslesmeHavuza1v1 = [];
const eslesmeHavuza4v4 = [];

io.on('connection', (socket) => {
    console.log('Yeni oyuncu bağlandı:', socket.id);

    // ==========================================
    // 1. MEVCUT SİSTEM (find_match)
    // ==========================================
    socket.on('find_match', (data) => {
        const mode = data.mode || 2; 
        const playerName = data.isim || "Oyuncu";

        const player = {
            socketId: socket.id,
            isim: playerName
        };

        if (!waitingPlayers[mode]) {
            waitingPlayers[mode] = [];
        }

        waitingPlayers[mode] = waitingPlayers[mode].filter(p => p.socketId !== socket.id);
        waitingPlayers[mode].push(player);

        console.log(`[Mod ${mode}] Kuyruktaki oyuncu sayısı: ${waitingPlayers[mode].length}`);

        if (waitingPlayers[mode].length >= mode) {
            const roomPlayers = waitingPlayers[mode].splice(0, mode);
            const roomId = "room_" + Date.now();

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

    // ==========================================
    // 2. YENİ ETKİNLİK SİSTEMİ (eslesme_ara)
    // ==========================================
    socket.on('eslesme_ara', (data) => {
        const oyuncuData = {
            id: socket.id,
            oyuncuAdi: data.oyuncuAdi,
            profilFoto: data.profilFoto
        };

        if (data.mod === '1v1') {
            // Çift eklemeyi önlemek için temizle ve ekle
            const index = eslesmeHavuza1v1.findIndex(o => o.id === socket.id);
            if (index !== -1) eslesmeHavuza1v1.splice(index, 1);
            
            eslesmeHavuza1v1.push(oyuncuData);
            console.log(`[1v1] Havuzdaki oyuncu: ${eslesmeHavuza1v1.length}/2`);
            
            // Havuzda 2 kişi biriktiyse maçı başlat
            if (eslesmeHavuza1v1.length >= 2) {
                const oyuncu1 = eslesmeHavuza1v1.shift();
                const oyuncu2 = eslesmeHavuza1v1.shift();
                const odaId = "1v1_oda_" + Date.now();

                // 1. Oyuncunun Socket'ini Odaya Al ve Bildir
                const s1 = io.sockets.sockets.get(oyuncu1.id);
                if (s1) s1.join(odaId);
                io.to(oyuncu1.id).emit('eslesme_guncelleme', { mevcutSayi: 2, rakipBilgisi: oyuncu2 });
                io.to(oyuncu1.id).emit('mac_bulundu', { odaId: odaId, rol: 'kurucu' });

                // 2. Oyuncunun Socket'ini Odaya Al ve Bildir
                const s2 = io.sockets.sockets.get(oyuncu2.id);
                if (s2) s2.join(odaId);
                io.to(oyuncu2.id).emit('eslesme_guncelleme', { mevcutSayi: 2, rakipBilgisi: oyuncu1 });
                io.to(oyuncu2.id).emit('mac_bulundu', { odaId: odaId, rol: 'katilimci' });

                console.log(`⚡ 1v1 Maç Başladı! Oda ID: ${odaId}`);
            }
        } 
        else if (data.mod === '4v4') {
            const index = eslesmeHavuza4v4.findIndex(o => o.id === socket.id);
            if (index !== -1) eslesmeHavuza4v4.splice(index, 1);

            eslesmeHavuza4v4.push(oyuncuData);
            console.log(`[4v4] Havuzdaki oyuncu: ${eslesmeHavuza4v4.length}/8`);

            // Havuzda 8 kişi (4v4) biriktiyse maçı başlat
            if (eslesmeHavuza4v4.length >= 8) {
                const takimMavi = eslesmeHavuza4v4.splice(0, 4);
                const takimKirmizi = eslesmeHavuza4v4.splice(0, 4);
                const odaId = "4v4_oda_" + Date.now();

                const tumOyuncular = [...takimMavi, ...takimKirmizi];
                tumOyuncular.forEach((oyuncu) => {
                    const s = io.sockets.sockets.get(oyuncu.id);
                    if (s) s.join(odaId);
                    io.to(oyuncu.id).emit('mac_bulundu', { odaId: odaId, takimMavi, takimKirmizi });
                });

                console.log(`🛡️ 4v4 Maç Başladı! Oda ID: ${odaId}`);
            }
        }
    });

    // ==========================================
    // 3. GENEL ORTAK OLAYLAR (Hamle, İptal, Disconnect)
    // ==========================================
    
    // Oyuncu Hamlesi
    socket.on('player_action', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('update_game', data);
        }
    });

    // Eşleşmeyi İptal Etme
    socket.on('eslesme_iptal', () => {
        const index1 = eslesmeHavuza1v1.findIndex(o => o.id === socket.id);
        if (index1 !== -1) eslesmeHavuza1v1.splice(index1, 1);

        const index4 = eslesmeHavuza4v4.findIndex(o => o.id === socket.id);
        if (index4 !== -1) eslesmeHavuza4v4.splice(index4, 1);

        console.log('Etkinlik eşleşmesi iptal edildi:', socket.id);
    });

    socket.on('cancel_match', () => {
        for (let mode in waitingPlayers) {
            waitingPlayers[mode] = waitingPlayers[mode].filter(p => p.socketId !== socket.id);
        }
        console.log('Eşleşme iptal edildi:', socket.id);
    });

    // Bağlantı Kopması Temizliği
    socket.on('disconnect', () => {
        // Eski modların temizliği
        for (let mode in waitingPlayers) {
            waitingPlayers[mode] = waitingPlayers[mode].filter(p => p.socketId !== socket.id);
        }

        // Yeni etkinlik havuzlarının temizliği
        const index1 = eslesmeHavuza1v1.findIndex(o => o.id === socket.id);
        if (index1 !== -1) eslesmeHavuza1v1.splice(index1, 1);

        const index4 = eslesmeHavuza4v4.findIndex(o => o.id === socket.id);
        if (index4 !== -1) eslesmeHavuza4v4.splice(index4, 1);

        console.log('Oyuncu ayrıldı:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif!`);
});
      
