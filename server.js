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

app.use(express.static('public'));
app.use(express.static(__dirname));

let oyuncular = [];
let beklemeSirasi = [];
let bekleyenler4v4 = []; // 4v4 Bekleme Kuyruğu

io.on('connection', (socket) => {
    console.log('Bir oyuncu bağlandı, ID:', socket.id);

    oyuncular.push({ id: socket.id });

    // WebRTC Ses Sinyalleşmesi
    socket.on('sesSinyali', (veri) => {
        io.to(veri.hedefID).emit('sesSinyali', {
            gonderenID: socket.id,
            sinyal: veri.sinyal
        });
    });

    // --- 1v1 ESKİ EŞLEŞTİRME ---
    socket.on('rakipAra', () => {
        console.log('Rakip arayan oyuncu:', socket.id);

        if (!beklemeSirasi.includes(socket.id)) {
            beklemeSirasi.push(socket.id);
        }

        if (beklemeSirasi.length >= 2) {
            const oyuncu1 = beklemeSirasi.shift();
            const oyuncu2 = beklemeSirasi.shift();

            io.to(oyuncu1).emit('oyunBasliyor', { rakip: oyuncu2, oyuncular: [oyuncu1, oyuncu2] });
            io.to(oyuncu2).emit('oyunBasliyor', { rakip: oyuncu1, oyuncular: [oyuncu1, oyuncu2] });

            console.log(`Eşleşme sağlandı: ${oyuncu1} vs ${oyuncu2}`);
        } else {
            socket.emit('bekle', 'Rakip aranıyor, lütfen bekleyin...');
        }
    });

    // --- NEW: 4v4 YENİ EŞLEŞTİRME ---
    socket.on('eslesme_ara', (data) => {
        if (data.mod === '4v4') {
            if (!bekleyenler4v4.some(p => p.id === socket.id)) {
                bekleyenler4v4.push({
                    id: socket.id,
                    isim: data.oyuncuAdi || 'Oyuncu',
                    foto: data.profilFoto || '',
                    socket: socket
                });
            }

            const mevcutSayi = bekleyenler4v4.length;
            bekleyenler4v4.forEach(p => {
                p.socket.emit('eslesme_guncelleme', { mevcutSayi: mevcutSayi });
            });

            console.log(`[4v4] Sıradaki Oyuncu Sayısı: ${mevcutSayi}/8`);

            if (bekleyenler4v4.length >= 8) {
                const eslesenGrup = bekleyenler4v4.splice(0, 8);
                const odaId = 'ODA_4v4_' + Date.now();

                const maviTakim = eslesenGrup.slice(0, 4).map(p => ({ id: p.id, isim: p.isim, foto: p.foto }));
                const kirmiziTakim = eslesenGrup.slice(4, 8).map(p => ({ id: p.id, isim: p.isim, foto: p.foto }));

                eslesenGrup.forEach(p => {
                    p.socket.join(odaId);
                    p.socket.emit('eslesme_tamamlandi', {
                        odaId: odaId,
                        mod: '4v4',
                        maviTakim: maviTakim,
                        kirmiziTakim: kirmiziTakim
                    });
                });

                console.log(`[4v4] 8 kişilik maç başlatıldı! Oda: ${odaId}`);
            }
        }
    });

    // 4v4 İptal Etme
    socket.on('eslesme_iptal', (data) => {
        if (data.mod === '4v4') {
            bekleyenler4v4 = bekleyenler4v4.filter(p => p.id !== socket.id);
            bekleyenler4v4.forEach(p => {
                p.socket.emit('eslesme_guncelleme', { mevcutSayi: bekleyenler4v4.length });
            });
        }
    });

    // Bağlantı koptuğunda temizlik
    socket.on('disconnect', () => {
        console.log('Oyuncu ayrıldı:', socket.id);
        oyuncular = oyuncular.filter(p => p.id !== socket.id);
        beklemeSirasi = beklemeSirasi.filter(id => id !== socket.id);
        
        // 4v4 kuyruğundan da çıkar
        bekleyenler4v4 = bekleyenler4v4.filter(p => p.id !== socket.id);
        bekleyenler4v4.forEach(p => {
            p.socket.emit('eslesme_guncelleme', { mevcutSayi: bekleyenler4v4.length });
        });
    });
});

server.listen(3000, () => {
    console.log('Sunucu 3000 portunda çalışıyor...');
});
