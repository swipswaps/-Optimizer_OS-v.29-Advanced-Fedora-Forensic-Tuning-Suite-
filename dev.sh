#!/usr/bin/env bash
# =============================================================================
# OPTIMIZER_OS DEV WRAPPER
# Handles self-updates and single-instance verification
# =============================================================================

# 1. VERSION CHECK / SELF-UPDATE
if [ -d .git ]; then
    echo "[SYSTEM] Checking for repository updates..."
    git fetch origin main &>/dev/null
    UPSTREAM_HASH=$(git rev-parse "@{u}")
    LOCAL_HASH=$(git rev-parse "@")
    if [ "$LOCAL_HASH" != "$UPSTREAM_HASH" ]; then
        echo "[UPDATE] New version detected. Pulling changes..."
        git pull origin main
        npm install
    else
        echo "[SYSTEM] Codebase is up to date."
    fi
fi

# 2. SELF-HEAL / PRE-FLIGHT
bash self-heal.sh

# 3. INSTANCE VERIFICATION
PORT=3000
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; then
    echo "[ERROR] Port $PORT is already in use."
    echo "[HINT] Is another instance of Optimizer_OS running? Kill it first."
    exit 1
fi

# 3. START SERVER
echo "[LAUNCH] Starting Optimizer_OS Forensic Suite..."
exec npx tsx server.ts
