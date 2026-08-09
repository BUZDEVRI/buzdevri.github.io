console.log("Paramanya sunucusu başlatıldı!");
let para = 1000;
let konum = 0;

function zarAt() {
    let zar = Math.floor(Math.random() * 6) + 1;
    console.log("Zar sonucu: " + zar);
    konum += zar;
    para -= 50; // Her adımda bir masraf simülasyonu
    console.log("Yeni konum: " + konum + " | Kalan para: " + para);
}

zarAt();
