#!/usr/bin/env bash
# =============================================================================
# OPTIMIZER_OS SELF-HEAL MODULE
# Automatically resolves environmental inconsistencies.
# =============================================================================

echo "[AUDIT] Starting Kinetic Self-Healing sequence..."

# 1. Directory Integrity
DIRS=("./io_probe_logs_v29" "./tuning_profiles")
for dir in "${DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        echo "[FIX] Creating missing directory: $dir"
        mkdir -p "$dir"
    fi
done

# 2. Artifact Cleanup
echo "[FIX] Purging transient .tmp artifacts..."
find . -name "*.tmp" -delete

# 3. Permissions Alignment
echo "[FIX] Aligning filesystem execution bits..."
chmod +x dev.sh io_causality_probe_v29.py self-heal.sh

# 4. Dependency Check
if ! command -v python3 &> /dev/null; then
    echo "[CRITICAL] python3 not found. Forensic engine will remain offline."
else
    echo "[PASS] python3 runtime verified."
fi

# 5. Kernel Capability Audit
if [ ! -f /proc/pressure/io ]; then
    echo "[WARN] Kernel PSI not detected. Threshold triggers may be downgraded to Latency-only."
else
    echo "[PASS] Kernel PSI tracepoints active."
fi

echo "[FINISH] Self-healing cycle complete. Environment normalized."
