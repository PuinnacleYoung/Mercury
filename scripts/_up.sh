#!/bin/bash
mkdir -p $(dirname /opt/mercury/src/card-games.js)
cp -p /opt/mercury/src/card-games.js /opt/mercury/src/card-games.js.bak_20261004_015946 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__card-games.js /opt/mercury/src/card-games.js || exit 9
chown root:root /opt/mercury/src/card-games.js 2>/dev/null || true
echo OK /opt/mercury/src/card-games.js
mkdir -p $(dirname /opt/mercury/src/index.html)
cp -p /opt/mercury/src/index.html /opt/mercury/src/index.html.bak_20261004_015946 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__index.html /opt/mercury/src/index.html || exit 9
chown root:root /opt/mercury/src/index.html 2>/dev/null || true
echo OK /opt/mercury/src/index.html
mkdir -p $(dirname /opt/mercury/src/sw.js)
cp -p /opt/mercury/src/sw.js /opt/mercury/src/sw.js.bak_20261004_015946 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__sw.js /opt/mercury/src/sw.js || exit 9
chown root:root /opt/mercury/src/sw.js 2>/dev/null || true
echo OK /opt/mercury/src/sw.js
mkdir -p $(dirname /opt/mercury/sw.js)
cp -p /opt/mercury/sw.js /opt/mercury/sw.js.bak_20261004_015946 2>/dev/null || true
cp /tmp/mcup/opt__mercury__sw.js /opt/mercury/sw.js || exit 9
chown root:root /opt/mercury/sw.js 2>/dev/null || true
echo OK /opt/mercury/sw.js
echo LANDED 4
