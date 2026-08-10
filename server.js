const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); // Frontend dosyalarının olduğu klasör
app.use(express.static(__dirname));

let oyuncular = [];
let beklemeSirasi = [];

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

    // Oyuncu rakip aradığında
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

    // Bağlantı koptuğunda
    socket.on('disconnect', () => {
        console.log('Oyuncu ayrıldı:', socket.id);
        oyuncular = oyuncular.filter(p => p.id !== socket.id);
        beklemeSirasi = beklemeSirasi.filter(id => id !== socket.id);
    });
});

server.listen(3000, () => {
    console.log('Sunucu 3000 portunda çalışıyor...');
});
