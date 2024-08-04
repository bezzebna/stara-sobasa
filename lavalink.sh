#!/bin/sh
cd "$(dirname "$0")"
[ -f Lavalink.jar ] || curl -OL https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar
screen -Logfile lavalink.log -dmSL lavalink java -jar Lavalink.jar
