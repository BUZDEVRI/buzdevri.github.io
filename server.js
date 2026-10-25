
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const WebSocket = require('ws');
const initSqlJs = require('sql.js');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'cadircilar.sqlite');
const MAX_PLAYERS = 40;
const WORLD = { width: 2400, height: 1800 };

const sessions = new Map();
const sockets = new Map();
const moveInputs = new Map();

let db, wss;
let trees = [];
let tents = [];
let players = new Map();

const colors = [
  '#f4c76b', '#a7d8ff', '#ff9f9f',
  '#c4a1ff', '#b7ee9b', '#ffca91'
];

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function cleanName(s) {
  return String(s || '').trim().normalize('NFKC');
}

function validName(s) {
  return /^[A-Za-z0-9_ğüşöçıİĞÜŞÖÇ-]{3,18}$/.test(s);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function makeToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function passwordHash(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
}

function run(sql, params = []) {
  db.run(sql, params);
}

function rows(sql, params = []) {
  const stmt = db.prepare(sql, params);
  const result = [];

  try {
    while (stmt.step()) {
      result.push(stmt.getAsObject());
    }
  } finally {
    stmt.free();
  }

  return result;
}

function one(sql, params = []) {
  return rows(sql, params)[0] || null;
}

function persist() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

function createSession(userId) {
  const token = makeToken();
  const hash = tokenHash(token);
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30;

  sessions.set(hash, { userId, expiresAt });

  run(
    'INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',
    [hash, userId, expiresAt]
  );

  persist();
  return token;
}

function resolveToken(token) {
  if (!token || typeof token !== 'string' || token.length > 200) {
    return null;
  }

  const hash = tokenHash(token);
  let session = sessions.get(hash);

  if (!session) {
    const row = one(
      'SELECT user_id,expires_at FROM sessions WHERE token_hash=?',
      [hash]
    );

    if (row) {
      session = {
        userId: row.user_id,
        expiresAt: Number(row.expires_at)
      };
    }
  }

  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(hash);
    run('DELETE FROM sessions WHERE token_hash=?', [hash]);
    return null;
  }

  sessions.set(hash, session);

  return {
    userId: session.userId,
    hash
  };
}

function hashCode(s) {
  let h = 0;

  for (let i = 0; i < String(s).length; i++) {
    h = ((h << 5) - h) + String(s).charCodeAt(i) | 0;
  }

  return h;
}

function playerRow(userId) {
  const r = one(
    'SELECT id,username,x,y,wood,coins FROM users WHERE id=?',
    [userId]
  );

  if (!r) return null;

  return {
    id: r.id,
    username: r.username,
    x: Number(r.x),
    y: Number(r.y),
    wood: Number(r.wood),
    coins: Number(r.coins),
    color: colors[Math.abs(hashCode(r.id)) % colors.length]
  };
}

function savePlayer(p) {
  run(
    'UPDATE users SET x=?,y=?,wood=?,updated_at=? WHERE id=?',
    [p.x, p.y, p.wood, Date.now(), p.id]
  );
}

function publicPlayers() {
  return [...players.values()].map(p => ({
    id: p.id,
    username: p.username,
    x: p.x,
    y: p.y,
    wood: p.wood,
    coins: p.coins,
    color: p.color
  }));
}

function publicTrees() {
  return trees.map(t => ({
    id: t.id,
    x: t.x,
    y: t.y,
    wood: t.wood
  }));
}

function publicTents() {
  return tents.map(t => ({
    id: t.id,
    ownerId: t.ownerId,
    x: t.x,
    y: t.y
  }));
}

function loadWorld() {
  trees = rows('SELECT id,x,y,wood FROM trees').map(t => ({
    id: t.id,
    x: Number(t.x),
    y: Number(t.y),
    wood: Number(t.wood)
  }));

  tents = rows('SELECT id,owner_id,x,y FROM tents').map(t => ({
    id: t.id,
    ownerId: t.owner_id,
    x: Number(t.x),
    y: Number(t.y)
  }));

  if (!trees.length) {
    for (let i = 0; i < 90; i++) {
      const t = {
        id: crypto.randomUUID(),
        x: 80 + Math.random() * (WORLD.width - 160),
        y: 80 + Math.random() * (WORLD.height - 160),
        wood: 3
      };

      trees.push(t);

      run(
        'INSERT INTO trees(id,x,y,wood) VALUES(?,?,?,?)',
        [t.id, t.x, t.y, t.wood]
      );
    }

    persist();
  }
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });

  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', chunk => {
      size += chunk.length;

      if (size > 10000) {
        reject(new Error('İstek çok büyük.'));
        req.destroy();
        return;
      }

      body += chunk;
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Geçersiz JSON.'));
      }
    });

    req.on('error', reject);
  });
}

function authFromRequest(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);

  return match ? resolveToken(match[1]) : null;
}

function requireAuth(req, res) {
  const auth = authFromRequest(req);

  if (!auth) {
    json(res, 401, {
      error: 'Oturum geçersiz veya süresi dolmuş. Tekrar giriş yap.'
    });

    return null;
  }

  return auth;
}

function normalizedName(s) {
  return cleanName(s).toLocaleLowerCase('tr-TR');
}

function transaction(callback) {
  run('BEGIN TRANSACTION');

  try {
    const result = callback();
    run('COMMIT');
    persist();
    return result;
  } catch (error) {
    run('ROLLBACK');
    throw error;
  }
}

function notifyPlayer(userId, obj) {
  send(sockets.get(userId), obj);
}

function updateOnlinePlayer(userId) {
  const fresh = playerRow(userId);

  if (fresh && players.has(userId)) {
    const online = players.get(userId);
    Object.assign(online, fresh);
  }

  return fresh;
}

function friendRows(userId) {
  return rows(`
    SELECT u.id,u.username
    FROM friend_requests f
    JOIN users u
      ON u.id = CASE
        WHEN f.requester_id=? THEN f.target_id
        ELSE f.requester_id
      END
    WHERE f.status='accepted'
      AND (f.requester_id=? OR f.target_id=?)
    ORDER BY u.username COLLATE NOCASE
  `, [userId, userId, userId]);
}

function socialData(userId) {
  const player = playerRow(userId);

  const friends = friendRows(userId).map(f => ({
    id: f.id,
    username: f.username,
    online: players.has(f.id)
  }));

  const incoming = rows(`
    SELECT f.id,u.id AS user_id,u.username
    FROM friend_requests f
    JOIN users u ON u.id=f.requester_id
    WHERE f.target_id=? AND f.status='pending'
    ORDER BY f.created_at DESC
  `, [userId]).map(f => ({
    requestId: f.id,
    id: f.user_id,
    username: f.username
  }));

  const outgoing = rows(`
    SELECT u.username
    FROM friend_requests f
    JOIN users u ON u.id=f.target_id
    WHERE f.requester_id=? AND f.status='pending'
  `, [userId]).map(f => f.username);

  const clanMembership = one(`
    SELECT c.id,c.name,c.owner_id,cm.role
    FROM clan_members cm
    JOIN clans c ON c.id=cm.clan_id
    WHERE cm.user_id=?
  `, [userId]);

  let clan = null;

  if (clanMembership) {
    clan = {
      id: clanMembership.id,
      name: clanMembership.name,
      ownerId: clanMembership.owner_id,
      role: clanMembership.role,
      members: rows(`
        SELECT u.id,u.username,cm.role
        FROM clan_members cm
        JOIN users u ON u.id=cm.user_id
        WHERE cm.clan_id=?
        ORDER BY
          CASE cm.role WHEN 'owner' THEN 0 ELSE 1 END,
          u.username COLLATE NOCASE
      `, [clanMembership.id]).map(m => ({
        id: m.id,
        username: m.username,
        role: m.role,
        online: players.has(m.id)
      }))
    };
  }

  const listings = rows(`
    SELECT
      l.id,l.seller_id,l.item,l.quantity,l.price,l.created_at,
      u.username AS seller_name
    FROM market_listings l
    JOIN users u ON u.id=l.seller_id
    ORDER BY l.created_at DESC
    LIMIT 100
  `).map(l => ({
    id: l.id,
    sellerId: l.seller_id,
    seller: l.seller_name,
    item: l.item,
    quantity: Number(l.quantity),
    price: Number(l.price),
    createdAt: Number(l.created_at),
    mine: l.seller_id === userId
  }));

  return {
    player,
    friends,
    incoming,
    outgoing,
    clan,
    listings
  };
}

async function handleApi(req, res, url) {
  const route = url.pathname;

  // KAYIT
  if (req.method === 'POST' && route === '/api/register') {
    const body = await readBody(req);
    const username = cleanName(body.username);
    const password = String(body.password || '');

    if (!validName(username)) {
      return json(res, 400, {
        error: 'Oyuncu adı 3–18 karakter olmalı.'
      });
    }

    if (password.length < 8 || password.length > 128) {
      return json(res, 400, {
        error: 'Parola 8–128 karakter olmalı.'
      });
    }

    const key = normalizedName(username);

    if (one('SELECT id FROM users WHERE username_key=?', [key])) {
      return json(res, 409, {
        error: 'Bu oyuncu adı zaten kullanılıyor.'
      });
    }

    const id = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await passwordHash(password, salt);
    const now = Date.now();

    run(`
      INSERT INTO users
      (id,username,username_key,password_hash,password_salt,
       x,y,wood,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)
    `, [id, username, key, hash, salt, 1200, 900, 0, now, now]);

    persist();

    const token = createSession(id);

    return json(res, 201, {
      token,
      player: playerRow(id)
    });
  }

  // GİRİŞ
  if (req.method === 'POST' && route === '/api/login') {
    const body = await readBody(req);
    const username = cleanName(body.username);
    const password = String(body.password || '');

    const user = one(`
      SELECT id,password_hash,password_salt
      FROM users WHERE username_key=?
    `, [normalizedName(username)]);

    if (!user || password.length > 128) {
      return json(res, 401, {
        error: 'Oyuncu adı veya parola yanlış.'
      });
    }

    const hash = await passwordHash(password, user.password_salt);
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(user.password_hash, 'hex');

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return json(res, 401, {
        error: 'Oyuncu adı veya parola yanlış.'
      });
    }

    const token = createSession(user.id);

    return json(res, 200, {
      token,
      player: playerRow(user.id)
    });
  }

  // HESAP BİLGİSİ
  if (req.method === 'GET' && route === '/api/me') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const player = playerRow(auth.userId);

    if (!player) {
      return json(res, 401, { error: 'Hesap bulunamadı.' });
    }

    return json(res, 200, { player });
  }

  // ÇIKIŞ
  if (req.method === 'POST' && route === '/api/logout') {
    const auth = authFromRequest(req);

    if (auth) {
      sessions.delete(auth.hash);
      run('DELETE FROM sessions WHERE token_hash=?', [auth.hash]);
      persist();
    }

    return json(res, 200, { ok: true });
  }

  // TÜM SOSYAL VERİLER
  if (req.method === 'GET' && route === '/api/social') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    return json(res, 200, socialData(auth.userId));
  }

  // ARKADAŞLIK İSTEĞİ GÖNDER
  if (req.method === 'POST' && route === '/api/friends/request') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const body = await readBody(req);
    const targetName = cleanName(body.username);

    if (!targetName || targetName.length > 18) {
      return json(res, 400, {
        error: 'Geçerli bir oyuncu adı yaz.'
      });
    }

    const target = one(
      'SELECT id,username FROM users WHERE username_key=?',
      [normalizedName(targetName)]
    );

    if (!target) {
      return json(res, 404, {
        error: 'Bu oyuncu bulunamadı.'
      });
    }

    if (target.id === auth.userId) {
      return json(res, 400, {
        error: 'Kendine arkadaşlık isteği gönderemezsin.'
      });
    }

    const existing = one(`
      SELECT id,status FROM friend_requests
      WHERE (requester_id=? AND target_id=?)
         OR (requester_id=? AND target_id=?)
    `, [auth.userId, target.id, target.id, auth.userId]);

    if (existing && existing.status === 'accepted') {
      return json(res, 409, {
        error: 'Bu oyuncu zaten arkadaşın.'
      });
    }

    if (existing && existing.status === 'pending') {
      // Karşı tarafın bekleyen isteği varsa kabul ederek
      // iki tarafı da arkadaş yap.
      const inverse = one(`
        SELECT id FROM friend_requests
        WHERE requester_id=? AND target_id=? AND status='pending'
      `, [target.id, auth.userId]);

      if (inverse) {
        run(
          "UPDATE friend_requests SET status='accepted' WHERE id=?",
          [inverse.id]
        );
        persist();

        return json(res, 200, {
          ok: true,
          message: 'Karşılıklı istekler kabul edildi.'
        });
      }

      return json(res, 409, {
        error: 'Bu oyuncuya zaten istek gönderilmiş.'
      });
    }

    run(`
      INSERT INTO friend_requests
      (id,requester_id,target_id,status,created_at)
      VALUES(?,?,?,'pending',?)
    `, [
      crypto.randomUUID(),
      auth.userId,
      target.id,
      Date.now()
    ]);

    persist();

    notifyPlayer(target.id, {
      type: 'notice',
      text: 'Yeni bir arkadaşlık isteğin var.'
    });

    return json(res, 201, {
      ok: true,
      message: 'Arkadaşlık isteği gönderildi.'
    });
  }

  // ARKADAŞLIK İSTEĞİNİ KABUL ET / REDDET
  if (req.method === 'POST' && route === '/api/friends/respond') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const body = await readBody(req);
    const requestId = String(body.requestId || '');
    const accept = body.accept === true;

    const request = one(`
      SELECT id,requester_id,target_id,status
      FROM friend_requests
      WHERE id=? AND target_id=? AND status='pending'
    `, [requestId, auth.userId]);

    if (!request) {
      return json(res, 404, {
        error: 'Bekleyen istek bulunamadı.'
      });
    }

    if (accept) {
      run(
        "UPDATE friend_requests SET status='accepted' WHERE id=?",
        [request.id]
      );
    } else {
      run('DELETE FROM friend_requests WHERE id=?', [request.id]);
    }

    persist();

    return json(res, 200, {
      ok: true,
      message: accept ? 'Arkadaş eklendi.' : 'İstek reddedildi.'
    });
  }

  // OBA KUR
  if (req.method === 'POST' && route === '/api/clans/create') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const body = await readBody(req);
    const name = cleanName(body.name);

    if (!/^[A-Za-z0-9_ğüşöçıİĞÜŞÖÇ -]{3,24}$/.test(name)) {
      return json(res, 400, {
        error: 'Oba adı 3–24 karakter olmalı.'
      });
    }

    if (one('SELECT clan_id FROM clan_members WHERE user_id=?', [auth.userId])) {
      return json(res, 409, {
        error: 'Zaten bir obaya üyesin. Önce mevcut obandan ayrıl.'
      });
    }

    const key = normalizedName(name);

    if (one('SELECT id FROM clans WHERE name_key=?', [key])) {
      return json(res, 409, {
        error: 'Bu isimde bir oba zaten var.'
      });
    }

    const id = crypto.randomUUID();

    try {
      transaction(() => {
        run(`
          INSERT INTO clans(id,name,name_key,owner_id,created_at)
          VALUES(?,?,?,?,?)
        `, [id, name, key, auth.userId, Date.now()]);

        run(`
          INSERT INTO clan_members(clan_id,user_id,role,joined_at)
          VALUES(?,?, 'owner', ?)
        `, [id, auth.userId, Date.now()]);
      });
    } catch (e) {
      return json(res, 409, {
        error: 'Oba kurulamadı. İsmi veya üyelik durumunu kontrol et.'
      });
    }

    return json(res, 201, {
      ok: true,
      message: 'Oban kuruldu.',
      social: socialData(auth.userId)
    });
  }

  // MEVCUT OBAYA KATIL
  if (req.method === 'POST' && route === '/api/clans/join') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const body = await readBody(req);
    const name = cleanName(body.name);

    const clan = one(
      'SELECT id,name FROM clans WHERE name_key=?',
      [normalizedName(name)]
    );

    if (!clan) {
      return json(res, 404, { error: 'Oba bulunamadı.' });
    }

    if (one('SELECT clan_id FROM clan_members WHERE user_id=?', [auth.userId])) {
      return json(res, 409, {
        error: 'Zaten bir obaya üyesin.'
      });
    }

    try {
      run(`
        INSERT INTO clan_members(clan_id,user_id,role,joined_at)
        VALUES(?,?,'member',?)
      `, [clan.id, auth.userId, Date.now()]);

      persist();
    } catch {
      return json(res, 409, {
        error: 'Obaya katılınamadı.'
      });
    }

    return json(res, 200, {
      ok: true,
      message: clan.name + ' obasına katıldın.',
      social: socialData(auth.userId)
    });
  }

  // OBADAN AYRIL
  if (req.method === 'POST' && route === '/api/clans/leave') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const membership = one(`
      SELECT clan_id,role FROM clan_members WHERE user_id=?
    `, [auth.userId]);

    if (!membership) {
      return json(res, 400, {
        error: 'Herhangi bir obada değilsin.'
      });
    }

    transaction(() => {
      if (membership.role === 'owner') {
        // Oba lideri ayrılırsa oba kapatılır.
        run('DELETE FROM clan_members WHERE clan_id=?', [
          membership.clan_id
        ]);
        run('DELETE FROM clans WHERE id=?', [
          membership.clan_id
        ]);
      } else {
        run(
          'DELETE FROM clan_members WHERE clan_id=? AND user_id=?',
          [membership.clan_id, auth.userId]
        );
      }
    });

    return json(res, 200, {
      ok: true,
      message: membership.role === 'owner'
        ? 'Oba kapatıldı.'
        : 'Obadan ayrıldın.',
      social: socialData(auth.userId)
    });
  }

  // PAZARA ODUN KOY
  if (req.method === 'POST' && route === '/api/market/list') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const body = await readBody(req);
    const quantity = Number(body.quantity);
    const price = Number(body.price);

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000
    ) {
      return json(res, 400, {
        error: 'Satış miktarı 1–1000 arasında tam sayı olmalı.'
      });
    }

    if (
      !Number.isSafeInteger(price) ||
      price < 1 ||
      price > 100000
    ) {
      return json(res, 400, {
        error: 'Toplam fiyat 1–100000 altın arasında olmalı.'
      });
    }

    const seller = one(
      'SELECT wood FROM users WHERE id=?',
      [auth.userId]
    );

    if (!seller || Number(seller.wood) < quantity) {
      return json(res, 400, {
        error: 'Yeterli odunun yok.'
      });
    }

    const id = crypto.randomUUID();

    try {
      transaction(() => {
        const current = one(
          'SELECT wood FROM users WHERE id=?',
          [auth.userId]
        );

        if (!current || Number(current.wood) < quantity) {
          throw new Error('Yeterli odunun yok.');
        }

        run(
          'UPDATE users SET wood=wood-?,updated_at=? WHERE id=?',
          [quantity, Date.now(), auth.userId]
        );

        run(`
          INSERT INTO market_listings
          (id,seller_id,item,quantity,price,created_at)
          VALUES(?,?,'wood',?,?,?)
        `, [id, auth.userId, quantity, price, Date.now()]);
      });
    } catch (e) {
      return json(res, 400, {
        error: e.message || 'İlan oluşturulamadı.'
      });
    }

    updateOnlinePlayer(auth.userId);

    return json(res, 201, {
      ok: true,
      message: 'Odun pazara konuldu.',
      social: socialData(auth.userId)
    });
  }

  // PAZARDAN ODUN SATIN AL
  if (req.method === 'POST' && route === '/api/market/buy') {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const body = await readBody(req);
    const listingId = String(body.listingId || '');

    let purchased = null;

    try {
      transaction(() => {
        const listing = one(`
          SELECT id,seller_id,item,quantity,price
          FROM market_listings WHERE id=?
        `, [listingId]);

        if (!listing) {
          throw new Error('Bu ilan artık mevcut değil.');
        }

        if (listing.seller_id === auth.userId) {
          throw new Error('Kendi ilanını satın alamazsın.');
        }

        if (listing.item !== 'wood') {
          throw new Error('Bu ürün desteklenmiyor.');
        }

        const buyer = one(
          'SELECT coins FROM users WHERE id=?',
          [auth.userId]
        );

        if (!buyer) {
          throw new Error('Alıcı hesabı bulunamadı.');
        }

        const price = Number(listing.price);
        const quantity = Number(listing.quantity);

        if (Number(buyer.coins) < price) {
          throw new Error('Yeterli altının yok.');
        }

        const seller = one(
          'SELECT id FROM users WHERE id=?',
          [listing.seller_id]
        );

        if (!seller) {
          throw new Error('Satıcı hesabı bulunamadı.');
        }

        run(`
          UPDATE users
          SET coins=coins-?,wood=wood+?,updated_at=?
          WHERE id=?
        `, [price, quantity, Date.now(), auth.userId]);

        run(`
          UPDATE users
          SET coins=coins+?,updated_at=?
          WHERE id=?
        `, [price, Date.now(), listing.seller_id]);

        run('DELETE FROM market_listings WHERE id=?', [listing.id]);

        purchased = {
          sellerId: listing.seller_id,
          quantity,
          price
        };
      });
    } catch (e) {
      return json(res, 400, {
        error: e.message || 'Satın alma başarısız.'
      });
    }

    updateOnlinePlayer(auth.userId);
    updateOnlinePlayer(purchased.sellerId);

    notifyPlayer(purchased.sellerId, {
      type: 'notice',
      text: 'Pazardaki odun ilanından satış yapıldı.'
    });

    return json(res, 200, {
      ok: true,
      message: purchased.quantity + ' odun satın aldın.',
      social: socialData(auth.userId)
    });
  }

  return json(res, 404, {
    error: 'API adresi bulunamadı.'
  });
}

function serveStatic(req, res, url) {
  let pathname;

  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end('Geçersiz adres.');
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  const file = path.resolve(ROOT, '.' + pathname);

  if (
    !file.startsWith(ROOT + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  ) {
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8'
    });
    res.end('Dosya bulunamadı.');
    return;
  }

  const ext = path.extname(file);

  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  res.writeHead(200, {
    'Content-Type': types[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  });

  fs.createReadStream(file).pipe(res);
}

async function main() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys=ON');

  run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_key TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      x REAL NOT NULL DEFAULT 1200,
      y REAL NOT NULL DEFAULT 900,
      wood INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Eski hesapları silmeden para sütununu ekle.
  const userColumns = rows('PRAGMA table_info(users)');
  if (!userColumns.some(c => c.name === 'coins')) {
    run('ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 100');
  }

  run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS trees (
      id TEXT PRIMARY KEY,
      x REAL NOT NULL,
      y REAL NOT NULL,
      wood INTEGER NOT NULL
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS tents (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      x REAL NOT NULL,
      y REAL NOT NULL
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      UNIQUE(requester_id,target_id)
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS clans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      owner_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS clan_members (
      clan_id TEXT NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER NOT NULL,
      PRIMARY KEY(clan_id,user_id)
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS market_listings (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      item TEXT NOT NULL DEFAULT 'wood',
      quantity INTEGER NOT NULL,
      price INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  run('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');
  run('CREATE INDEX IF NOT EXISTS idx_friends_target ON friend_requests(target_id,status)');
  run('CREATE INDEX IF NOT EXISTS idx_market_created ON market_listings(created_at)');

  const now = Date.now();

  rows('SELECT token_hash,user_id,expires_at FROM sessions').forEach(s => {
    if (Number(s.expires_at) > now) {
      sessions.set(s.token_hash, {
        userId: s.user_id,
        expiresAt: Number(s.expires_at)
      });
    } else {
      run('DELETE FROM sessions WHERE token_hash=?', [s.token_hash]);
    }
  });

  persist();
  loadWorld();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname.startsWith('/api/')) {
      try {
        await handleApi(req, res, url);
      } catch (e) {
        console.error('API error:', e);

        if (!res.headersSent) {
          json(res, 400, {
            error: e.message === 'İstek çok büyük.'
              ? e.message
              : 'İstek işlenemedi.'
          });
        }
      }

      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    serveStatic(req, res, url);
  });

  wss = new WebSocket.Server({
    server,
    maxPayload: 8192
  });

  function broadcast(obj) {
    for (const client of wss.clients) {
      if (client.userId) send(client, obj);
    }
  }

  function broadcastState() {
    for (const client of wss.clients) {
      if (client.userId) {
        const p = players.get(client.userId);

        send(client, {
          type: 'state',
          players: publicPlayers(),
          trees: publicTrees(),
          tents: publicTents(),
          me: p || null
        });
      }
    }
  }

  wss.on('connection', ws => {
    ws.userId = null;
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', raw => {
      let m;

      try {
        m = JSON.parse(raw.toString());
      } catch {
        return send(ws, {
          type: 'error',
          message: 'Geçersiz mesaj.'
        });
      }

      if (!ws.userId) {
        if (m.type !== 'auth') {
          return send(ws, {
            type: 'error',
            message: 'Önce giriş yapmalısın.'
          });
        }

        const auth = resolveToken(m.token);

        if (!auth) {
          send(ws, {
            type: 'error',
            message: 'Oturum geçersiz. Yeniden giriş yap.'
          });
          ws.close();
          return;
        }

        const p = playerRow(auth.userId);

        if (!p) {
          ws.close();
          return;
        }

        if (players.size >= MAX_PLAYERS && !players.has(p.id)) {
          send(ws, {
            type: 'error',
            message: 'Kamp dolu, daha sonra tekrar dene.'
          });
          ws.close();
          return;
        }

        ws.userId = p.id;

        const previous = sockets.get(p.id);
        if (previous && previous !== ws) {
          try { previous.close(); } catch {}
        }

        sockets.set(p.id, ws);
        players.set(p.id, p);

        send(ws, {
          type: 'init',
          me: p,
          players: publicPlayers(),
          trees: publicTrees(),
          tents: publicTents(),
          world: WORLD
        });

        broadcastState();
        return;
      }

      const p = players.get(ws.userId);
      if (!p) return;

      if (m.type === 'move') {
        const dx = Math.max(-1, Math.min(1, Number(m.dx) || 0));
        const dy = Math.max(-1, Math.min(1, Number(m.dy) || 0));

        moveInputs.set(p.id, {
          dx,
          dy,
          at: Date.now()
        });
      } else if (m.type === 'chat') {
        const text = String(m.text || '').trim().slice(0, 240);
        if (!text) return;

        const now = Date.now();
        if (now - (p.lastChat || 0) < 900) return;
        p.lastChat = now;

        broadcast({
          type: 'chat',
          username: p.username,
          text
        });
      } else if (m.type === 'gather') {
        const now = Date.now();
        if (now - (p.lastGather || 0) < 500) return;
        p.lastGather = now;

        const tree = trees
          .filter(t => t.wood > 0)
          .sort((a, b) =>
            Math.hypot(a.x - p.x, a.y - p.y) -
            Math.hypot(b.x - p.x, b.y - p.y)
          )[0];

        if (!tree || Math.hypot(tree.x - p.x, tree.y - p.y) > 75) {
          send(ws, {
            type: 'notice',
            text: 'Odun toplamak için bir ağaca yaklaş.'
          });
          return;
        }

        tree.wood--;
        p.wood++;

        run('UPDATE trees SET wood=? WHERE id=?', [tree.wood, tree.id]);
        savePlayer(p);
        persist();

        send(ws, {
          type: 'notice',
          text: '1 odun topladın.'
        });

        broadcastState();
      } else if (m.type === 'tent') {
        if (p.wood < 5) {
          send(ws, {
            type: 'notice',
            text: 'Çadır kurmak için 5 odun gerekli.'
          });
          return;
        }

        p.wood -= 5;

        const t = {
          id: crypto.randomUUID(),
          ownerId: p.id,
          x: p.x,
          y: p.y
        };

        tents.push(t);

        run(
          'INSERT INTO tents(id,owner_id,x,y) VALUES(?,?,?,?)',
          [t.id, t.ownerId, t.x, t.y]
        );

        savePlayer(p);
        persist();

        send(ws, {
          type: 'notice',
          text: 'Çadırın kuruldu! 5 odun harcandı.'
        });

        broadcastState();
      }
    });

    ws.on('close', () => {
      if (ws.userId && sockets.get(ws.userId) === ws) {
        const p = players.get(ws.userId);

        if (p) {
          savePlayer(p);
          persist();
        }

        sockets.delete(ws.userId);
        players.delete(ws.userId);
        moveInputs.delete(ws.userId);
        broadcastState();
      }
    });
  });

  setInterval(() => {
    const dt = 0.05;

    for (const [id, p] of players) {
      const input = moveInputs.get(id);

      if (input && Date.now() - input.at < 250) {
        const speed = 190;
        const len = Math.hypot(input.dx, input.dy) || 1;

        p.x = Math.max(
          25,
          Math.min(WORLD.width - 25, p.x + input.dx / len * speed * dt)
        );

        p.y = Math.max(
          25,
          Math.min(WORLD.height - 25, p.y + input.dy / len * speed * dt)
        );
      }
    }

    if (Date.now() % 1000 < 55) {
      for (const p of players.values()) savePlayer(p);
    }

    broadcastState();
  }, 50);

  setInterval(() => {
    try {
      persist();
    } catch (e) {
      console.error('DB save error', e);
    }
  }, 5000);

  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }

      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  server.listen(PORT, HOST, () => {
    console.log(`Çadırcılar hazır: http://127.0.0.1:${PORT}`);
  });
}

main().catch(err => {
  console.error('Sunucu başlatılamadı:', err);
  process.exit(1);
});

   