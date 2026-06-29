/**
 * src/engine.js
 * 纯正意图驱动版：保留区域二维隔离、加入授权控制网闸，执行 x_rule 注入
 */

import * as db from './db.js';

function parseRule(ruleStr) {
  if (!ruleStr) return null;
  const [action, detail] = ruleStr.split(':');
  const regions = detail ? detail.split(',').map(r => r.trim()) : [];
  const isDirectIncluded = action.includes('+direct');
  const baseMode = action.replace('+direct', '');
  return { mode: baseMode, regions, includeDirect: isDirectIncluded };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error(`请求超时：${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch (e) {
    return String(error);
  }
}

function createKeywordRegexp(pattern, fallback) {
  try {
    return new RegExp(pattern || fallback, "i");
  } catch (e) {
    return new RegExp(fallback, "i");
  }
}

async function sha256Text(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function getTemplateSource(globalConfig) {
  const url = String(globalConfig.TEMPLATE_REMOTE_URL || "").trim();
  if (!url) {
    throw new Error("请先在管理面板中配置远程模板地址。");
  }
  return {
    type: "remote",
    url
  };
}

function isSameTemplateSource(a, b) {
  return !!a && !!b && a.type === b.type && a.url === b.url;
}

export function validateTemplate(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("模板不是合法 JSON 对象。");
  }
  if (!Array.isArray(config.outbounds)) {
    throw new Error("模板缺少 outbounds 数组。");
  }
  const tags = new Set(config.outbounds.map(o => o?.tag).filter(Boolean));
  const missing = [];
  config.outbounds.forEach(o => {
    if (Array.isArray(o.outbounds)) {
      o.outbounds.forEach(tag => {
        if (!tags.has(tag)) missing.push(`outbound [${o.tag}] 引用了不存在的 tag: ${tag}`);
      });
    }
  });
  if (config.dns?.servers) {
    config.dns.servers.forEach(s => {
      if (s.detour && !tags.has(s.detour)) missing.push(`DNS server [${s.tag || s.server}] detour 引用了不存在的 tag: ${s.detour}`);
    });
  }
  if (config.route?.rules) {
    config.route.rules.forEach((rule, index) => {
      if (rule.outbound && !tags.has(rule.outbound)) missing.push(`route.rules[${index}] 引用了不存在的 outbound: ${rule.outbound}`);
    });
  }
  if (missing.length > 0) {
    throw new Error(missing.slice(0, 5).join("；"));
  }
  return true;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function getTemplate(env, globalConfig, options = {}) {
  if ((globalConfig.TEMPLATE_MODE || "remote") === "kv") {
    const builtin = await db.getBuiltinTemplate(env);
    if (!builtin?.content) {
      return {
        config: null,
        status: {
          ok: false,
          mode: "kv",
          from_cache: true,
          checked_at: new Date().toISOString(),
          content_hash: "",
          message: "当前模板来源为本地内置模板，但还没有导入模板。"
        }
      };
    }
    try {
      validateTemplate(builtin.content);
      return {
        config: cloneJson(builtin.content),
        status: {
          ok: true,
          mode: "kv",
          source: { type: "kv", path: "global:template_builtin" },
          from_cache: true,
          checked_at: new Date().toISOString(),
          fetched_at: builtin.updated_at || null,
          content_hash: builtin.content_hash || "",
          message: "已使用本地内置模板。"
        }
      };
    } catch (e) {
      const message = errorMessage(e);
      return {
        config: null,
        status: {
          ok: false,
          mode: "kv",
          from_cache: true,
          checked_at: new Date().toISOString(),
          content_hash: builtin.content_hash || "",
          message: `本地内置模板校验失败：${message}`
        }
      };
    }
  }

  const source = getTemplateSource(globalConfig);
  const cache = await db.getTemplateCache(env);
  const cacheMatches = isSameTemplateSource(cache?.source, source);
  const headers = { "User-Agent": "SingBox-Config-Builder" };
  if (!options.forceRefresh && cacheMatches) {
    if (cache.etag) headers["If-None-Match"] = cache.etag;
    if (cache.last_modified) headers["If-Modified-Since"] = cache.last_modified;
  }

  try {
    const res = await fetchWithTimeout(source.url, { headers }, 8000);
    if (res.status === 304 && cacheMatches && cache?.content) {
      return {
        config: cloneJson(cache.content),
        status: {
          ok: true,
          mode: "remote",
          source,
          from_cache: true,
          checked_at: new Date().toISOString(),
          fetched_at: cache.fetched_at || null,
          content_hash: cache.content_hash || "",
          message: "远程模板未变化，已使用 KV 缓存。"
        }
      };
    }
    if (!res.ok) throw new Error(`远程模板 HTTP ${res.status}`);

    const text = await res.text();
    const content = JSON.parse(text);
    validateTemplate(content);
    const contentHash = await sha256Text(text);
    const nextCache = {
      source,
      etag: res.headers.get("ETag") || "",
      last_modified: res.headers.get("Last-Modified") || "",
      content_hash: contentHash,
      content,
      status: "ok",
      last_error: ""
    };
    await db.saveTemplateCache(env, nextCache);

    return {
      config: cloneJson(content),
      status: {
        ok: true,
        mode: "remote",
        source,
        from_cache: false,
        checked_at: new Date().toISOString(),
        fetched_at: new Date().toISOString(),
        content_hash: contentHash,
        message: cacheMatches && cache?.content_hash === contentHash ? "远程模板内容未变化，缓存时间已刷新。" : "远程模板已拉取并写入 KV 缓存。"
      }
    };
  } catch (e) {
    const message = errorMessage(e);
    if (cacheMatches && cache?.content) {
      return {
        config: cloneJson(cache.content),
        status: {
          ok: true,
          mode: "remote",
          source,
          from_cache: true,
          stale: true,
          checked_at: new Date().toISOString(),
          fetched_at: cache.fetched_at || null,
          content_hash: cache.content_hash || "",
          message: `远程模板检查失败，已使用 KV 旧缓存：${message}`
        }
      };
    }
    return {
      config: null,
      status: {
        ok: false,
        mode: "remote",
        source,
        from_cache: false,
        checked_at: new Date().toISOString(),
        fetched_at: cache?.fetched_at || null,
        content_hash: cache?.content_hash || "",
        message: `远程模板不可用：${message}`
      }
    };
  }
}

export async function getTemplateCacheStatus(env, globalConfig) {
  if ((globalConfig.TEMPLATE_MODE || "remote") === "kv") {
    const builtin = await db.getBuiltinTemplate(env);
    return {
      ok: !!builtin?.content,
      configured: !!builtin?.content,
      mode: "kv",
      source: { type: "kv", path: "global:template_builtin" },
      from_cache: true,
      fetched_at: builtin?.updated_at || null,
      content_hash: builtin?.content_hash || "",
      message: builtin?.content ? "当前使用本地内置模板。" : "当前使用本地内置模板，但还没有导入模板。"
    };
  }

  let source = null;
  try {
    source = getTemplateSource(globalConfig);
  } catch (e) {
    return { ok: false, configured: false, message: errorMessage(e) };
  }
  const cache = await db.getTemplateCache(env);
  const cacheMatches = isSameTemplateSource(cache?.source, source);
  return {
    ok: !!(cacheMatches && cache?.content),
    configured: true,
    mode: "remote",
    source,
    from_cache: !!(cacheMatches && cache?.content),
    fetched_at: cacheMatches ? cache.fetched_at || null : null,
    content_hash: cacheMatches ? cache.content_hash || "" : "",
    message: cacheMatches && cache?.content ? "KV 中已有当前模板缓存。" : "KV 中还没有当前模板缓存。"
  };
}

function validateReferences(config) {
  const validTags = new Set();
  if (Array.isArray(config.outbounds)) {
    config.outbounds.forEach(o => validTags.add(o.tag));
  }
  if (!Array.isArray(config.outbounds)) return;
  config.outbounds.forEach(o => {
    if (Array.isArray(o.outbounds)) {
      o.outbounds = o.outbounds.filter(tag => {
        const isValid = validTags.has(tag);
        if (!isValid) console.warn(`[Validate] 剔除无效引用: [${o.tag}] -> "${tag}"`);
        return isValid;
      });
    }
  });
  if (config.dns && Array.isArray(config.dns.servers)) {
    config.dns.servers.forEach(s => {
      if (s.detour && !validTags.has(s.detour)) delete s.detour;
    });
  }
}

function normalizeNodes(data) {
  let nodes = (Array.isArray(data) ? data : (data.outbounds || []));
  return nodes.map(n => {
    if (n.tls?.utls?.fingerprint !== undefined) n.tls.utls.fingerprint = String(n.tls.utls.fingerprint);
    if (n.tls?.reality?.short_id !== undefined) n.tls.reality.short_id = String(n.tls.reality.short_id);
    return n;
  });
}

function filterRealNodes(nodes, bannedRegexp) {
  return nodes.filter(n => {
    const tag = n.tag || "";
    const isHighRate = /(?:[1-9]\.[1-9]|[2-9]\.\d+)x/i.test(tag);
    const isAds = bannedRegexp.test(tag);
    const isRealNode = n.type && !["selector", "urltest", "direct", "block", "dns"].includes(n.type);
    return !isHighRate && !isAds && isRealNode;
  });
}

function countRegions(nodes, regionKeywords, allowedRegions) {
  const regions = {};
  Object.keys(regionKeywords || {}).forEach(reg => { regions[reg] = 0; });
  let unmatched = 0;

  nodes.forEach(node => {
    const tagUpper = (node.tag || "").toUpperCase();
    const matched = Object.keys(regionKeywords || {}).some(reg => {
      if (allowedRegions && !allowedRegions.includes(reg)) return false;
      const hit = regionKeywords[reg].some(kw => tagUpper.includes(String(kw).toUpperCase()));
      if (hit) regions[reg]++;
      return hit;
    });
    if (!matched) unmatched++;
  });

  return { ...regions, unmatched };
}

export async function testSubscription(sub, globalConfig) {
  if (!sub?.url || !/^https?:\/\//i.test(sub.url)) {
    return { success: false, error: "订阅源 URL 格式不正确。" };
  }

  const startedAt = Date.now();
  const regionKeywords = globalConfig.REGION_KEYWORDS || {};
  const bannedRegexp = createKeywordRegexp(globalConfig.BANNED_KEYWORDS, "过期|剩余|网址");
  const subUrl = sub.url.includes('?') ? `${sub.url}&t=${Date.now()}` : `${sub.url}?t=${Date.now()}`;

  try {
    const res = await fetchWithTimeout(subUrl, { headers: { "User-Agent": "Mozilla/5.0 (Clash)" } }, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const rawNodes = normalizeNodes(data);
    const validNodes = filterRealNodes(rawNodes, bannedRegexp);

    return {
      success: true,
      name: sub.name || "未命名订阅",
      duration_ms: Date.now() - startedAt,
      raw_nodes: rawNodes.length,
      valid_nodes: validNodes.length,
      regions: countRegions(validNodes, regionKeywords, sub.allowed_regions),
      warnings: validNodes.length === 0 ? ["没有可用节点。"] : []
    };
  } catch (e) {
    const message = errorMessage(e);
    return {
      success: false,
      name: sub.name || "未命名订阅",
      duration_ms: Date.now() - startedAt,
      error: message
    };
  }
}

export async function generateConfig(userSubLinks, globalConfig, isDebug, env) {
  try {
    const debugLogs = [];
    const startedAt = Date.now();
    const steps = [];
    const warnings = [];
    const addStep = (name, status, message, details = {}) => {
      steps.push({ name, status, message, details });
      if (status === "warning") warnings.push(message);
    };
    const log = (msg) => { if (isDebug) { console.log(msg); debugLogs.push(msg); } };

    log("--- 启动配置生成引擎 (原版分离逻辑) ---");

    // ==========================================
    // 1. 获取远程模板
    // ==========================================
    const templateResult = await getTemplate(env, globalConfig);
    if (!templateResult.status.ok || !templateResult.config) {
      addStep("远程模板", "error", templateResult.status.message, templateResult.status);
      throw new Error(templateResult.status.message);
    }
    let config = templateResult.config;
    addStep(
      "远程模板",
      templateResult.status.stale ? "warning" : "success",
      templateResult.status.message,
      templateResult.status
    );
    log(`[远程模板] ${templateResult.status.message}`);

    // ==========================================
    // 2. 环境初始化
    // ==========================================
    const REGION_KEYWORDS = globalConfig.REGION_KEYWORDS || {};
    const FLAG_MAP = { "HK": "🇭🇰", "SG": "🇸🇬", "JP": "🇯🇵", "US": "🇺🇸", "TW": "🇹🇼" };
    const BANNED_REGEXP = createKeywordRegexp(globalConfig.BANNED_KEYWORDS, "过期|剩余|网址");
    const URLTEST_PARAMS = globalConfig.URLTEST_PARAMS || { url: "https://www.gstatic.com/generate_204", interval: "3m", tolerance: 150 };

    const activeConfigs = (userSubLinks || []).filter(p => p.enabled && p.url);
    const projectMap = new Map();
    const allRealNodes = [];
    const subReports = [];

    // ==========================================
    // 3. 并发拉取并清洗单节点数据
    // ==========================================
    await Promise.all(activeConfigs.map(async (p) => {
      try {
        const subUrl = p.url.includes('?') ? `${p.url}&t=${Date.now()}` : `${p.url}?t=${Date.now()}`;
        // 注意：移除了 cache: "no-store" 防报错
        const res = await fetchWithTimeout(subUrl, { headers: { "User-Agent": "Mozilla/5.0 (Clash)" } }, 10000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        let nodes = normalizeNodes(data);
        const rawCount = nodes.length;
        nodes = filterRealNodes(nodes, BANNED_REGEXP);

        if (nodes.length > 0) {
          // 保存节点，并绑定该机场 UI 上授权的引流区域 (兼容旧数据)
          const allowed = p.allowed_regions || Object.keys(REGION_KEYWORDS);
          projectMap.set(p.name, { nodes, allowed_regions: allowed });
          allRealNodes.push(...nodes);
          subReports.push({ name: p.name || "未命名订阅", status: "success", raw_nodes: rawCount, valid_nodes: nodes.length });
          log(`[节点加载] 机场 [${p.name}]: 加载 ${nodes.length} 个干净节点。`);
        } else {
          subReports.push({ name: p.name || "未命名订阅", status: "warning", raw_nodes: rawCount, valid_nodes: 0, error: "没有可用节点" });
        }
      } catch (e) {
        const message = errorMessage(e);
        subReports.push({ name: p.name || "未命名订阅", status: "error", raw_nodes: 0, valid_nodes: 0, error: message });
        log(`[节点加载] 机场 [${p.name}] 异常: ${message}`);
      }
    }));
    const failedSubs = subReports.filter(r => r.status === "error").length;
    addStep(
      "订阅源拉取",
      failedSubs > 0 ? "warning" : "success",
      `启用 ${activeConfigs.length} 个，成功 ${subReports.filter(r => r.status === "success").length} 个，失败 ${failedSubs} 个。`,
      { items: subReports }
    );
    addStep("节点清洗", allRealNodes.length > 0 ? "success" : "warning", `保留 ${allRealNodes.length} 个有效节点。`);

    // ==========================================
    // 4. 按机场及区域构建自动化策略组 (原汁原味二维隔离)
    // ==========================================
    const dynamicGroups = [];
    const regionalGroupsMap = {};
    Object.keys(REGION_KEYWORDS).forEach(reg => { regionalGroupsMap[reg] = []; });

    for (const [pName, pData] of projectMap) {
      const { nodes, allowed_regions } = pData;
      
      Object.keys(REGION_KEYWORDS).forEach(reg => {
        // 核心网闸补丁：如果当前区域不在该机场的 UI 授权名单里，彻底拦截它！
        if (!allowed_regions.includes(reg)) {
          return;
        }

        const matchedTags = nodes.filter(n => {
          const tagUpper = n.tag.toUpperCase();
          return REGION_KEYWORDS[reg].some(kw => tagUpper.includes(kw));
        }).map(n => n.tag);

        if (matchedTags.length > 0) {
          // 命名严格回归原版，如: 🇭🇰 HK-机场名
          const groupTag = `${FLAG_MAP[reg] || ''} ${reg}-${pName}`.trim();
          dynamicGroups.push({
            tag: groupTag, 
            type: "urltest",
            outbounds: [...new Set(matchedTags)],
            url: URLTEST_PARAMS.url, 
            interval: URLTEST_PARAMS.interval, 
            tolerance: URLTEST_PARAMS.tolerance,
            interrupt_exist_connections: true
          });
          regionalGroupsMap[reg].push(groupTag);
        }
      });
    }

    log(`[策略构建] 已生成 ${dynamicGroups.length} 个独立的机场级区域 urltest 分组`);
    addStep("区域分组", dynamicGroups.length > 0 ? "success" : "warning", `生成 ${dynamicGroups.length} 个 urltest 分组。`, {
      regions: Object.fromEntries(Object.entries(regionalGroupsMap).map(([key, groups]) => [key, groups.length]))
    });

    // ==========================================
    // 5. 模板驱动注入逻辑 (处理 x_rule，完全镜像原版)
    // ==========================================
    const allGeneratedRegionalTags = Object.values(regionalGroupsMap).flat();

    let injectedSelectors = 0;
    if (Array.isArray(config.outbounds)) {
      config.outbounds = config.outbounds.map(group => {
        if (group.type !== "selector") return group;
        injectedSelectors++;

        const ruleStr = group.x_rule;
        const rule = parseRule(ruleStr);
        let keys = ["🗽 节点选择"];

        if (!rule) {
          log(`[注入回退] 分组 "${group.tag}" 执行兼容性回退`);
          const t = group.tag;
          if (t === "🗽 节点选择") {
            const others = allRealNodes.filter(n => 
              !Object.values(REGION_KEYWORDS).flat().some(k => n.tag.toUpperCase().includes(k))
            ).map(n => n.tag);
            keys = [...allGeneratedRegionalTags, ...new Set(others)];
          } 
          else if (t === "🦚 PeacockTV" || t === "🅾️ OpenAI") keys.push(...(regionalGroupsMap["US"] || []));
          else if (t === "🌀 Hamivideo") keys.push(...(regionalGroupsMap["TW"] || []));
          else if (t === "📹️ Viu") keys.push(...(regionalGroupsMap["HK"] || []));
          else if (t === "🎞 Emby") keys.push("🎯 全球直连", ...(regionalGroupsMap["HK"] || []), ...(regionalGroupsMap["SG"] || []), ...(regionalGroupsMap["US"] || []));
          else if (t === "🍎 Apple" || t === "🐧 Tencent") keys.push("🎯 全球直连");
          else if (["🐟 漏网之鱼", "🌐 GLOBAL"].includes(t)) { /* 保持仅含总控 */ }
          else keys.push(...allGeneratedRegionalTags);
        } else {
          log(`[规则注入] 分组 "${group.tag}" 命中规则: ${ruleStr}`);
          switch (rule.mode) {
            case 'keep': delete group.x_rule; return group;
            case 'direct_only': keys = ["🎯 全球直连"]; break;
            case 'region':
              if (rule.includeDirect) keys.push("🎯 全球直连");
              rule.regions.forEach(r => { if (regionalGroupsMap[r]) keys.push(...regionalGroupsMap[r]); });
              break;
            case 'main':
              const others = allRealNodes.filter(n => 
                !Object.values(REGION_KEYWORDS).flat().some(k => n.tag.toUpperCase().includes(k))
              ).map(n => n.tag);
              keys = [...allGeneratedRegionalTags, ...new Set(others)];
              break;
            case 'all_regions':
            default: keys.push(...allGeneratedRegionalTags); break;
          }
        }

        if (group.x_rule) delete group.x_rule;
        group.outbounds = [...new Set(keys)];
        return group;
      });
    }
    addStep("策略注入", "success", `处理 ${injectedSelectors} 个 selector。`);

    // ==========================================
    // 6. 最终合并配置组装
    // ==========================================
    const seen = new Set();
    const uniqueNodes = allRealNodes.filter(n => !seen.has(n.tag) && seen.add(n.tag));
    
    config.outbounds = [
      ...(config.outbounds || []).filter(o => o.type), 
      ...dynamicGroups, 
      ...uniqueNodes
    ];

    validateReferences(config);
    addStep("最终配置", "success", `输出 ${config.outbounds?.length || 0} 个 outbound。`);

    const summary = {
      success: true,
      duration_ms: Date.now() - startedAt,
      template_source: templateResult.status.mode === "kv" ? "local_builtin" : (templateResult.status.from_cache ? "remote_cache" : "remote"),
      template_hash: templateResult.status.content_hash || "",
      active_subscriptions: activeConfigs.length,
      total_nodes: allRealNodes.length,
      dynamic_groups: dynamicGroups.length,
      selectors: injectedSelectors,
      outbounds: config.outbounds?.length || 0,
      warnings: warnings.length
    };

    if (isDebug) {
      return new Response(JSON.stringify({ success: true, summary, steps, logs: debugLogs, config: config }, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    return new Response(JSON.stringify(config, null, 2), {
      headers: { 
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });

  } catch (e) {
    const message = errorMessage(e);
    return new Response(JSON.stringify({ success: false, error: message, logs: [message] }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
