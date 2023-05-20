#!/usr/bin/env sh

node -r source-map-support/register dist/start.js &
node webui/start.js
