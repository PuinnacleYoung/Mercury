#!/bin/bash
mkdir -p $(dirname /opt/mercury/src/cloud-sync.js)
cp -p /opt/mercury/src/cloud-sync.js /opt/mercury/src/cloud-sync.js.bak_20261001_222602 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__cloud-sync.js /opt/mercury/src/cloud-sync.js || exit 9
chown root:root /opt/mercury/src/cloud-sync.js 2>/dev/null || true
echo OK /opt/mercury/src/cloud-sync.js
mkdir -p $(dirname /opt/mercury/src/服装编辑引擎.html)
cp -p /opt/mercury/src/服装编辑引擎.html /opt/mercury/src/服装编辑引擎.html.bak_20261001_222602 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__服装编辑引擎.html /opt/mercury/src/服装编辑引擎.html || exit 9
chown root:root /opt/mercury/src/服装编辑引擎.html 2>/dev/null || true
echo OK /opt/mercury/src/服装编辑引擎.html
mkdir -p $(dirname /opt/mercury/src/周边制作引擎.html)
cp -p /opt/mercury/src/周边制作引擎.html /opt/mercury/src/周边制作引擎.html.bak_20261001_222602 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__周边制作引擎.html /opt/mercury/src/周边制作引擎.html || exit 9
chown root:root /opt/mercury/src/周边制作引擎.html 2>/dev/null || true
echo OK /opt/mercury/src/周边制作引擎.html
mkdir -p $(dirname /opt/mercury/src/登录页面引擎.html)
cp -p /opt/mercury/src/登录页面引擎.html /opt/mercury/src/登录页面引擎.html.bak_20261001_222602 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__登录页面引擎.html /opt/mercury/src/登录页面引擎.html || exit 9
chown root:root /opt/mercury/src/登录页面引擎.html 2>/dev/null || true
echo OK /opt/mercury/src/登录页面引擎.html
mkdir -p $(dirname /opt/mercury/src/sw.js)
cp -p /opt/mercury/src/sw.js /opt/mercury/src/sw.js.bak_20261001_222602 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__sw.js /opt/mercury/src/sw.js || exit 9
chown root:root /opt/mercury/src/sw.js 2>/dev/null || true
echo OK /opt/mercury/src/sw.js
mkdir -p $(dirname /opt/mercury/sw.js)
cp -p /opt/mercury/sw.js /opt/mercury/sw.js.bak_20261001_222602 2>/dev/null || true
cp /tmp/mcup/opt__mercury__sw.js /opt/mercury/sw.js || exit 9
chown root:root /opt/mercury/sw.js 2>/dev/null || true
echo OK /opt/mercury/sw.js
echo LANDED 6
