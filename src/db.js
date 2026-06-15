/**
 * src/db.js
 * Alpine/Node 本地 SQLite 数据层。
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const dataDir = process.env.DATA_DIR || path.resolve('data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sqlitePath = process.env.DB_PATH || path.join(dataDir, 'singbox-center.db');
const sqlite = new Database(sqlitePath);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT,
    metadata TEXT,
    expire_at INTEGER,
    updated_at TEXT NOT NULL
  )
`);

for (const ddl of [
  "ALTER TABLE kv_store ADD COLUMN metadata TEXT",
  "ALTER TABLE kv_store ADD COLUMN updated_at TEXT"
]) {
  try { sqlite.exec(ddl); } catch (e) {}
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const DB_SHIM = {
  async get(key, options = {}) {
    const row = sqlite.prepare('SELECT value, expire_at FROM kv_store WHERE key = ?').get(key);
    if (!row) return null;
    if (row.expire_at && Date.now() > row.expire_at) {
      sqlite.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
      return null;
    }
    if (options.type === 'json') return row.value ? JSON.parse(row.value) : null;
    return row.value;
  },

  async getWithMetadata(key, options = {}) {
    const row = sqlite.prepare('SELECT value, metadata, expire_at FROM kv_store WHERE key = ?').get(key);
    if (!row) return { value: null, metadata: null };
    if (row.expire_at && Date.now() > row.expire_at) {
      sqlite.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
      return { value: null, metadata: null };
    }
    const value = options.type === 'json' && row.value ? JSON.parse(row.value) : row.value;
    const metadata = row.metadata ? JSON.parse(row.metadata) : null;
    return { value, metadata };
  },

  async put(key, value, options = {}) {
    const expireAt = options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null;
    const metadata = options.metadata ? JSON.stringify(options.metadata) : null;
    sqlite.prepare(`
      INSERT INTO kv_store (key, value, metadata, expire_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        metadata = excluded.metadata,
        expire_at = excluded.expire_at,
        updated_at = excluded.updated_at
    `).run(key, normalizeValue(value), metadata, expireAt, nowIso());
  },

  async delete(key) {
    sqlite.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
  },

  async list(options = {}) {
    const prefix = options.prefix || '';
    const rows = sqlite.prepare('SELECT key FROM kv_store WHERE key LIKE ? ORDER BY key').all(`${prefix}%`);
    return { keys: rows.map(row => ({ name: row.key })) };
  }
};

export const envLocal = { DB: DB_SHIM };

function sha256(password) {
  return createHash('sha256').update(password).digest('hex');
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const iterations = 100000;
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2$${iterations}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (!storedHash.startsWith('pbkdf2$')) return sha256(password) === storedHash;

  const [, iterationsRaw, saltHex, hashHex] = storedHash.split('$');
  const iterations = Number(iterationsRaw);
  if (!iterations || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const actual = pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), iterations, expected.length, 'sha256');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function generateToken() {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').substring(0, 16);
}

export async function getUser(env, username) {
  return await env.DB.get(`user:${username}`, { type: 'json' });
}

export async function saveUser(env, username, userData) {
  await env.DB.put(`user:${username}`, JSON.stringify(userData));
}

export async function deleteUser(env, username) {
  const user = await getUser(env, username);
  if (user?.client_token) await env.DB.delete(`token:${user.client_token}`);
  await env.DB.delete(`user:${username}`);
  await env.DB.delete(`data:${username}:sub_links`);
  await env.DB.delete(`cache:${username}:config`);
  await env.DB.delete(`status:${username}:generation`);
}

export async function createSession(env, sessionId, username) {
  await env.DB.put(`session:${sessionId}`, username, { expirationTtl: 86400 });
}

export async function getUserBySession(env, sessionId) {
  return await env.DB.get(`session:${sessionId}`);
}

export async function deleteSession(env, sessionId) {
  await env.DB.delete(`session:${sessionId}`);
}

export async function linkTokenToUser(env, token, username) {
  await env.DB.put(`token:${token}`, username);
}

export async function getUserByClientToken(env, token) {
  const username = await env.DB.get(`token:${token}`);
  if (!username) return null;
  const user = await getUser(env, username);
  return user ? { username, ...user } : null;
}

export async function listAllUsers(env) {
  const value = await env.DB.list({ prefix: 'user:' });
  const users = [];
  for (const key of value.keys) {
    const userData = await env.DB.get(key.name, { type: 'json' });
    users.push({ username: key.name.replace('user:', ''), ...userData });
  }
  return users;
}

export async function getUserSubLinks(env, username) {
  return await env.DB.get(`data:${username}:sub_links`, { type: 'json' }) || [];
}

export async function saveUserSubLinks(env, username, subLinks) {
  await env.DB.put(`data:${username}:sub_links`, JSON.stringify(subLinks));
}

export async function getCachedConfig(env, username) {
  return await env.DB.get(`cache:${username}:config`);
}

export async function getCachedConfigWithMetadata(env, username) {
  return await env.DB.getWithMetadata(`cache:${username}:config`);
}

export async function saveCachedConfig(env, username, configText) {
  await env.DB.put(`cache:${username}:config`, configText, {
    metadata: { updated_at: nowIso() }
  });
}

export async function getGenerationStatus(env, username) {
  return await env.DB.get(`status:${username}:generation`, { type: 'json' });
}

export async function saveGenerationStatus(env, username, statusData) {
  await env.DB.put(`status:${username}:generation`, JSON.stringify({
    ...statusData,
    updated_at: nowIso()
  }));
}

export async function getTemplateCache(env) {
  return await env.DB.get('global:template_cache', { type: 'json' });
}

export async function saveTemplateCache(env, cacheData) {
  await env.DB.put('global:template_cache', JSON.stringify({
    ...cacheData,
    fetched_at: nowIso()
  }));
}

export async function getBuiltinTemplate(env) {
  return await env.DB.get('global:template_builtin', { type: 'json' });
}

export async function saveBuiltinTemplate(env, templateData) {
  await env.DB.put('global:template_builtin', JSON.stringify({
    ...templateData,
    updated_at: nowIso()
  }));
}

export async function getBuiltinTemplateBackup(env) {
  return await env.DB.get('global:template_builtin_backup', { type: 'json' });
}

export async function saveBuiltinTemplateBackup(env, templateData) {
  await env.DB.put('global:template_builtin_backup', JSON.stringify({
    ...templateData,
    backed_up_at: nowIso()
  }));
}

export async function getGlobalConfig(env) {
  const config = await env.DB.get('global:config', { type: 'json' });
  if (!config) {
    return {
      REGION_KEYWORDS: { HK: ['HK', '香港'], TW: ['TW', '台湾'], SG: ['SG', '新加坡'], JP: ['JP', '日本'], US: ['US', '美国'] },
      BANNED_KEYWORDS: '过期|剩余|网址|官网|流量|到期|重置|有效|套餐|群组|通知|地址|购买|维护',
      URLTEST_PARAMS: { url: 'https://www.gstatic.com/generate_204', interval: '3m', tolerance: 150 },
      TEMPLATE_MODE: 'github',
      TEMPLATE_JSON: {},
      GITHUB_USER: '',
      GITHUB_REPO: '',
      GITHUB_BRANCH: 'master'
    };
  }
  return config;
}

export async function saveGlobalConfig(env, config) {
  await env.DB.put('global:config', JSON.stringify(config));
}
