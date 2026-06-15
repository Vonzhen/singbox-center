/**
 * src/server.js
 * Alpine/Node 本地 Express 服务入口。
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import { generateConfig, getTemplate, getTemplateCacheStatus, testSubscription, validateTemplate } from './engine.js';
import { renderHTML } from './html.js';
import * as db from './db.js';

const app = express();
const env = db.envLocal;

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

function jsonResponse(res, data, status = 200, extraHeaders = {}) {
  Object.entries(extraHeaders).forEach(([key, value]) => res.setHeader(key, value));
  return res.status(status).json(data);
}

function withSecretConfig(globalConfig) {
  const { GITHUB_TOKEN: _ignored, ...safeConfig } = globalConfig || {};
  return { ...safeConfig, GITHUB_TOKEN };
}

async function hashText(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getCurrentUser(req) {
  const sessionId = req.cookies.session_id;
  if (!sessionId) return null;
  const username = await db.getUserBySession(env, sessionId);
  if (!username) return null;
  const user = await db.getUser(env, username);
  return user ? { username, ...user } : null;
}

async function requireUser(req, res) {
  const user = await getCurrentUser(req);
  if (!user) {
    jsonResponse(res, { error: '未登录' }, 401);
    return null;
  }
  return user;
}

async function requireActiveUser(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.status !== 'active') {
    jsonResponse(res, { error: '账号审核中，限制访问' }, 403);
    return null;
  }
  return user;
}

async function requireOwner(req, res) {
  const user = await requireActiveUser(req, res);
  if (!user) return null;
  if (user.role !== 'owner') {
    jsonResponse(res, { error: '拒绝访问' }, 403);
    return null;
  }
  return user;
}

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderHTML());
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/api/generate', async (req, res) => {
  try {
    const clientToken = req.query.token;
    let isDebug = req.query.debug === '1';
    if (!clientToken) return res.status(401).send('Missing token');

    const user = await db.getUserByClientToken(env, clientToken);
    if (!user || user.status !== 'active') return res.status(403).send('Unauthorized or pending access');
    isDebug = isDebug && user.role === 'owner';

    const userSubLinks = await db.getUserSubLinks(env, user.username);
    const globalConfig = withSecretConfig(await db.getGlobalConfig(env));
    const response = await generateConfig(userSubLinks, globalConfig, isDebug, env);

    if (!isDebug && response.ok) {
      const configText = await response.clone().text();
      await db.saveCachedConfig(env, user.username, configText);
      await db.saveGenerationStatus(env, user.username, {
        status: 'success',
        source: 'live',
        message: '配置生成成功',
        size: configText.length
      });
    }

    if (!isDebug && !response.ok) {
      const cached = await db.getCachedConfig(env, user.username);
      if (cached) {
        await db.saveGenerationStatus(env, user.username, {
          status: 'warning',
          source: 'cache',
          message: '生成失败，已返回最近一次成功配置',
          size: cached.length
        });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('X-Config-Cache', 'HIT');
        return res.status(200).send(cached);
      }

      const errorBody = await response.clone().json().catch(() => ({}));
      await db.saveGenerationStatus(env, user.username, {
        status: 'error',
        source: 'live',
        message: errorBody.error || '配置生成失败',
        size: 0
      });
    }

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.send(await response.text());
  } catch (e) {
    res.status(500).json({ error: 'Server Gateway Error', details: e.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return jsonResponse(res, { error: '参数不完整' }, 400);

  const existingUser = await db.getUser(env, username);
  if (existingUser) return jsonResponse(res, { error: '用户已存在' }, 400);

  const allUsers = await db.listAllUsers(env);
  const isFirstUser = allUsers.length === 0;
  const newUser = {
    password_hash: await db.hashPassword(password),
    role: isFirstUser ? 'owner' : 'member',
    status: isFirstUser ? 'active' : 'pending',
    client_token: null,
    created_at: new Date().toISOString(),
    token_updated_at: null
  };

  if (isFirstUser) {
    newUser.client_token = db.generateToken();
    newUser.token_updated_at = new Date().toISOString();
    await db.linkTokenToUser(env, newUser.client_token, username);
  }

  await db.saveUser(env, username, newUser);
  jsonResponse(res, { success: true, isFirstUser });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.getUser(env, username);
  if (!user) return jsonResponse(res, { error: '用户不存在或密码错误' }, 401);

  const passwordOk = await db.verifyPassword(password, user.password_hash);
  if (!passwordOk) return jsonResponse(res, { error: '用户不存在或密码错误' }, 401);

  if (!user.password_hash.startsWith('pbkdf2$')) {
    user.password_hash = await db.hashPassword(password);
    await db.saveUser(env, username, user);
  }

  const sessionId = db.generateToken();
  await db.createSession(env, sessionId, username);
  res.cookie('session_id', sessionId, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    maxAge: 86400 * 1000,
    sameSite: 'strict',
    path: '/'
  });
  jsonResponse(res, { success: true, role: user.role, status: user.status });
});

app.post('/api/auth/logout', async (req, res) => {
  if (req.cookies.session_id) await db.deleteSession(env, req.cookies.session_id);
  res.clearCookie('session_id', { path: '/' });
  jsonResponse(res, { success: true });
});

app.get('/api/me', async (req, res) => {
  const currentUser = await requireUser(req, res);
  if (!currentUser) return;
  jsonResponse(res, {
    username: currentUser.username,
    role: currentUser.role,
    status: currentUser.status,
    client_token: currentUser.client_token
  });
});

app.post('/api/auth/reset_token', async (req, res) => {
  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  const oldToken = currentUser.client_token;
  const newToken = db.generateToken();
  if (oldToken) await env.DB.delete(`token:${oldToken}`);

  const { username, ...userData } = currentUser;
  userData.client_token = newToken;
  userData.token_updated_at = new Date().toISOString();
  await db.saveUser(env, username, userData);
  await db.linkTokenToUser(env, newToken, username);
  jsonResponse(res, { success: true, client_token: newToken });
});

app.get('/api/dashboard', async (req, res) => {
  const currentUser = await requireActiveUser(req, res);
  if (!currentUser) return;

  const subLinks = await db.getUserSubLinks(env, currentUser.username);
  const enabledSubs = subLinks.filter(s => s.enabled && s.url);
  const cacheData = await db.getCachedConfigWithMetadata(env, currentUser.username);
  const generationStatus = await db.getGenerationStatus(env, currentUser.username);
  let templateStatus = null;
  let pendingUsers = 0;
  let totalUsers = 0;

  if (currentUser.role === 'owner') {
    const globalConfig = withSecretConfig(await db.getGlobalConfig(env));
    templateStatus = await getTemplateCacheStatus(env, globalConfig);
    const users = await db.listAllUsers(env);
    totalUsers = users.length;
    pendingUsers = users.filter(u => u.status === 'pending').length;
  }

  jsonResponse(res, {
    user: {
      username: currentUser.username,
      role: currentUser.role,
      status: currentUser.status,
      has_client_token: !!currentUser.client_token
    },
    subscriptions: { total: subLinks.length, enabled: enabledSubs.length },
    cache: {
      has_config: !!cacheData.value,
      updated_at: cacheData.metadata?.updated_at || null,
      size: cacheData.value ? cacheData.value.length : 0
    },
    generation: generationStatus,
    template: templateStatus,
    admin: currentUser.role === 'owner' ? { total_users: totalUsers, pending_users: pendingUsers } : null
  });
});

app.get('/api/settings', async (req, res) => {
  const currentUser = await requireActiveUser(req, res);
  if (!currentUser) return;

  const sub_links = await db.getUserSubLinks(env, currentUser.username);
  let responseData = { sub_links };
  if (currentUser.role === 'owner') {
    const globalConfig = await db.getGlobalConfig(env);
    const { GITHUB_TOKEN: _ignored, ...safeGlobalConfig } = globalConfig;
    responseData = { ...responseData, ...safeGlobalConfig };
  }
  jsonResponse(res, responseData);
});

app.post('/api/settings', async (req, res) => {
  const currentUser = await requireActiveUser(req, res);
  if (!currentUser) return;

  if (req.body.sub_links) await db.saveUserSubLinks(env, currentUser.username, req.body.sub_links);

  if (currentUser.role === 'owner') {
    const {
      REGION_KEYWORDS, BANNED_KEYWORDS, URLTEST_PARAMS, TEMPLATE_JSON,
      GITHUB_USER, GITHUB_REPO, GITHUB_BRANCH, TEMPLATE_MODE
    } = req.body;
    const currentGlobal = await db.getGlobalConfig(env);
    await db.saveGlobalConfig(env, {
      REGION_KEYWORDS: REGION_KEYWORDS || currentGlobal.REGION_KEYWORDS,
      BANNED_KEYWORDS: BANNED_KEYWORDS || currentGlobal.BANNED_KEYWORDS,
      URLTEST_PARAMS: URLTEST_PARAMS || currentGlobal.URLTEST_PARAMS,
      TEMPLATE_JSON: TEMPLATE_JSON || currentGlobal.TEMPLATE_JSON,
      TEMPLATE_MODE: TEMPLATE_MODE === 'kv' ? 'kv' : 'github',
      GITHUB_USER: GITHUB_USER !== undefined ? GITHUB_USER : currentGlobal.GITHUB_USER,
      GITHUB_REPO: GITHUB_REPO !== undefined ? GITHUB_REPO : currentGlobal.GITHUB_REPO,
      GITHUB_BRANCH: GITHUB_BRANCH !== undefined ? GITHUB_BRANCH : currentGlobal.GITHUB_BRANCH
    });
  }
  jsonResponse(res, { success: true });
});

app.get('/api/template/status', async (req, res) => {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  const globalConfig = withSecretConfig(await db.getGlobalConfig(env));
  jsonResponse(res, await getTemplateCacheStatus(env, globalConfig));
});

app.post('/api/template/check', async (req, res) => {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  const result = await getTemplate(env, withSecretConfig(await db.getGlobalConfig(env)), { forceRefresh: false });
  jsonResponse(res, result.status, result.status.ok ? 200 : 500);
});

app.post('/api/template/refresh', async (req, res) => {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  const result = await getTemplate(env, withSecretConfig(await db.getGlobalConfig(env)), { forceRefresh: true });
  jsonResponse(res, result.status, result.status.ok ? 200 : 500);
});

app.post('/api/template/import_builtin', async (req, res) => {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  const globalConfig = withSecretConfig(await db.getGlobalConfig(env));
  const result = await getTemplate(env, { ...globalConfig, TEMPLATE_MODE: 'github' }, { forceRefresh: false });
  if (!result.status.ok || !result.config) return jsonResponse(res, { error: result.status.message || 'GitHub 模板不可用' }, 500);

  const contentHash = await hashText(JSON.stringify(result.config));
  await db.saveBuiltinTemplate(env, {
    content: result.config,
    content_hash: contentHash,
    imported_from: result.status.source || null,
    imported_at: new Date().toISOString(),
    imported_by: currentUser.username
  });
  jsonResponse(res, { success: true, mode: 'kv', content_hash: contentHash, message: '已将当前 GitHub 模板导入为本地内置模板。' });
});

app.get('/api/template/builtin', async (req, res) => {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  const builtin = await db.getBuiltinTemplate(env);
  const backup = await db.getBuiltinTemplateBackup(env);
  jsonResponse(res, {
    exists: !!builtin?.content,
    content: builtin?.content || null,
    content_text: builtin?.content ? JSON.stringify(builtin.content, null, 2) : '',
    content_hash: builtin?.content_hash || '',
    updated_at: builtin?.updated_at || null,
    backup: backup ? {
      exists: true,
      content_hash: backup.content_hash || '',
      backed_up_at: backup.backed_up_at || null
    } : { exists: false }
  });
});

app.post('/api/template/validate_builtin', async (req, res) => {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  try {
    const parsed = JSON.parse(req.body.content_text || '');
    validateTemplate(parsed);
    jsonResponse(res, { success: true, message: '模板校验通过。' });
  } catch (e) {
    jsonResponse(res, { success: false, error: e.message }, 400);
  }
});

app.post('/api/template/save_builtin', async (req, res) => {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  try {
    const parsed = JSON.parse(req.body.content_text || '');
    validateTemplate(parsed);
    const current = await db.getBuiltinTemplate(env);
    if (current?.content) {
      await db.saveBuiltinTemplateBackup(env, {
        content: current.content,
        content_hash: current.content_hash || '',
        updated_at: current.updated_at || null,
        backed_up_by: current.updated_by || current.imported_by || ''
      });
    }
    const contentHash = await hashText(JSON.stringify(parsed));
    await db.saveBuiltinTemplate(env, {
      content: parsed,
      content_hash: contentHash,
      updated_by: currentUser.username
    });
    jsonResponse(res, { success: true, content_hash: contentHash, message: '本地内置模板已保存。' });
  } catch (e) {
    jsonResponse(res, { success: false, error: e.message }, 400);
  }
});

app.post('/api/template/rollback_builtin', async (req, res) => {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  const backup = await db.getBuiltinTemplateBackup(env);
  if (!backup?.content) return jsonResponse(res, { success: false, error: '没有可回滚的上一版模板。' }, 400);
  const current = await db.getBuiltinTemplate(env);
  if (current?.content) {
    await db.saveBuiltinTemplateBackup(env, {
      content: current.content,
      content_hash: current.content_hash || '',
      updated_at: current.updated_at || null,
      backed_up_by: current.updated_by || current.imported_by || ''
    });
  }
  await db.saveBuiltinTemplate(env, {
    content: backup.content,
    content_hash: backup.content_hash || await hashText(JSON.stringify(backup.content)),
    updated_by: currentUser.username,
    rolled_back_from: backup.backed_up_at || null
  });
  jsonResponse(res, { success: true, message: '已回滚到上一版本地内置模板。' });
});

app.post('/api/subscription/test', async (req, res) => {
  const currentUser = await requireActiveUser(req, res);
  if (!currentUser) return;
  const globalConfig = withSecretConfig(await db.getGlobalConfig(env));
  jsonResponse(res, await testSubscription(req.body.subscription, globalConfig));
});

app.get('/api/admin/users', async (req, res) => {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  const users = await db.listAllUsers(env);
  const safeUsers = await Promise.all(users.map(async ({ password_hash, ...u }) => {
    const subLinks = await db.getUserSubLinks(env, u.username);
    const generation = await db.getGenerationStatus(env, u.username);
    return {
      ...u,
      sub_count: subLinks.length,
      enabled_sub_count: subLinks.filter(s => s.enabled && s.url).length,
      generation
    };
  }));
  jsonResponse(res, safeUsers);
});

app.post('/api/admin/approve', async (req, res) => {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  const { target_username } = req.body;
  const targetUser = await db.getUser(env, target_username);
  if (targetUser && targetUser.status === 'pending') {
    targetUser.status = 'active';
    targetUser.client_token = db.generateToken();
    targetUser.token_updated_at = new Date().toISOString();
    await db.saveUser(env, target_username, targetUser);
    await db.linkTokenToUser(env, targetUser.client_token, target_username);
    return jsonResponse(res, { success: true });
  }
  jsonResponse(res, { error: '用户状态异常' }, 400);
});

app.post('/api/admin/reject', async (req, res) => {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  const { target_username } = req.body;
  const targetUser = await db.getUser(env, target_username);
  if (targetUser && targetUser.status === 'pending') {
    await db.deleteUser(env, target_username);
    return jsonResponse(res, { success: true });
  }
  jsonResponse(res, { error: '用户状态异常' }, 400);
});

app.post('/api/admin/disable', async (req, res) => {
  await updateUserStatus(req, res, 'disabled');
});

app.post('/api/admin/enable', async (req, res) => {
  await updateUserStatus(req, res, 'active');
});

async function updateUserStatus(req, res, status) {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  const { target_username } = req.body;
  if (target_username === currentUser.username) return jsonResponse(res, { error: '不能操作当前登录的 owner 账号' }, 400);
  const targetUser = await db.getUser(env, target_username);
  if (!targetUser) return jsonResponse(res, { error: '用户不存在' }, 404);
  targetUser.status = status;
  await db.saveUser(env, target_username, targetUser);
  jsonResponse(res, { success: true });
}

app.post('/api/admin/reset_token', async (req, res) => {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  const { target_username } = req.body;
  const targetUser = await db.getUser(env, target_username);
  if (!targetUser) return jsonResponse(res, { error: '用户不存在' }, 404);
  if (targetUser.client_token) await env.DB.delete(`token:${targetUser.client_token}`);
  targetUser.client_token = db.generateToken();
  targetUser.token_updated_at = new Date().toISOString();
  await db.saveUser(env, target_username, targetUser);
  await db.linkTokenToUser(env, targetUser.client_token, target_username);
  jsonResponse(res, { success: true, client_token: targetUser.client_token });
});

app.post('/api/admin/delete', async (req, res) => {
  const currentUser = await requireOwner(req, res);
  if (!currentUser) return;
  const { target_username } = req.body;
  if (target_username === currentUser.username) return jsonResponse(res, { error: '不能删除当前登录的 owner 账号' }, 400);
  const targetUser = await db.getUser(env, target_username);
  if (!targetUser) return jsonResponse(res, { error: '用户不存在' }, 404);
  await db.deleteUser(env, target_username);
  jsonResponse(res, { success: true });
});

app.listen(PORT, HOST, () => {
  console.log(`[singbox-center] listening on http://${HOST}:${PORT}`);
  console.log(`[singbox-center] sqlite db: ${process.env.DB_PATH || 'data/singbox-center.db'}`);
});
