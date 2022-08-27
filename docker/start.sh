#!/usr/bin/env sh

node -r source-map-support/register dist/start.cjs &
node webui/start.js
