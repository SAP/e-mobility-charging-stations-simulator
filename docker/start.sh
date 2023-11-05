#!/usr/bin/env sh

node --enable-source-maps dist/start.js &
node webui/start.js
