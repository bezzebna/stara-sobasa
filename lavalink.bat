@echo off
cd /d "%~dp0"
if not exist Lavalink.jar curl -OL https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar
java -jar Lavalink.jar
