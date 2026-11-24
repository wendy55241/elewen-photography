@echo off
cd /d "%~dp0"
start "" "http://127.0.0.1:4262/"
node tools\serve.mjs 4262
pause
