#!/usr/bin/env bash
# ============================================================
# 拾光·澈屿 · 一键部署脚本（Ubuntu / Debian / CentOS 通用）
# 用法：把整个包解压到服务器上任意目录，然后：
#       sudo bash deploy/deploy.sh
# ============================================================
set -e

PKG="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/mercury
GREEN='\033[32m'; YELLOW='\033[33m'; NC='\033[0m'
say(){ echo -e "${GREEN}[部署]${NC} $1"; }
warn(){ echo -e "${YELLOW}[注意]${NC} $1"; }

# ---------- 1. Node ----------
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  say "安装 Node 20 ..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - || true
    apt-get install -y nodejs
  elif command -v yum >/dev/null 2>&1 || command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - || true
    (yum install -y nodejs || dnf install -y nodejs)
  fi
fi
say "Node 版本：$(node -v)"

# ---------- 2. 拷贝代码 ----------
say "部署代码到 $APP ..."
mkdir -p "$APP"
cp -rf "$PKG/src"     "$APP/" 2>/dev/null || true
cp -rf "$PKG/server"  "$APP/" 2>/dev/null || true
cp -f  "$PKG/index.html" "$APP/" 2>/dev/null || true
cp -f  "$PKG/manifest.webmanifest" "$APP/" 2>/dev/null || true
cp -f  "$PKG/responsive.css" "$APP/" 2>/dev/null || true
cp -f  "$PKG/responsive.js" "$APP/" 2>/dev/null || true
cp -f  "$PKG/orientation-lock.js" "$APP/" 2>/dev/null || true
cp -f  "$PKG/pwa-install.js" "$APP/" 2>/dev/null || true
cp -rf "$PKG/icons"   "$APP/" 2>/dev/null || true
cp -rf "$PKG/scripts" "$APP/" 2>/dev/null || true
[ -f "$APP/server/data.json" ] || echo '{ "accounts":{}, "mails":{}, "friends":{}, "seq":0 }' > "$APP/server/data.json"
chmod -R 755 "$APP"

# ---------- 3. nginx ----------
if ! command -v nginx >/dev/null 2>&1; then
  say "安装 nginx ..."
  if command -v apt-get >/dev/null 2>&1; then apt-get update -y && apt-get install -y nginx;
  else (yum install -y nginx || dnf install -y nginx); fi
fi
say "写入 nginx 配置 ..."
mkdir -p /etc/nginx/conf.d
cp -f "$PKG/deploy/nginx-http.conf" /etc/nginx/conf.d/mercury.conf
# 干掉默认站点，避免抢占 80
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
if [ -f /etc/nginx/nginx.conf ] && grep -q "sites-enabled" /etc/nginx/nginx.conf; then :; fi
nginx -t
systemctl enable nginx
systemctl restart nginx
say "nginx 已启动"

# ---------- 4. 联机服务（systemd 守护） ----------
say "注册联机服务 ..."
cp -f "$PKG/deploy/mercury.service" /etc/systemd/system/mercury.service
systemctl daemon-reload
systemctl enable mercury
systemctl restart mercury
sleep 2
systemctl is-active --quiet mercury && say "联机服务已启动（8090）" || { warn "联机服务没起来，看日志：tail -50 /var/log/mercury.log"; exit 1; }

# ---------- 5. 防火墙 ----------
if command -v ufw >/dev/null 2>&1; then ufw allow 80/tcp >/dev/null 2>&1; ufw allow 443/tcp >/dev/null 2>&1; fi
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=80/tcp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port=443/tcp >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
fi

# ---------- 6. 自检 ----------
IP=$(curl -s -m 5 ifconfig.me || hostname -I | awk '{print $1}')
say "自检联机端口："
curl -s -m 5 "http://127.0.0.1:8090/health" || warn "健康检查没响应"
echo
say "=============================================="
say "部署完成！"
say "  导航首页： http://$IP/"
say "  游戏入口： http://$IP/src/index.html"
say "  联机状态： http://$IP:8090/health"
say "=============================================="
warn "云服务器控制台的【安全组/防火墙】必须放行 80、443（8090 不用放行，走 nginx 反代）"
warn "后台管理默认口令 ADMIN_KEY=change_me_please，请改 /etc/systemd/system/mercury.service 后 systemctl restart mercury"
