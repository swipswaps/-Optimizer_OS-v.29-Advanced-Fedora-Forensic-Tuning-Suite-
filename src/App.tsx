import { useState, useEffect, type ReactNode } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
  BarChart, Bar, Cell
} from 'recharts';
import { 
  Activity, Database, Cpu, HardDrive, AlertTriangle, Clock, 
  Terminal, ShieldCheck, ChevronRight, Search, FileText, Settings,
  Download, FileImage, FileCode
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface ProbeEvent {
  timestamp: string;
  state: {
    lat: number;
    psi: number;
    io: number;
    d_count: number;
    d_pids: number[];
  };
  edges: string[];
  graph: Record<string, number>;
  cycle: number;
}

export default function App() {
  const [events, setEvents] = useState<ProbeEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventDetails, setEventDetails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'optimizers' | 'tuning' | 'files'>('dashboard');
  const [fileActivity, setFileActivity] = useState<any[]>([]);

  // Tuner States
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [predefinedProfiles, setPredefinedProfiles] = useState<any[]>([]);
  const [applyStatus, setApplyStatus] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [inspectorProcessTreeOpen, setInspectorProcessTreeOpen] = useState(false);

  // System Parameter Tuning States
  const [sysParams, setSysParams] = useState({
    "vm.swappiness": 60,
    "vm.dirty_ratio": 20,
    "io_scheduler": "mq-deadline",
    "thresholds": {
      "psi": 15,
      "latency": 150,
      "d_state": 1
    }
  });

  const [cpuLoad, setCpuLoad] = useState<any[]>([]);

  useEffect(() => {
    fetchLogs();
    fetchProfiles();
    fetchPredefinedProfiles();
    fetchSystemParams();
    fetchFileActivity();
    const probeInterval = setInterval(fetchLogs, 10000);
    const cpuInterval = setInterval(fetchCpuLoad, 1000);
    const fileInterval = setInterval(fetchFileActivity, 5000);
    return () => {
      clearInterval(probeInterval);
      clearInterval(cpuInterval);
      clearInterval(fileInterval);
    };
  }, []);

  const fetchPredefinedProfiles = async () => {
    try {
      const res = await fetch('/api/tuner/predefined');
      const data = await res.json();
      setPredefinedProfiles(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCpuLoad = async () => {
    try {
      const res = await fetch('/api/system/cpu-load');
      const data = await res.json();
      setCpuLoad(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/probe-logs');
      const data = await res.json();
      setEvents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemParams = async () => {
    try {
      const res = await fetch('/api/system/params');
      const data = await res.json();
      setSysParams(data);
    } catch (e) {
      console.error(e);
    }
  };

  const updateSystemParam = (key: string, value: any) => {
    setSysParams(prev => ({ ...prev, [key]: value }));
  };

  const fetchFileActivity = async () => {
    try {
      const res = await fetch('/api/system/file-activity');
      const data = await res.json();
      setFileActivity(data);
    } catch (e) {
      console.error(e);
    }
  };

  const saveAndApplyParams = async () => {
    try {
      setApplyStatus("Committing Kernel Parameters...");
      const res = await fetch('/api/system/params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sysParams)
      });
      const data = await res.json();
      if (data.success) {
        setApplyStatus("Kernel State Updated Successfully.");
      }
      setTimeout(() => setApplyStatus(null), 3000);
    } catch (e) {
      console.error(e);
      setApplyStatus("Failed to update kernel state.");
    }
  };

  const downloadLogs = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(events));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `fedora_io_probe_${new Date().getTime()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/tuner/profiles');
      const data = await res.json();
      setProfiles(data);
    } catch (e) {
      console.error(e);
    }
  };

  const exportGraphSVG = () => {
    const svgElement = document.querySelector('.recharts-responsive-container svg');
    if (!svgElement) return;
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);
    if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if(!source.match(/^<svg[^>]+xmlns\:xlink="http\:\/\/www\.w3\.org\/1999\/xlink"/)){
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", url);
    downloadAnchorNode.setAttribute("download", `causal_graph_${new Date().getTime()}.svg`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const runAnalysis = async () => {
    try {
      const res = await fetch('/api/tuner/analyze', { method: 'POST' });
      const data = await res.json();
      setSuggestions(data.suggestions);
    } catch (e) {
      console.error(e);
    }
  };

  const saveProfile = async () => {
    if (!newProfileName) return;
    try {
      const data = activeTab === 'optimizers' ? suggestions : sysParams;
      await fetch('/api/tuner/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProfileName, data })
      });
      setNewProfileName("");
      fetchProfiles();
    } catch (e) {
      console.error(e);
    }
  };

  const loadProfile = async (profile: any) => {
    try {
      if (profile.type === 'optimizer') {
        applyOptimizations(profile.data.map((s: any) => s.action));
      } else {
        setSysParams(profile.data);
        saveAndApplyParams();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const applyOptimizations = async (actions: string[]) => {
    try {
      setApplyStatus("Applying...");
      const res = await fetch('/api/tuner/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions })
      });
      const data = await res.json();
      setApplyStatus(data.message);
      setTimeout(() => setApplyStatus(null), 3000);
    } catch (e) {
      console.error(e);
      setApplyStatus("Failed to apply.");
    }
  };

  const fetchDetails = async (id: string) => {
    try {
      setSelectedEventId(id);
      const res = await fetch(`/api/probe-logs/${id}`);
      const data = await res.json();
      setEventDetails(data);
    } catch (e) {
      console.error(e);
    }
  };

  const latestState = events[0]?.state || { lat: 0, psi: 0, io: 0, d_count: 0 };
  const updateThreshold = (key: 'psi' | 'latency' | 'd_state', value: number) => {
    setSysParams(prev => ({
      ...prev,
      thresholds: {
        ...(prev.thresholds || { psi: 15, latency: 150, d_state: 1 }),
        [key]: value
      }
    }));
  };
  const chartData = [...events].reverse().map(e => ({
    time: e.timestamp.split('_')[1]?.replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3') || '0',
    latency: e.state.lat,
    psi: e.state.psi,
    io: e.state.io / 1024, // KB
    d_count: e.state.d_count
  }));

  const activeEdges = events[0]?.edges || [];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg font-sans selection:bg-accent/30">
      {/* Header */}
      <header className="h-[60px] border-b border-line px-6 flex justify-between items-center bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-accent rounded-[4px]" />
          <h1 className="font-mono font-bold text-[18px] tracking-tighter text-white">OPTIMIZER_OS // v.29</h1>
        </div>
        <div className="font-mono text-[12px] text-muted space-x-4 hidden md:block text-right">
          <span>HOST: fedora-e15-pro</span>
          <span>|</span>
          <span>UPTIME: 6h 12m</span>
          <span>|</span>
          <span>KERNEL: 6.19.10</span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-[320px_1fr] overflow-hidden shrink-0">
        {/* Sidebar */}
        <aside className="border-r border-line bg-surface flex flex-col overflow-hidden">
          <div className="p-4 space-y-2 shrink-0">
            <NavItem 
              icon={<Activity size={20} />} 
              label="Dashboard" 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')}
            />
            <NavItem 
              icon={<Settings size={20} />} 
              label="Optimizers" 
              active={activeTab === 'optimizers'} 
              onClick={() => setActiveTab('optimizers')}
            />
            <NavItem 
              icon={<Cpu size={20} />} 
              label="Kernel" 
              active={activeTab === 'tuning'} 
              onClick={() => setActiveTab('tuning')}
            />
            <NavItem 
              icon={<FileCode size={20} />} 
              label="File Activity" 
              active={activeTab === 'files'} 
              onClick={() => setActiveTab('files')}
            />
          </div>

          <div className="p-3 px-6 text-[11px] uppercase tracking-widest text-muted border-y border-line shrink-0 flex justify-between items-center">
            <span>{activeTab === 'dashboard' ? 'Forensic history' : activeTab === 'optimizers' ? 'Saved Profiles' : activeTab === 'files' ? 'File I/O Monitor' : 'System Tuning'}</span>
            {activeTab === 'dashboard' && (
              <button 
                onClick={downloadLogs}
                className="p-1 hover:text-accent transition-colors"
                title="Export Logs"
              >
                <Download size={14} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto module-list border-b border-line">
            {activeTab === 'dashboard' ? (
              events.map((e) => (
                <div 
                  key={e.timestamp} 
                  onClick={() => fetchDetails(e.timestamp)}
                  className={cn(
                    "p-4 px-6 border-b border-line cursor-pointer flex flex-col gap-1 transition-all",
                    selectedEventId === e.timestamp ? "bg-bg border-l-4 border-l-accent" : "hover:bg-line/20 border-l-4 border-l-transparent"
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div className="font-semibold text-[13px] text-ink uppercase tracking-tight">
                      {e.timestamp.split('_')[1]?.replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3')}
                    </div>
                    <div className={cn(
                      "text-[10px] font-mono",
                      e.state.lat > 150 ? "text-red-500" : "text-accent"
                    )}>
                      {Math.round(e.state.lat)}MS
                    </div>
                  </div>
                  <div className="text-[11px] text-muted line-clamp-1">
                    PSI: {e.state.psi.toFixed(2)}% | D: {e.state.d_count}
                  </div>
                </div>
              ))
            ) : activeTab === 'optimizers' ? (
              <div className="flex flex-col h-full bg-bg">
                <div className="p-3 px-6 bg-line/10 text-[10px] font-bold uppercase tracking-[0.2em] text-accent border-b border-line">
                  Predefined Presets
                </div>
                {predefinedProfiles.map((p) => (
                  <div key={p.id} className="p-4 px-6 border-b border-line bg-surface/30 flex justify-between items-center group">
                    <div className="flex flex-col gap-0.5">
                       <div className="font-semibold text-[12px] text-ink uppercase tracking-tight">{p.name}</div>
                       <div className="text-[9px] text-muted font-mono leading-tight max-w-[180px]">{p.description}</div>
                    </div>
                    <button 
                      onClick={() => loadProfile(p)}
                      className="p-1.5 px-3 bg-accent/20 text-accent border border-accent/30 rounded text-[9px] font-bold uppercase hover:bg-accent hover:text-bg transition-all"
                    >
                      Apply
                    </button>
                  </div>
                ))}
                
                <div className="p-3 px-6 bg-line/10 text-[10px] font-bold uppercase tracking-[0.2em] text-muted border-b border-line mt-4">
                  User Profiles
                </div>
                {profiles.map((p) => (
                  <div 
                    key={p.id}
                    className="p-4 px-6 border-b border-line hover:bg-line/20 transition-all flex justify-between items-center group"
                  >
                    <div>
                      <div className="font-semibold text-[13px] text-ink uppercase tracking-tight">{p.name}</div>
                      <div className="text-[10px] text-muted font-mono uppercase">
                        {p.type === 'kernel' ? 'Kernel tuning set' : `${p.data.length || 0} optimizations`}
                      </div>
                    </div>
                    <button 
                      onClick={() => loadProfile(p)}
                      className="opacity-0 group-hover:opacity-100 p-1 bg-accent text-bg rounded text-[10px] font-bold uppercase transition-all"
                    >
                      Load
                    </button>
                  </div>
                ))}
              </div>
            ) : activeTab === 'files' ? (
              <div className="flex flex-col p-6 space-y-6">
                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                       <h4 className="text-[11px] font-bold uppercase tracking-widest text-accent">Hot Inodes - Top Paths</h4>
                       <span className="text-[9px] font-mono opacity-50">SYNC_PERIOD: 5S</span>
                    </div>
                    {fileActivity.slice(0, 5).map((f, i) => (
                      <div key={i} className="bg-surface/50 border border-line p-3 flex justify-between items-center">
                        <div className="overflow-hidden">
                           <div className="text-[11px] font-mono text-ink truncate w-full" title={f.path}>{f.path}</div>
                           <div className="text-[9px] uppercase tracking-tight text-muted">{f.type} Activity</div>
                        </div>
                        <div className="text-[12px] font-mono text-accent shrink-0 ml-3">{f.ioRate}KB/s</div>
                      </div>
                    ))}
                    {fileActivity.length === 0 && (
                      <div className="text-center py-4 text-[10px] text-muted italic">Scanning inodes...</div>
                    )}
                 </div>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                 <div className="space-y-3">
                   <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-muted">
                     <span>Swappiness</span>
                     <span className="text-accent">{sysParams['vm.swappiness']}</span>
                   </div>
                   <input 
                    type="range" min="0" max="100" 
                    value={sysParams['vm.swappiness']}
                    onChange={(e) => updateSystemParam('vm.swappiness', parseInt(e.target.value))}
                    className="w-full accent-accent bg-line h-1.5 rounded-full appearance-none flex-1"
                   />
                 </div>

                 <div className="space-y-3">
                   <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-muted">
                     <span>Dirty Ratio</span>
                     <span className="text-accent">{sysParams['vm.dirty_ratio']}%</span>
                   </div>
                   <input 
                    type="range" min="0" max="50" 
                    value={sysParams['vm.dirty_ratio']}
                    onChange={(e) => updateSystemParam('vm.dirty_ratio', parseInt(e.target.value))}
                    className="w-full accent-accent bg-line h-1.5 rounded-full appearance-none flex-1"
                   />
                 </div>

                 <div className="space-y-3">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-muted">I/O Scheduler</div>
                    <select 
                      value={sysParams['io_scheduler']}
                      onChange={(e) => updateSystemParam('io_scheduler', e.target.value)}
                      className="w-full bg-bg border border-line p-2 text-xs font-mono text-ink outline-none focus:border-accent"
                    >
                      <option value="mq-deadline">mq-deadline</option>
                      <option value="none">none (NVMe)</option>
                      <option value="bfq">bfq (HDD)</option>
                      <option value="kyber">kyber</option>
                    </select>
                 </div>

                 <div className="pt-4 border-t border-line space-y-4">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-muted italic">Sentinel Thresholds</div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-mono text-slate-500">
                        <span>PSI CRITICAL</span>
                        <span>{(sysParams.thresholds?.psi ?? 15).toString()}%</span>
                      </div>
                      <input 
                        type="range" min="5" max="50" 
                        value={sysParams.thresholds?.psi ?? 15}
                        onChange={(e) => updateThreshold('psi', parseInt(e.target.value))}
                        className="w-full accent-red-500 bg-line h-1 rounded-full appearance-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-mono text-slate-500">
                        <span>LATENCY MAX</span>
                        <span>{sysParams.thresholds?.latency ?? 150}ms</span>
                      </div>
                      <input 
                        type="range" min="50" max="500" step="10"
                        value={sysParams.thresholds?.latency ?? 150}
                        onChange={(e) => updateThreshold('latency', parseInt(e.target.value))}
                        className="w-full accent-red-500 bg-line h-1 rounded-full appearance-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-mono text-slate-500">
                        <span>D-STATE TRIGGER</span>
                        <span>{sysParams.thresholds?.d_state ?? 1} PID(s)</span>
                      </div>
                      <input 
                        type="number" 
                        value={sysParams.thresholds?.d_state ?? 1}
                        onChange={(e) => updateThreshold('d_state', parseInt(e.target.value) || 0)}
                        className="w-full bg-bg border border-line p-2 text-[11px] font-mono text-ink outline-none focus:border-red-500"
                      />
                    </div>
                 </div>

                 <button 
                  onClick={saveAndApplyParams}
                  className="w-full py-4 bg-accent text-bg font-black uppercase tracking-[0.2em] text-[11px] hover:shadow-[0_0_20px_rgba(0,255,156,0.3)] transition-all"
                 >
                   Apply Kernel Profile
                 </button>

                 <div className="space-y-4 pt-4 border-t border-line">
                    <input 
                      type="text" 
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder="NAME_PROFILE..."
                      className="w-full bg-bg border border-line px-4 py-2 text-xs font-mono text-accent outline-none focus:border-accent uppercase"
                    />
                    <button 
                      onClick={saveProfile}
                      className="w-full py-2 bg-slate-800 text-ink text-[10px] font-bold uppercase tracking-widest border border-slate-700 hover:bg-slate-700 transition-all"
                    >
                      Save Configuration
                    </button>
                 </div>
              </div>
            )}
          </div>

          <div className="p-3 px-6 text-[11px] uppercase tracking-widest text-muted border-b border-line shrink-0 flex justify-between items-center">
            <span>Causal Graph Visualization</span>
            <button 
              onClick={exportGraphSVG}
              className="p-1 hover:text-accent transition-colors"
              title="Export SVG"
            >
              <FileImage size={14} />
            </button>
          </div>
          <div className="p-4 h-[160px] shrink-0 bg-bg/50 border-line border-b">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart 
                 data={['IO->D', 'D->PSI', 'PSI->LAT'].map(edge => ({ 
                   name: edge, 
                   weight: events[0]?.graph[edge] || 0 
                 }))} 
                 layout="vertical"
                 margin={{ left: -10, right: 10, top: 0, bottom: 0 }}
               >
                 <XAxis type="number" hide domain={[0, 10]} />
                 <YAxis 
                    dataKey="name" 
                    type="category" 
                    stroke="#666666" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    width={60} 
                    fontFamily="var(--font-mono)"
                 />
                 <Tooltip 
                    cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                    contentStyle={{ backgroundColor: '#0D0D0E', border: '1px solid #2D2D33', fontSize: '10px', fontFamily: 'var(--font-mono)' }} 
                 />
                 <Bar dataKey="weight" radius={[0, 2, 2, 0]} animationDuration={500}>
                   {['IO->D', 'D->PSI', 'PSI->LAT'].map((edge, index) => (
                     <Cell 
                        key={index} 
                        fill={activeEdges.includes(edge) ? '#00FF9C' : '#2D2D33'} 
                        fillOpacity={activeEdges.includes(edge) ? 1 : 0.4}
                     />
                   ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
          </div>
          <div className="p-3 px-6 text-[11px] uppercase tracking-widest text-muted border-b border-line shrink-0">
            Causal Graph Weights
          </div>
          <div className="p-6 space-y-5 shrink-0 bg-bg/50 border-b border-line">
            {['IO->D', 'D->PSI', 'PSI->LAT'].map((edge) => {
              const weight = events[0]?.graph[edge] || 0;
              const isActive = activeEdges.includes(edge);
              return (
                <div key={edge} className="space-y-2">
                  <div className="flex justify-between text-[10px] font-mono items-center">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        isActive ? "bg-accent animate-pulse shadow-[0_0_5px_#00FF9C]" : "bg-muted"
                      )} />
                      <span className={cn(isActive ? "text-accent font-bold" : "text-slate-500")}>
                        {edge}
                      </span>
                    </div>
                    <span className="text-slate-400 font-bold">{weight.toFixed(2)}</span>
                  </div>
                  <div className="h-4 w-full bg-line rounded-sm overflow-hidden relative border border-line/50">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, weight * 10)}%` }}
                      className={cn(
                        "h-full rounded-sm transition-all duration-1000 relative",
                        isActive ? "bg-gradient-to-r from-accent/20 to-accent" : "bg-muted/40"
                      )}
                    >
                      {isActive && (
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_right,_rgba(0,255,156,0.4),_transparent)]" />
                      )}
                    </motion.div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Dynamic Content Area */}
        <section className="p-6 overflow-y-auto custom-scrollbar">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Alert Banner */}
              <AnimatePresence>
                {((latestState.psi > (sysParams.thresholds?.psi ?? 15) || 
                   latestState.lat > (sysParams.thresholds?.latency ?? 150) || 
                   latestState.d_count >= (sysParams.thresholds?.d_state ?? 1)) && !dismissedAlerts.includes(events[0]?.timestamp)) && (
                  <motion.div 
                    initial={{ opacity: 0, y: -20, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -20, height: 0 }}
                    className="bg-red-500/10 border border-red-500/50 p-4 mb-4 flex flex-col gap-3 text-red-500 overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-500 text-bg rounded animate-pulse">
                          <AlertTriangle size={18} />
                        </div>
                        <div>
                          <div className="font-bold uppercase tracking-widest text-[11px]">System Threshold Violation</div>
                          <div className="text-[10px] font-mono opacity-80 uppercase italic">
                            {latestState.psi > (sysParams.thresholds?.psi ?? 15) ? `PSI Peak: ${latestState.psi.toFixed(1)}% ` : ""}
                            {latestState.lat > (sysParams.thresholds?.latency ?? 150) ? `Latency SPIKE: ${Math.round(latestState.lat)}ms ` : ""}
                            {latestState.d_count >= (sysParams.thresholds?.d_state ?? 1) ? `D-State Count: ${latestState.d_count}` : ""}
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => setDismissedAlerts(prev => [...prev, events[0]?.timestamp])}
                        className="p-1 hover:bg-red-500/20 rounded transition-colors"
                      >
                        <ShieldCheck size={16} />
                      </button>
                    </div>
                    <div className="bg-red-500/5 p-3 rounded text-[11px] leading-relaxed border-l-2 border-red-500">
                      <span className="font-bold uppercase">Impact Analysis:</span> Current contention patterns likely originate from storage scheduler saturation. 
                      This leads to non-maskable stalls in multi-threaded browser runtimes and kernel worker threads, potentially resulting in UI lockups or delayed disk flushes.
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-[1px] bg-line border border-line shrink-0">
                <StatBox label="Latency" value={`${Math.round(latestState.lat)}ms`} trend={latestState.lat > 150 ? "critical" : "normal"} />
                <StatBox label="PSI I/O" value={`${latestState.psi.toFixed(1)}%`} trend={latestState.psi > 10 ? "warning" : "normal"} />
                <StatBox label="Throughput" value={`${(latestState.io / 1024 / 1024).toFixed(1)} MB/s`} />
                <StatBox label="D-State" value={latestState.d_count.toString()} trend={latestState.d_count > 0 ? "warning" : "normal"} />
              </div>

              {/* Visualization */}
              <div className="bg-surface border border-line p-6 flex flex-col min-h-[300px]">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-[14px] font-bold text-white mb-1 uppercase tracking-tight">Latent Entropy Analysis</h3>
                    <p className="text-[11px] text-muted">Forensic timeline of device and scheduler contention</p>
                  </div>
                  <div className="text-[10px] text-accent border border-accent rounded px-2 py-0.5 font-mono">
                    LIVE ANALYSIS
                  </div>
                </div>
                
                <div className="flex-1 min-h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="v29-lat" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00FF9C" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#00FF9C" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2D2D33" vertical={false} />
                      <XAxis dataKey="time" stroke="#666666" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                      <YAxis stroke="#666666" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#0D0D0E', border: '1px solid #2D2D33', borderRadius: '4px', fontSize: '12px' }} />
                      <Area type="monotone" dataKey="latency" stroke="#00FF9C" strokeWidth={1.5} fill="url(#v29-lat)" animationDuration={1000} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* CPU Core Load Visualization */}
              <div className="bg-surface border border-line p-6 flex flex-col min-h-[300px]">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-[14px] font-bold text-white mb-1 uppercase tracking-tight">Multi-Core Load Symmetry</h3>
                    <p className="text-[11px] text-muted">Real-time scheduling distribution across logical processors</p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                    <span className="text-accent uppercase">Realtime // 1hz</span>
                  </div>
                </div>
                
                <div className="flex-1 min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cpuLoad} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2D2D33" vertical={false} />
                      <XAxis dataKey="core" stroke="#666666" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#666666" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                      <Tooltip 
                        cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                        contentStyle={{ backgroundColor: '#0D0D0E', border: '1px solid #2D2D33', fontSize: '12px', fontFamily: 'var(--font-mono)' }} 
                      />
                      <Bar dataKey="load" radius={[2, 2, 0, 0]}>
                        {cpuLoad.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.load > 80 ? "#ef4444" : "#00FF9C"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Historical Trend Chart (5-Minute Window) */}
              <div className="bg-surface border border-line p-6 flex flex-col min-h-[300px]">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-[14px] font-bold text-white mb-1 uppercase tracking-tight">Resource Exhaustion Trend</h3>
                    <p className="text-[11px] text-muted">Historical drift of PSI pressure vs. Probe Latency (Last 5m)</p>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-mono">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-0.5 bg-accent" />
                      <span className="text-muted">LATENCY</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-0.5 bg-blue-500" />
                      <span className="text-muted">PSI I/O</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2D2D33" vertical={false} />
                      <XAxis dataKey="time" stroke="#666666" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" stroke="#666666" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" stroke="#666666" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0D0D0E', border: '1px solid #2D2D33', fontSize: '10px', fontFamily: 'var(--font-mono)' }} 
                      />
                      <Line yAxisId="left" type="stepAfter" dataKey="latency" stroke="#00FF9C" strokeWidth={2} dot={false} animationDuration={1000} />
                      <Line yAxisId="right" type="monotone" dataKey="psi" stroke="#3b82f6" strokeWidth={2} dot={false} animationDuration={1000} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Artifact Inspector */}
              {selectedEventId && (
                <div className="bg-surface border border-line flex flex-col shrink-0">
                  <div className="p-3 px-6 bg-line/20 border-b border-line flex items-center justify-between">
                    <div className="flex items-center gap-2 text-accent">
                      <Search size={14} />
                      <span className="text-[11px] font-bold uppercase tracking-widest">Artifact Inspector</span>
                    </div>
                    <span className="text-[10px] text-muted font-mono">{selectedEventId}</span>
                  </div>
                  <div className="p-6 space-y-6">
                    {/* Process Tree Section */}
                    <div className="border border-line bg-bg/50">
                       <button 
                        onClick={() => setInspectorProcessTreeOpen(!inspectorProcessTreeOpen)}
                        className="w-full p-3 px-4 flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-muted hover:bg-line/20 transition-all"
                       >
                          <span>Process Lineage Tree</span>
                          <span className={cn("transition-transform", inspectorProcessTreeOpen && "rotate-180")}>▼</span>
                       </button>
                       {inspectorProcessTreeOpen && (
                         <div className="p-4 pt-2 font-mono text-[11px] leading-6 border-t border-line">
                            <div className="text-accent">└─ systemd (1)</div>
                            <div className="pl-4 border-l border-line ml-2">└─ docker-containerd (942)</div>
                            <div className="pl-8 border-l border-line ml-2 text-red-500">└─ kworker/u8:2 (412) - IO_WAITING</div>
                            <div className="pl-4 border-l border-line ml-2">└─ Xorg (1021)</div>
                            <div className="pl-4 border-l border-line ml-2">└─ gnome-session (2104)</div>
                         </div>
                       )}
                    </div>

                    {Object.entries(eventDetails).map(([name, content]) => (
                      <div key={name} className="space-y-2">
                        <div className="text-[10px] font-bold text-muted uppercase tracking-[0.2em]">{name}</div>
                        <pre className="p-4 bg-bg border border-line rounded text-[12px] font-mono leading-relaxed overflow-x-auto text-terminal-green max-h-[160px] custom-scrollbar selection:bg-terminal-green/20">
                          {content}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'files' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <header className="mb-8 flex justify-between items-end">
                <div>
                  <h3 className="text-2xl font-bold text-white uppercase tracking-tight italic">Global File I/O Monitor</h3>
                  <p className="text-sm text-muted">Real-time inode tracking and scheduler pressure attribution</p>
                </div>
                <div className="text-[10px] font-mono text-muted uppercase tracking-widest border border-line px-3 py-1 bg-surface">
                  VFS_SNOOP // ACTIVE
                </div>
              </header>
              
              <div className="bg-surface border border-line overflow-hidden shadow-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-line/30 text-[10px] uppercase tracking-widest text-muted border-b border-line">
                      <th className="p-4 px-6 font-bold">Filesystem Path</th>
                      <th className="p-4 px-6 font-bold">Activity Type</th>
                      <th className="p-4 px-6 font-bold text-right">Throughput</th>
                      <th className="p-4 px-6 font-bold text-right">Pressure</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {fileActivity.map((f, i) => (
                      <tr key={i} className="hover:bg-line/10 transition-colors group">
                        <td className="p-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-bg border border-line rounded">
                              <FileText size={14} className="text-accent opacity-50" />
                            </div>
                            <span className="text-[12px] font-mono text-ink group-hover:text-accent transition-colors">{f.path}</span>
                          </div>
                        </td>
                        <td className="p-4 px-6">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-bold uppercase border",
                            f.type === 'write' ? "bg-red-500/10 text-red-500 border-red-500/30 font-black" :
                            f.type === 'read' ? "bg-blue-500/10 text-blue-500 border-blue-500/30" :
                            "bg-slate-500/10 text-slate-500 border-slate-500/30"
                          )}>
                            {f.type}
                          </span>
                        </td>
                        <td className="p-4 px-6 text-right font-mono text-[13px] text-accent">
                          {f.ioRate.toLocaleString()} <span className="text-[9px] opacity-40">KB/s</span>
                        </td>
                        <td className="p-4 px-6 text-right">
                           <div className="flex justify-end items-center gap-1.5 h-6">
                             {Array.from({ length: 5 }).map((_, barIdx) => {
                               const intensity = (f.ioRate / 1500) * 5;
                               const isActive = barIdx < intensity;
                               return (
                                 <div 
                                   key={barIdx} 
                                   className={cn(
                                     "w-1 rounded-full transition-all duration-500",
                                     isActive 
                                       ? (intensity > 4 ? "bg-red-500 h-full" : "bg-accent h-[60%]") 
                                       : "bg-line h-[20%]"
                                   )} 
                                 />
                               );
                             })}
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {fileActivity.length === 0 && (
                  <div className="py-24 text-center">
                    <div className="flex justify-center mb-4">
                      <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                    <p className="text-muted italic text-sm font-mono uppercase tracking-widest">Awaiting kernel inode events...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {(activeTab === 'optimizers' || activeTab === 'tuning') && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <header className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-white uppercase tracking-tight italic">Automated Tuner</h3>
                  <p className="text-sm text-muted">Intelligent system optimization based on v29 kernel signals</p>
                </div>
                <button 
                  onClick={runAnalysis}
                  className="px-6 py-2 bg-accent text-bg font-bold uppercase tracking-widest text-xs rounded hover:shadow-[0_0_15px_#00FF9C] transition-all"
                >
                  Run Global Analysis
                </button>
              </header>

              {suggestions.length > 0 ? (
                <div className="space-y-4">
                  {suggestions.map((s) => (
                    <div key={s.id} className="bg-surface border border-line p-6 flex flex-col md:flex-row gap-6 hover:border-accent/40 transition-all">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 bg-line text-slate-400 text-[9px] font-bold uppercase rounded border border-slate-700">{s.category}</span>
                          <h4 className="text-white font-bold tracking-tight">{s.target}</h4>
                        </div>
                        <p className="text-xs text-muted leading-relaxed">{s.description}</p>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-accent">
                          <Activity size={12} />
                          EXPECTED IMPACT: {s.impact}
                        </div>
                      </div>
                      <div className="md:w-64 flex flex-col justify-center items-end gap-3">
                         <code className="text-[11px] bg-black p-2 rounded text-terminal-green/80 flex-1 w-full text-center">
                           {s.action}
                         </code>
                         <button 
                           onClick={() => applyOptimizations([s.action])}
                           className="w-full py-1.5 bg-line hover:bg-slate-700 text-ink text-[10px] font-bold uppercase border border-slate-700 transition-all"
                         >
                           Apply Parameter
                         </button>
                      </div>
                    </div>
                  ))}

                  <div className="pt-8 border-t border-line flex flex-col md:flex-row items-center justify-between gap-4">
                     <div className="flex items-center gap-4 w-full md:w-96">
                        <input 
                          type="text" 
                          value={newProfileName}
                          onChange={(e) => setNewProfileName(e.target.value)}
                          placeholder="PROFIL_NAME_ID..."
                          className="flex-1 bg-bg border border-line px-4 py-2 text-xs font-mono text-accent outline-none focus:border-accent transition-all uppercase"
                        />
                        <button 
                          onClick={saveProfile}
                          className="px-4 py-2 bg-slate-800 text-white text-xs font-bold uppercase tracking-widest border border-slate-700 hover:bg-slate-700 transition-all shrink-0"
                        >
                          Save Profile
                        </button>
                     </div>

                     <button 
                       onClick={() => applyOptimizations(suggestions.map(s => s.action))}
                       className="px-8 py-3 bg-white text-bg font-black uppercase tracking-[0.2em] text-xs hover:bg-accent transition-all w-full md:w-auto"
                     >
                       Commit All Changes
                     </button>
                  </div>
                </div>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-slate-700 border-2 border-dashed border-line rounded-3xl">
                  <Settings size={64} className="mb-4 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-[0.3em]">System analysis required</p>
                  <p className="text-xs mt-2 italic capitalize opacity-60">Triangulating kernel signals for potential optimizations</p>
                </div>
              )}

              {applyStatus && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="fixed bottom-10 right-10 bg-accent text-bg px-6 py-3 font-bold uppercase tracking-widest text-xs shadow-2xl shadow-accent/20 z-50 rounded"
                >
                  {applyStatus}
                </motion.div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Terminal Footer */}
      <footer className="h-[200px] bg-black border-t border-line p-6 font-mono text-[13px] text-terminal-green overflow-hidden flex flex-col gap-1 shrink-0">
        <div className="flex items-center gap-2 opacity-80">
          <span>[SYSTEM]</span>
          <span className="text-white">v29 Trace Ready</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted">[INFO]</span>
          <span>Searching repositories for 'linux-performance-optimization'...</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted">[DONE]</span>
          <span className="text-white">Found logic in: AdnanHodzic/auto-cpufreq, stacer/stacer, bleachbit</span>
        </div>
        <div className="flex items-center gap-2 mt-2">
           <span className="text-white shrink-0">optimizer@machine:~$</span>
           <span className="animate-pulse">./io_causality_probe_v29.py --realtime</span>
           <span className="w-2 h-[15px] bg-terminal-green ml-0.5 animate-pulse" />
        </div>
        <div className="mt-4 flex gap-4 text-[11px] uppercase tracking-[0.15em] text-muted">
          <span>LAT: {Math.round(latestState.lat)}ms</span>
          <span>PSI: {latestState.psi.toFixed(1)}%</span>
          <span>IO: {(latestState.io/1024).toFixed(0)}KB/s</span>
          <span>THREADS: {events.length > 0 ? "731" : "0"}</span>
        </div>
      </footer>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all font-medium",
        active ? "bg-accent/10 text-accent font-bold shadow-[inset_0_0_8px_rgba(0,255,156,0.1)]" : "text-muted hover:bg-slate-800 hover:text-slate-200"
      )}
    >
      {icon}
      <span className="text-[13px] uppercase tracking-tight">{label}</span>
    </div>
  );
}

function StatBox({ label, value, trend = "normal" }: { label: string, value: string, trend?: string }) {
  return (
    <div className="bg-surface p-5 py-4">
      <div className="text-[11px] uppercase tracking-widest text-muted mb-2 font-medium">{label}</div>
      <div className={cn(
        "text-[24px] font-mono leading-none",
        trend === "critical" ? "text-red-500" : trend === "warning" ? "text-orange-500" : "text-accent"
      )}>
        {value}
      </div>
    </div>
  );
}
