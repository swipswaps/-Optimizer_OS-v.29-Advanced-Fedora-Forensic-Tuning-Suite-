# Optimizer_OS // v.29: Advanced Fedora Forensic & Tuning Suite

## Genesis: How We Got Here
Optimizer_OS began as a conceptual "one-shot" optimization script designed to squeeze maximum performance out of Fedora Linux machines. It evolved from a simple command-line utility into a **Full-Stack Kernel Forensic Dashboard**. 

The project was driven by a need to not just *apply* settings, but to *understand* the causal relationships between I/O pressure, multi-core scheduling, and user-perceived latency. 

## Current State: The Performance Mission Control
Today, Optimizer_OS is a high-density, real-time diagnostic platform that treats your OS like a Formula 1 car. It provides a "High Density" terminal aesthetic that presents critical data points without the clutter of traditional dashboards.

### Key Capabilities
1.  **Forensic Observability**:
    *   **Real-time PSI & Latency**: Monitors Pressure Stall Information (PSI) and I/O latency with sub-second precision.
    *   **5m Exhaustion Trends**: Visualizes the historical correlation between I/O pressure and probe latency to identify sustained resource exhaustion.
    *   **Multi-Core Symmetry**: A 1Hz real-time bar chart showing load distribution across all logical CPU cores.

2.  **Causal Graph Analysis**:
    *   A weighted directed graph and real-time weight visualization that explains *why* the system is lagging.
    *   Traces events through the logic chain: `IO -> D-State -> PSI -> User Latency`.

3.  **Automated Tuning & Profile Management**:
    *   **Advanced Presets**: Shipped with factory-tuned profiles for NVMe/SSDs, BTRFS filesystems, and USB latency minimization.
    *   **User Profiles**: Save your own manual `sysctl` and scheduler configurations as named profiles.
    *   **System Tuner**: An automated diagnostic engine that suggests optimizations (e.g., ZRAM, swapiness, dirty ratios) based on live probe data.

4.  **Deep-Dive Diagnostics**:
    *   **Process Lineage Tree**: Trace offending PIDs back to their parent services (systemd, docker, etc.) directly within the Inspector.
    *   **File Activity Monitor**: Identify "Hot Inodes" and the exact directory paths causing storage path saturation.

5.  **Data Portability**:
    *   Export the Causal Graph as **SVG** for reports.
    *   Export Forensic History as **JSON** for offline analysis.

---

## Under the Hood: Technical Architecture

### 1. The Backend (Express.js)
The `server.ts` acts as a **Simulated Kernel Interface**.
*   **State Management**: Persists kernel parameters in `simulated_kernel_state.json`.
*   **Data Generation**: Simulates a realistic kernel probe environment, injecting latency spikes and D-state hangs to test the tuner's resilience.
*   **Audit Logging**: Every optimization applied is recorded in `applied_optimizations.log` for security audits.

### 2. The Frontend (React + Vite + Tailwind)
The UI is a Single Page Application (SPA) designed for "Glanceability".
*   **Design System**: "High Density" theme using a custom palette of Neon Green (`#00FF9C`), Terminal Grey, and Alert Red.
*   **Visualizations**: Powered by `Recharts` for high-frequency data rendering (Area, Bar, and Line charts).
*   **Motion**: Uses `motion/react` (Framer Motion) for smooth layout transitions and purposeful micro-animations.

---

## User Guide: Navigating the Suite

### Dashboard (Monitor)
*   **Forensic History**: Click any event in the sidebar to inspect the system state at that exact millisecond.
*   **Charts**: Watch the **Resource Exhaustion Trend** to catch "drift" before the system locks up.
*   **Alerts**: If you see a **Threshold Violation** banner, read the "Impact Analysis" to understand the risk. Click the Shield icon to dismiss warnings once acknowledged.

### Optimizers (Analyze & Load)
*   **Run Analysis**: Clicking this triggers the AI-driven tuner to suggest specific `echo` and `sysctl` commands.
*   **Presets**: Use the "Apply" buttons on predefined presets for instant SSD or BTRFS optimization.
*   **Profiles**: Type a name and click "Save Configuration" to bookmark your current tuning state.

### Kernel (Tune)
*   **Live Tuning**: Adjust sliders for Swappiness and Dirty Ratio. 
*   **Sentinel Thresholds**: Configure your own "tripwires" for alerts. If you have a high-latency NVMe, you might want to lower the Latency Max threshold.
*   **Scheduler**: Switch between `mq-deadline`, `bfq`, or `none` depending on your storage hardware.

### File Activity (Locate)
*   Switch to this tab to see which paths are the "loudest" on the disk bus. If `/var/lib/mysql` is peaking, you know your performance issue is database-heavy.

---

## Security Note
Optimizer_OS is a diagnostic and staging tool. In a production environment, applying kernel parameters requires `CAP_SYS_ADMIN` privileges. This suite simulates the impact of those changes safely before they are committed to a live production kernel.
