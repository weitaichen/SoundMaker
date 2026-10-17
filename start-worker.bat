@echo off
chcp 65001 >nul
title AI Music worker
REM Polls the website for song requests, has Claude write them, renders locally, uploads to Vercel Blob.
REM Settings: worker\.env  (copy from worker\.env.example)
cd /d "%~dp0worker"
if not exist .env (
  echo worker\.env not found. Copy worker\.env.example to worker\.env and fill it in.
  pause
  exit /b 1
)
:loop
call npm start
echo Worker stopped. Restarting in 5 seconds... (close this window to quit)
timeout /t 5 >nul
goto loop
