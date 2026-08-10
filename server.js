// Gerekli kütüphaneler (Kurulum için terminale: npm install express axios crypto)
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Middleware Ayarları
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});
// Gerçek oyuncu bağlantılarını yönetmek için dizi
const oyuncular = [];

io.on('connection', (socket) => {
    console.log('Bir oyuncu bağlandı, ID:', socket.id);

    // Yeni katılan oyuncuyu listeye ekleyelim
    oyuncular.push({ id: socket.id });

    // Oyuncu bağlantısı koptuğunda listeden çıkaralım
    socket.on('disconnect', () => {
        console.log('Oyuncu ayrıldı:', socket.id);
        const index = oyuncular.findIndex(p => p.id === socket.id);
        if (index !== -1) {
            oyuncular.splice(index, 1);
        }
    });
});

// ==========================================
// 1. MAĞAZA, BANKA VE GÜVENLİK BİLGİLERİNİZ
// ==========================================
const MAGAZA_AYARLARI = {
    merchant_id: "SİZİN_GERÇEK_MERCHANT_ID",     // PayTR panelinden alacağınız Mağaza No
    merchant_key: "SİZİN_GERÇEK_MERCHANT_KEY",   // PayTR panelinden alacağınız Gizli Anahtar
    merchant_salt: "SİZİN_GERÇEK_MERCHANT_SALT", // PayTR panelinden alacağınız Tuz (Salt) değeri
    
    // Paranın yatacağı sizin banka IBAN'ınız (Ödeme kuruluşundaki hesabınıza bağlıdır)
    sizinBankaIbaniniz: "TR52 95 4500 4160 6070",
    
    // Ödeme başarılı olunca oyuncunun yönlendirileceği sayfa
    basariliDonusUrl: "https://alanadiniz.com/odeme-basarili",
    hataliDonusUrl: "https://alanadiniz.com/odeme-hata"
};

// ==========================================
// 2. ÖDEME BAŞLATMA ENDPOINT'İ (Ön yüzden gelir)
// ==========================================
app.post('/api/odeme-baslat', async (req, res) => {
    try {
        const { urunAdi, tutar, kartSahibi, kartNumarasi, skt, cvv, oyuncuId } = req.body;

        // SKT ay ve yıl olarak ayrılır (Örn: 08/26 -> Ay: 08, Yıl: 2026)
        const [ccMonth, ccYear] = skt.split('/');

        // Ödeme kuruluşundan dönen 3D Secure yönlendirme adresi örneği:
        let guvenli3dUrl = "https://www.paytr.com/odeme/guvenli-3d-token-ornek";

        res.json({
            basarili: true,
            redirectUrl: guvenli3dUrl // Oyuncunun SMS onayına (3D Secure) yönlendirileceği adres
        });

    } catch (hata) {
        console.error("Backend Ödeme Başlatma Hatası:", hata);
        res.status(500).json({
            basarili: false,
            hataMesaji: "Ödeme işlenirken bir sunucu hatası oluştu."
        });
    }
});

// ==========================================
// 3. PAYTR OTOMATİK BİLDİRİM (WEBHOOK) ENDPOINT'İ
// ==========================================
app.post('/api/paytr-bildirim', (req, res) => {
    try {
        let data = req.body;
        
        // Yukarıda tanımladığımız ayarları kullanıyoruz
        let merchantId = MAGAZA_AYARLARI.merchant_id;
        let merchantKey = MAGAZA_AYARLARI.merchant_key;
        let merchantSalt = MAGAZA_AYARLARI.merchant_salt;

        // PayTR'den gelen verilerin güvenliğini (hash) kontrol ediyoruz
        let hashStr = data.merchant_oid + merchantSalt + data.status + data.total_amount;
        let token = crypto.createHmac('sha256', merchantKey).update(hashStr).digest('base64');

        if (token !== data.hash) {
            return res.status(400).send("PAYTR Bildirim hash doğrulaması başarısız!");
        }

        // Ödeme gerçekten başarılı oldu mu?
        if (data.status === 'success') {
            console.log(`Ödeme Başarılı! Hızlı Gösterici ID: ${data.merchant_oid} nolu işlemle oyuncuya tanımlandı.`);
            console.log(`Para Aktarılan IBAN / Hesap: ${MAGAZA_AYARLARI.sizinBankaIbaniniz}`);
            
            return res.send("OK");
        } else {
            console.log("Ödeme Başarısız Oldu: " + data.failed_reason);
            return res.send("OK");
        }

    } catch (error) {
        console.error("Bildirim işlenirken hata oluştu:", error);
        res.status(500).send("Hata oluştu");
    }
});

// Base64 çevirici yardımcı fonksiyon
function base64_encode(data) {
    return Buffer.from(data).toString('base64');
}

// ==========================================
// 4. SUNUCUYU BAŞLATMA
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Ödeme sunucusu ${PORT} portunda güvenli bir şekilde çalışıyor...`);
});
