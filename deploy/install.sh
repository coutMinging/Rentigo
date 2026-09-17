#!/usr/bin/env bash
# ============================================================
# 厂房及公寓楼出租管理系统 · 服务器安装脚本
#
# 适用：Debian / Ubuntu（其他发行版请自行安装 Node ≥ 20 后，从第 2 步开始手动执行）
#
# 用法：把代码放到安装目录后，在该目录内执行
#     sudo mkdir -p /opt/farental && sudo chown "$USER" /opt/farental
#     git clone <仓库地址> /opt/farental
#     cd /opt/farental
#     sudo bash deploy/install.sh
#
# 可用环境变量覆盖默认值：
#     APP_DIR=/opt/farental  APP_USER=farental  SERVICE_NAME=farental
#     PORT=3001              NODE_MAJOR=20
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/farental}"
APP_USER="${APP_USER:-farental}"
SERVICE_NAME="${SERVICE_NAME:-farental}"
PORT="${PORT:-3001}"
NODE_MAJOR="${NODE_MAJOR:-20}"

# 脚本自身的上一级目录即仓库根目录
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '\033[36m[install]\033[0m %s\n' "$*"; }
fail() {
  printf '\033[31m[install] 错误：\033[0m %s\n' "$*" >&2
  exit 1
}

# ---------- 0. 前置检查 ----------
[[ $EUID -eq 0 ]] || fail "请用 root 执行：sudo bash deploy/install.sh"

if [[ "$REPO_ROOT" != "$APP_DIR" ]]; then
  fail "请在安装目录内执行本脚本，推荐流程：
    sudo mkdir -p $APP_DIR && sudo chown \$USER $APP_DIR
    git clone <仓库地址> $APP_DIR && cd $APP_DIR
    sudo bash deploy/install.sh"
fi

[[ -d "$APP_DIR/.git" ]] || log "提示：$APP_DIR 不是 git 仓库，后续更新代码需要手动同步"

# ---------- 1. Node.js ----------
if command -v node >/dev/null 2>&1 &&
  [[ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MAJOR" ]]; then
  log "已安装 Node $(node -v)，跳过"
else
  log "安装 Node.js ${NODE_MAJOR}.x"
  command -v apt-get >/dev/null 2>&1 ||
    fail "当前系统没有 apt-get，请手动安装 Node ≥ ${NODE_MAJOR} 后重跑本脚本"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

# ---------- 2. 运行账号 ----------
# 用无登录权限的系统账号跑服务，避免以 root 身份暴露在公网
if id -u "$APP_USER" >/dev/null 2>&1; then
  log "账号 $APP_USER 已存在，跳过"
else
  log "创建系统账号 $APP_USER"
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

# ---------- 3. 安装依赖 ----------
# 注意不能用 --omit=dev：运行期靠 tsx 直接执行 TypeScript，构建前端还需要 vite
log "安装依赖（含构建期工具，请勿使用 --omit=dev）"
cd "$APP_DIR"
npm install --no-audit --no-fund

# ---------- 4. 生成环境变量 ----------
cd "$APP_DIR/server"
ADMIN_PW=""

if [[ -f .env ]]; then
  log "server/.env 已存在，保留原有配置不动"
  ADMIN_PW="$(grep -E '^ADMIN_PASSWORD=' .env | cut -d= -f2- || true)"
else
  log "生成 server/.env（含随机 JWT 密钥与管理员密码）"
  JWT_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
  ADMIN_PW="$(node -e 'console.log(require("node:crypto").randomBytes(9).toString("base64url"))')"

  cat >.env <<EOF
# 由 deploy/install.sh 自动生成，请勿提交到版本库
NODE_ENV=production
PORT=${PORT}

# JWT 签名密钥。更换它会让所有已登录用户下线
JWT_SECRET=${JWT_SECRET}

# 正式库不写入演示业务数据
SEED_DEMO=false

# 空库首次启动时创建的管理员账号
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PW}

# 留空 = 自动托管 web/dist
SERVE_WEB=

# 同源部署无需跨域
CORS_ORIGINS=
EOF
  chmod 600 .env
fi

# ---------- 5. 构建前端 ----------
log "构建前端产物到 web/dist"
cd "$APP_DIR"
npm run build

# ---------- 6. 权限 ----------
# 只放开程序真正要写的目录和要读的密钥文件，其余保持 root 所有
log "设置目录权限"
mkdir -p "$APP_DIR/server/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/server/data"
chown "$APP_USER:$APP_USER" "$APP_DIR/server/.env"

# ---------- 7. 注册 systemd 服务 ----------
log "安装 systemd 服务 ${SERVICE_NAME}"
sed -e "s#^User=.*#User=${APP_USER}#" \
  -e "s#^Group=.*#Group=${APP_USER}#" \
  -e "s#^WorkingDirectory=.*#WorkingDirectory=${APP_DIR}/server#" \
  "$APP_DIR/deploy/farental.service" >"/etc/systemd/system/${SERVICE_NAME}.service"

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null
systemctl restart "${SERVICE_NAME}"

# ---------- 8. 结果 ----------
sleep 4

if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  printf '\n'
  fail "服务启动失败，请查看日志：journalctl -u ${SERVICE_NAME} -n 50 --no-pager"
fi

ACTUAL_PORT="$(grep -E '^PORT=' "$APP_DIR/server/.env" | cut -d= -f2- || echo "$PORT")"

printf '\n'
log "安装完成，服务已启动"
printf '\n'
printf '  访问地址   http://<服务器公网IP>:%s\n' "$ACTUAL_PORT"
printf '  账号       admin\n'
if [[ -n "$ADMIN_PW" ]]; then
  printf '  初始密码   %s   ← 请立即登录后修改\n' "$ADMIN_PW"
else
  printf '  初始密码   沿用 server/.env 中的 ADMIN_PASSWORD\n'
fi
printf '\n'
printf '  查看日志   journalctl -u %s -f\n' "$SERVICE_NAME"
printf '  重启服务   systemctl restart %s\n' "$SERVICE_NAME"
printf '  数据备份   cd %s && npm run backup -w server\n' "$APP_DIR"
printf '\n'

# ---------- 9. 后续提示 ----------
cat <<'TIP'
接下来还需要做两件事：

  1) 放行端口
     · 只用 IP 访问 → 在云厂商控制台「安全组」放行 3001
     · 配 nginx    → 放行 80/443，并把 3001 保持在内网（不要对公网开放）

  2) 配 HTTPS（有域名后）
     apt install -y nginx
     cp deploy/nginx.conf /etc/nginx/conf.d/farental.conf
     nginx -t && systemctl reload nginx
     apt install -y certbot python3-certbot-nginx
     certbot --nginx -d 你的域名

  3) 加每日自动备份（crontab -e，每天 3 点）
     0 3 * * * cd /opt/farental && /usr/bin/npm run backup -w server >> /var/log/farental-backup.log 2>&1

提醒：server/data/ 目录是全部业务数据，重新部署代码时不要覆盖或删除它。
TIP
