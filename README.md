# singbox-center

运行在内网 Alpine/Node.js 上的 sing-box 配置中心。

它提供网页控制台，用来管理用户、订阅源、区域关键字、测速参数和 sing-box 模板。客户端通过专属 Token 访问 `/api/generate` 拉取最终 sing-box JSON 配置。

## 功能

- 多用户登录与注册审核
- 每个用户独立配置订阅源
- 区域授权矩阵
- 单订阅源测试
- 配置生成结构化测试报告
- GitHub 模板缓存
- 本地内置模板编辑、校验、保存和回滚
- 客户端 Token 重置
- 最近一次成功配置缓存
- 用户最近生成状态与管理操作

## 部署到 Alpine

安装依赖：

```bash
apk add nodejs npm python3 make g++ sqlite
```

安装项目依赖：

```bash
npm install
```

启动：

```bash
npm start
```

默认监听：

```text
0.0.0.0:3000
```

默认数据库：

```text
data/singbox-center.db
```

## 环境变量

```bash
HOST=0.0.0.0
PORT=3000
DATA_DIR=/var/lib/singbox-center
DB_PATH=/var/lib/singbox-center/singbox-center.db
GITHUB_TOKEN=
COOKIE_SECURE=false
```

如果只在内网 HTTP 使用，`COOKIE_SECURE=false`。如果经 HTTPS 反代访问，可以设置为 `true`。

## OpenRC 示例

创建 `/etc/init.d/singbox-center`：

```sh
#!/sbin/openrc-run

name="singbox-center"
description="sing-box config center"
command="/usr/bin/npm"
command_args="start"
directory="/opt/singbox-center"
command_user="root"
supervisor="supervise-daemon"
output_log="/var/log/singbox-center.log"
error_log="/var/log/singbox-center.err"

export HOST="0.0.0.0"
export PORT="3000"
export DATA_DIR="/var/lib/singbox-center"
export DB_PATH="/var/lib/singbox-center/singbox-center.db"
export COOKIE_SECURE="false"
```

启用：

```bash
chmod +x /etc/init.d/singbox-center
rc-update add singbox-center default
rc-service singbox-center start
```

## 使用

1. 打开 `http://<vm-ip>:3000`。
2. 第一个注册用户会自动成为 `owner` 并激活。
3. 在“全局与仓库控制”里选择模板来源：
   - GitHub 仓库模板
   - 本地内置模板
4. 添加订阅源并配置区域授权矩阵。
5. 在总览页测试生成配置。
6. 复制客户端订阅链接。

订阅地址格式：

```text
http://<vm-ip>:3000/api/generate?token=<client_token>
```

## 模板管理

模板来源支持两种模式：

- `GitHub 仓库模板`：从 GitHub 拉取 `profiles/main-profile.json`，并缓存到 SQLite。
- `本地内置模板`：从 GitHub 导入或网页内编辑模板，生成配置时直接使用 SQLite 中的内置模板。

在内置模板模式下，可以直接在网页中编辑模板 JSON。保存时会校验 JSON 结构和引用关系，并自动备份上一版。
