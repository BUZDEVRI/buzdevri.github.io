const express = require('http'); // veya express modülün nasıl kuruluysa
const expressApp = require('express');
const app = expressApp();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Gerçek oyuncu bağlantılarını yönetmek için dizi
const oyuncular = [];
// Boşta bekleyen oyuncuları tutacağımız sıra
let beklemeSirasi = [];

io.on('connection', (socket) => {
    console.log('Bir oyuncu bağlandı, ID:', socket.id);

    // Yeni katılan oyuncuyu listeye ekleyelim
    oyuncular.push({ id: socket.id });

    // Oyuncu "eşleşme arıyorum" dediğinde çalışacak dinleyici
    socket.on('rakipAra', () => {
        console.log('Rakip arayan oyuncu:', socket.id);

        if (!beklemeSirasi.includes(socket.id)) {
            beklemeSirasi.push(socket.id);
        }

        if (beklemeSirasi.length >= 2) {
            const oyuncu1 = beklemeSirasi.shift();
            const oyuncu2 = beklemeSirasi.shift();

            io.to(oyuncu1).emit('oyunBasliyor', { rakip: oyuncu2 });
            io.to(oyuncu2).emit('oyunBasliyor', { rakip: oyuncu1 });

            console.log(`Eşleşme sağlandı: ${oyuncu1} vs ${oyuncu2}`);
        } else {
            socket.emit('bekle', 'Rakip aranıyor, lütfen bekleyin...');
        }
    });

    // Oyuncu bağlantısı koptuğunda listeden çıkaralım
    socket.on('disconnect', () => {
        console.log('Oyuncu ayrıldı:', socket.id);
        const index = oyuncular.findIndex(p => p.id === socket.id);
        if (index !== -1) {
            oyuncular.splice(index, 1);
        }

        const siraIndex = beklemeSirasi.indexOf(socket.id);
        if (siraIndex !== -1) {
            beklemeSirasi.splice(siraIndex, 1);
        }
    });
});

// PayTR ve Mağaza Ayarları Alanı (Dışarıda güvenli durur)
const MAGAZA_AYARLARI = {
    merchant_id: "SİZİN_GERÇEK_MERCHANT_ID",     
    merchant_key: "SİZİN_GERÇEK_MERCHANT_KEY",   
    merchant_salt: "SİZİN_GERÇEK_MERCHANT_SALT",
    basariliDonusUrl: "https://alaniniz.com/odeme-basarili"
};

server.listen(PORT, () => {
    console.log(`Oyun sunucusu ${PORT} portunda aktif ve çalışıyor.`);
});
