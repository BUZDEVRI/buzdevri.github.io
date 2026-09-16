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

// --- TÜM BEKLEME HAVUZLARI ---
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
    // 2. YENİ ETKİNLİK SİSTEMİ (eslesme_ara) - KESİN EŞLEŞTİRME DÜZELTMESİ
    // ==========================================
    socket.on('eslesme_ara', (data) => {
        const oyuncuData = {
            id: socket.id,
            oyuncuAdi: data.oyuncuAdi || 'Oyuncu',
            profilFoto: (data.profilFoto && data.profilFoto.length > 5) 
                        ? data.profilFoto 
                        : 'https://via.placeholder.com/100'
        };

        // ------------------ 1v1 MODU ------------------
        if (data.mod === '1v1' || data.mod === 1 || data.mod === 2) {
            // Mükerrer kaydı temizle
            const index = eslesmeHavuza1v1.findIndex(o => o.id === socket.id);
            if (index !== -1) eslesmeHavuza1v1.splice(index, 1);
            
            eslesmeHavuza1v1.push(oyuncuData);
            console.log(`[1v1] Havuzdaki oyuncu sayısı: ${eslesmeHavuza1v1.length}/2`);

            // Ekrandaki durumu güncelle
            io.emit('eslesme_guncelleme', { mevcutSayi: eslesmeHavuza1v1.length });

            // 2 Kişi olduğunda maçı anında başlat
            if (eslesmeHavuza1v1.length >= 2) {
                const oyuncu1 = eslesmeHavuza1v1.shift();
                const oyuncu2 = eslesmeHavuza1v1.shift();
                const odaId = "1v1_oda_" + Date.now();

                const s1 = io.sockets.sockets.get(oyuncu1.id);
                const s2 = io.sockets.sockets.get(oyuncu2.id);

                if (s1) s1.join(odaId);
                if (s2) s2.join(odaId);

                // İki tarafa da aynı paket formatını gönder (Kırılmayı önler)
                io.to(oyuncu1.id).emit('mac_bulundu', { 
                    odaId: odaId, 
                    rol: 'kurucu', 
                    rakipBilgisi: oyuncu2,
                    takimMavi: [{ oyuncuAdi: oyuncu1.oyuncuAdi, profilFoto: oyuncu1.profilFoto }],
                    takimKirmizi: [{ oyuncuAdi: oyuncu2.oyuncuAdi, profilFoto: oyuncu2.profilFoto }]
                });

                io.to(oyuncu2.id).emit('mac_bulundu', { 
                    odaId: odaId, 
                    rol: 'katilimci', 
                    rakipBilgisi: oyuncu1,
                    takimMavi: [{ oyuncuAdi: oyuncu1.oyuncuAdi, profilFoto: oyuncu1.profilFoto }],
                    takimKirmizi: [{ oyuncuAdi: oyuncu2.oyuncuAdi, profilFoto: oyuncu2.profilFoto }]
                });

                console.log(`⚡ 1v1 Maç Başladı! (${oyuncu1.oyuncuAdi} VS ${oyuncu2.oyuncuAdi})`);
            }
        } 
        // ------------------ 4v4 MODU ------------------
        else if (data.mod === '4v4' || data.mod === 4 || data.mod === 8) {
            const index = eslesmeHavuza4v4.findIndex(o => o.id === socket.id);
            if (index !== -1) eslesmeHavuza4v4.splice(index, 1);

            eslesmeHavuza4v4.push(oyuncuData);
            console.log(`[4v4] Havuzdaki oyuncu sayısı: ${eslesmeHavuza4v4.length}/8`);

            socket.emit('eslesme_guncelleme', { mevcutSayi: eslesmeHavuza4v4.length });

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
    // 3. GENEL ORTAK OLAYLAR
    // ==========================================
    socket.on('player_action', (data) => {
        if (data.roomId) {
            socket.to(data.roomId).emit('update_game', data);
        }
    });

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

    socket.on('disconnect', () => {
        for (let mode in waitingPlayers) {
            waitingPlayers[mode] = waitingPlayers[mode].filter(p => p.socketId !== socket.id);
        }

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
