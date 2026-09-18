// 3D PARKUR OYUN MOTORU (Subway Surfers Tarzı)
let scene, camera, renderer;
let oyuncuMesh, rakipMesh;
let mevcutSerit = 0; // -1: Sol, 0: Orta, 1: Sağ
const seritGenisligi = 2.5;
let oyuncuVy = 0;
let zipliyor = false;
let skor = 0;
let engeller = [];
let oyunCalisiyor = false;

// 3D Parkur Oyununu Başlatan Ana Fonksiyon
function parkur3dBaslat() {
    console.log("3D Parkur başlatılıyor...");
    
    const ekran = document.getElementById('parkur-3d-ekran');
    if (!ekran) {
        alert("Hata: parkur-3d-ekran elementi bulunamadı!");
        return;
    }
    
    // Ekranı Görünür Yap
    ekran.style.display = 'block';

    // 1. Sahne ve Kamera Kurulumu
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.Fog(0x0f172a, 20, 100);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 4, 8);
    camera.lookAt(0, 1, -5);

    // 2. WebGL Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    const container = document.getElementById('canvas-container');
    container.innerHTML = ''; // Eski canvas varsa temizle
    container.appendChild(renderer.domElement);

    // 3. Işıklandırma
    const isik = new THREE.DirectionalLight(0xffffff, 1.2);
    isik.position.set(5, 15, 10);
    scene.add(isik);
    scene.add(new THREE.AmbientLight(0x606060));

    // 4. PARKUR YOLU (3 Şeritli Uzun Yol)
    const yolGeometri = new THREE.BoxGeometry(9, 0.1, 300);
    const yolMateryal = new THREE.MeshPhongMaterial({ color: 0x1e293b });
    const yol = new THREE.Mesh(yolGeometri, yolMateryal);
    yol.position.z = -140;
    scene.add(yol);

    // 5. BİZİM KARAKTERİMİZ (Mavi Şeker Karakter)
    const oyuncuGeometri = new THREE.BoxGeometry(1, 1.5, 1);
    const oyuncuMateryal = new THREE.MeshPhongMaterial({ color: 0x38bdf8 });
    oyuncuMesh = new THREE.Mesh(oyuncuGeometri, oyuncuMateryal);
    oyuncuMesh.position.set(0, 0.75, 0);
    scene.add(oyuncuMesh);

    // 6. RAKİP / ARKADAŞ KARAKTERİ (Kırmızı Şeker Karakter)
    const rakipGeometri = new THREE.BoxGeometry(1, 1.5, 1);
    const rakipMateryal = new THREE.MeshPhongMaterial({ color: 0xef4444 });
    rakipMesh = new THREE.Mesh(rakipGeometri, rakipMateryal);
    rakipMesh.position.set(0, 0.75, 0);
    scene.add(rakipMesh);

    // Engelleri Oluştur
    engeller = [];
    engelleriOlustur();

    oyunCalisiyor = true;
    oyunDongusu();
}

// Şerit Değiştirme (Sol / Sağ)
function seritDegistir(yon) {
    if (!oyunCalisiyor) return;
    mevcutSerit += yon;
    if (mevcutSerit < -1) mevcutSerit = -1;
    if (mevcutSerit > 1) mevcutSerit = 1;
}

// Zıplama Fiziği
function parkurZatlat() {
    if (!oyunCalisiyor) return;
    if (!zipliyor) {
        oyuncuVy = 0.22;
        zipliyor = true;
    }
}

// Parkur Engelleri
function engelleriOlustur() {
    const engelGeometri = new THREE.BoxGeometry(1.8, 1.2, 1);
    const engelMateryal = new THREE.MeshPhongMaterial({ color: 0xf59e0b });

    for (let i = 0; i < 15; i++) {
        const engel = new THREE.Mesh(engelGeometri, engelMateryal);
        const randomSerit = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
        engel.position.set(randomSerit * seritGenisligi, 0.6, -20 - (i * 15));
        scene.add(engel);
        engeller.push(engel);
    }
}

// Ana Oyun Döngüsü
function oyunDongusu() {
    if (!oyunCalisiyor) return;
    requestAnimationFrame(oyunDongusu);

    // 1. Şerit Pozisyonuna Yumuşak Geçiş
    const hedefX = mevcutSerit * seritGenisligi;
    oyuncuMesh.position.x += (hedefX - oyuncuMesh.position.x) * 0.25;

    // 2. Zıplama Yerçekimi Hesaplaması
    if (zipliyor) {
        oyuncuMesh.position.y += oyuncuVy;
        oyuncuVy -= 0.012;

        if (oyuncuMesh.position.y <= 0.75) {
            oyuncuMesh.position.y = 0.75;
            zipliyor = false;
        }
    }

    // 3. Engelleri Hareket Ettir
    engeller.forEach(engel => {
        engel.position.z += 0.3;

        if (engel.position.z > 5) {
            engel.position.z = -220;
            const randomSerit = Math.floor(Math.random() * 3) - 1;
            engel.position.x = randomSerit * seritGenisligi;
            
            skor += 10;
            const skorEl = document.getElementById('parkur-skor');
            if (skorEl) skorEl.innerText = skor;
        }
    });

    // 4. Pozisyonu Socket.io ile Gönder
    if (window.socket && window.socket.connected) {
        window.socket.emit('parkur_pozisyon_guncelle', {
            x: oyuncuMesh.position.x,
            y: oyuncuMesh.position.y,
            z: oyuncuMesh.position.z
        });
    }

    renderer.render(scene, camera);
}

// Arkadaşınızın Hareketlerini Güncelle
if (window.socket) {
    window.socket.on('rakip_parkur_pozisyon', function(data) {
        if (rakipMesh) {
            rakipMesh.position.set(data.x, data.y, data.z);
        }
    });
}

// Pencere Boyutu Değiştiğinde
window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});
