#!/usr/bin/env python3
# =============================================================================
# IO CAUSALITY PROBE v29 (ULTIMATE ASYNC + KERNEL STACK + WEIGHTED GRAPH)
# =============================================================================
# PURPOSE:
#   High-fidelity causal event engine mapping IO -> D-State -> PSI -> User Latency.
#
# v29 FIXES (Post-Audit):
#   1. ASYNC SNAPSHOTS: Queue-based background writes to avoid loop stalls.
#   2. REAL LATENCY: Measure path-bound fsync delay (no synthetic CPU loops).
#   3. GRAPH WEIGHTING: Restored 0.85/0.15 magnitude preservation model.
#   4. ROBUST PARSING: Safe split indexing and PID caching.
#   5. KERNEL DUMPS: Immediate stack trace capture on spike detection.
# =============================================================================

import os
import time
import json
import signal
import threading
import subprocess
from queue import Queue, Empty
from collections import deque, defaultdict
from datetime import datetime

# --- CONFIG ---
INTERVAL_IDLE = 5
INTERVAL_ACTIVE = 1
WINDOW_SIZE = 15
IO_THRESHOLD = 50000  # Based on observed 60k-1.1M spike range in v26 logs
OUTDIR = os.path.abspath("./io_probe_logs_v29")
os.makedirs(OUTDIR, exist_ok=True)

# --- STATE ---
self_pid = os.getpid()
history = deque(maxlen=WINDOW_SIZE)
graph = defaultdict(float)
loop_score = defaultdict(float)
proc_prev = {}
psi_prev = None
run_state = {"running": True}
snapshot_queue = Queue()

def log(msg):
    print(f"[{datetime.now().strftime('%F %T')}] {msg}", flush=True)

def run_cmd(cmd, timeout=3):
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if res.returncode != 0:
            return f"[CMD ERROR] Exit code {res.returncode}\n{res.stderr}"
        return res.stdout
    except subprocess.TimeoutExpired:
        return "[TIMEOUT] Command took too long"
    except Exception as e:
        return f"[CMD FAILURE] {e}"

# --- ASYNC LOG WRITER ---
def snapshot_worker():
    while run_state["running"] or not snapshot_queue.empty():
        try:
            item = snapshot_queue.get(timeout=1)
            ts, meta, raw_data = item
            
            d_path = os.path.join(OUTDIR, ts)
            os.makedirs(d_path, exist_ok=True)
            
            # Atomic write for JSON metadata
            meta_path = os.path.join(d_path, "event.json")
            tmp_meta_path = meta_path + ".tmp"
            with open(tmp_meta_path, "w") as f:
                json.dump(meta, f, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.rename(tmp_meta_path, meta_path)
            
            # Write forensic artifacts
            for name, content in raw_data.items():
                artifact_path = os.path.join(d_path, f"{name}.txt")
                tmp_artifact_path = artifact_path + ".tmp"
                with open(tmp_artifact_path, "w") as f:
                    f.write(content)
                os.rename(tmp_artifact_path, artifact_path)

            log(f"Async atomic snapshot flushed: {ts}")
        except Empty:
            continue
        except Exception as e:
            log(f"Snapshot worker failure: {e}")

_worker_thread = threading.Thread(target=snapshot_worker, daemon=True)
_worker_thread.start()

# --- SIGNALS ---
def get_psi():
    try:
        with open("/proc/pressure/io") as f:
            for line in f:
                if line.startswith("some"):
                    return float(line.split()[3].split("=")[1])
    except: return 0.0
    return 0.0

def get_iowait():
    try:
        with open("/proc/stat") as f:
            line = f.readline()
            if not line.startswith("cpu "): return 0
            v = list(map(int, line.split()[1:]))
            return v[4] # iowait index
    except: return 0

def measure_real_latency(path="/var/tmp"):
    fname = f"{path}/.probe_lat_{os.getpid()}_{time.time_ns()}"
    t0 = time.perf_counter()
    try:
        with open(fname, "wb") as f:
            f.write(os.urandom(4096))
            f.flush()
            os.fsync(f.fileno())
        os.remove(fname)
    except: return -1.0
    return (time.perf_counter() - t0) * 1000

def get_d_state_pids():
    pids = []
    for p in [p for p in os.listdir("/proc") if p.isdigit()]:
        try:
            with open(f"/proc/{p}/stat") as f:
                if f.read().split()[2] == "D":
                    pids.append(int(p))
        except: continue
    return pids

def get_proc_io_delta():
    global proc_prev
    current = {}
    total_delta = 0
    for p in [p for p in os.listdir("/proc") if p.isdigit()]:
        try:
            pid = int(p)
            if pid == self_pid: continue
            with open(f"/proc/{p}/io") as f:
                bytes_val = 0
                for line in f:
                    if "read_bytes" in line or "write_bytes" in line:
                        bytes_val += int(line.split(":")[1])
                current[pid] = bytes_val
                if pid in proc_prev:
                    total_delta += max(0, bytes_val - proc_prev[pid])
        except: continue
    proc_prev = current
    return total_delta

# --- CAUSAL GRAPH (WEIGHTED) ---
def update_causal_graph(prev, cur):
    edges = []
    
    # IO -> D (Cause: Data movement leads to scheduler block)
    if prev.get("io", 0) > IO_THRESHOLD and cur.get("d_count", 0) > 0:
        edges.append(("IO->D", prev["io"]))
        
    # D -> PSI (Cause: Stalled tasks increase pressure metric)
    if prev.get("d_count", 0) > 0 and cur["psi"] > prev["psi"]:
        edges.append(("D->PSI", (cur["psi"] - prev["psi"]) * 100))
        
    # PSI -> LAT (Cause: Kernel pressure delays userspace response)
    if cur["psi"] > prev["psi"] and cur["lat"] > prev["lat"] and cur["lat"] > 100:
        edges.append(("PSI->LAT", cur["lat"]))

    # v29 Magnitude Preservation Formula (0.85/0.15)
    active_edge_names = []
    for e, w in edges:
        graph[e] = graph[e] * 0.85 + w * 0.15
        active_edge_names.append(e)
    
    return active_edge_names

# --- MAIN LOOP ---
log("[START] IO CAUSALITY PROBE v29 running...")

def handle_exit(signum, frame):
    run_state["running"] = False
    log("Termination received. Flushing logs...")

signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)

while run_state["running"]:
    t_start = time.perf_counter()
    
    psi = get_psi()
    lat = measure_real_latency()
    io_delta = get_proc_io_delta()
    d_pids = get_d_state_pids()
    
    state = {
        "lat": lat,
        "psi": psi,
        "io": io_delta,
        "d_count": len(d_pids),
        "d_pids": d_pids
    }
    
    active_edges = []
    if history:
        active_edges = update_causal_graph(history[-1], state)
        
    history.append(state)
    
    # TRIGGER LOGIC
    is_anomaly = lat > 150 or psi > 15.0 or len(active_edges) > 1
    
    if is_anomaly:
        log(f"ANOMALY: lat={int(lat)}ms psi={psi:.2f} edges={active_edges}")
        
        # Capture raw artifacts
        raw = {
            "ps": run_cmd(["ps", "-eo", "pid,ppid,state,cmd,%cpu,%mem", "--sort=-%cpu"]),
            "top": run_cmd(["top", "-bn1"]),
            "dmesg": run_cmd(["dmesg", "-T"]), # Simplified, server-side can trace if needed
        }
        
        # Capture stack traces for D-State processes
        stack_content = ""
        for dp in d_pids[:5]:
            stack_content += f"\n--- PID {dp} Stack ---\n"
            stack_content += run_cmd(["cat", f"/proc/{dp}/stack"])
            stack_content += f"\n--- PID {dp} WChan ---\n"
            stack_content += run_cmd(["cat", f"/proc/{dp}/wchan"])
        raw["stacks"] = stack_content
        
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        snapshot_queue.put((ts, {"state": state, "edges": active_edges, "graph": dict(graph)}, raw))
        
    log(f"Cycle end: lat={int(lat)}ms psi={psi:.2f} io={io_delta} d={len(d_pids)} edges={len(active_edges)}")
    
    # Adaptive sleep
    target_interval = INTERVAL_ACTIVE if is_anomaly else INTERVAL_IDLE
    elapsed = time.perf_counter() - t_start
    time.sleep(max(0, target_interval - elapsed))

# Drain queued snapshots before exit (survives SIGTERM from parent supervisor)
_worker_thread.join(timeout=5)
log("Probe exited cleanly.")
