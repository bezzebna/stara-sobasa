#!/bin/sh
cd "$(dirname "$0")"
[ -d node_modules ] || pnpm i || npm i
screen -Logfile bot.log -dmSL bot node .
