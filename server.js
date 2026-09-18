const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const oyuncular = {};


// ==========================================
// ANA SAYFA
// ==========================================

app.get("/", (req, res) => {

    res.send(
        "🌆 Şehir Online Multiplayer Sunucusu Çalışıyor!"
    );
});


// ==========================================
// OYUNCU BAĞLANTISI
// ==========================================

io.on("connection", socket => {

    console.log(
        "Oyuncu bağlandı:",
        socket.id
    );


    // Oyuncu hareketi

    socket.on(
        "oyuncu_hareket",
        oyuncu => {

            oyuncular[socket.id] = {
                id: socket.id,

                isim:
                    String(oyuncu.isim)
                    .substring(0, 16),

                x: Number(oyuncu.x) || 900,

                y: Number(oyuncu.y) || 700,

                para:
                    Number(oyuncu.para) || 0,

                meslek:
                    String(oyuncu.meslek || "İşsiz")
                    .substring(0, 30),

                aracta:
                    Boolean(oyuncu.aracta),

                renk:
                    oyuncu.renk || "#2196f3"
            };

            oyuncularGonder();
        }
    );


    // ======================================
    // SOHBET
    // ======================================

    socket.on(
        "sohbet",
        veri => {

            if (!veri) return;

            const mesaj =
                String(veri.mesaj || "")
                .substring(0, 200);

            if (!mesaj) return;

            io.emit(
                "sohbet",
                {
                    isim:
                        String(veri.isim || "Oyuncu")
                        .substring(0, 16),

                    mesaj: mesaj
                }
            );
        }
    );


    // ======================================
    // ÇIKIŞ
    // ======================================

    socket.on("disconnect", () => {

        console.log(
            "Oyuncu ayrıldı:",
            socket.id
        );

        delete oyuncular[socket.id];

        oyuncularGonder();
    });


    function oyuncularGonder() {

        io.emit(
            "oyuncular",
            Object.values(oyuncular)
        );
    }
});


// ==========================================
// SUNUCU
// ==========================================

const PORT =
    process.env.PORT || 3000;

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "Sunucu çalışıyor: " +
            PORT
        );
    }
);