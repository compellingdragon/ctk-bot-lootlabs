const Database = require('better-sqlite3');
const crypto = require('crypto');
const config = require('./config');

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      username TEXT,
      balance INTEGER NOT NULL DEFAULT 0,
      total_earned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS earn_sessions (
      session_id TEXT PRIMARY KEY,
      discord_id TEXT NOT NULL,
      status TEXT NOT NULL,
      token TEXT,
      lootlabs_url TEXT,
      lootlabs_short TEXT,
      postback_unique_id TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      completed_at INTEGER,
      ip_hint TEXT
    );

    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      actor_id TEXT,
      session_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lootlabs_postbacks (
      unique_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      ip TEXT,
      raw_query TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      item TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      handled_by TEXT,
      handled_at INTEGER
    );
  `);

  const sessionColumns = db.prepare(`PRAGMA table_info(earn_sessions)`).all().map(c => c.name);
  const addColumn = (name, sql) => {
    if (!sessionColumns.includes(name)) db.exec(`ALTER TABLE earn_sessions ADD COLUMN ${sql}`);
  };
  addColumn('lootlabs_url', 'lootlabs_url TEXT');
  addColumn('lootlabs_short', 'lootlabs_short TEXT');
  addColumn('postback_unique_id', 'postback_unique_id TEXT');
}

function now() {
  return Date.now();
}

function makeId(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function upsertUser(discordId, username = null) {
  const t = now();
  db.prepare(`
    INSERT INTO users(discord_id, username, balance, total_earned, created_at, updated_at)
    VALUES(?, ?, 0, 0, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET username = COALESCE(excluded.username, users.username), updated_at = excluded.updated_at
  `).run(discordId, username, t, t);
}

function getUser(discordId) {
  return db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
}

function getOrCreateUser(discordId, username = null) {
  upsertUser(discordId, username);
  return getUser(discordId);
}

function createEarnSession(discordId) {
  const sessionId = makeId(20);
  const t = now();
  const expires = t + config.sessionExpiryMinutes * 60 * 1000;
  db.prepare(`
    INSERT INTO earn_sessions(session_id, discord_id, status, created_at, expires_at)
    VALUES(?, ?, 'pending', ?, ?)
  `).run(sessionId, discordId, t, expires);
  return getSession(sessionId);
}

function getSession(sessionId) {
  return db.prepare('SELECT * FROM earn_sessions WHERE session_id = ?').get(sessionId);
}

function updateSessionLootStarted(sessionId, token, lootlabsUrl, lootlabsShort = null, ipHint = null) {
  db.prepare(`
    UPDATE earn_sessions
    SET status = 'loot_started', token = ?, lootlabs_url = ?, lootlabs_short = ?, ip_hint = COALESCE(?, ip_hint)
    WHERE session_id = ?
  `).run(token, lootlabsUrl, lootlabsShort, ipHint, sessionId);
}

function completeSessionFromPostback(sessionId, uniqueId, ip = null, rawQuery = '') {
  const t = now();
  const tx = db.transaction(() => {
    const session = getSession(sessionId);
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' };
    if (session.status === 'completed') return { ok: false, code: 'ALREADY_COMPLETED', session };
    if (session.expires_at < t) {
      markSessionExpired(sessionId);
      return { ok: false, code: 'SESSION_EXPIRED', session };
    }
    if (session.status !== 'loot_started') return { ok: false, code: 'SESSION_NOT_READY', session };

    const existing = db.prepare('SELECT * FROM lootlabs_postbacks WHERE unique_id = ?').get(uniqueId);
    if (existing) return { ok: false, code: 'DUPLICATE_POSTBACK', session };

    db.prepare(`
      INSERT INTO lootlabs_postbacks(unique_id, session_id, ip, raw_query, created_at)
      VALUES(?, ?, ?, ?, ?)
    `).run(uniqueId, sessionId, ip, rawQuery, t);

    addBalance(session.discord_id, config.rewardAmount, 'LootLabs postback earn reward', 'lootlabs', session.session_id);
    db.prepare(`
      UPDATE earn_sessions
      SET status = 'completed', completed_at = ?, postback_unique_id = ?
      WHERE session_id = ?
    `).run(t, uniqueId, sessionId);

    return { ok: true, session: getSession(sessionId), user: getUser(session.discord_id) };
  });
  return tx();
}


function markSessionCompleted(sessionId) {
  db.prepare(`UPDATE earn_sessions SET status = 'completed', completed_at = ? WHERE session_id = ?`).run(now(), sessionId);
}

function markSessionExpired(sessionId) {
  db.prepare(`UPDATE earn_sessions SET status = 'expired' WHERE session_id = ? AND status != 'completed'`).run(sessionId);
}

function getLastCompletedEarn(discordId) {
  return db.prepare(`
    SELECT * FROM earn_sessions
    WHERE discord_id = ? AND status = 'completed'
    ORDER BY completed_at DESC
    LIMIT 1
  `).get(discordId);
}

function getActiveSession(discordId) {
  return db.prepare(`
    SELECT * FROM earn_sessions
    WHERE discord_id = ? AND status IN ('pending', 'loot_started') AND expires_at > ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(discordId, now());
}

function addBalance(discordId, amount, reason, actorId = null, sessionId = null) {
  const t = now();
  upsertUser(discordId);
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET balance = balance + ?, total_earned = total_earned + CASE WHEN ? > 0 THEN ? ELSE 0 END, updated_at = ?
      WHERE discord_id = ?
    `).run(amount, amount, amount, t, discordId);
    db.prepare(`
      INSERT INTO ledger(discord_id, amount, reason, actor_id, session_id, created_at)
      VALUES(?, ?, ?, ?, ?, ?)
    `).run(discordId, amount, reason, actorId, sessionId, t);
  });
  tx();
  return getUser(discordId);
}

function setBalance(discordId, balance, reason, actorId) {
  const user = getOrCreateUser(discordId);
  const diff = balance - user.balance;
  return addBalance(discordId, diff, reason, actorId, null);
}

function removeBalance(discordId, amount, reason, actorId = null) {
  const user = getOrCreateUser(discordId);
  const finalAmount = Math.min(amount, user.balance);
  return addBalance(discordId, -finalAmount, reason, actorId, null);
}

function createRedemption(discordId, amount, item) {
  const user = getOrCreateUser(discordId);
  if (user.balance < amount) return { ok: false, error: 'INSUFFICIENT_BALANCE', user };
  const t = now();
  const tx = db.transaction(() => {
    addBalance(discordId, -amount, `Redeem request: ${item}`, discordId, null);
    db.prepare(`
      INSERT INTO redemptions(discord_id, amount, item, status, created_at)
      VALUES(?, ?, ?, 'pending', ?)
    `).run(discordId, amount, item, t);
  });
  tx();
  return { ok: true, user: getUser(discordId) };
}

function listPendingRedemptions(limit = 10) {
  return db.prepare(`
    SELECT * FROM redemptions
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT ?
  `).all(limit);
}

function topUsers(limit = 10) {
  return db.prepare(`SELECT * FROM users ORDER BY balance DESC LIMIT ?`).all(limit);
}

module.exports = {
  initDb,
  now,
  makeId,
  upsertUser,
  getUser,
  getOrCreateUser,
  createEarnSession,
  getSession,
  updateSessionLootStarted,
  completeSessionFromPostback,
  markSessionCompleted,
  markSessionExpired,
  getLastCompletedEarn,
  getActiveSession,
  addBalance,
  setBalance,
  removeBalance,
  createRedemption,
  listPendingRedemptions,
  topUsers
};
