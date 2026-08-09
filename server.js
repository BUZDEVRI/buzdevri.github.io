const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// HTML dosyanı dışarıya aç
app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('Bir oyuncu bağlandı');
    
    socket.on('mesaj-gonder', (mesaj) => {
        io.emit('mesaj-al', mesaj); // Mesajı herkese yay
    });
});

http.listen(3000, () => {
    console.log('Sunucu 3000 portunda çalışıyor: http://localhost:3000');
});
