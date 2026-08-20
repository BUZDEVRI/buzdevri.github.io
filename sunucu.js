const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    // __dirname, dosyanın olduğu klasörün tam yoludur
    const dosyaYolu = path.join(__dirname, 'index.html');
   
     fs.readFile(dosyaYolu, (err, data) => {
        if (err) {
            res.writeHead(404, {'Content-Type': 'text/plain'});
            // Hata mesajını daha detaylı yapalım ki nerede aradığını görelim
            res.write("Dosya bulunamadi: " + dosyaYolu);
            res.end();
            return;
        }
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(data);
        res.end();
    });
});

server.listen(8080, () => {
    console.log('Sunucu calisiyor: http://localhost:8080');
});
