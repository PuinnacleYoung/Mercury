#!/bin/bash
mkdir -p $(dirname /opt/mercury/index.html)
cp -p /opt/mercury/index.html /opt/mercury/index.html.bak_20261001_231231 2>/dev/null || true
cp /tmp/mcup/opt__mercury__index.html /opt/mercury/index.html || exit 9
chown root:root /opt/mercury/index.html 2>/dev/null || true
echo OK /opt/mercury/index.html
mkdir -p $(dirname /opt/mercury/src/index.html)
cp -p /opt/mercury/src/index.html /opt/mercury/src/index.html.bak_20261001_231231 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__index.html /opt/mercury/src/index.html || exit 9
chown root:root /opt/mercury/src/index.html 2>/dev/null || true
echo OK /opt/mercury/src/index.html
mkdir -p $(dirname /opt/mercury/src/地图编辑引擎.html)
cp -p /opt/mercury/src/地图编辑引擎.html /opt/mercury/src/地图编辑引擎.html.bak_20261001_231231 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__地图编辑引擎.html /opt/mercury/src/地图编辑引擎.html || exit 9
chown root:root /opt/mercury/src/地图编辑引擎.html 2>/dev/null || true
echo OK /opt/mercury/src/地图编辑引擎.html
mkdir -p $(dirname /opt/mercury/src/塔罗编辑引擎.html)
cp -p /opt/mercury/src/塔罗编辑引擎.html /opt/mercury/src/塔罗编辑引擎.html.bak_20261001_231231 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__塔罗编辑引擎.html /opt/mercury/src/塔罗编辑引擎.html || exit 9
chown root:root /opt/mercury/src/塔罗编辑引擎.html 2>/dev/null || true
echo OK /opt/mercury/src/塔罗编辑引擎.html
mkdir -p $(dirname /opt/mercury/src/数据备份与迁移.html)
cp -p /opt/mercury/src/数据备份与迁移.html /opt/mercury/src/数据备份与迁移.html.bak_20261001_231231 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__数据备份与迁移.html /opt/mercury/src/数据备份与迁移.html || exit 9
chown root:root /opt/mercury/src/数据备份与迁移.html 2>/dev/null || true
echo OK /opt/mercury/src/数据备份与迁移.html
mkdir -p $(dirname /opt/mercury/src/服装编辑引擎.html)
cp -p /opt/mercury/src/服装编辑引擎.html /opt/mercury/src/服装编辑引擎.html.bak_20261001_231231 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__服装编辑引擎.html /opt/mercury/src/服装编辑引擎.html || exit 9
chown root:root /opt/mercury/src/服装编辑引擎.html 2>/dev/null || true
echo OK /opt/mercury/src/服装编辑引擎.html
mkdir -p $(dirname /opt/mercury/src/sw.js)
cp -p /opt/mercury/src/sw.js /opt/mercury/src/sw.js.bak_20261001_231231 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__sw.js /opt/mercury/src/sw.js || exit 9
chown root:root /opt/mercury/src/sw.js 2>/dev/null || true
echo OK /opt/mercury/src/sw.js
mkdir -p $(dirname /opt/mercury/sw.js)
cp -p /opt/mercury/sw.js /opt/mercury/sw.js.bak_20261001_231231 2>/dev/null || true
cp /tmp/mcup/opt__mercury__sw.js /opt/mercury/sw.js || exit 9
chown root:root /opt/mercury/sw.js 2>/dev/null || true
echo OK /opt/mercury/sw.js
echo LANDED 8
