# singbox-center

运行在 Linux/Node.js 上的 sing-box 配置中心。

它提供一个网页控制台，用于管理用户、订阅源、区域授权、测速参数和 sing-box 模板。客户端通过专属 Token 访问 `/api/generate` 拉取生成后的 sing-box JSON 配置。

## 功能

- 多用户注册、登录与审核
- 首个注册用户自动成为 owner
- 每个用户独立维护订阅源
- 订阅源区域授权矩阵
- 单订阅源连通性与节点统计测试
- sing-box 模板缓存
- GitHub 远程模板与本地内置模板两种模式
- 本地内置模板编辑、校验、保存和回滚
- 客户端 Token 重置
- 最近一次成功配置缓存
- 用户最近生成状态与管理操作

## 一键安装

本项目推荐通过 GitHub raw 源码安装。你可以直接在 GitHub 网页上传代码，不需要在服务器上使用 `git clone`。

上传到 GitHub 后，假设仓库地址为：

```text
https://github.com/yourname/singbox-center
```

在目标服务器上以 root 执行：

```sh
curl -fsSL https://raw.githubusercontent.com/yourname/singbox-center/main/install.sh | REPO_OWNER=yourname sh
```

如果服务器没有 `curl`：

```sh
wget -qO- https://raw.githubusercontent.com/yourname/singbox-center/main/install.sh | REPO_OWNER=yourname sh
```

如果你的默认分支是 `master`：

```sh
curl -fsSL https://raw.githubusercontent.com/yourname/singbox-center/master/install.sh | REPO_OWNER=yourname REPO_BRANCH=master sh
```

如果没有显式设置 `REPO_BRANCH`，安装脚本会先尝试 `main`，失败后自动尝试 `master`。

如果仓库名不是 `singbox-center`：

```sh
curl -fsSL https://raw.githubusercontent.com/myorg/myrepo/main/install.sh | REPO_OWNER=myorg REPO_NAME=myrepo sh
```

## 安装器会做什么

- 自动检测 Alpine、Ubuntu 或 Debian
- 自动安装缺失依赖
- 下载 GitHub 分支源码归档
- 安装项目到 `/opt/singbox-center`
- 创建环境变量文件 `/etc/singbox-center/singbox-center.env`
- 保存数据到 `/var/lib/singbox-center`
- 安装并使用 pm2 管理进程
- 配置 pm2 开机自启

## 依赖

安装脚本会自动安装这些依赖：

```text
nodejs
npm
python3
make
g++
sqlite/sqlite3
curl
wget
ca-certificates
tar
pm2
```

其中 `python3`、`make`、`g++` 用于编译 `better-sqlite3`。

## 路径

```text
/opt/singbox-center
/etc/singbox-center/singbox-center.env
/var/lib/singbox-center
/var/log/singbox-center
/usr/local/bin/singbox-center
```

默认监听：

```text
0.0.0.0:3000
```

默认数据库：

```text
/var/lib/singbox-center/singbox-center.db
```

## 环境变量

编辑：

```text
/etc/singbox-center/singbox-center.env
```

默认内容：

```env
HOST=0.0.0.0
PORT=3000
DATA_DIR=/var/lib/singbox-center
DB_PATH=/var/lib/singbox-center/singbox-center.db
COOKIE_SECURE=false
GITHUB_TOKEN=
```

如果只在内网 HTTP 使用，保持：

```env
COOKIE_SECURE=false
```

如果经过 HTTPS 反向代理访问，可以设置：

```env
COOKIE_SECURE=true
```

修改环境变量后重启：

```sh
pm2 restart singbox-center
```

## pm2 管理

查看状态：

```sh
pm2 status singbox-center
```

查看日志：

```sh
pm2 logs singbox-center
```

重启：

```sh
pm2 restart singbox-center
```

停止：

```sh
pm2 stop singbox-center
```

保存当前 pm2 进程列表：

```sh
pm2 save
```

日志文件也会写入：

```text
/var/log/singbox-center
```

## 更新

```sh
curl -fsSL https://raw.githubusercontent.com/yourname/singbox-center/main/install.sh | REPO_OWNER=yourname sh -s -- update
```

如果分支是 `master`：

```sh
curl -fsSL https://raw.githubusercontent.com/yourname/singbox-center/master/install.sh | REPO_OWNER=yourname REPO_BRANCH=master sh -s -- update
```

更新会保留：

```text
/etc/singbox-center/singbox-center.env
/var/lib/singbox-center
```

旧程序目录会备份为类似：

```text
/opt/singbox-center.backup.20260615193000
```

## 卸载

删除程序和 pm2 进程，保留配置与数据：

```sh
curl -fsSL https://raw.githubusercontent.com/yourname/singbox-center/main/install.sh | sh -s -- uninstall
```

删除程序、pm2 进程、配置、数据和日志：

```sh
curl -fsSL https://raw.githubusercontent.com/yourname/singbox-center/main/install.sh | sh -s -- uninstall --purge
```

## 使用

1. 打开 `http://<server-ip>:3000`。
2. 第一个注册用户会自动成为 `owner` 并激活。
3. 在管理界面配置模板来源：
   - GitHub 仓库模板
   - 本地内置模板
4. 添加订阅源并配置区域授权。
5. 在总览页面测试配置生成。
6. 复制客户端订阅链接。

客户端订阅地址格式：

```text
http://<server-ip>:3000/api/generate?token=<client_token>
```

## 模板管理

模板来源支持两种模式：

- GitHub 仓库模板：从 GitHub 拉取 `profiles/main-profile.json`，并缓存到 SQLite。
- 本地内置模板：从 GitHub 导入或在网页内编辑模板，生成配置时直接使用 SQLite 中保存的内置模板。

在本地内置模板模式下，可以直接在网页中编辑模板 JSON。保存时会校验 JSON 结构和引用关系，并自动备份上一版。

## 本地运行

开发或临时测试时，也可以直接运行：

```sh
npm install
npm start
```

检查语法：

```sh
npm run check
```
