// 3D HEYECANLI PARKUR MOTORU
let scene, camera, renderer;
let oyuncuMesh, rakipMesh;
let mevcutSerit = 0; // -1: Sol, 0: Orta, 1: Sağ
const seritGenisligi = 2.5;
let oyuncuVy = 0;
let zipliyor = false;
let skor = 0;
let hiz = 0.35; // Başlangıç hızı
let engeller = [];
let sekerler = [];
let oyunCalisiyor = false;

function parkur3dBaslat() {
    const ekran = document.getElementById('parkur-3d-ekran');
    if (ekran) ekran.style.display = 'block';

    // Değişkenleri Sıfırla
    skor = 0;
    hiz = 0.35;
    mevcutSerit = 0;
    engeller = [];
    sekerler = [];
    document.getElementById('parkur-skor').innerText = "0";

    // Sahne & Kamera
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.Fog(0x0f172a, 15, 80);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 3.5, 7);
    camera.lookAt(0, 1, -5);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    const container = document.getElementById('canvas-container');
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Işıklar
    const isik = new THREE.DirectionalLight(0xffffff, 1.2);
    isik.position.set(5, 15, 10);
    scene.add(isik);
    scene.add(new THREE.AmbientLight(0x707070));

    // Yol (3 Şeritli)
    const yolGeometri = new THREE.BoxGeometry(8.5, 0.1, 300);
    const yolMateryal = new THREE.MeshPhongMaterial({ color: 0x1e293b });
    const yol = new THREE.Mesh(yolGeometri, yolMateryal);
    yol.position.z = -140;
    scene.add(yol);

    // Şerit Çizgileri
    for (let i = -1; i <= 1; i += 2) {
        const cizgiGeom = new THREE.BoxGeometry(0.1, 0.12, 300);
        const cizgiMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
        const cizgi = new THREE.Mesh(cizgiGeom, cizgiMat);
        cizgi.position.set(i * 1.25, 0, -140);
        scene.add(cizgi);
    }

    // Bizim Karakterimiz (Mavi)
    const oyuncuGeometri = new THREE.BoxGeometry(0.9, 1.4, 0.9);
    const oyuncuMateryal = new THREE.MeshPhongMaterial({ color: 0x38bdf8 });
    oyuncuMesh = new THREE.Mesh(oyuncuGeometri, oyuncuMateryal);
    oyuncuMesh.position.set(0, 0.7, 0);
    scene.add(oyuncuMesh);

    // Rakip Karakter (Kırmızı)
    const rakipGeometri = new THREE.BoxGeometry(0.9, 1.4, 0.9);
    const rakipMateryal = new THREE.MeshPhongMaterial({ color: 0xef4444 });
    rakipMesh = new THREE.Mesh(rakipGeometri, rakipMateryal);
    rakipMesh.position.set(0, 0.7, 0);
    scene.add(rakipMesh);

    // Obje Üretimi
    engelleriOlustur();
    sekerleriOlustur();

    oyunCalisiyor = true;
    oyunDongusu();
}

function seritDegistir(yon) {
    if (!oyunCalisiyor) return;
    mevcutSerit += yon;
    if (mevcutSerit < -1) mevcutSerit = -1;
    if (mevcutSerit > 1) mevcutSerit = 1;
}

function parkurZatlat() {
    if (!oyunCalisiyor) return;
    if (!zipliyor) {
        oyuncuVy = 0.24;
        zipliyor = true;
    }
}

// Kırmızı Tehlikeli Engeller
function engelleriOlustur() {
    const engelGeometri = new THREE.BoxGeometry(1.8, 1.2, 0.8);
    const engelMateryal = new THREE.MeshPhongMaterial({ color: 0xd97706 });

    for (let i = 0; i < 12; i++) {
        const engel = new THREE.Mesh(engelGeometri, engelMateryal);
        const randomSerit = Math.floor(Math.random() * 3) - 1;
        engel.position.set(randomSerit * seritGenisligi, 0.6, -25 - (i * 20));
        scene.add(engel);
        engeller.push(engel);
    }
}

// Toplanabilir Altın/Şekerler
function sekerleriOlustur() {
    const sekerGeometri = new THREE.DodecahedronGeometry(0.4);
    const sekerMateryal = new THREE.MeshPhongMaterial({ color: 0xfacc15 });

    for (let i = 0; i < 15; i++) {
        const seker = new THREE.Mesh(sekerGeometri, sekerMateryal);
        const randomSerit = Math.floor(Math.random() * 3) - 1;
        seker.position.set(randomSerit * seritGenisligi, 0.8, -15 - (i * 12));
        scene.add(seker);
        sekerler.push(seker);
    }
}

function oyunDongusu() {
    if (!oyunCalisiyor) return;
    requestAnimationFrame(oyunDongusu);

    // Şerit Geçişi (Yumuşak)
    const hedefX = mevcutSerit * seritGenisligi;
    oyuncuMesh.position.x += (hedefX - oyuncuMesh.position.x) * 0.25;

    // Zıplama & Yerçekimi
    if (zipliyor) {
        oyuncuMesh.position.y += oyuncuVy;
        oyuncuVy -= 0.014;

        if (oyuncuMesh.position.y <= 0.7) {
            oyuncuMesh.position.y = 0.7;
            zipliyor = false;
        }
    }

    // Giderek Hızlanma
    hiz += 0.00005;

    // Engellerin Hareketi & Çarpışma Kontrolü (YANMA)
    engeller.forEach(engel => {
        engel.position.z += hiz;

        // Çarptı mı? (Çarpışma Kutusu Kontrolü)
        const dx = Math.abs(oyuncuMesh.position.x - engel.position.x);
        const dy = Math.abs(oyuncuMesh.position.y - engel.position.y);
        const dz = Math.abs(oyuncuMesh.position.z - engel.position.z);

        if (dx < 1.2 && dy < 1.0 && dz < 0.8) {
            oyunBitti();
        }

        // Dışarı çıkan engeli öne taşı
        if (engel.position.z > 5) {
            engel.position.z = -220;
            engel.position.x = (Math.floor(Math.random() * 3) - 1) * seritGenisligi;
        }
    });

    // Şeker Toplama Kontrolü
    sekerler.forEach(seker => {
        seker.position.z += hiz;
        seker.rotation.y += 0.05; // Dönen Şeker

        const dx = Math.abs(oyuncuMesh.position.x - seker.position.x);
        const dy = Math.abs(oyuncuMesh.position.y - seker.position.y);
        const dz = Math.abs(oyuncuMesh.position.z - seker.position.z);

        if (dx < 1.0 && dy < 1.0 && dz < 0.8) {
            seker.position.z = -200; // Şekeri uzağa gönder (toplandı)
            seker.position.x = (Math.floor(Math.random() * 3) - 1) * seritGenisligi;
            skor += 50;
            document.getElementById('parkur-skor').innerText = skor;
        }

        if (seker.position.z > 5) {
            seker.position.z = -200;
            seker.position.x = (Math.floor(Math.random() * 3) - 1) * seritGenisligi;
        }
    });

    // Skor Zamanla Artar
    skor += 1;
    document.getElementById('parkur-skor').innerText = skor;

    // Konumu Socket ile Gönder
    if (window.socket && window.socket.connected) {
        window.socket.emit('parkur_pozisyon_guncelle', {
            x: oyuncuMesh.position.x,
            y: oyuncuMesh.position.y,
            z: oyuncuMesh.position.z
        });
    }

    renderer.render(scene, camera);
}

// YANMA EKRANI
function oyunBitti() {
    oyunCalisiyor = false;
    alert(`💥 YANDIN!\n\nToplanan Skor: ${skor}\n\nTekrar denemek için "Parkura Başla" butonuna bas!`);
    
    const ekran = document.getElementById('parkur-3d-ekran');
    if (ekran) ekran.style.display = 'none';
}

// Rakip Pozisyon Güncelleme
if (window.socket) {
    window.socket.on('rakip_parkur_pozisyon', function(data) {
        if (rakipMesh) {
            rakipMesh.position.set(data.x, data.y, data.z);
        }
    });
}
