/**
 * src/html.js
 * 带有客户端直链重置熔断功能的控制台
 */
export function renderHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>sing-box 配置中心</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <style>
    body { background-color: #0f172a; color: #e2e8f0; font-family: system-ui, -apple-system, sans-serif; }
    .panel { background-color: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .input-box { background-color: #0f172a; border: 1px solid #334155; color: #f8fafc; padding: 0.5rem 0.75rem; border-radius: 0.5rem; width: 100%; outline: none; transition: border-color 0.2s; }
    .input-box:focus { border-color: #3b82f6; }
    .btn-primary { background-color: #3b82f6; color: white; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; transition: background-color 0.2s; cursor: pointer; }
    .btn-primary:hover { background-color: #2563eb; }
    .btn-danger { background-color: #ef4444; color: white; padding: 0.25rem 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; cursor: pointer; }
    .btn-danger:hover { background-color: #dc2626; }
    .tab-btn { padding: 0.75rem 1.5rem; font-weight: 500; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s; color: #94a3b8; }
    .tab-btn.active { color: #3b82f6; border-bottom-color: #3b82f6; }
    .tab-btn:hover:not(.active) { color: #e2e8f0; }
    .status-pill { border-radius: 999px; padding: 0.125rem 0.5rem; font-size: 0.75rem; font-weight: 600; }
    .status-success { background: rgba(34, 197, 94, 0.15); color: #86efac; }
    .status-warning { background: rgba(245, 158, 11, 0.15); color: #fcd34d; }
    .status-error { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
    .toast { position: fixed; right: 1rem; top: 1rem; z-index: 50; max-width: min(24rem, calc(100vw - 2rem)); }
    .matrix-wrap { overflow-x: auto; border: 1px solid #334155; border-radius: 0.75rem; }
    .matrix-table { min-width: 720px; width: 100%; border-collapse: collapse; }
    .matrix-table th, .matrix-table td { padding: 0.75rem; border-bottom: 1px solid #1e293b; text-align: left; }
    .matrix-table th { color: #94a3b8; font-size: 0.75rem; font-weight: 600; background: #0f172a; }
    .matrix-table td { color: #e2e8f0; font-size: 0.875rem; }
    .matrix-check { width: 1rem; height: 1rem; accent-color: #3b82f6; }
    .modal-backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(2, 6, 23, 0.78); display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .modal-panel { width: min(42rem, 100%); max-height: calc(100vh - 2rem); overflow-y: auto; background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.25rem; box-shadow: 0 20px 40px rgba(0,0,0,0.35); }
    @media (max-width: 768px) {
      .tab-row { overflow-x: auto; white-space: nowrap; }
      .mobile-stack { flex-direction: column; align-items: stretch; }
      .mobile-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
    }
    [v-cloak] { display: none; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #0f172a; }
    ::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
  </style>
</head>
<body>
  <div id="app" class="max-w-5xl mx-auto py-8 px-4" v-cloak>
    <div class="toast space-y-2">
      <div v-for="t in toasts" :key="t.id" class="rounded-lg border px-4 py-3 shadow-xl text-sm"
           :class="t.type === 'error' ? 'bg-red-950 border-red-800 text-red-100' : (t.type === 'warning' ? 'bg-amber-950 border-amber-800 text-amber-100' : 'bg-slate-800 border-slate-700 text-slate-100')">
        {{ t.message }}
      </div>
    </div>
    
    <div v-if="!isLoggedIn" class="min-h-[60vh] flex flex-col items-center justify-center">
      <div class="bg-slate-800 border border-slate-700 p-8 rounded-xl shadow-xl w-full max-w-md">
        <h2 class="text-2xl font-bold text-white mb-2 text-center">sing-box 配置中心</h2>
        <p class="text-slate-400 text-xs text-center mb-6">无服务器多用户 Sing-Box 配置中枢</p>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-400 mb-1">用户名</label>
            <input type="text" v-model="authForm.username" class="input-box" placeholder="输入用户名">
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-1">密码</label>
            <input type="password" v-model="authForm.password" class="input-box" placeholder="输入密码">
          </div>
          <div class="flex gap-3 pt-2">
            <button @click="handleLogin" :disabled="authLoading" class="flex-1 btn-primary text-center">登录</button>
            <button @click="handleRegister" :disabled="authLoading" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-medium transition-colors">申请注册</button>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="user.status === 'pending'" class="min-h-[50vh] flex flex-col items-center justify-center">
      <div class="bg-slate-800 border border-amber-900/50 p-8 rounded-xl text-center max-w-md">
        <div class="text-4xl mb-4">⏳</div>
        <h2 class="text-xl font-bold text-amber-400 mb-2">账号审核中</h2>
        <p class="text-slate-300 text-sm leading-relaxed mb-6">
          你好 <strong>{{ user.username }}</strong>，请联系系统所有者通过激活申请。
        </p>
        <button @click="handleLogout" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">退出账号</button>
      </div>
    </div>

    <div v-else-if="user.status === 'active'">
      
      <header class="flex justify-between items-center mb-6 mobile-stack gap-4">
        <div>
          <h1 class="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            sing-box <span class="text-xl font-normal text-blue-400">配置中心</span>
          </h1>
          <div class="flex items-center gap-2 mt-1 text-xs text-slate-400">
            <span>当前用户: <strong class="text-slate-200">{{ user.username }}</strong></span>
            <span class="bg-slate-800 px-2 py-0.5 rounded text-blue-400 font-mono">{{ user.role.toUpperCase() }}</span>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button @click="saveSettings" :disabled="saving" class="btn-primary">保存修改</button>
          <button @click="handleLogout" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm border border-slate-700">登出</button>
        </div>
      </header>

      <div class="flex border-b border-slate-700 mb-6 tab-row">
        <button class="tab-btn" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">总览</button>
        <button class="tab-btn" :class="{ active: activeTab === 'config' }" @click="activeTab = 'config'">✈️ 个人节点源</button>
        <button v-if="user.role === 'owner'" class="tab-btn" :class="{ active: activeTab === 'global' }" @click="activeTab = 'global'">⚙️ 全局与仓库控制</button>
        <button v-if="user.role === 'owner'" class="tab-btn" :class="{ active: activeTab === 'admin' }" @click="activeTab = 'admin'">👥 用户准入审核</button>
      </div>

      <div v-show="activeTab === 'overview'">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="panel mb-0">
            <div class="text-xs text-slate-400 mb-2">订阅源</div>
            <div class="text-3xl font-bold text-white">{{ dashboard.subscriptions.enabled }}/{{ dashboard.subscriptions.total }}</div>
            <div class="text-xs text-slate-500 mt-1">启用 / 总数</div>
          </div>
          <div class="panel mb-0">
            <div class="text-xs text-slate-400 mb-2">配置缓存</div>
            <div class="text-3xl font-bold" :class="dashboard.cache.has_config ? 'text-green-400' : 'text-amber-400'">{{ dashboard.cache.has_config ? '可用' : '暂无' }}</div>
            <div class="text-xs text-slate-500 mt-1">{{ dashboard.cache.updated_at || '尚未生成' }}</div>
          </div>
          <div class="panel mb-0">
            <div class="text-xs text-slate-400 mb-2">最近生成</div>
            <div class="text-3xl font-bold" :class="generationClass(dashboard.generation)">{{ generationText(dashboard.generation) }}</div>
            <div class="text-xs text-slate-500 mt-1">{{ dashboard.generation && dashboard.generation.updated_at || '暂无记录' }}</div>
          </div>
          <div v-if="user.role === 'owner'" class="panel mb-0">
            <div class="text-xs text-slate-400 mb-2">GitHub 模板</div>
            <div class="text-3xl font-bold" :class="dashboard.template && dashboard.template.ok ? 'text-green-400' : 'text-amber-400'">{{ dashboard.template && dashboard.template.ok ? '已缓存' : '待检查' }}</div>
            <div class="text-xs text-slate-500 mt-1">{{ dashboard.template && dashboard.template.content_hash ? dashboard.template.content_hash.slice(0, 8) : '无版本' }}</div>
          </div>
          <div v-if="user.role === 'owner'" class="panel mb-0">
            <div class="text-xs text-slate-400 mb-2">用户审核</div>
            <div class="text-3xl font-bold text-white">{{ dashboard.admin.pending_users }}</div>
            <div class="text-xs text-slate-500 mt-1">待处理 / 共 {{ dashboard.admin.total_users }} 人</div>
          </div>
        </div>

        <div class="panel">
          <div class="flex justify-between gap-4 mobile-stack">
            <div>
              <h2 class="text-xl font-semibold text-white mb-1">配置生成测试</h2>
              <p class="text-sm text-slate-400">按模板、订阅拉取、节点清洗、区域分组和策略注入分步检查。</p>
            </div>
            <button @click="testEngine" :disabled="testing" class="btn-primary whitespace-nowrap">{{ testing ? '测试中...' : '测试生成' }}</button>
          </div>

          <div v-if="testReport" class="mt-5">
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <div class="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                <div class="text-xs text-slate-500">耗时</div>
                <div class="text-lg font-semibold text-white">{{ testReport.summary.duration_ms }}ms</div>
              </div>
              <div class="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                <div class="text-xs text-slate-500">模板来源</div>
                <div class="text-lg font-semibold text-white">{{ testReport.summary.template_source }}</div>
              </div>
              <div class="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                <div class="text-xs text-slate-500">节点</div>
                <div class="text-lg font-semibold text-white">{{ testReport.summary.total_nodes }}</div>
              </div>
              <div class="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                <div class="text-xs text-slate-500">分组</div>
                <div class="text-lg font-semibold text-white">{{ testReport.summary.dynamic_groups }}</div>
              </div>
              <div class="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                <div class="text-xs text-slate-500">警告</div>
                <div class="text-lg font-semibold text-white">{{ testReport.summary.warnings }}</div>
              </div>
            </div>
            <div class="space-y-2">
              <div v-for="step in testReport.steps" :key="step.name" class="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
                <div class="flex justify-between gap-3 mobile-stack">
                  <div>
                    <div class="font-semibold text-white">{{ step.name }}</div>
                    <div class="text-sm text-slate-400">{{ step.message }}</div>
                  </div>
                  <span class="status-pill self-start" :class="step.status === 'success' ? 'status-success' : (step.status === 'warning' ? 'status-warning' : 'status-error')">{{ step.status }}</span>
                </div>
                <div v-if="step.details && step.details.items && step.details.items.length" class="mt-3 space-y-2">
                  <div v-for="item in step.details.items" :key="item.name" class="flex justify-between gap-3 bg-slate-950/50 border border-slate-800 rounded px-3 py-2 text-sm mobile-stack">
                    <div>
                      <span class="font-medium text-slate-200">{{ item.name }}</span>
                      <span class="text-slate-500 ml-2">原始 {{ item.raw_nodes }} / 有效 {{ item.valid_nodes }}</span>
                    </div>
                    <div class="text-right">
                      <span class="status-pill" :class="item.status === 'success' ? 'status-success' : (item.status === 'warning' ? 'status-warning' : 'status-error')">{{ item.status }}</span>
                      <div v-if="item.error" class="text-xs text-red-300 mt-1">{{ item.error }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="panel border-blue-950 bg-blue-950/20">
          <h2 class="text-xl font-semibold mb-4 border-b border-blue-900/50 pb-2 text-blue-400">客户端订阅链接</h2>
          <div class="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/50 p-4 rounded-lg border border-slate-800">
            <div class="flex-grow w-full font-mono text-sm break-all text-green-400 select-all">{{ clientUrl }}</div>
            <div class="flex gap-2 w-full md:w-auto">
              <button @click="copyUrl" class="btn-primary whitespace-nowrap bg-green-600 hover:bg-green-500">复制</button>
              <button @click="resetToken" :disabled="resetting" class="px-3 py-2 bg-red-600/20 hover:bg-red-600 border border-red-500 hover:border-red-600 text-red-200 hover:text-white rounded-lg text-sm transition-colors whitespace-nowrap">
                {{ resetting ? '重置中...' : '重置 Token' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'config'">
        <div class="panel">
          <div class="flex justify-between items-center mb-4 border-b border-slate-700 pb-2 mobile-stack gap-3">
            <div>
              <h2 class="text-xl font-semibold text-white">个人节点源与区域授权矩阵</h2>
              <p class="text-sm text-slate-400 mt-1">按行管理订阅源，按列控制区域授权。</p>
            </div>
            <button @click="addSubscription" class="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded text-white">+ 添加订阅源</button>
          </div>
          <div v-if="sub_links.length === 0" class="text-center text-slate-500 py-6 text-sm">尚未配置节点。</div>

          <div v-else class="matrix-wrap">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th>订阅源</th>
                  <th>启用</th>
                  <th v-for="reg in regionKeys" :key="reg" class="text-center">{{ reg }}</th>
                  <th class="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(sub, index) in sub_links" :key="index">
                  <td>
                    <div class="font-semibold text-white">{{ sub.name || '未命名订阅' }}</div>
                    <div class="text-xs text-slate-500 font-mono max-w-[18rem] truncate">{{ sub.url || '未填写 URL' }}</div>
                  </td>
                  <td>
                    <input type="checkbox" v-model="sub.enabled" class="matrix-check">
                  </td>
                  <td v-for="reg in regionKeys" :key="reg" class="text-center">
                    <input type="checkbox" class="matrix-check" :checked="isRegionAllowed(sub, reg)" @change="toggleRegion(sub, reg)">
                  </td>
                  <td>
                    <div class="flex justify-end gap-2">
                      <button @click="openSubEditor(index)" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs">编辑</button>
                      <button @click="testSubscriptionAt(index)" :disabled="testingSubIndex === index" class="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs">{{ testingSubIndex === index ? '测试中' : '测试' }}</button>
                      <button @click="removeSubscription(index)" class="btn-danger">删除</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'global' && user.role === 'owner'">
        <div class="panel">
          <div class="flex justify-between gap-4 mb-4 border-b border-slate-700 pb-2 mobile-stack">
            <div>
              <h2 class="text-xl font-semibold text-white">🧠 模板来源</h2>
              <p class="text-sm text-slate-400 mt-1">可使用 GitHub 模板，也可将模板导入本地 SQLite 后作为内置模板使用。</p>
            </div>
            <div class="flex gap-2">
              <button v-if="globalConfig.TEMPLATE_MODE !== 'kv'" @click="checkTemplate(false)" :disabled="templateChecking" class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">检查模板</button>
              <button v-if="globalConfig.TEMPLATE_MODE !== 'kv'" @click="checkTemplate(true)" :disabled="templateChecking" class="btn-primary text-sm">强制刷新</button>
              <button @click="importBuiltinTemplate" :disabled="templateChecking" class="px-3 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm">导入为内置模板</button>
            </div>
          </div>
          <div class="mb-4 flex gap-3 mobile-stack">
            <label class="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm">
              <input type="radio" value="github" v-model="globalConfig.TEMPLATE_MODE" class="matrix-check">
              GitHub 仓库模板
            </label>
            <label class="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm">
              <input type="radio" value="kv" v-model="globalConfig.TEMPLATE_MODE" class="matrix-check">
              本地内置模板
            </label>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-slate-400 mb-1">GitHub 用户名</label>
              <input type="text" v-model="globalConfig.GITHUB_USER" class="input-box" placeholder="你的 GitHub ID">
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-1">仓库名 (REPO)</label>
              <input type="text" v-model="globalConfig.GITHUB_REPO" class="input-box" placeholder="例如: singbox-profiles">
            </div>
            <div>
              <label class="block text-sm text-slate-400 mb-1">分支名称</label>
              <input type="text" v-model="globalConfig.GITHUB_BRANCH" class="input-box" placeholder="master 或 main">
            </div>
          </div>
          <div v-if="templateStatus.message" class="mt-4 bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-sm">
            <div class="flex justify-between gap-3 mobile-stack">
              <span>{{ templateStatus.message }}</span>
              <span class="status-pill self-start" :class="templateStatus.ok ? 'status-success' : 'status-warning'">{{ templateStatus.ok ? 'ok' : 'pending' }}</span>
            </div>
            <div v-if="templateStatus.content_hash" class="text-xs text-slate-500 mt-2 font-mono">hash: {{ templateStatus.content_hash }}</div>
          </div>

          <div v-if="globalConfig.TEMPLATE_MODE === 'kv'" class="mt-4 bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <div class="flex justify-between gap-3 mb-3 mobile-stack">
              <div>
                <h3 class="font-semibold text-white">本地内置模板编辑</h3>
                <p class="text-sm text-slate-400">保存前会校验 JSON 和引用关系，并自动备份上一版。</p>
              </div>
              <div class="flex gap-2 flex-wrap">
                <button @click="loadBuiltinTemplate" class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">加载</button>
                <button @click="copyBuiltinTemplate" class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">复制</button>
                <button @click="formatBuiltinTemplate" class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">格式化</button>
                <button @click="validateBuiltinTemplate" class="px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm">校验</button>
                <button @click="saveBuiltinTemplate" class="btn-primary text-sm">保存</button>
                <button @click="rollbackBuiltinTemplate" class="px-3 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-sm">回滚</button>
                <button @click="clearBuiltinTemplate" class="px-3 py-2 bg-red-900/60 hover:bg-red-800 text-red-100 rounded-lg text-sm">清空</button>
              </div>
            </div>
            <textarea v-model="builtinTemplateText" @input="updateBuiltinEditorStats" class="input-box font-mono text-xs h-96 leading-relaxed" spellcheck="false" placeholder="加载或粘贴 main-profile.json 内容"></textarea>
            <div v-if="builtinTemplateError" class="mt-3 bg-red-950/50 border border-red-800 text-red-100 rounded-lg p-3 text-sm">
              {{ builtinTemplateError }}
            </div>
            <div class="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div class="bg-slate-950/50 border border-slate-800 rounded p-2">行数：{{ builtinEditorStats.lines }}</div>
              <div class="bg-slate-950/50 border border-slate-800 rounded p-2">大小：{{ builtinEditorStats.size }} 字符</div>
              <div class="bg-slate-950/50 border border-slate-800 rounded p-2">更新时间：{{ builtinTemplateMeta.updated_at || '无' }}</div>
              <div class="bg-slate-950/50 border border-slate-800 rounded p-2">备份时间：{{ builtinTemplateMeta.backup && builtinTemplateMeta.backup.backed_up_at || '无' }}</div>
            </div>
            <div class="mt-2 text-xs text-slate-500 font-mono break-all">
              当前 hash: {{ builtinTemplateMeta.content_hash || '无' }} | 备份: {{ builtinTemplateMeta.backup && builtinTemplateMeta.backup.exists ? builtinTemplateMeta.backup.content_hash : '无' }}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="panel h-full mb-0">
            <h2 class="text-xl font-semibold mb-4 border-b border-slate-700 pb-2 text-white">区域匹配关键字字典</h2>
            <div class="space-y-3">
              <div v-for="(keywords, reg) in regionStr" :key="reg" class="flex flex-col">
                <label class="text-sm font-medium text-slate-300 mb-1">{{ reg }} 区域</label>
                <input type="text" v-model="regionStr[reg]" class="input-box text-sm font-mono">
              </div>
            </div>
          </div>
          <div class="panel h-full mb-0">
            <h2 class="text-xl font-semibold mb-4 border-b border-slate-700 pb-2 text-white">调度清洗与测速阈值</h2>
            <div class="mb-4">
              <label class="block text-sm text-slate-400 mb-1">无效节点屏蔽正则</label>
              <textarea v-model="globalConfig.BANNED_KEYWORDS" class="input-box text-sm font-mono h-16"></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-2 border-b border-slate-700 pb-1">UrlTest 全局参数</label>
              <div class="space-y-2">
                <input type="text" v-model="globalConfig.URLTEST_PARAMS.url" class="input-box text-sm font-mono" placeholder="测速 URL">
                <div class="flex gap-4">
                  <input type="text" v-model="globalConfig.URLTEST_PARAMS.interval" class="input-box text-sm font-mono" placeholder="间隔 (如 3m)">
                  <input type="number" v-model="globalConfig.URLTEST_PARAMS.tolerance" class="input-box text-sm font-mono" placeholder="容差 ms">
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'admin' && user.role === 'owner'">
        <div class="panel">
          <h2 class="text-xl font-semibold mb-4 border-b border-slate-700 pb-2 text-white">系统账户管理</h2>
          <div class="overflow-x-auto">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th>用户名</th>
                  <th>权限</th>
                  <th>状态</th>
                  <th>订阅源</th>
                  <th>最近生成</th>
                  <th>Token</th>
                  <th class="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in adminUsers" :key="u.username">
                  <td class="font-medium text-white">{{ u.username }}</td>
                  <td><span class="text-xs px-2 py-0.5 rounded bg-slate-700">{{ u.role }}</span></td>
                  <td>
                    <span class="status-pill" :class="userStatusClass(u.status)">{{ userStatusText(u.status) }}</span>
                  </td>
                  <td>
                    <span class="text-xs text-slate-300">{{ u.enabled_sub_count || 0 }}/{{ u.sub_count || 0 }}</span>
                  </td>
                  <td>
                    <div>
                      <span class="status-pill" :class="generationStatusClass(u.generation)">{{ generationText(u.generation) }}</span>
                      <div class="text-xs text-slate-500 mt-1">{{ u.generation && u.generation.updated_at || '-' }}</div>
                    </div>
                  </td>
                  <td>
                    <span class="text-xs font-mono" :class="u.client_token ? 'text-green-400' : 'text-slate-500'">{{ u.client_token ? '已签发' : '无' }}</span>
                    <div class="text-xs text-slate-500 mt-1">{{ u.token_updated_at || '-' }}</div>
                  </td>
                  <td>
                    <div class="flex justify-end gap-2">
                      <button v-if="u.status === 'pending'" @click="adminAction('approve', u.username)" class="px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs">通过</button>
                      <button v-if="u.status === 'pending'" @click="adminAction('reject', u.username)" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs">拒绝</button>
                      <button v-if="u.status === 'active' && u.username !== user.username" @click="adminAction('disable', u.username)" class="px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs">禁用</button>
                      <button v-if="u.status === 'disabled'" @click="adminAction('enable', u.username)" class="px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs">启用</button>
                      <button v-if="u.status !== 'pending'" @click="adminAction('reset_token', u.username)" class="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs">重置 Token</button>
                      <button v-if="u.username !== user.username" @click="adminAction('delete', u.username)" class="btn-danger">删除</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>

    <div v-if="editingSubIndex !== null" class="modal-backdrop" @click.self="closeSubEditor">
      <div class="modal-panel">
        <div class="flex justify-between items-start gap-4 mb-4">
          <div>
            <h2 class="text-xl font-semibold text-white">编辑订阅源</h2>
            <p class="text-sm text-slate-400 mt-1">修改名称、URL 和区域授权。</p>
          </div>
          <button @click="closeSubEditor" class="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">关闭</button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-400 mb-1">名称</label>
            <input type="text" v-model="editSubDraft.name" class="input-box" placeholder="订阅源别名">
          </div>
          <div>
            <label class="block text-sm text-slate-400 mb-1">URL</label>
            <input type="text" v-model="editSubDraft.url" class="input-box font-mono text-sm" placeholder="https://example.com/sub.json">
          </div>
          <label class="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" v-model="editSubDraft.enabled" class="matrix-check">
            启用该订阅源
          </label>
          <div>
            <div class="text-sm text-slate-400 mb-2">授权区域</div>
            <div class="flex flex-wrap gap-3">
              <label v-for="reg in regionKeys" :key="reg" class="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-sm">
                <input type="checkbox" :value="reg" v-model="editSubDraft.allowed_regions" class="matrix-check">
                {{ reg }}
              </label>
            </div>
          </div>
        </div>

        <div v-if="subTestReport" class="mt-5 bg-slate-900/60 border border-slate-800 rounded-lg p-4">
          <div class="flex justify-between gap-4 mobile-stack">
            <div>
              <div class="font-semibold text-white">{{ subTestReport.success ? '测试成功' : '测试失败' }}</div>
              <div class="text-sm text-slate-400">{{ subTestReport.success ? ('耗时 ' + subTestReport.duration_ms + 'ms') : subTestReport.error }}</div>
            </div>
            <span class="status-pill self-start" :class="subTestReport.success ? 'status-success' : 'status-error'">{{ subTestReport.success ? 'ok' : 'error' }}</span>
          </div>
          <div v-if="subTestReport.success" class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div class="bg-slate-950/60 rounded p-3 border border-slate-800">
              <div class="text-xs text-slate-500">原始节点</div>
              <div class="text-lg font-semibold text-white">{{ subTestReport.raw_nodes }}</div>
            </div>
            <div class="bg-slate-950/60 rounded p-3 border border-slate-800">
              <div class="text-xs text-slate-500">有效节点</div>
              <div class="text-lg font-semibold text-white">{{ subTestReport.valid_nodes }}</div>
            </div>
            <div v-for="reg in regionKeys" :key="reg" class="bg-slate-950/60 rounded p-3 border border-slate-800">
              <div class="text-xs text-slate-500">{{ reg }}</div>
              <div class="text-lg font-semibold text-white">{{ subTestReport.regions[reg] || 0 }}</div>
            </div>
            <div class="bg-slate-950/60 rounded p-3 border border-slate-800">
              <div class="text-xs text-slate-500">未匹配</div>
              <div class="text-lg font-semibold text-white">{{ subTestReport.regions.unmatched || 0 }}</div>
            </div>
          </div>
        </div>

        <div class="mt-5 flex justify-between gap-3 mobile-stack">
          <button @click="testSubscriptionDraft" :disabled="testingSubIndex === editingSubIndex" class="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm">{{ testingSubIndex === editingSubIndex ? '测试中...' : '测试订阅源' }}</button>
          <div class="flex gap-2">
            <button @click="closeSubEditor" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">取消</button>
            <button @click="saveSubEditor" class="btn-primary">保存订阅源</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const { createApp } = Vue;

    createApp({
      data() {
        return {
          isLoggedIn: false,
          authLoading: false,
          saving: false,
          testing: false,
          templateChecking: false,
          testingSubIndex: null,
          resetting: false, // 联动异步控制状态
          activeTab: 'overview',
          authForm: { username: '', password: '' },
          user: { username: '', role: '', status: '', client_token: '' },
          dashboard: {
            subscriptions: { total: 0, enabled: 0 },
            cache: { has_config: false, updated_at: null, size: 0 },
            generation: null,
            template: null,
            admin: { total_users: 0, pending_users: 0 }
          },
          templateStatus: {},
          builtinTemplateText: "",
          builtinTemplateMeta: { content_hash: "", backup: { exists: false } },
          builtinTemplateError: "",
          builtinEditorStats: { lines: 0, size: 0 },
          sub_links: [],
          globalConfig: {
            GITHUB_USER: "", GITHUB_REPO: "", GITHUB_BRANCH: "master",
            TEMPLATE_MODE: "github",
            BANNED_KEYWORDS: "",
            URLTEST_PARAMS: { url: "", interval: "", tolerance: 150 }
          },
          regionStr: { HK: "HK, 香港", TW: "TW, 台湾", SG: "SG, 新加坡", JP: "JP, 日本", US: "US, 美国" },
          adminUsers: [],
          testReport: null,
          subTestReport: null,
          editingSubIndex: null,
          editSubDraft: { name: "", url: "", enabled: true, allowed_regions: [] },
          toasts: []
        }
      },
      computed: {
        regionKeys() {
          return Object.keys(this.regionStr);
        },
        clientUrl() {
          if (!this.user.client_token) return '账号未激活';
          return \`\${window.location.origin}/api/generate?token=\${this.user.client_token}\`;
        }
      },
      async mounted() { await this.checkAuthStatus(); },
      methods: {
        showToast(message, type = 'info') {
          const id = Date.now() + Math.random();
          this.toasts.push({ id, message, type });
          setTimeout(() => {
            this.toasts = this.toasts.filter(t => t.id !== id);
          }, 3200);
        },

        async checkAuthStatus() {
          try {
            const res = await fetch('/api/me');
            if (res.status === 200) {
              this.user = await res.json();
              this.isLoggedIn = true;
              if (this.user.status === 'active') {
                await this.loadSettings();
                await this.loadDashboard();
                if (this.user.role === 'owner') await this.loadAdminUsers();
              }
            } else {
              this.isLoggedIn = false;
            }
          } catch (e) { this.isLoggedIn = false; }
        },

        async handleLogin() {
          if (!this.authForm.username || !this.authForm.password) return this.showToast("请完整填入凭证", "warning");
          this.authLoading = true;
          try {
            const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.authForm)
            });
            const data = await res.json();
            if (res.ok && data.success) { await this.checkAuthStatus(); this.showToast("登录成功", "success"); } else { this.showToast(data.error || "登录失败", "error"); }
          } catch (e) { this.showToast("网络异常", "error"); }
          this.authLoading = false;
        },

        async handleRegister() {
          if (!this.authForm.username || !this.authForm.password) return this.showToast("请完整填入凭证", "warning");
          this.authLoading = true;
          try {
            const res = await fetch('/api/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.authForm)
            });
            const data = await res.json();
            if (res.ok && data.success) {
              if (data.isFirstUser) { this.showToast("初始化建站成功，已自动激活，请直接登录。", "success"); }
              else { this.showToast("注册申请已提交，请等待管理员审核。", "success"); }
            } else { this.showToast(data.error || "注册失败", "error"); }
          } catch (e) { this.showToast("注册异常", "error"); }
          this.authLoading = false;
        },

        async handleLogout() {
          await fetch('/api/auth/logout', { method: 'POST' });
          this.isLoggedIn = false;
          this.user = { username: '', role: '', status: '', client_token: '' };
        },

        async loadSettings() {
          try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            
            this.sub_links = (data.sub_links || []).map(sub => {
              if (!sub.allowed_regions) sub.allowed_regions = Object.keys(this.regionStr);
              return sub;
            });
            
            if (this.user.role === 'owner') {
              this.globalConfig.GITHUB_USER = data.GITHUB_USER || "";
              this.globalConfig.GITHUB_REPO = data.GITHUB_REPO || "";
              this.globalConfig.GITHUB_BRANCH = data.GITHUB_BRANCH || "master";
              this.globalConfig.TEMPLATE_MODE = data.TEMPLATE_MODE || "github";
              this.globalConfig.BANNED_KEYWORDS = data.BANNED_KEYWORDS || "";
              this.globalConfig.URLTEST_PARAMS = data.URLTEST_PARAMS || { url: "", interval: "", tolerance: 150 };
              if (data.REGION_KEYWORDS) {
                for (let k in this.regionStr) {
                  this.regionStr[k] = data.REGION_KEYWORDS[k] ? data.REGION_KEYWORDS[k].join(', ') : "";
                }
              }
            }
          } catch (e) {}
        },

        async loadDashboard() {
          try {
            const res = await fetch('/api/dashboard');
            if (!res.ok) return;
            const data = await res.json();
            this.dashboard = {
              subscriptions: data.subscriptions || { total: 0, enabled: 0 },
              cache: data.cache || { has_config: false, updated_at: null, size: 0 },
              generation: data.generation || null,
              template: data.template,
              admin: data.admin || { total_users: 0, pending_users: 0 }
            };
            if (data.template) this.templateStatus = data.template;
          } catch (e) {}
        },

        validateSettingsPayload(payload) {
          for (const sub of payload.sub_links || []) {
            if (sub.enabled && !sub.name?.trim()) return "启用的订阅源需要填写名称。";
            if (sub.enabled && !/^https?:\\/\\//i.test(sub.url || "")) return \`订阅源 [\${sub.name || '未命名'}] 的 URL 格式不正确。\`;
            if (sub.enabled && (!sub.allowed_regions || sub.allowed_regions.length === 0)) return \`订阅源 [\${sub.name || '未命名'}] 至少选择一个区域。\`;
          }
          if (this.user.role === 'owner') {
            if (payload.TEMPLATE_MODE !== 'kv') {
              if (!payload.GITHUB_USER?.trim()) return "请填写 GitHub 用户名。";
              if (!payload.GITHUB_REPO?.trim()) return "请填写 GitHub 仓库名。";
              if (!payload.GITHUB_BRANCH?.trim()) return "请填写 GitHub 分支名。";
            }
            if (!/^https?:\\/\\//i.test(payload.URLTEST_PARAMS?.url || "")) return "测速 URL 格式不正确。";
            if (!payload.URLTEST_PARAMS?.interval) return "请填写 UrlTest 间隔。";
            if (Number(payload.URLTEST_PARAMS?.tolerance) < 0) return "UrlTest 容差不能为负数。";
          }
          return "";
        },

        async saveSettings() {
          this.saving = true;
          let payload = { sub_links: this.sub_links };

          if (this.user.role === 'owner') {
            let finalRegions = {};
            for (let k in this.regionStr) {
              finalRegions[k] = this.regionStr[k].split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
            payload.REGION_KEYWORDS = finalRegions;
            payload.GITHUB_USER = this.globalConfig.GITHUB_USER;
            payload.GITHUB_REPO = this.globalConfig.GITHUB_REPO;
            payload.GITHUB_BRANCH = this.globalConfig.GITHUB_BRANCH;
            payload.TEMPLATE_MODE = this.globalConfig.TEMPLATE_MODE;
            payload.BANNED_KEYWORDS = this.globalConfig.BANNED_KEYWORDS;
            payload.URLTEST_PARAMS = this.globalConfig.URLTEST_PARAMS;
          }

          const validationError = this.validateSettingsPayload(payload);
          if (validationError) {
            this.showToast(validationError, "warning");
            this.saving = false;
            return;
          }

          try {
            const res = await fetch('/api/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            if (res.ok) {
              this.showToast("数据同步成功", "success");
              await this.loadDashboard();
            } else {
              const data = await res.json().catch(() => ({}));
              this.showToast(data.error || "保存失败", "error");
            }
          } catch (e) { this.showToast("网络提交异常", "error"); }
          this.saving = false;
        },

        async checkTemplate(force) {
          this.templateChecking = true;
          try {
            const res = await fetch(force ? '/api/template/refresh' : '/api/template/check', { method: 'POST' });
            const data = await res.json();
            this.templateStatus = data;
            this.showToast(data.message || (res.ok ? "模板检查完成" : "模板检查失败"), res.ok ? "success" : "error");
            await this.loadDashboard();
          } catch (e) {
            this.showToast("模板检查请求失败", "error");
          }
          this.templateChecking = false;
        },

        async copyText(text) {
          const value = text || "";
          try {
            if (navigator.clipboard && window.isSecureContext) {
              await navigator.clipboard.writeText(value);
              return true;
            }
          } catch (e) {}

          const textarea = document.createElement('textarea');
          textarea.value = value;
          textarea.setAttribute('readonly', '');
          textarea.style.position = 'fixed';
          textarea.style.left = '-9999px';
          textarea.style.top = '0';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          let ok = false;
          try {
            ok = document.execCommand('copy');
          } catch (e) {
            ok = false;
          }
          document.body.removeChild(textarea);
          return ok;
        },

        async importBuiltinTemplate() {
          this.templateChecking = true;
          try {
            const res = await fetch('/api/template/import_builtin', { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.success) {
              this.templateStatus = data;
              this.showToast(data.message || "已导入内置模板", "success");
              await this.loadBuiltinTemplate();
              await this.loadDashboard();
            } else {
              this.showToast(data.error || "导入内置模板失败", "error");
            }
          } catch (e) {
            this.showToast("导入内置模板请求失败", "error");
          }
          this.templateChecking = false;
        },

        async loadBuiltinTemplate() {
          try {
            const res = await fetch('/api/template/builtin');
            const data = await res.json();
            if (res.ok) {
              this.builtinTemplateText = data.content_text || "";
              this.builtinTemplateMeta = {
                content_hash: data.content_hash || "",
                updated_at: data.updated_at || null,
                backup: data.backup || { exists: false }
              };
              this.builtinTemplateError = "";
              this.updateBuiltinEditorStats();
              this.showToast(data.exists ? "内置模板已加载。" : "还没有内置模板，请先导入或粘贴保存。", data.exists ? "success" : "warning");
            }
          } catch (e) { this.showToast("加载内置模板失败", "error"); }
        },

        updateBuiltinEditorStats() {
          const text = this.builtinTemplateText || "";
          this.builtinEditorStats = {
            lines: text ? text.split('\\n').length : 0,
            size: text.length
          };
        },

        async copyBuiltinTemplate() {
          const ok = await this.copyText(this.builtinTemplateText || "");
          this.showToast(ok ? "模板内容已复制。" : "复制模板失败，请手动选中复制。", ok ? "success" : "error");
        },

        clearBuiltinTemplate() {
          if (!confirm("确认清空当前编辑器内容吗？这不会删除已保存的 KV 模板，除非继续点击保存。")) return;
          this.builtinTemplateText = "";
          this.builtinTemplateError = "";
          this.updateBuiltinEditorStats();
        },

        formatBuiltinTemplate() {
          try {
            this.builtinTemplateText = JSON.stringify(JSON.parse(this.builtinTemplateText || "{}"), null, 2);
            this.builtinTemplateError = "";
            this.updateBuiltinEditorStats();
            this.showToast("JSON 已格式化。", "success");
          } catch (e) {
            this.builtinTemplateError = e.message;
            this.showToast("JSON 格式错误，无法格式化。", "error");
          }
        },

        async validateBuiltinTemplate() {
          try {
            const res = await fetch('/api/template/validate_builtin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content_text: this.builtinTemplateText })
            });
            const data = await res.json();
            this.builtinTemplateError = res.ok ? "" : (data.error || "模板校验失败");
            this.showToast(data.message || data.error || "模板校验完成", res.ok ? "success" : "error");
            return res.ok;
          } catch (e) {
            this.builtinTemplateError = "模板校验请求失败";
            this.showToast("模板校验请求失败", "error");
            return false;
          }
        },

        async saveBuiltinTemplate() {
          const ok = await this.validateBuiltinTemplate();
          if (!ok) return;
          try {
            const res = await fetch('/api/template/save_builtin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content_text: this.builtinTemplateText })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast(data.message || "内置模板已保存。", "success");
              this.builtinTemplateError = "";
              await this.loadBuiltinTemplate();
              await this.loadDashboard();
            } else {
              this.showToast(data.error || "保存内置模板失败", "error");
            }
          } catch (e) { this.showToast("保存内置模板请求失败", "error"); }
        },

        async rollbackBuiltinTemplate() {
          if (!confirm("确认要回滚到上一版本地内置模板吗？当前版本会被备份。")) return;
          try {
            const res = await fetch('/api/template/rollback_builtin', { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast(data.message || "已回滚内置模板。", "success");
              await this.loadBuiltinTemplate();
              await this.loadDashboard();
            } else {
              this.showToast(data.error || "回滚失败", "error");
            }
          } catch (e) { this.showToast("回滚请求失败", "error"); }
        },

        // ====== 🚀 新增：前端异步重置 Token 触发函数 ======
        async resetToken() {
          const msg = "⚠️ 极其危险的操作警告！\\n\\n一旦执行重置 Token：\\n1. 当前正在使用该订阅直链的所有物理设备（Apple TV、OpenWrt 路由器、手机等）将会瞬间被边缘断开、拉取报错！\\n2. 旧的链接将永久失效且不可找回。\\n\\n你确定要强制吊销旧密钥并下发新 Token 吗？";
          if (!confirm(msg)) return;

          this.resetting = true;
          try {
            const res = await fetch('/api/auth/reset_token', { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.success) {
              this.user.client_token = data.client_token; // 实时重绑 Vue 节点响应式计算
              this.showToast("Token 已重置，请及时更新客户端订阅地址。", "success");
            } else {
              this.showToast(data.error || "熔断过账失败", "error");
            }
          } catch (e) { this.showToast("网关通道中断，重置未生效", "error"); }
          this.resetting = false;
        },

        async loadAdminUsers() {
          try {
            const res = await fetch('/api/admin/users');
            if (res.ok) this.adminUsers = await res.json();
          } catch (e) {}
        },

        userStatusText(status) {
          if (status === 'active') return '活跃';
          if (status === 'pending') return '待审核';
          if (status === 'disabled') return '已禁用';
          return status || '未知';
        },
        userStatusClass(status) {
          if (status === 'active') return 'status-success';
          if (status === 'pending') return 'status-warning';
          if (status === 'disabled') return 'status-error';
          return 'status-warning';
        },
        generationText(generation) {
          if (!generation) return '无记录';
          if (generation.status === 'success') return '成功';
          if (generation.status === 'warning') return '缓存';
          if (generation.status === 'error') return '失败';
          return generation.status || '未知';
        },
        generationStatusClass(generation) {
          if (!generation) return 'status-warning';
          if (generation.status === 'success') return 'status-success';
          if (generation.status === 'warning') return 'status-warning';
          if (generation.status === 'error') return 'status-error';
          return 'status-warning';
        },
        generationClass(generation) {
          if (!generation) return 'text-amber-400';
          if (generation.status === 'success') return 'text-green-400';
          if (generation.status === 'warning') return 'text-amber-400';
          if (generation.status === 'error') return 'text-red-400';
          return 'text-amber-400';
        },
        async adminAction(action, target_username) {
          const labels = {
            approve: '通过',
            reject: '拒绝并删除',
            disable: '禁用',
            enable: '启用',
            reset_token: '重置 Token',
            delete: '删除'
          };
          if (['reject', 'disable', 'reset_token', 'delete'].includes(action)) {
            if (!confirm(\`确认要对用户 [\${target_username}] 执行 [\${labels[action]}] 吗？\`)) return;
          }
          try {
            const res = await fetch(\`/api/admin/\${action}\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ target_username })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
              this.showToast(\`用户 [\${target_username}] 已执行：\${labels[action]}。\`, "success");
              await this.loadAdminUsers();
              await this.loadDashboard();
            } else {
              this.showToast(data.error || "操作失败", "error");
            }
          } catch (e) { this.showToast("用户操作请求失败", "error"); }
        },

        addSubscription() { 
          this.editingSubIndex = -1;
          this.subTestReport = null;
          this.editSubDraft = {
            name: "",
            url: "",
            enabled: true,
            allowed_regions: [...this.regionKeys]
          };
        },
        removeSubscription(index) { this.sub_links.splice(index, 1); },
        isRegionAllowed(sub, reg) {
          if (!sub.allowed_regions) sub.allowed_regions = [];
          return sub.allowed_regions.includes(reg);
        },
        toggleRegion(sub, reg) {
          if (!sub.allowed_regions) sub.allowed_regions = [];
          if (sub.allowed_regions.includes(reg)) {
            sub.allowed_regions = sub.allowed_regions.filter(r => r !== reg);
          } else {
            sub.allowed_regions.push(reg);
          }
        },
        openSubEditor(index) {
          const sub = this.sub_links[index];
          this.editingSubIndex = index;
          this.subTestReport = null;
          this.editSubDraft = {
            name: sub.name || "",
            url: sub.url || "",
            enabled: sub.enabled !== false,
            allowed_regions: [...(sub.allowed_regions || this.regionKeys)]
          };
        },
        closeSubEditor() {
          this.editingSubIndex = null;
          this.subTestReport = null;
          this.editSubDraft = { name: "", url: "", enabled: true, allowed_regions: [] };
        },
        saveSubEditor() {
          if (!this.editSubDraft.name.trim()) return this.showToast("订阅源名称不能为空。", "warning");
          if (!/^https?:\\/\\//i.test(this.editSubDraft.url || "")) return this.showToast("订阅源 URL 格式不正确。", "warning");
          if (!this.editSubDraft.allowed_regions.length) return this.showToast("至少选择一个授权区域。", "warning");
          const nextSub = {
            name: this.editSubDraft.name.trim(),
            url: this.editSubDraft.url.trim(),
            enabled: this.editSubDraft.enabled,
            allowed_regions: [...this.editSubDraft.allowed_regions]
          };
          if (this.editingSubIndex === -1) {
            this.sub_links.push(nextSub);
            this.showToast("订阅源已添加，记得保存修改。", "success");
          } else {
            this.sub_links[this.editingSubIndex] = nextSub;
            this.showToast("订阅源已更新，记得保存修改。", "success");
          }
          this.closeSubEditor();
        },
        async testSubscriptionAt(index) {
          this.openSubEditor(index);
          await this.testSubscriptionDraft();
        },
        async testSubscriptionDraft() {
          if (!this.editSubDraft.url) return this.showToast("请先填写订阅源 URL。", "warning");
          this.testingSubIndex = this.editingSubIndex;
          this.subTestReport = null;
          try {
            const res = await fetch('/api/subscription/test', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subscription: this.editSubDraft })
            });
            const data = await res.json();
            this.subTestReport = data;
            this.showToast(data.success ? "订阅源测试完成。" : (data.error || "订阅源测试失败。"), data.success ? "success" : "error");
          } catch (e) {
            this.showToast("订阅源测试请求失败。", "error");
          }
          this.testingSubIndex = null;
        },
        async copyUrl() {
          const ok = await this.copyText(this.clientUrl);
          this.showToast(ok ? "分发链接已复制。" : "复制失败，请手动选中链接复制。", ok ? "success" : "error");
        },

        async testEngine() {
          this.testing = true;
          this.testReport = null;
          try {
            const res = await fetch(\`/api/generate?token=\${this.user.client_token}&debug=1\`);
            const result = await res.json();
            if (res.ok && result.summary) {
              this.testReport = result;
              this.showToast("配置生成测试完成", result.summary.warnings > 0 ? "warning" : "success");
              await this.loadDashboard();
            }
            else { this.showToast(result.error || "未返回结构化报告。", "error"); }
          } catch (e) { this.showToast("引擎故障。", "error"); }
          this.testing = false;
        }
      }
    }).mount('#app'); // 拧钥匙打火
  </script>
</body>
</html>`;
}
