// ==========================================
// ŞEHİR ONLINE - ANA OYUN
// ==========================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let W = 0;
let H = 0;

function boyutlandir() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
}

window.addEventListener("resize", boyutlandir);
boyutlandir();


// ==========================================
// OYUNCU
// ==========================================

let oyuncu = {
    id: null,
    isim: "Oyuncu",

    x: 900,
    y: 700,

    hiz: 3,

    para: 500,

    meslek: "İşsiz",

    aracta: false,

    renk: "#2196f3"
};


// ==========================================
// DİĞER OYUNCULAR
// ==========================================

let digerOyuncular = {};


// ==========================================
// KLAVYE
// ==========================================

const tuslar = {};

window.addEventListener("keydown", e => {
    tuslar[e.key.toLowerCase()] = true;
});

window.addEventListener("keyup", e => {
    tuslar[e.key.toLowerCase()] = false;
});


// ==========================================
// MOBİL KONTROLLER
// ==========================================

const hareket = {
    yukari: false,
    asagi: false,
    sol: false,
    sag: false
};

function hareketBas(yon) {
    hareket[yon] = true;
}

function hareketBit(yon) {
    hareket[yon] = false;
}


// ==========================================
// ŞEHİR
// ==========================================

const dunya = {
    genislik: 4000,
    yukseklik: 3000
};


// ==========================================
// BİNALAR
// ==========================================

const binalar = [

    {
        id: "market",
        isim: "Market",
        tip: "market",
        x: 500,
        y: 450,
        w: 300,
        h: 220
    },

    {
        id: "restoran",
        isim: "Restoran",
        tip: "restoran",
        x: 1100,
        y: 450,
        w: 300,
        h: 220
    },

    {
        id: "benzinlik",
        isim: "Benzinlik",
        tip: "benzinlik",
        x: 1750,
        y: 450,
        w: 350,
        h: 220
    },

    {
        id: "hastane",
        isim: "Hastane",
        tip: "hastane",
        x: 2500,
        y: 400,
        w: 450,
        h: 300
    },

    {
        id: "polis",
        isim: "Polis Merkezi",
        tip: "polis",
        x: 3150,
        y: 450,
        w: 400,
        h: 280
    },

    {
        id: "ev1",
        isim: "Ev",
        tip: "ev",
        x: 500,
        y: 1200,
        w: 280,
        h: 220
    },

    {
        id: "ev2",
        isim: "Ev",
        tip: "ev",
        x: 1000,
        y: 1200,
        w: 280,
        h: 220
    },

    {
        id: "ev3",
        isim: "Ev",
        tip: "ev",
        x: 1500,
        y: 1200,
        w: 280,
        h: 220
    }
];


// ==========================================
// İŞ YERLERİ
// ==========================================

const isler = {

    market: {
        isim: "Market Çalışanı",
        kazanc: 50
    },

    restoran: {
        isim: "Garson",
        kazanc: 70
    },

    benzinlik: {
        isim: "Benzinlik Çalışanı",
        kazanc: 80
    },

    hastane: {
        isim: "Doktor",
        kazanc: 120
    },

    polis: {
        isim: "Polis",
        kazanc: 100
    }
};


// ==========================================
// HARİTA
// ==========================================

function haritaCiz() {

    ctx.fillStyle = "#6da34d";
    ctx.fillRect(0, 0, dunya.genislik, dunya.yukseklik);

    // yollar

    ctx.fillStyle = "#555";

    ctx.fillRect(
        0,
        800,
        dunya.genislik,
        220
    );

    ctx.fillRect(
        1450,
        0,
        220,
        dunya.yukseklik
    );

    // yol çizgileri

    ctx.strokeStyle = "#e7d36b";
    ctx.lineWidth = 5;

    ctx.setLineDash([30, 30]);

    ctx.beginPath();

    ctx.moveTo(0, 910);
    ctx.lineTo(dunya.genislik, 910);

    ctx.stroke();

    ctx.beginPath();

    ctx.moveTo(1560, 0);
    ctx.lineTo(1560, dunya.yukseklik);

    ctx.stroke();

    ctx.setLineDash([]);
}


// ==========================================
// BİNALARI ÇİZ
// ==========================================

function binalariCiz() {

    for (const bina of binalar) {

        ctx.fillStyle = "#d9d9d9";

        ctx.fillRect(
            bina.x,
            bina.y,
            bina.w,
            bina.h
        );

        ctx.strokeStyle = "#222";
        ctx.lineWidth = 5;

        ctx.strokeRect(
            bina.x,
            bina.y,
            bina.w,
            bina.h
        );

        ctx.fillStyle = "#222";

        ctx.font = "bold 25px Arial";

        ctx.textAlign = "center";

        ctx.fillText(
            bina.isim,
            bina.x + bina.w / 2,
            bina.y + bina.h / 2
        );

        // kapı

        ctx.fillStyle = "#654321";

        ctx.fillRect(
            bina.x + bina.w / 2 - 20,
            bina.y + bina.h - 45,
            40,
            45
        );
    }
}


// ==========================================
// OYUNCU ÇİZ
// ==========================================

function oyuncuCiz(p) {

    ctx.beginPath();

    ctx.arc(
        p.x,
        p.y,
        p.aracta ? 25 : 16,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = p.renk || "#2196f3";

    ctx.fill();

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;

    ctx.stroke();

    ctx.fillStyle = "#fff";

    ctx.font = "bold 15px Arial";
    ctx.textAlign = "center";

    ctx.fillText(
        p.isim,
        p.x,
        p.y - 25
    );

    if (p.aracta) {

        ctx.font = "20px Arial";

        ctx.fillText(
            "🚗",
            p.x,
            p.y + 7
        );
    }
}


// ==========================================
// KAMERA
// ==========================================

function kameraHesapla() {

    let kameraX = oyuncu.x - W / 2;
    let kameraY = oyuncu.y - H / 2;

    kameraX = Math.max(
        0,
        Math.min(kameraX, dunya.genislik - W)
    );

    kameraY = Math.max(
        0,
        Math.min(kameraY, dunya.yukseklik - H)
    );

    return {
        x: kameraX,
        y: kameraY
    };
}


// ==========================================
// ÇARPIŞMA
// ==========================================

function binaCarpisma(nx, ny) {

    const boyut = 18;

    for (const bina of binalar) {

        if (
            nx + boyut > bina.x &&
            nx - boyut < bina.x + bina.w &&
            ny + boyut > bina.y &&
            ny - boyut < bina.y + bina.h
        ) {

            return true;
        }
    }

    return false;
}


// ==========================================
// HAREKET
// ==========================================

function hareketEt() {

    let dx = 0;
    let dy = 0;

    if (tuslar["w"] || tuslar["arrowup"] || hareket.yukari) {
        dy -= 1;
    }

    if (tuslar["s"] || tuslar["arrowdown"] || hareket.asagi) {
        dy += 1;
    }

    if (tuslar["a"] || tuslar["arrowleft"] || hareket.sol) {
        dx -= 1;
    }

    if (tuslar["d"] || tuslar["arrowright"] || hareket.sag) {
        dx += 1;
    }

    if (dx !== 0 || dy !== 0) {

        const uzunluk = Math.sqrt(dx * dx + dy * dy);

        dx /= uzunluk;
        dy /= uzunluk;

        const hiz = oyuncu.aracta
            ? 6
            : oyuncu.hiz;

        const nx = oyuncu.x + dx * hiz;
        const ny = oyuncu.y + dy * hiz;

        if (!binaCarpisma(nx, oyuncu.y)) {
            oyuncu.x = nx;
        }

        if (!binaCarpisma(oyuncu.x, ny)) {
            oyuncu.y = ny;
        }

        oyuncu.x = Math.max(
            20,
            Math.min(dunya.genislik - 20, oyuncu.x)
        );

        oyuncu.y = Math.max(
            20,
            Math.min(dunya.yukseklik - 20, oyuncu.y)
        );

        sunucuyaOyuncuGonder();
    }
}


// ==========================================
// YAKIN BİNA
// ==========================================

function yakinBinaBul() {

    let enYakin = null;
    let mesafe = Infinity;

    for (const bina of binalar) {

        const merkezX = bina.x + bina.w / 2;
        const merkezY = bina.y + bina.h / 2;

        const d = Math.hypot(
            oyuncu.x - merkezX,
            oyuncu.y - merkezY
        );

        if (d < mesafe) {
            mesafe = d;
            enYakin = bina;
        }
    }

    if (mesafe < 250) {
        return enYakin;
    }

    return null;
}


// ==========================================
// ETKİLEŞİM
// ==========================================

function etkilesimKontrol() {

    const bina = yakinBinaBul();

    const btn = document.getElementById(
        "etkilesimButonu"
    );

    if (!bina) {

        btn.style.display = "none";
        return;
    }

    btn.style.display = "block";

    if (bina.tip === "ev") {
        btn.innerText = "🏠 Eve Gir";
    }
    else if (isler[bina.tip]) {
        btn.innerText = "💼 İşe Gir";
    }
    else {
        btn.innerText = "🔎 İncele";
    }
}


// ==========================================
// ETKİLEŞİM YAP
// ==========================================

function etkilesimYap() {

    const bina = yakinBinaBul();

    if (!bina) return;

    // EV

    if (bina.tip === "ev") {

        alert(
            "🏠 Ev\n\n" +
            "Burası senin evin olabilir.\n" +
            "Ev satın alma sistemi sonraki sürümde."
        );

        return;
    }

    // İŞ

    if (isler[bina.tip]) {

        const is = isler[bina.tip];

        oyuncu.meslek = is.isim;

        document.getElementById(
            "meslekGoster"
        ).innerText = oyuncu.meslek;

        paraKaydet();

        alert(
            "💼 İşe başladın!\n\n" +
            "Meslek: " + is.isim + "\n" +
            "Kazanç: " + is.kazanc + " ₺"
        );

        return;
    }
}


// ==========================================
// PARA
// ==========================================

function paraKaydet() {

    localStorage.setItem(
        "sehir_online_para",
        oyuncu.para
    );

    localStorage.setItem(
        "sehir_online_meslek",
        oyuncu.meslek
    );

    document.getElementById(
        "paraGoster"
    ).innerText = oyuncu.para;

    document.getElementById(
        "meslekGoster"
    ).innerText = oyuncu.meslek;
}


function paraYukle() {

    const para = localStorage.getItem(
        "sehir_online_para"
    );

    const meslek = localStorage.getItem(
        "sehir_online_meslek"
    );

    if (para !== null) {
        oyuncu.para = Number(para);
    }

    if (meslek !== null) {
        oyuncu.meslek = meslek;
    }

    paraKaydet();
}


// ==========================================
// MAAŞ
// ==========================================

setInterval(() => {

    if (!oyuncu.meslek ||
        oyuncu.meslek === "İşsiz") {
        return;
    }

    let kazanc = 50;

    for (const key in isler) {

        if (isler[key].isim === oyuncu.meslek) {
            kazanc = isler[key].kazanc;
        }
    }

    oyuncu.para += kazanc;

    paraKaydet();

    mesajEkle(
        "💰 Maaş aldın: +" + kazanc + " ₺"
    );

}, 60000);


// ==========================================
// ARAÇ
// ==========================================

function aracaBin() {

    oyuncu.aracta = !oyuncu.aracta;

    if (oyuncu.aracta) {

        mesajEkle("🚗 Araca bindin.");

    } else {

        mesajEkle("🚶 Araçtan indin.");
    }

    sunucuyaOyuncuGonder();
}


// ==========================================
// LOCAL KAYIT
// ==========================================

function isimKaydet() {

    localStorage.setItem(
        "sehir_online_isim",
        oyuncu.isim
    );
}

function isimYukle() {

    const isim =
        localStorage.getItem(
            "sehir_online_isim"
        );

    if (isim) {
        oyuncu.isim = isim;
    }
}


// ==========================================
// MULTIPLAYER
// ==========================================

// Buraya kendi sunucunun adresini yaz.
//
// Örnek:
// https://senin-sunucun.onrender.com

const SERVER_URL = "BURAYA_SUNUCU_ADRESINI_YAZ";

let socket = null;

function multiplayerBaslat() {

    if (SERVER_URL.includes("BURAYA")) {

        document.getElementById(
            "baglantiDurumu"
        ).innerText =
            "🟡 Sunucu adresi henüz ayarlanmadı.";

        return;
    }

    socket = io(SERVER_URL, {
        transports: ["websocket", "polling"]
    });

    socket.on("connect", () => {

        oyuncu.id = socket.id;

        document.getElementById(
            "baglantiDurumu"
        ).innerText =
            "🟢 Sunucuya bağlandın!";

        sunucuyaOyuncuGonder();
    });


    socket.on("disconnect", () => {

        document.getElementById(
            "baglantiDurumu"
        ).innerText =
            "🔴 Sunucu bağlantısı kesildi.";
    });


    socket.on("oyuncular", liste => {

        digerOyuncular = {};

        liste.forEach(p => {

            if (p.id !== oyuncu.id) {
                digerOyuncular[p.id] = p;
            }
        });

        document.getElementById(
            "oyuncuSayisi"
        ).innerText =
            liste.length;
    });


    socket.on("sohbet", veri => {

        mesajEkle(
            "💬 " +
            veri.isim +
            ": " +
            veri.mesaj
        );
    });
}


function sunucuyaOyuncuGonder() {

    if (!socket ||
        !socket.connected) {
        return;
    }

    socket.emit("oyuncu_hareket", {
        id: oyuncu.id,
        isim: oyuncu.isim,
        x: oyuncu.x,
        y: oyuncu.y,
        para: oyuncu.para,
        meslek: oyuncu.meslek,
        aracta: oyuncu.aracta,
        renk: oyuncu.renk
    });
}


// ==========================================
// SOHBET
// ==========================================

function mesajEkle(mesaj) {

    const alan =
        document.getElementById("mesajlar");

    const div =
        document.createElement("div");

    div.className = "mesaj";

    div.innerText = mesaj;

    alan.appendChild(div);

    alan.scrollTop = alan.scrollHeight;

    while (alan.children.length > 30) {
        alan.removeChild(alan.firstChild);
    }
}


function mesajGonder() {

    const input =
        document.getElementById("mesajInput");

    const mesaj =
        input.value.trim();

    if (!mesaj) return;

    if (!socket ||
        !socket.connected) {

        mesajEkle(
            "🔴 Multiplayer bağlantısı yok."
        );

        return;
    }

    socket.emit("sohbet", {
        isim: oyuncu.isim,
        mesaj: mesaj
    });

    input.value = "";
}


document.getElementById(
    "mesajInput"
).addEventListener("keydown", e => {

    if (e.key === "Enter") {
        mesajGonder();
    }
});


// ==========================================
// OYUNA BAŞLA
// ==========================================

function oyunaBasla() {

    const input =
        document.getElementById("isimInput");

    const isim =
        input.value.trim();

    if (!isim) {

        alert("Oyuncu adını yaz!");

        return;
    }

    oyuncu.isim = isim;

    isimKaydet();
    paraYukle();

    document.getElementById(
        "baslangic"
    ).style.display = "none";

    document.getElementById(
        "oyun"
    ).style.display = "block";

    document.getElementById(
        "isimGoster"
    ).innerText = oyuncu.isim;

    multiplayerBaslat();
}


// ==========================================
// OYUN DÖNGÜSÜ
// ==========================================

function oyunDongusu() {

    hareketEt();

    etkilesimKontrol();

    const kamera = kameraHesapla();

    ctx.clearRect(
        0,
        0,
        W,
        H
    );

    ctx.save();

    ctx.translate(
        -kamera.x,
        -kamera.y
    );

    haritaCiz();

    binalariCiz();


    // diğer oyuncular

    for (const id in digerOyuncular) {

        oyuncuCiz(
            digerOyuncular[id]
        );
    }


    // kendi oyuncumuz

    oyuncuCiz(oyuncu);

    ctx.restore();

    requestAnimationFrame(
        oyunDongusu
    );
}


// ==========================================
// BAŞLANGIÇ
// ==========================================

isimYukle();
paraYukle();

document.getElementById(
    "isimInput"
).value = oyuncu.isim;

oyunDongusu();