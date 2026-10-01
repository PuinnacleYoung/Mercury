# -*- coding: utf-8 -*-
"""把本地文件部署到腾讯云 43.138.164.146:/opt/mercury
------------------------------------------------------------------
用法：
  python scripts/deploy.py --files src/index.html src/cloud-sync.js
  python scripts/deploy.py --files src/net-client.js --restart
  python scripts/deploy.py --files "src/登录页面引擎.html" --check "登录页面引擎.html:导出完整包"

坑（踩过多次，别再踩）：
  · /opt/mercury/** 属 root，ubuntu 直接 SFTP 写会 EACCES → 先传 /tmp/mcup，再 sudo 落地
  · --files 必须列全！漏传 = 线上还是旧版，陛下刷新一百遍也没用
  · --check "远程文件:关键字" 会比对「线上出现次数」与「本地出现次数」，不一致就报警
"""
import sys, os, paramiko, warnings, time
warnings.filterwarnings("ignore")

HOST = "43.138.164.146"; USER = "ubuntu"; PASS = "PinnacleYoung02"
ROOT = r"D:\projects\q版换装小游戏"
TMP = "/tmp/mcup"

args = sys.argv[1:]
files, checks, restart = [], [], False
i = 0
while i < len(args):
    a = args[i]
    if a == "--files":
        i += 1
        while i < len(args) and not args[i].startswith("--"):
            files.append(args[i]); i += 1
    elif a == "--check":
        i += 1
        while i < len(args) and not args[i].startswith("--"):
            checks.append(args[i]); i += 1
    elif a == "--restart":
        restart = True; i += 1
    else:
        i += 1

if not files:
    print("用法: python scripts/deploy.py --files a b c [--check remote:kw] [--restart]")
    sys.exit(1)

def remote_of(local):
    lp = local.replace("\\", "/")
    return "/opt/mercury/" + lp           # src/xxx -> /opt/mercury/src/xxx；sw.js -> /opt/mercury/sw.js

def tmp_of(remote):
    """临时名必须带上完整路径，否则 src/sw.js 和 sw.js 会互相覆盖（踩过：把根 sw.js 写进了 src/）"""
    return TMP + "/" + remote.strip("/").replace("/", "__")

pairs = []
for f in files:
    local = os.path.join(ROOT, f.replace("/", os.sep))
    if not os.path.exists(local):
        print("❌ 本地不存在：" + local); sys.exit(2)
    pairs.append((local, remote_of(f)))

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, 22, username=USER, password=PASS, timeout=20, allow_agent=False, look_for_keys=False)
sftp = c.open_sftp()

def sh(cmd, timeout=300):
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode("utf-8", "replace")
    return stdout.channel.recv_exit_status(), out

sh("mkdir -p %s" % TMP)
names = []
for local, remote in pairs:
    # 临时名里带上完整路径：src/sw.js 和 sw.js 同名，都叫 sw.js 会互相覆盖（踩过：src/sw.js 被写成了根 sw.js）
    tmp = TMP + "/" + remote.strip('/').replace('/', '__')
    sftp.put(local, tmp)
    names.append((tmp, remote))
    print("↑ %s (%d B) -> %s" % (os.path.basename(local), os.path.getsize(local), remote))

ts = time.strftime("%Y%m%d_%H%M%S")
lines = ["#!/bin/bash"]
for tmp, remote in names:
    lines.append("mkdir -p $(dirname %s)" % remote)
    lines.append("cp -p %s %s.bak_%s 2>/dev/null || true" % (remote, remote, ts))
    lines.append("cp %s %s || exit 9" % (tmp, remote))
    lines.append("chown root:root %s 2>/dev/null || true" % remote)
    lines.append("echo OK %s" % remote)
lines.append("echo LANDED %d" % len(names))
script = "\n".join(lines) + "\n"
# 必须 LF：CRLF 会让 bash 把 `set -e` 读成 `set -e\r` 直接报 invalid option
with open(os.path.join(ROOT, "scripts", "_up.sh"), "w", encoding="utf-8", newline="\n") as f:
    f.write(script)
sftp.put(os.path.join(ROOT, "scripts", "_up.sh"), TMP + "/up.sh")
print("↑ up.sh")

code, out = sh("echo '%s' | sudo -S bash %s/up.sh" % (PASS, TMP))
print(out.strip())
if code != 0:
    print("❌ 落地失败"); sys.exit(3)
print("✅ 已落地 %d 个文件" % len(names))

# 校验
ok = True
for chk in checks:
    if ":" not in chk: continue
    rfile, kw = chk.split(":", 1)
    rp = rfile if rfile.startswith("/") else "/opt/mercury/" + rfile
    # -e 必须有：关键字带 - / * 时会被 grep 当成选项（--ph-op 就翻过车）
    code, out = sh("grep -cF -e '%s' %s" % (kw, rp))   # -F 按字面找，正则符号不捣乱
    online = out.strip().splitlines()[-1] if out.strip() else "?"
    # 本地计数
    lp = os.path.join(ROOT, rfile.replace("/opt/mercury/", "").replace("/", os.sep))
    localn = "?"
    if os.path.exists(lp):
        with open(lp, "r", encoding="utf-8", errors="ignore") as f:
            localn = str(f.read().count(kw))
    mark = "✅" if str(online) == str(localn) else "⚠️"
    if mark == "⚠️": ok = False
    print("%s 校验 %s 关键字「%s」：线上 %s / 本地 %s" % (mark, rfile, kw, online, localn))

if restart:
    code, out = sh("echo '%s' | sudo -S systemctl restart mercury && sleep 1 && systemctl is-active mercury" % PASS)
    print("🔄 mercury: " + out.strip().splitlines()[-1])

sftp.close(); c.close()
sys.exit(0 if ok else 4)
