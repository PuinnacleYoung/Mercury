#!/bin/bash
mkdir -p $(dirname /opt/mercury/src/card-games.js)
cp -p /opt/mercury/src/card-games.js /opt/mercury/src/card-games.js.bak_20261002_202837 2>/dev/null || true
cp /tmp/mcup/opt__mercury__src__card-games.js /opt/mercury/src/card-games.js || exit 9
chown root:root /opt/mercury/src/card-games.js 2>/dev/null || true
echo OK /opt/mercury/src/card-games.js
echo LANDED 1
