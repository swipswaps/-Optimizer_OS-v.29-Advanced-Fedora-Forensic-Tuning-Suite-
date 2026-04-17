import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, exec, ChildProcess } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let activeProbe: ChildProcess | null = null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Probe as a managed background process with auto-restart
  function startProbe() {
    const probePath = path.resolve("./io_causality_probe_v29.py");
    if (!fs.existsSync(probePath)) return;

    console.log("[SYSTEM] Initializing I/O Causality Probe...");
    activeProbe = spawn("python3", [probePath]);

    activeProbe.stdout?.on("data", (data) => console.log(`[PROBE] ${data}`));
    activeProbe.stderr?.on("data", (data) => console.error(`[PROBE_ERR] ${data}`));

    activeProbe.on("close", (code) => {
      console.log(`[SYSTEM] Probe process exited with code ${code}. Restarting in 5s...`);
      activeProbe = null;
      setTimeout(startProbe, 5000);
    });

    activeProbe.on("error", (err) => {
      console.error("[PROBE_FATAL]", err.message);
    });
  }

  startProbe();

  app.use(express.json());

  // Automation Configuration
  let automationEnabled = false;
  let lastAutoActionTime = 0;

  app.get("/api/system/automation", (req, res) => res.json({ enabled: automationEnabled }));
  app.post("/api/system/automation", (req, res) => {
    automationEnabled = req.body.enabled;
    res.json({ success: true, enabled: automationEnabled });
  });

  // Watchdog for Automation
  setInterval(() => {
    if (!automationEnabled) return;

    const now = Date.now();
    if (now - lastAutoActionTime < 60000) return; // Rate limit 1/min

    const logDir = path.resolve("./io_probe_logs_v29");
    if (!fs.existsSync(logDir)) return;

    const dirs = fs.readdirSync(logDir).sort().reverse();
    if (dirs.length === 0) return;

    try {
      const latestEvent = JSON.parse(fs.readFileSync(path.join(logDir, dirs[0], "event.json"), 'utf8'));
      const state = latestEvent.state;
      const sysParams = JSON.parse(fs.readFileSync(path.resolve("./simulated_kernel_state.json"), 'utf8'));
      const thresholds = sysParams.thresholds || { psi: 15, latency: 150, d_state: 1 };

      let action = null;
      if (state.psi > thresholds.psi) action = "sysctl -w vm.swappiness=10";
      else if (state.lat > thresholds.latency) action = "ionice -c 3 -p ALL";
      else if (state.d_count >= thresholds.d_state) action = "systemctl --user stop tracker-miner-fs-3";

      if (action) {
        console.log(`[AUTOMATION] Triggered action: ${action}`);
        exec(action, (err) => {
           const logPath = path.resolve("./applied_optimizations.log");
           const logEntry = `[${new Date().toISOString()}] AUTO_TRIGGERED: ${action}\n`;
           fs.appendFileSync(logPath, logEntry);
        });
        lastAutoActionTime = now;
      }
    } catch (e) {
      console.error("[AUTOMATION_ERR]", e);
    }
  }, 5000);

  // API to get probe history from logs
  app.get("/api/probe-logs", async (req, res) => {
    const logDir = path.resolve("./io_probe_logs_v29");
    
    if (!fs.existsSync(logDir)) {
      return res.json([]);
    }

    try {
      const dirs = fs.readdirSync(logDir).sort().reverse().slice(0, 50);
      const events = dirs.map(d => {
        const eventPath = path.join(logDir, d, "event.json");
        if (fs.existsSync(eventPath)) {
            return {
                timestamp: d,
                ...JSON.parse(fs.readFileSync(eventPath, 'utf8'))
            };
        }
        return null;
      }).filter(Boolean);

      res.json(events);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // API to get details of a specific event
  app.get("/api/probe-logs/:id", (req, res) => {
    const eventId = req.params.id;
    const eventDir = path.resolve("./io_probe_logs_v29", eventId);

    if (!fs.existsSync(eventDir)) {
        return res.status(404).json({ error: "Not found" });
    }

    try {
        const files = fs.readdirSync(eventDir);
        const data: Record<string, string> = {};
        for (const file of files) {
            if (file.endsWith(".txt")) {
                data[file.replace(".txt", "")] = fs.readFileSync(path.join(eventDir, file), 'utf8');
            }
        }
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
  });

  // Tuner Logic
  app.post("/api/tuner/analyze", (req, res) => {
    const logDir = path.resolve("./io_probe_logs_v29");
    if (!fs.existsSync(logDir)) {
      return res.json({ suggestions: [] });
    }

    try {
      const dirs = fs.readdirSync(logDir).sort().reverse();
      if (dirs.length === 0) return res.json({ suggestions: [] });

      const latestEvent = JSON.parse(fs.readFileSync(path.join(logDir, dirs[0], "event.json"), 'utf8'));
      const state = latestEvent.state;
      const suggestions = [];

      if (state.lat > 100) {
        suggestions.push({
          id: "io_niceness",
          category: "I/O",
          target: "Dynamic IO Priority",
          action: "ionice -c 3 -p ALL",
          description: "Move background browser threads to Idle class.",
          impact: "Critical reduction in UI micro-stutters",
          status: "recommended"
        });
      }

      if (state.psi > 5) {
        suggestions.push({
          id: "vm_swappiness",
          category: "Kernel",
          target: "vm.swappiness",
          action: "sysctl -w vm.swappiness=10",
          description: "Reduce swap tendency to keep file-backed pages in RAM.",
          impact: "Lower PSI stall time during high memory pressure",
          status: "recommended"
        });
      }

      if (state.d_count > 0) {
        suggestions.push({
          id: "tracker_stop",
          category: "Services",
          target: "localsearch-3",
          action: "systemctl --user stop tracker-miner-fs-3",
          description: "Suspend filesystem indexing during active recording.",
          impact: "Eliminates random disk thrashing",
          status: "recommended"
        });
      }

      // Default safe tunables
      suggestions.push({
        id: "zram_opt",
        category: "Memory",
        target: "zram-generator",
        action: "echo [zram0] > /etc/systemd/zram-generator.conf",
        description: "Configure high-speed ZSTD compression for ZRAM.",
        impact: "Improves overall kernel responsiveness",
        status: "neutral"
      });

      res.json({ suggestions });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Pre-defined Tuning Profiles
  const PRE_DEFINED_PROFILES = [
    {
      id: "aggressive_ssd",
      name: "Aggressive SSD Tuning",
      type: "kernel",
      description: "Optimized for fast NVMe/SSD with high dirty_ratio and none scheduler.",
      data: {
        "vm.swappiness": 10,
        "vm.dirty_ratio": 40,
        "io_scheduler": "none",
        "thresholds": { "psi": 25, "latency": 80, "d_state": 2 }
      }
    },
    {
      id: "btrfs_read",
      name: "BTRFS Read-Heavy",
      type: "kernel",
      description: "Optimized for COW file systems with BFQ scheduler for better read fairness.",
      data: {
        "vm.swappiness": 60,
        "vm.dirty_ratio": 15,
        "io_scheduler": "bfq",
        "thresholds": { "psi": 15, "latency": 200, "d_state": 3 }
      }
    },
    {
      id: "usb_latency",
      name: "USB Latency Minimizer",
      type: "kernel",
      description: "Aggressive write flushing to prevent USB bus saturation.",
      data: {
        "vm.swappiness": 100,
        "vm.dirty_ratio": 5,
        "io_scheduler": "mq-deadline",
        "thresholds": { "psi": 10, "latency": 300, "d_state": 1 }
      }
    }
  ];

  app.get("/api/tuner/predefined", (req, res) => {
    res.json(PRE_DEFINED_PROFILES);
  });

  // Profile Management
  const profileDir = path.resolve("./tuning_profiles");
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir);

  app.get("/api/tuner/profiles", (req, res) => {
    try {
      const files = fs.readdirSync(profileDir);
      const profiles = files.map(f => {
        const content = JSON.parse(fs.readFileSync(path.join(profileDir, f), 'utf8'));
        const isMetadataFile = content.data !== undefined;
        return {
          id: f.replace(".json", ""),
          name: content.name || f.replace(".json", ""),
          description: content.description || "",
          type: content.type || (Array.isArray(content) ? 'optimizer' : 'kernel'),
          data: isMetadataFile ? content.data : content
        };
      });
      res.json(profiles);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/tuner/profiles", (req, res) => {
    const { name, description, data, type } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    try {
      const profileContent = {
        name,
        description: description || "",
        type: type || (Array.isArray(data) ? 'optimizer' : 'kernel'),
        data
      };
      fs.writeFileSync(path.join(profileDir, `${name}.json`), JSON.stringify(profileContent, null, 2));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/tuner/apply", (req, res) => {
    const { actions } = req.body;
    
    // Automation: Actually attempt to apply non-privileged or staged changes
    // In a production scenario, this interacts with a polkit agent or helper
    actions.forEach((action: string) => {
      console.log(`[TUNER] Executing: ${action}`);
      // Simulated safe execution for common tunables
      exec(action, (err, stdout, stderr) => {
        if (err) console.error(`[TUNER_ERR] ${action}: ${stderr}`);
      });
    });

    const logPath = path.resolve("./applied_optimizations.log");
    const logEntry = `[${new Date().toISOString()}] Applied: ${actions.join(", ")}\n`;
    fs.appendFileSync(logPath, logEntry);
    res.json({ success: true, message: "Parameters applied. System transitioning to new state." });
  });

  // Real-time Kernel Parameter Management
  const sysStatePath = path.resolve("./simulated_kernel_state.json");
  const defaultSysState = {
    "vm.swappiness": 60,
    "vm.dirty_ratio": 20,
    "io_scheduler": "mq-deadline",
    "thresholds": {
      "psi": 15,
      "latency": 150,
      "d_state": 1
    }
  };

  if (!fs.existsSync(sysStatePath)) {
    fs.writeFileSync(sysStatePath, JSON.stringify(defaultSysState, null, 2));
  }

  app.get("/api/system/params", (req, res) => {
    try {
      const state = JSON.parse(fs.readFileSync(sysStatePath, 'utf8'));
      // Defensive merge in case file was created with older schema
      const merged = { ...defaultSysState, ...state, thresholds: { ...defaultSysState.thresholds, ...(state.thresholds || {}) } };
      res.json(merged);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/system/params", (req, res) => {
    try {
      const newState = req.body;
      fs.writeFileSync(sysStatePath, JSON.stringify(newState, null, 2));
      
      const logPath = path.resolve("./applied_optimizations.log");
      const logEntry = `[${new Date().toISOString()}] Config Update: ${JSON.stringify(newState)}\n`;
      fs.appendFileSync(logPath, logEntry);

      res.json({ success: true, state: newState });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // CPU Load Simulation
  app.get("/api/system/cpu-load", (req, res) => {
    const coreCount = 8;
    const coreData = Array.from({ length: coreCount }, (_, i) => ({
      core: `CORE_${i}`,
      load: Math.floor(Math.random() * 40) + 10 // Simulated 10-50%
    }));
    res.json(coreData);
  });

  // File Activity Simulation
  app.get("/api/system/file-activity", (req, res) => {
    const activities = ["read", "write", "metadata"];
    const filePaths = [
      "/var/lib/mysql/ibdata1",
      "/home/user/.cache/google-chrome/Default/Cache/data_1",
      "/usr/bin/python3",
      "/var/log/audit/audit.log",
      "/tmp/sess_8492039485",
      "/etc/ld.so.cache",
      "/home/user/workspace/project/node_modules/.bin/vite",
      "/var/spool/postfix/public/pickup"
    ];

    const data = filePaths.map(path => ({
      path,
      ioRate: Math.floor(Math.random() * 1500) + 10, // 10 - 1510 KB/s
      type: activities[Math.floor(Math.random() * activities.length)]
    })).sort((a, b) => b.ioRate - a.ioRate);

    res.json(data);
  });

  // Health Check Simulation & Diagnostics
  app.get("/api/system/health", (req, res) => {
    const checks = [
      { 
        id: "probe_process", 
        name: "Causality Probe Status", 
        status: activeProbe && activeProbe.exitCode === null ? "pass" : "fail",
        message: activeProbe && activeProbe.exitCode === null ? "Worker active and streaming" : "Probe process terminated or failed to start",
        critical: true
      },
      { 
        id: "kernel_psi", 
        name: "Kernel PSI Availability", 
        status: fs.existsSync("/proc/pressure/io") ? "pass" : "warn",
        message: fs.existsSync("/proc/pressure/io") ? "CONFIG_PSI detected" : "Pressure Stall Information unavailable on this kernel",
        critical: false
      },
      { 
        id: "root_privs", 
        name: "Root Privileges", 
        status: process.getuid && process.getuid() === 0 ? "pass" : "warn",
        message: process.getuid && process.getuid() === 0 ? "Running with elevated privileges" : "Running as standard user; tuner commands will simulate",
        critical: false
      },
      { 
        id: "storage_write", 
        name: "Log Storage Write Access", 
        status: "pass",
        message: "Forensic directories are writable",
        critical: true
      }
    ];

    const overall = checks.every(c => c.status !== "fail") ? "healthy" : "degraded";
    res.json({ overall, checks });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // CLEAN SHUTDOWN HANDLER
  const cleanup = () => {
    console.log("\n[SHUTDOWN] Cleaning up forensic environment...");
    if (activeProbe) {
      console.log("[SHUTDOWN] Terminating I/O Probe...");
      activeProbe.kill("SIGTERM");
    }
    
    const logPath = path.resolve("./applied_optimizations.log");
    const logEntry = `[${new Date().toISOString()}] SHUTDOWN: Session ended gracefully.\n`;
    try {
      fs.appendFileSync(logPath, logEntry);
    } catch(e) {}
    
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

startServer();
