@echo off
chcp 65001 >nul
REM Starts the ACE-Step engine and the worker, each in its own window.
start "ACE-Step API" cmd /c "%~dp0start-acestep.bat"
start "AI Music worker" cmd /c "%~dp0start-worker.bat"
