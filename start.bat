@echo off
cd /d "%~dp0"
if not exist node_modules pnpm i || npm i
node .
