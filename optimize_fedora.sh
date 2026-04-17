#!/usr/bin/env bash
# =============================================================================
# FEDORA SYSTEM OPTIMIZATION SCRIPT
# Targeted at solving I/O bottlenecks and D-State stalls on ThinkPad E15 Gen 2
# =============================================================================

# WHY: Based on diag data, localsearch-3 (Tracker) and heavy browser I/O
# saturate the SATA-USB HDD bridge, leading to high %wa and UI freezes.

# Check for root/sudo
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)"
   exit 1
fi

log() {
    echo "[$(date '+%F %T')] $*"
}

# 1. DISABLE GNOME TRACKER (localsearch-3)
# WHY: Tracker indexer is the #1 cause of D-state stalls in your logs.
# REF: https://fedoraproject.org/wiki/Common_F39_bugs#Tracker_high_IO
log "Stopping and masking Tracker / localsearch-3 services..."
systemctl --user -M owner@ stop tracker-miner-fs-3.service tracker-extract-3.service 2>/dev/null
systemctl --user -M owner@ mask tracker-miner-fs-3.service tracker-extract-3.service 2>/dev/null
pkill -9 -f localsearch-3 2>/dev/null || true

# 2. TUNING SWAPPINESS AND VM CACHE
# WHY: On systems with high disk latency, frequent swap-out kills responsiveness.
# REF: https://www.kernel.org/doc/Documentation/sysctl/vm.txt
log "Tuning VM subsystems (swappiness=10, dirty_ratios)..."
sysctl -w vm.swappiness=10
sysctl -w vm.dirty_ratio=10
sysctl -w vm.dirty_background_ratio=5
sysctl -w vm.vfs_cache_pressure=50 # Bias toward keeping VFS cache (inodes/dentries)

# 3. IO SCHEDULER TUNING
# WHY: Mechanical HDDs (sda) benefit from 'bfq' or 'mq-deadline'.
# REF: https://wiki.ubuntu.com/Kernel/Reference/IOSchedulers
log "Setting I/O scheduler for rotational devices (sda)..."
if [ -e /sys/block/sda/queue/scheduler ]; then
    echo "bfq" > /sys/block/sda/queue/scheduler 2>/dev/null || echo "mq-deadline" > /sys/block/sda/queue/scheduler
fi

# 4. RENICE HEAVY BROWSER PROCESSES
# WHY: Firefox content processes often contend for CPU/IO during playback/recording.
log "Lowering priority for Firefox content processes..."
pgrep -f "firefox.*-contentproc" | xargs -r renice +10 -p
pgrep -f "firefox.*-contentproc" | xargs -r ionice -c 3 -p

# 5. ZRAM OPTIMIZATION
# WHY: Fedora uses zram by default. High compression can save slow disk writes.
# REF: https://github.com/systemd/zram-generator
log "Checking zram status..."
zramctl

# 6. CLEAR RECLAIMABLE MEMORY
# WHY: Recover memory from page cache immediately to ease pressure.
log "Dropping reclaimable page cache..."
sync && echo 3 > /proc/sys/vm/drop_caches

# 7. VA-API ENABLING FOR FFMPEG (Instruction to user)
# WHY: lspci showed AMD Renoir. Software encoding Vp9 is too heavy.
# REF: https://docs.fedoraproject.org/en-US/quick-docs/switching-to-rpm-fusion/
log "ADVISORY: Use hardware acceleration for recording."
log "H264 VA-API command: ffmpeg -vaapi_device /dev/dri/renderD128 -f x11grab ... -c:v h264_vaapi output.mp4"

log "Optimization complete. System load should descend over the next 2-3 minutes."
uptime
free -h
