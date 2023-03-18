#!/usr/bin/env sh

node -r source-map-support/register dist/start.mjs &
node webui/start.js
