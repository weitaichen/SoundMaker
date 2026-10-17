@echo off
chcp 65001 >nul
title ACE-Step API (port 8001)
REM Local ACE-Step 1.5 music engine. First start downloads the models (~11 GB).
set ACESTEP_CONFIG_PATH=acestep-v15-turbo
REM "精緻模式" uses ACE-Step's small planning LM. On an 8 GB GPU it must run on the
REM CPU, otherwise the GPU runs out of memory and audio decoding becomes very slow.
set ACESTEP_INIT_LLM=true
set ACESTEP_LM_MODEL_PATH=acestep-5Hz-lm-0.6B
set ACESTEP_LM_DEVICE=cpu
set ACESTEP_LM_BACKEND=pt
cd /d "%~dp0engines\ACE-Step-1.5"
uv run acestep-api --host 127.0.0.1 --port 8001
pause
