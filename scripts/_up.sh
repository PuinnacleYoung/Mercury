#!/bin/bash
mkdir -p $(dirname /opt/mercury/src/card-games.js)
cp -p /opt/mercury/src/card-games.js /opt/mercury/src/card-games.js.bak_20261005_001704 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__card-games.js /opt/mercury/src/card-games.js || exit 9
chown root:root /opt/mercury/src/card-games.js 2>/dev/null || true
echo OK /opt/mercury/src/card-games.js
mkdir -p $(dirname /opt/mercury/src/fl-board.js)
cp -p /opt/mercury/src/fl-board.js /opt/mercury/src/fl-board.js.bak_20261005_001704 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__fl-board.js /opt/mercury/src/fl-board.js || exit 9
chown root:root /opt/mercury/src/fl-board.js 2>/dev/null || true
echo OK /opt/mercury/src/fl-board.js
mkdir -p $(dirname /opt/mercury/src/index.html)
cp -p /opt/mercury/src/index.html /opt/mercury/src/index.html.bak_20261005_001704 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__index.html /opt/mercury/src/index.html || exit 9
chown root:root /opt/mercury/src/index.html 2>/dev/null || true
echo OK /opt/mercury/src/index.html
mkdir -p $(dirname /opt/mercury/src/棋牌引擎.html)
cp -p /opt/mercury/src/棋牌引擎.html /opt/mercury/src/棋牌引擎.html.bak_20261005_001704 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__棋牌引擎.html /opt/mercury/src/棋牌引擎.html || exit 9
chown root:root /opt/mercury/src/棋牌引擎.html 2>/dev/null || true
echo OK /opt/mercury/src/棋牌引擎.html
mkdir -p $(dirname /opt/mercury/src/sw.js)
cp -p /opt/mercury/src/sw.js /opt/mercury/src/sw.js.bak_20261005_001704 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__sw.js /opt/mercury/src/sw.js || exit 9
chown root:root /opt/mercury/src/sw.js 2>/dev/null || true
echo OK /opt/mercury/src/sw.js
mkdir -p $(dirname /opt/mercury/sw.js)
cp -p /opt/mercury/sw.js /opt/mercury/sw.js.bak_20261005_001704 2>/dev/null || true
cp /tmp/mcup/opt__mercury__sw.js /opt/mercury/sw.js || exit 9
chown root:root /opt/mercury/sw.js 2>/dev/null || true
echo OK /opt/mercury/sw.js
echo LANDED 6
