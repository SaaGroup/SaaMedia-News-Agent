import React, { useState, useEffect } from "react";
import { animate, motion, AnimatePresence } from "motion/react";
import { 
  Newspaper, 
  Settings, 
  Activity, 
  Globe, 
  RefreshCw, 
  Play, 
  Trash2, 
  Edit3, 
  ExternalLink, 
  Save, 
  Check, 
  X, 
  Plus, 
  FileText, 
  Send, 
  CheckCheck, 
  Sliders, 
  ListRestart, 
  AlertCircle,
  Database,
  Grid,
  Bell,
  CheckCircle2,
  Lock,
  Sparkles
} from "lucide-react";
import { Article, NewsSource, SystemLog, SystemConfig } from "./types.ts";

function decodeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .trim();
}

export default function App() {
  // Page Navigation State
  const [activeTab, setActiveTab] = useState<"queue" | "archive" | "sources" | "logs" | "settings">("queue");

  // Server Data States
  const [articles, setArticles] = useState<Article[]>([]);
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [config, setConfig] = useState<SystemConfig>({
    wordpressUrl: "",
    wordpressUsername: "",
    wordpressPassword: "",
    wordpressMode: "rest",
    whatsappRecipient: "",
    whatsappGateway: "mock",
    whatsappSenderNumber: "",
    whatsappAccountSid: "",
    whatsappApiKey: "",
    schedulerIntervalMins: 60,
    schedulerEnabled: true,
    apiKeyOverride: "",
    telegramToken: "",
    telegramChatId: "",
    telegramEnabled: false,
    facebookPageId: "",
    facebookPageAccessToken: "",
    facebookEnabled: false
  });
  
  // Stats summary state
  const [stats, setStats] = useState({
    totalScraped: 0,
    totalPublished: 0,
    totalPending: 0,
    totalFailed: 0,
    categoryCounts: {} as Record<string, number>,
    sourceCounts: {} as Record<string, number>
  });

  // WhatsApp Live Client Status State
  const [waStatus, setWaStatus] = useState<{
    status: 'DISCONNECTED' | 'AUTHENTICATING' | 'QR_RECEIVED' | 'CONNECTED' | 'ERROR';
    qrCode: string | null;
    error: string | null;
    recipient: string;
    pairingCode: string | null;
    pairingPhone: string | null;
  }>({
    status: 'DISCONNECTED',
    qrCode: null,
    error: null,
    recipient: '',
    pairingCode: null,
    pairingPhone: null
  });
  const [waLoading, setWaLoading] = useState(false);
  const [pairingPhoneInput, setPairingPhoneInput] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);

  // Local config form state to prevent background polling from resetting fields during active typing
  const [localConfig, setLocalConfig] = useState<SystemConfig | null>(null);

  // Sync with main config when entering settings, nullify when navigating away
  useEffect(() => {
    if (activeTab === "settings" && !localConfig) {
      setLocalConfig(config);
    } else if (activeTab !== "settings" && localConfig) {
      setLocalConfig(null);
    }
  }, [activeTab, config]);

  const activeConfig = localConfig || config;

  // UI Interactive States
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);

  // Manual News Submission State
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [manualSource, setManualSource] = useState("Manual Admin Input");
  const [manualCategory, setManualCategory] = useState("National");

  // Custom Source Submission State
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceFeedUrl, setNewSourceFeedUrl] = useState("");
  const [newSourceType, setNewSourceType] = useState("National");

  // Auto Dismiss Alert helper
  const triggerAlert = (type: "success" | "error" | "info", message: string) => {
    setAlert({ type, message });
    setTimeout(() => {
      setAlert(null);
    }, 4500);
  };

  const handleRequestPairingCode = async () => {
    if (!pairingPhoneInput.trim()) {
      triggerAlert("error", "Please input a valid phone number with country code.");
      return;
    }
    setPairingLoading(true);
    try {
      const res = await fetch("/api/whatsapp/pairing-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: pairingPhoneInput })
      });
      if (res.ok) {
        triggerAlert("success", "Handshake requested! Fetching pairing code from Baileys engine...");
        // Poll status immediately
        setTimeout(fetchWaStatus, 2000);
        setTimeout(fetchWaStatus, 4000);
        setTimeout(fetchWaStatus, 6000);
      } else {
        const errJson = await res.json();
        triggerAlert("error", errJson.error || "Failed to trigger pairing handshake.");
      }
    } catch (err) {
      triggerAlert("error", "Error connecting to service container.");
    } finally {
      setPairingLoading(false);
    }
  };

  // FETCH CORE DATA FROM BACKEND RELIABLY
  const fetchData = async (isBackground = false) => {
    setLoading(true);
    
    const fetchWithTimeout = async (url: string, timeout = 8000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return response;
      } catch (err) {
        clearTimeout(id);
        throw err;
      }
    };

    const fetchJson = async (url: string) => {
      try {
        const res = await fetchWithTimeout(url);
        if (!res.ok) {
          console.warn(`Endpoint ${url} responded with status: ${res.status}`);
          return null;
        }
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          console.warn(`Endpoint ${url} returned non-JSON content type: ${contentType}`);
          return null;
        }
        return await res.json();
      } catch (e: any) {
        console.warn(`Failed to fetch ${url}: ${e.message}`);
        return null;
      }
    };

    try {
      // Fetch resources concurrently but handle individual failures gracefully so a single slow or offline endpoint doesn't crash everything
      const [artData, srcData, logData, cfgData, statData] = await Promise.all([
        fetchJson("/api/articles"),
        fetchJson("/api/sources"),
        fetchJson("/api/logs"),
        fetchJson("/api/config"),
        fetchJson("/api/stats")
      ]);

      if (artData) setArticles(artData);
      if (srcData) setSources(srcData);
      if (logData) setLogs(logData);
      if (cfgData) setConfig(prev => ({ ...prev, ...cfgData }));
      if (statData) setStats(statData);

      // If absolutely everything failed, notify about backend offline state (unless background poll)
      if (!artData && !srcData && !logData && !cfgData && !statData) {
        if (!isBackground) {
          triggerAlert("error", "SaaMedia News automation backend appears offline. Re-establishing connection...");
        }
        console.warn("API Sourcing Fetch is waiting for backend ready state...");
      }
    } catch (e) {
      console.warn("Retrying fetchData queue orchestration...", e);
    } finally {
      setLoading(false);
    }
  };

  // Trigger manual immediate scraping cycle
  const handleScrapeNow = async () => {
    setScraping(true);
    triggerAlert("info", "Contacting Sourcing & Alternate Generative Agents...");
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      if (res.ok) {
        triggerAlert("success", "SaaMedia news scraping cycle triggered successfully!");
        // We delay data update slightly to let the agent process
        setTimeout(fetchData, 2000);
      } else {
        triggerAlert("error", "Failed to launch immediate scraping task.");
      }
    } catch (e) {
      triggerAlert("error", "Failed to connect to scraping service.");
    } finally {
      // Keep scraping animation active for 2.5s to show workflow
      setTimeout(() => setScraping(false), 2500);
    }
  };

  // Save Credentials Config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localConfig) return;
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localConfig)
      });
      if (res.ok) {
        triggerAlert("success", "Gateways and WP credentials saved. Scheduler updated.");
        setConfig(localConfig);
        fetchData();
      } else {
        triggerAlert("error", "Failed to persist core configurations.");
      }
    } catch (e) {
      triggerAlert("error", "Error connecting to configuration API.");
    }
  };

  // Toggle Source active status
  const handleToggleSource = async (id: string) => {
    const updated = sources.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
    setSources(updated);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        triggerAlert("success", "Sourcing preference updated.");
        fetchData();
      } else {
        triggerAlert("error", "Failed to preserve source toggle state.");
      }
    } catch (e) {
      triggerAlert("error", "CORS block or connection failure on source sync.");
    }
  };

  // Add Custom Feed Source
  const handleAddCustomSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceName || !newSourceFeedUrl) {
      return triggerAlert("error", "Enter both source title and XML/RSS URL.");
    }

    const newSrc: NewsSource = {
      id: "custom_" + Math.random().toString(36).substring(2, 7),
      name: newSourceName,
      url: newSourceUrl || newSourceFeedUrl,
      type: newSourceType,
      feedUrl: newSourceFeedUrl,
      enabled: true
    };

    const nextSources = [...sources, newSrc];
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSources)
      });
      if (res.ok) {
        triggerAlert("success", `Added custom news outlet: ${newSourceName}`);
        setNewSourceName("");
        setNewSourceUrl("");
        setNewSourceFeedUrl("");
        fetchData();
      } else {
        triggerAlert("error", "Failed to add news feed source.");
      }
    } catch (e) {
      triggerAlert("error", "Failed to contact sources endpoint.");
    }
  };

  // Submit manual article draft
  const handleAddManualArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle || !manualContent) {
      return triggerAlert("error", "Input a title and article body.");
    }

    try {
      const res = await fetch("/api/articles/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: manualTitle,
          content: manualContent,
          source: manualSource,
          category: manualCategory
        })
      });

      if (res.ok) {
        triggerAlert("success", `Created draft: "${manualTitle}" ready for editorial.`);
        setManualTitle("");
        setManualContent("");
        setShowManualForm(false);
        fetchData();
      } else {
        triggerAlert("error", "Server rejected draft publication.");
      }
    } catch (e) {
      triggerAlert("error", "Error connection while saving draft.");
    }
  };

  // Delete article from local lists
  const handleDeleteArticle = async (id: string) => {
    if (!confirm("Are you sure you want to discard this item from SaaMedia queue?")) return;
    try {
      const res = await fetch(`/api/articles/${id}`, { method: "DELETE" });
      if (res.ok) {
        triggerAlert("info", "Article draft purged.");
        fetchData();
        if (editingArticle?.id === id) setEditingArticle(null);
      } else {
        triggerAlert("error", "Purge request returned negative error code.");
      }
    } catch (e) {
      triggerAlert("error", "Failed to dispatch delete command.");
    }
  };

  // Save and approve intermediate draft
  const handleSaveApproveArticle = async () => {
    if (!editingArticle) return;
    try {
      const res = await fetch(`/api/articles/${editingArticle.id}/edit-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editingArticle.title,
          content: editingArticle.content,
          summary: editingArticle.summary,
          category: editingArticle.category
        })
      });

      if (res.ok) {
        triggerAlert("success", "Draft approved and customized. Headed for publishing.");
        setEditingArticle(null);
        fetchData();
      } else {
        triggerAlert("error", "Failed to approve current draft edits.");
      }
    } catch (e) {
      triggerAlert("error", "API offline or error while validating approval.");
    }
  };

  // AI Expand Details & Enrich with Custom Media assets
  const handleAIEnrichArticle = async (id: string) => {
    setEnriching(true);
    triggerAlert("info", "AI is fetching full content and generating premium SEO story...");
    try {
      const res = await fetch(`/api/articles/${id}/enrich`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setEditingArticle(data.article);
        triggerAlert("success", "AI Agent successfully created rich full-length article narrative!");
        fetchData();
      } else {
        const data = await res.json();
        triggerAlert("error", data.error || "Failed to enrich draft details.");
      }
    } catch (e) {
      triggerAlert("error", "Network offline or error contacting enrichment service.");
    } finally {
      setEnriching(false);
    }
  };

  // Force Publish to WordPress Sandbox / Production Live
  const handleForcePublish = async (id: string) => {
    triggerAlert("info", "Contacting WordPress XML-RPC / REST Gateways...");
    setLoading(true);
    try {
      const res = await fetch(`/api/articles/${id}/force-publish`, { method: "POST" });
      if (res.ok) {
        const body = await res.json();
        if (body.article.status === "published") {
          triggerAlert("success", `Live on WordPress! Post ID: ${body.article.wordpressId}`);
        } else {
          triggerAlert("error", `Scattered issue during WordPress push: ${body.article.publishError}`);
        }
        fetchData();
        if (editingArticle?.id === id) setEditingArticle(null);
      } else {
        triggerAlert("error", "Publish endpoint returned server error.");
      }
    } catch (e) {
      triggerAlert("error", "Publish error: Server timeout or XML-RPC blocked.");
    } finally {
      setLoading(false);
    }
  };

  // Clear all Activity Logs
  const handleClearLogs = async () => {
    if (!confirm("Wipe automation tracking log archives?")) return;
    try {
      const res = await fetch("/api/logs/clear", { method: "POST" });
      if (res.ok) {
        triggerAlert("success", "Logs cleared.");
        fetchData();
      }
    } catch (e) {}
  };

  // Fetch immediately on mount and poll stats every 15 secs
  useEffect(() => {
    fetchData(false);
    const interval = setInterval(() => fetchData(true), 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchWaStatus = async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      if (res.ok) {
        const data = await res.json();
        setWaStatus(data);
      }
    } catch (e) {
      console.warn("Failed to fetch WhatsApp Web client status:", e);
    }
  };

  // WhatsApp helper polling if whatsapp-web is selected
  useEffect(() => {
    if (config.whatsappGateway !== "whatsapp-web") return;
    
    fetchWaStatus();
    const interval = setInterval(fetchWaStatus, 5000);
    return () => clearInterval(interval);
  }, [config.whatsappGateway]);

  // Filter queues
  const reviewQueue = articles.filter(a => a.status === "scraped" || a.status === "approved" || a.status === "failed" || a.status === "publishing");
  const publishedArchive = articles.filter(a => a.status === "published");

  return (
    <div className="min-h-screen bg-[#0B0F1A] font-sans text-slate-100 flex flex-col p-4 sm:p-6 md:p-8">
      
      {/* ALERT TOAST PORTAL */}
      <AnimatePresence>
        {alert && (
          <motion.div 
            initial={{ opacity: 0, y: -25, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: -25 }}
            className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm md:max-w-md ${
              alert.type === "success" ? "bg-emerald-950/80 border-emerald-800 text-emerald-100 shadow-emerald-950/25" :
              alert.type === "error" ? "bg-rose-950/80 border-rose-800 text-rose-100 shadow-rose-950/25" :
              "bg-slate-900 border-slate-700 text-slate-100 shadow-slate-950/25"
            }`}
            id="alert-toast"
          >
            <Activity className="h-4 w-4 shrink-0 animate-pulse text-green-400" />
            <p className="font-medium mr-2">{alert.message}</p>
            <button onClick={() => setAlert(null)} className="text-slate-450 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER SECTION */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#008751] rounded-xl flex items-center justify-center font-bold text-xl text-white shadow-md shadow-[#008751]/15 font-display">S</div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white font-display">SaaMedia News Agent</h1>
            <p className="text-xs text-slate-400 font-mono uppercase tracking-widest">AI Automation Pipeline v2.4</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 col-span-1">
          {/* Quick Trigger Scraper & Refresh */}
          <div className="flex items-center gap-2">
            <button 
              onClick={handleScrapeNow}
              disabled={scraping}
              id="btn-trigger-scrape"
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full border border-slate-700/60 transition-all ${
                scraping 
                  ? "bg-[#162033] text-slate-500 cursor-not-allowed" 
                  : "bg-[#162033] hover:bg-[#1f2c45] text-white shadow-sm active:scale-95 cursor-pointer"
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 text-[#008751] ${scraping ? "animate-spin" : ""}`} />
              {scraping ? "SCRAPING LIVE..." : "TRIGGER PIPELINE"}
            </button>
            
            <button 
              onClick={fetchData}
              disabled={loading}
              title="Refresh stats immediately"
              className="p-2 text-slate-400 hover:text-white bg-[#162033] hover:bg-[#1f2c45] rounded-full transition-colors border border-slate-700/60 cursor-pointer"
            >
              <ListRestart className={`h-4 w-4 ${loading && !scraping ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="flex items-center gap-2 bg-[#162033] px-3.5 py-2 rounded-full border border-slate-700/60">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-xs font-medium text-slate-300">System Live</span>
          </div>
          <div className="flex items-center gap-2 bg-[#162033] px-3.5 py-2 rounded-full border border-slate-700/60">
            <span className="text-xs font-medium text-slate-300 italic">saamedia.com.ng</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full flex-grow flex flex-col">
        
        {/* METRICS GRID WITH PURPOSEFUL BENTO LAYOUT AND rhythm */}
        <section id="metrics-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          
          <div className="bg-[#162033]/90 rounded-2xl p-5 border border-slate-700/50 flex flex-col justify-between hover:border-slate-655 transition-all group shadow-sm hover:shadow">
            <div className="flex justify-between items-start">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider font-mono">Total Discovered</span>
              <span className="text-[#008751] bg-[#008751]/10 px-2 py-0.5 rounded text-[10px] font-bold">Active Engine</span>
            </div>
            <div className="text-5xl font-black text-white my-3 group-hover:scale-[1.02] transition-transform">{stats.totalScraped}</div>
            <div className="text-xs text-slate-400">Sourced across live Nigerian RSS publications</div>
          </div>

          <div className="bg-[#162033]/90 rounded-2xl p-5 border border-slate-700/50 flex flex-col justify-between hover:border-slate-655 transition-all group shadow-sm hover:shadow">
            <div className="flex justify-between items-start">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider font-mono">Live on WordPress</span>
              <span className="text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded text-[10px] font-bold font-mono">Synchronized</span>
            </div>
            <div className="text-5xl font-black text-white my-3 group-hover:scale-[1.02] transition-transform">{stats.totalPublished}</div>
            <div className="text-xs text-green-400 font-medium font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Auto-synced and approved
            </div>
          </div>

          <div className="bg-[#162033]/90 rounded-2xl p-5 border border-slate-700/50 flex flex-col justify-between hover:border-slate-655 transition-all group shadow-sm hover:shadow">
            <div className="flex justify-between items-start">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider font-mono">Review Queue</span>
              {reviewQueue.length > 0 ? (
                <span className="text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded text-[10px] font-bold">Awaiting Push</span>
              ) : (
                <span className="text-slate-400 bg-slate-700/30 px-2 py-0.5 rounded text-[10px] font-bold font-mono">Cleared</span>
              )}
            </div>
            <div className="text-5xl font-black text-white my-3 group-hover:scale-[1.02] transition-transform">{stats.totalPending}</div>
            <div className="text-xs text-slate-400">Awaiting editorial adjustments & dispatches</div>
          </div>

          <div className="bg-[#162033]/90 rounded-2xl p-5 border border-slate-700/50 flex flex-col justify-between hover:border-slate-655 transition-all group shadow-sm hover:shadow">
            <div className="flex justify-between items-start">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider font-mono">Scheduler Loop</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${stats.schedulerEnabled ? "text-green-400 bg-green-400/10" : "text-slate-400 bg-slate-700"}`}>
                {stats.schedulerEnabled ? "ENABLED" : "PAUSED"}
              </span>
            </div>
            <div className="text-2xl font-black text-white my-4 uppercase tracking-wider flex items-center gap-2">
              <Activity className={`h-5 w-5 ${stats.schedulerEnabled ? "text-green-400 animate-pulse" : "text-slate-500"}`} />
              {stats.schedulerEnabled ? "Running Live" : "On Standby"}
            </div>
            <div className="text-xs text-slate-400">Polling every <span className="font-mono text-white font-bold">{stats.schedulerIntervalMins}</span> minutes</div>
          </div>

        </section>

        {/* PRIMARY LAYOUT WITH LEFT NAVIGATION RAIL AND MAIN STAGE */}
        <div id="main-interface" className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* NAVIGATION RAIL */}
          <aside className="lg:col-span-3">
            <div className="bg-[#162033] rounded-2xl border border-slate-700/50 p-4 sticky top-24 shadow-sm">
              <h3 className="px-4 pt-2 pb-3 text-xs font-mono text-slate-400 uppercase tracking-widest border-b border-slate-800/60 mb-3">CONTROL PORTAL</h3>
              <nav className="space-y-1.5">
                <button
                  onClick={() => { setActiveTab("queue"); setEditingArticle(null); }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activeTab === "queue" 
                      ? "bg-[#0B0F1A] text-green-400 border border-slate-700/40 font-bold" 
                      : "text-slate-300 hover:bg-[#1e2c47] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <FileText className={`h-4.5 w-4.5 ${activeTab === "queue" ? "text-green-400" : "text-slate-400"}`} />
                    <span>Editorial Queue</span>
                  </div>
                  {reviewQueue.length > 0 && (
                    <span className="bg-[#008751] text-white text-xs font-mono px-2 py-0.5 rounded-full font-bold">
                      {reviewQueue.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => { setActiveTab("archive"); setEditingArticle(null); }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activeTab === "archive" 
                      ? "bg-[#0B0F1A] text-green-400 border border-slate-700/40 font-bold" 
                      : "text-slate-300 hover:bg-[#1e2c47] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Globe className={`h-4.5 w-4.5 ${activeTab === "archive" ? "text-green-400" : "text-slate-400"}`} />
                    <span>WP Live Archive</span>
                  </div>
                  {publishedArchive.length > 0 && (
                    <span className="bg-[#0B0F1A] text-slate-400 text-xs font-mono px-1.5 py-0.5 rounded border border-slate-800">
                      {publishedArchive.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => { setActiveTab("sources"); setEditingArticle(null); }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activeTab === "sources" 
                      ? "bg-[#0B0F1A] text-green-400 border border-slate-700/40 font-bold" 
                      : "text-slate-300 hover:bg-[#1e2c47] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Grid className={`h-4.5 w-4.5 ${activeTab === "sources" ? "text-green-400" : "text-slate-400"}`} />
                    <span>Outlets Monitored</span>
                  </div>
                  <span className="bg-[#0B0F1A] text-slate-400 text-xs font-mono px-1.5 py-0.5 rounded border border-slate-800">
                    {sources.length}
                  </span>
                </button>

                <button
                  onClick={() => { setActiveTab("logs"); setEditingArticle(null); }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activeTab === "logs" 
                      ? "bg-[#0B0F1A] text-green-400 border border-slate-700/40 font-bold" 
                      : "text-slate-300 hover:bg-[#1e2c47] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Activity className={`h-4.5 w-4.5 ${activeTab === "logs" ? "text-green-400" : "text-slate-400"}`} />
                    <span>Tracker Event Log</span>
                  </div>
                  {logs.length > 0 && <span className="h-2 w-2 rounded-full bg-green-400 animate-ping"></span>}
                </button>

                <button
                  onClick={() => { setActiveTab("settings"); setEditingArticle(null); }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activeTab === "settings" 
                      ? "bg-[#0B0F1A] text-green-400 border border-slate-700/40 font-bold" 
                      : "text-slate-300 hover:bg-[#1e2c47] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Settings className={`h-4.5 w-4.5 ${activeTab === "settings" ? "text-green-400" : "text-slate-400"}`} />
                    <span>Gateways & Secrets</span>
                  </div>
                </button>
              </nav>

              {/* NEWS DIGEST SUMMARY BAR */}
              <div className="mt-6 border-t border-slate-800/60 pt-5">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-2 px-1">FEED CATEGORIES</span>
                {Object.keys(stats.categoryCounts).length === 0 ? (
                  <p className="text-xs text-slate-500 italic px-1">No news distributed yet</p>
                ) : (
                  <div className="space-y-1.5 px-1 max-h-48 overflow-y-auto pr-1">
                    {Object.entries(stats.categoryCounts).map(([cat, count]) => (
                      <div key={cat} className="flex justify-between items-center text-xs hover:bg-[#1d2a3f] p-1 rounded transition-colors">
                        <span className="text-slate-300 font-medium">{cat}</span>
                        <span className="font-mono font-semibold text-slate-200 bg-[#0B0F1A] px-2 py-0.5 rounded border border-slate-800">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </aside>

          {/* MAIN ACTIONS & SECTIONS PLACE STAGE */}
          <section className="lg:col-span-9">
            
            {/* STAGE A: EDITORIAL QUEUE */}
            {activeTab === "queue" && (
              <div className="space-y-6">
                
                {/* Header Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white font-display">Editorial Review Pipeline</h2>
                    <p className="text-sm text-slate-400">Review newly harvested Nigerian current events, adjust AI Editorial drafts and publish to WordPress live with WhatsApp alert indicators.</p>
                  </div>
                  
                  <button
                    onClick={() => setShowManualForm(!showManualForm)}
                    id="btn-add-draft"
                    className="flex items-center gap-2 bg-[#008751] hover:bg-green-600 text-white px-4 py-2 text-xs font-semibold rounded-xl transition-colors active:scale-95 text-center shadow"
                  >
                    {showManualForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    {showManualForm ? "DISMISS DRAWER" : "SUBMIT MANUAL DIGEST"}
                  </button>
                </div>

                {/* MANUAL SUBMISSIONS DRAWER */}
                {showManualForm && (
                  <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#162033] p-6 rounded-2xl border border-slate-700/50 shadow-sm"
                  >
                    <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider mb-4 flex items-center gap-2 text-[#008751]">
                      <Plus className="h-4 w-4" /> Create Custom Newspaper Draft
                    </h3>
                    <form onSubmit={handleAddManualArticle} className="space-y-4">
                      
                      <div>
                        <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-400 mb-1.5">Article Title *</label>
                        <input
                          type="text"
                          required
                          value={manualTitle}
                          onChange={(e) => setManualTitle(e.target.value)}
                          placeholder="e.g., Central Bank of Nigeria Approves Major Export Framework Updates"
                          className="w-full text-sm bg-[#0B0F1A] border border-slate-700/60 rounded-xl px-3-5 py-2.5 text-slate-100 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-400 mb-1.5">News Category *</label>
                          <select
                            value={manualCategory}
                            onChange={(e) => setManualCategory(e.target.value)}
                            className="w-full text-sm bg-[#0B0F1A] border border-slate-700/60 rounded-xl px-3-5 py-2.5 text-slate-100 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                          >
                            <option value="Politics">Politics</option>
                            <option value="Business">Business</option>
                            <option value="Security">Security</option>
                            <option value="Economy">Economy</option>
                            <option value="National">National</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-400 mb-1.5">Outlet Entity *</label>
                          <input
                            type="text"
                            required
                            value={manualSource}
                            onChange={(e) => setManualSource(e.target.value)}
                            className="w-full text-sm bg-[#0B0F1A] border border-slate-700/60 rounded-xl px-3-5 py-2.5 text-slate-100 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-400 mb-1.5">Raw Story / Snippet content *</label>
                        <textarea
                          rows={4}
                          required
                          value={manualContent}
                          onChange={(e) => setManualContent(e.target.value)}
                          placeholder="Paste raw contents here. Editorial Agent will automatically format, enrich, and build rich reading structures (HTML) on submit."
                          className="w-full text-sm bg-[#0B0F1A] border border-slate-700/60 rounded-xl px-3-5 py-2.5 text-slate-100 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751] resize-y"
                        ></textarea>
                      </div>

                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowManualForm(false)}
                          className="px-4 py-2 border border-slate-700 text-slate-300 hover:bg-[#1e2c47] text-xs font-semibold rounded-xl"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-[#008751] hover:bg-green-650 text-white text-xs font-semibold rounded-xl"
                        >
                          Add to Review Queue
                        </button>
                      </div>

                    </form>
                  </motion.div>
                )}

                {/* EDITING INTERACTIVE MODAL COMPONENT */}
                {editingArticle && (
                  <motion.div 
                    layoutId={`article-view-${editingArticle.id}`}
                    className="bg-[#162033] border-2 border-green-500 rounded-2xl p-6 shadow-xl shadow-green-950/10 text-slate-200"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800/60 pb-4 mb-4">
                      <div>
                        <span className="text-xs bg-[#008751]/20 text-green-350 border border-[#008751]/50 font-bold px-2.5 py-1 rounded-full">{editingArticle.category}</span>
                        <span className="text-xs text-slate-400 font-mono ml-3 font-medium">Draft Review Editor</span>
                      </div>
                      <button 
                        onClick={() => setEditingArticle(null)}
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      
                      <div>
                        <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-450 mb-1">Editorial SEO Headline</label>
                        <input
                          type="text"
                          value={editingArticle.title}
                          onChange={(e) => setEditingArticle({ ...editingArticle, title: e.target.value })}
                          className="w-full text-base font-bold bg-[#0B0F1A] border border-slate-700 text-slate-100 rounded-xl px-3 py-2 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-450 mb-1">SaaMedia Category</label>
                          <select
                            value={editingArticle.category}
                            onChange={(e) => setEditingArticle({ ...editingArticle, category: e.target.value })}
                            className="w-full text-sm bg-[#0B0F1A] border border-slate-700 text-slate-100 rounded-xl px-3 py-2 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                          >
                            <option value="Politics">Politics</option>
                            <option value="Business">Business</option>
                            <option value="Security">Security</option>
                            <option value="Economy">Economy</option>
                            <option value="National">National</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-450 mb-1">Outlet Source Mapping</label>
                          <input
                            type="text"
                            disabled
                            value={editingArticle.source}
                            className="w-full text-sm bg-slate-900/60 text-slate-450 cursor-not-allowed border border-slate-800 rounded-xl px-3 py-2 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Premium AI Editorial Enrichment CTA */}
                      <div className="border border-emerald-900/30 bg-emerald-950/10 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
                            <Sparkles className="h-4 w-4 text-emerald-350" /> AI Editorial Enrichment
                          </h4>
                          <p className="text-xs text-slate-400 max-w-lg leading-relaxed">
                            Research and transform this RSS snippet introduction into a comprehensive 4-paragraph full-length story with matching professional photos.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={enriching}
                          onClick={() => handleAIEnrichArticle(editingArticle.id)}
                          className={`w-full md:w-auto shrink-0 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                            enriching
                              ? "bg-emerald-950 text-emerald-600 border border-emerald-900/40 cursor-wait animate-pulse"
                              : "bg-gradient-to-r from-emerald-600 to-green-650 hover:from-emerald-500 hover:to-green-550 text-white shadow shadow-emerald-950/50 cursor-pointer"
                          }`}
                        >
                          {enriching ? "Enriching Story..." : "AI Research & Write Full Article"}
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-450 mb-1">WhatsApp Broadcast Preview (1-2 lines summarizer)</label>
                        <input
                          type="text"
                          value={editingArticle.summary}
                          placeholder="AI agent will generate brief summary upon publishing unless customized here"
                          onChange={(e) => setEditingArticle({ ...editingArticle, summary: e.target.value })}
                          className="w-full text-sm bg-[#0B0F1A] border border-slate-700 text-slate-100 rounded-xl px-3 py-2 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-450 mb-1">HTML Narrative Article Structure</label>
                        <textarea
                          rows={8}
                          value={editingArticle.content}
                          onChange={(e) => setEditingArticle({ ...editingArticle, content: e.target.value })}
                          className="w-full text-sm font-mono bg-[#0B0F1A] border border-slate-700 text-slate-200 rounded-xl p-3 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751] resize-y"
                        ></textarea>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-800/60">
                        <button
                          type="button"
                          onClick={() => handleDeleteArticle(editingArticle.id)}
                          className="flex items-center gap-2 text-rose-400 hover:text-rose-350 hover:bg-rose-950/20 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" /> Discard From Workspace
                        </button>

                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={handleSaveApproveArticle}
                            className="flex items-center gap-1.5 px-4 py-2 border border-slate-700 text-slate-300 hover:bg-[#1e2c47] rounded-xl text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                          >
                            <Check className="h-4 w-4 text-[#008751]" /> Save Review Draft
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => handleForcePublish(editingArticle.id)}
                            className="flex items-center gap-1.5 px-5 py-2 bg-[#008751] hover:bg-green-650 text-white rounded-xl text-xs font-semibold transition-colors shadow cursor-pointer"
                          >
                            <Send className="h-4 w-4" /> Approve & Send Live
                          </button>
                        </div>
                      </div>

                    </div>
                  </motion.div>
                )}

                {/* GENERAL QUEUE FEED */}
                {reviewQueue.length === 0 ? (
                  <div className="bg-[#162033] rounded-2xl border border-slate-700/50 p-12 text-center">
                    <div className="h-16 w-16 bg-[#0B0F1A] border border-slate-800 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                      <Newspaper className="h-7 w-7 text-[#008751]" />
                    </div>
                    <h3 className="text-base font-bold text-white font-display">Review Pipeline Clear</h3>
                    <p className="text-slate-400 text-sm max-w-md mx-auto mt-1">SaaMedia Agent has no queued drafts. Tap "Trigger Pipeline" in the top bar to source fresh news instantly or create manually.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviewQueue.map((article: Article) => (
                      <motion.div
                        key={article.id}
                        layoutId={`article-view-${article.id}`}
                        className={`p-5 rounded-2xl border transition-all ${
                          article.status === "failed" ? "border-rose-900 bg-rose-950/20 text-rose-100" : 
                          article.status === "approved" ? "border-emerald-800 bg-emerald-950/20 text-emerald-100" :
                          article.id === editingArticle?.id ? "border-green-500 shadow-lg bg-[#162033]" : "bg-[#162033]/85 border-[#1f2a3f] hover:border-slate-600 hover:bg-[#1c2940]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-2 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] bg-slate-900/60 text-blue-300 border border-slate-800 px-2 py-0.5 rounded font-mono font-semibold uppercase">
                                {article.source}
                              </span>
                              <span className="text-[10px] bg-slate-900/60 text-green-300 border border-slate-800/80 px-2 py-0.5 rounded font-mono font-semibold uppercase">
                                {article.category}
                              </span>
                              
                              {article.status === "failed" && (
                                <span className="text-[10px] flex items-center gap-1 font-mono font-bold uppercase tracking-wider bg-rose-950/60 text-rose-300 border border-rose-900/50 px-2 py-0.5 rounded">
                                  <AlertCircle className="h-3 w-3 text-rose-400" /> Publishing Failed
                                </span>
                              )}
                              {article.status === "approved" && (
                                <span className="text-[10px] flex items-center gap-1 font-mono font-bold uppercase tracking-wider bg-emerald-950/60 text-emerald-300 border border-emerald-900/50 px-2 py-0.5 rounded">
                                  <Check className="h-3 w-3 text-emerald-400" /> Editorial Approved
                                </span>
                              )}
                              
                              <span className="text-[10px] font-mono text-slate-450">
                                Sourced {new Date(article.scrapedAt).toLocaleTimeString()}
                              </span>
                            </div>

                            <h3 className="text-base font-bold text-white tracking-tight leading-snug hover:text-[#008751] transition-colors font-display break-words">
                              {article.title || article.originalTitle}
                            </h3>

                            {article.status === "failed" && article.publishError && (
                              <p className="text-xs text-rose-350 bg-rose-950/40 p-2.5 rounded border border-rose-900/40 font-mono break-all">
                                System Error: {article.publishError}
                              </p>
                            )}

                            <p className="text-slate-300 text-xs line-clamp-2 leading-relaxed">
                              {article.summary || article.content ? decodeXml(article.content) : "No preview text returned."}
                            </p>
                          </div>

                          <div className="flex sm:flex-col items-center justify-end gap-2 shrink-0">
                            
                            <button
                              onClick={() => setEditingArticle(article)}
                              title="Tweak and structure AI Draft"
                              className="p-2 border border-slate-700 hover:bg-[#1e2c47] hover:text-green-400 text-slate-400 rounded-xl transition-colors bg-[#0B0F1A] shadow-sm cursor-pointer"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>

                            <button
                              onClick={() => handleForcePublish(article.id)}
                              title="Force immediate publish"
                              className="p-2 border border-green-900/60 hover:bg-green-950/45 hover:text-green-300 text-green-400 rounded-xl transition-colors bg-[#0B0F1A] shadow-sm cursor-pointer"
                            >
                              <Send className="h-4 w-4" />
                            </button>

                            <button
                              onClick={() => handleDeleteArticle(article.id)}
                              title="Discard"
                              className="p-2 border border-slate-705 hover:bg-rose-950/40 hover:text-rose-400 text-slate-500 rounded-xl transition-colors bg-[#0B0F1A] shadow-sm cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>

                          </div>
                        </div>

                        {/* Article link footer */}
                        <div className="mt-3.5 pt-3.5 border-t border-slate-800/50 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span>Checked Duplicates: SKIPPED PASSIVE</span>
                          <a 
                            href={article.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="flex items-center gap-1 text-slate-400 hover:text-green-400 transition-colors font-semibold hover:underline"
                          >
                            View Sourced Article <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

              </div>
            )}

            {/* STAGE B: ARCHIVE */}
            {activeTab === "archive" && (
              <div className="space-y-6">
                
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white font-display">WordPress Published Digest</h2>
                  <p className="text-sm text-slate-400">List of archived local stories live on saamedia.com.ng with active WhatsApp and gateway confirmations.</p>
                </div>

                {publishedArchive.length === 0 ? (
                  <div className="bg-[#162033]/90 rounded-2xl border border-slate-700/50 p-12 text-center">
                    <div className="h-16 w-16 bg-[#0B0F1A] border border-slate-800 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Globe className="h-7 w-7 text-green-400" />
                    </div>
                    <h3 className="text-base font-bold text-white font-display">No Published Logs</h3>
                    <p className="text-slate-400 text-sm max-w-sm mx-auto mt-1">Archive is empty. Approve and publish stories from the Editorial Queue to see logs here.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {publishedArchive.map((article: Article) => (
                      <div key={article.id} className="bg-[#162033]/90 p-5 rounded-2xl border border-slate-700/50 hover:border-slate-600 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] bg-[#0B0F1A] font-mono text-slate-300 px-2 py-0.5 rounded font-bold uppercase border border-slate-850">{article.source}</span>
                            <span className="text-[10px] bg-[#0B0F1A] font-mono text-green-300 px-2 py-0.5 rounded font-bold uppercase border border-[#008751]/30">{article.category}</span>
                            <span className="text-xs text-slate-400 font-mono">WP ID: {article.wordpressId}</span>
                          </div>

                          <h3 className="text-base font-bold text-white tracking-tight leading-snug truncate font-display">
                            {article.title}
                          </h3>

                          <p className="text-xs text-slate-350 italic line-clamp-1">
                            {article.summary}
                          </p>

                          <div className="flex items-center gap-4 text-xs text-slate-400 pt-1.5 font-mono flex-wrap">
                            <span className="flex items-center gap-1.5">
                              {article.whatsappError ? (
                                <span className="flex items-center gap-1 text-rose-450" title={article.whatsappError}>
                                  ⚠️ WhatsApp Fail
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-emerald-400">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> WhatsApp Sent
                                </span>
                              )}
                            </span>
                            
                            {(config.telegramEnabled || article.telegramSent) && (
                              <span className="flex items-center gap-1.5">
                                {article.telegramSent ? (
                                  <span className="flex items-center gap-1 text-cyan-400">
                                    <Send className="h-3.5 w-3.5 text-cyan-450" /> Telegram Sent
                                  </span>
                                ) : article.telegramError ? (
                                  <span className="flex items-center gap-1 text-rose-450" title={article.telegramError}>
                                    ⚠️ Telegram Fail
                                  </span>
                                ) : (
                                  <span className="text-slate-500">
                                    ✈️ Telegram Pending
                                  </span>
                                )}
                              </span>
                            )}

                            {(config.facebookEnabled || article.facebookSent) && (
                              <span className="flex items-center gap-1.5">
                                {article.facebookSent ? (
                                  <span className="flex items-center gap-1 text-indigo-400">
                                    <Send className="h-3.5 w-3.5 text-indigo-400" /> Facebook Posted
                                  </span>
                                ) : article.facebookError ? (
                                  <span className="flex items-center gap-1 text-rose-450" title={article.facebookError}>
                                    ⚠️ Facebook Fail
                                  </span>
                                ) : (
                                  <span className="text-slate-500">
                                    👥 Facebook Pending
                                  </span>
                                )}
                              </span>
                            )}
                            <span>Published {article.publishedAt ? new Date(article.publishedAt).toLocaleString() : ""}</span>
                          </div>
                        </div>

                        <div className="flex md:flex-col shrink-0 gap-2 items-stretch justify-end min-w-[140px]">
                          <a
                            href={`${config.wordpressUrl}/?p=${article.wordpressId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#008751] hover:bg-green-650 text-white rounded-xl text-xs font-semibold transition-all shadow-sm text-center cursor-pointer font-display"
                          >
                            Open Live Site <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          
                          <button
                            onClick={() => handleDeleteArticle(article.id)}
                            className="flex items-center justify-center gap-2 text-rose-450 hover:text-white hover:bg-rose-950/20 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all border border-transparent cursor-pointer"
                          >
                            Purge Log
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            )}

            {/* STAGE C: NEW OUTLET CONTROLS */}
            {activeTab === "sources" && (
              <div className="space-y-6">
                
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white font-display">Sourced Publications</h2>
                  <p className="text-sm text-slate-400">Toggle active Nigerian publications, view last harvested states, and add custom XML feeds.</p>
                </div>

                {/* ADD NEW SOURCE CARD */}
                <div className="bg-[#162033] p-5 rounded-2xl border border-slate-700/50 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-widest text-[#008751] mb-4 flex items-center gap-2 font-mono">
                    <Plus className="h-4.5 w-4.5 text-green-400" /> Append Custom RSS Feed
                  </h3>
                  <form onSubmit={handleAddCustomSource} className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    
                    <div className="md:col-span-3">
                      <label className="block text-[10px] font-mono font-medium uppercase tracking-wider text-slate-400 mb-1">Outlet Name *</label>
                      <input
                        type="text"
                        required
                        value={newSourceName}
                        onChange={(e) => setNewSourceName(e.target.value)}
                        placeholder="e.g., Vanguard News"
                        className="w-full text-xs bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-2.5 py-2.5 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                      />
                    </div>

                    <div className="md:col-span-4">
                      <label className="block text-[10px] font-mono font-medium uppercase tracking-wider text-slate-400 mb-1">RSS/XML Feed Link *</label>
                      <input
                        type="url"
                        required
                        value={newSourceFeedUrl}
                        onChange={(e) => setNewSourceFeedUrl(e.target.value)}
                        placeholder="https://vanguardngr.com/feed/"
                        className="w-full text-xs bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-2.5 py-2.5 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[10px] font-mono font-medium uppercase tracking-wider text-slate-400 mb-1">Category Theme</label>
                      <select
                        value={newSourceType}
                        onChange={(e) => setNewSourceType(e.target.value)}
                        className="w-full text-xs bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-2.5 py-2.5 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                      >
                        <option value="Politics">Politics</option>
                        <option value="Business">Business</option>
                        <option value="National">National</option>
                        <option value="General">General</option>
                        <option value="Economy">Economy</option>
                      </select>
                    </div>

                    <div className="md:col-span-2 flex items-end">
                      <button
                        type="submit"
                        className="w-full bg-[#008751] text-white hover:bg-green-655 py-2.5-custom py-2.5 text-xs font-bold rounded-xl shadow transition-colors cursor-pointer"
                      >
                        Integrate Source
                      </button>
                    </div>

                  </form>
                </div>

                {/* ACTIVE SOURCES LIST */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sources.map((source: NewsSource) => {
                    const count = articles.filter(a => a.source === source.name).length;
                    return (
                      <div key={source.id} className="bg-[#162033]/95 p-5 rounded-2xl border border-slate-700/50 shadow-sm flex items-start justify-between gap-4">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-[#0B0F1A] font-mono text-green-300 border border-[#008751]/20 px-2 py-0.5 rounded font-bold uppercase">{source.type}</span>
                            <span className="text-xs text-slate-400 font-mono">Harvested: {count} articles</span>
                          </div>
                          
                          <h4 className="text-base font-bold text-white tracking-tight truncate font-display">{source.name}</h4>
                          <p className="text-xs text-green-400 truncate max-w-[200px]" title={source.feedUrl}>
                            {source.feedUrl}
                          </p>
                          
                          {source.lastScrapedAt ? (
                            <span className="text-[10px] text-slate-455 block font-mono">
                              Last scrape: {new Date(source.lastScrapedAt).toLocaleTimeString()}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-455 italic block font-mono">Never triggered</span>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {/* TOGGLE SWITCH */}
                          <button
                            onClick={() => handleToggleSource(source.id)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              source.enabled ? "bg-[#008751]" : "bg-slate-800"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                source.enabled ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                          
                          <span className={`text-[10px] font-mono font-semibold ${source.enabled ? "text-green-400" : "text-slate-400"}`}>
                            {source.enabled ? "ENABLED" : "PAUSED"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            )}

            {/* STAGE D: TRACKER ACTIVITY LOGGER */}
            {activeTab === "logs" && (
              <div className="space-y-6">
                
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white font-display">Automation Event logs</h2>
                    <p className="text-sm text-slate-400">Live system execution logs tracing RSS parsing, skip verifications, Gemini completions and gateway dispatches.</p>
                  </div>

                  <button
                    onClick={handleClearLogs}
                    className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-white hover:bg-rose-950/30 border border-rose-900/40 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear Record Log
                  </button>
                </div>

                <div className="bg-[#0B0F1A] text-slate-250 rounded-2xl overflow-hidden border border-slate-800/80 font-mono shadow-inner text-[11px] md:text-xs">
                  <div className="bg-slate-950 border-b border-slate-850 px-4 py-2 flex items-center justify-between text-slate-400 text-[10px] tracking-wider uppercase">
                    <span>SYSTEM SHELL TRACE</span>
                    <span>200 CAPACITY CAP</span>
                  </div>

                  {logs.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 italic">
                      Tracking pipeline idle. Wait for automatic scheduler triggers...
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-850/60 max-h-[500px] overflow-y-auto">
                      {logs.map((log: SystemLog) => (
                        <div key={log.id} className="p-3.5 hover:bg-slate-850/50 flex items-start gap-4">
                          <span className="text-[10px] text-slate-500 shrink-0 select-none">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          
                          <span className={`shrink-0 uppercase font-bold tracking-widest text-[9px] px-1.5 py-0.5 rounded ${
                            log.level === "success" ? "bg-emerald-950/80 text-emerald-400 border border-emerald-900" :
                            log.level === "error" ? "bg-rose-950/80 text-rose-400 border border-rose-900" :
                            log.level === "warn" ? "bg-amber-950/80 text-amber-400 border border-amber-900" :
                            "bg-slate-850 text-slate-400 border border-slate-700"
                          }`}>
                            {log.section}
                          </span>

                          <span className={`${
                            log.level === "success" ? "text-emerald-300" : 
                            log.level === "error" ? "text-rose-300 font-bold" : 
                            log.level === "warn" ? "text-amber-300" : "text-slate-300"
                          }`}>
                            {log.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* STAGE E: SETTINGS CONTROL PANEL */}
            {activeTab === "settings" && (
              <div className="space-y-6">
                
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white font-display">Configure Gateways & Integration</h2>
                  <p className="text-sm text-slate-450">Enable fully automatic scheduled runs and set up credentials for the WordPress XML-RPC API and WhatsApp Alert Gateways.</p>
                </div>

                <form onSubmit={handleSaveConfig} className="space-y-6 animate-fade-in">
                  
                  {/* AUTOMATION FREQUENCY SETTINGS */}
                  <div className="bg-[#162033]/90 p-6 rounded-2xl border border-slate-700/50 space-y-4">
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2 text-green-400 border-b border-slate-800/80 pb-2.5 font-display">
                      <Sliders className="h-4 w-4" /> Scheduler & Engine Loop
                    </h3>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-[#0B0F1A] border border-slate-800/80 rounded-xl">
                      <div>
                        <span className="text-xs font-bold text-slate-200 uppercase block mb-0.5">Automated Polling Mode</span>
                        <p className="text-xs text-slate-450">When enabled, SaaMedia News Agent will automatically scan Nigerian feeds every X minutes, skip duplicates, draft, summarize and auto-publish.</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setLocalConfig({ ...activeConfig, schedulerEnabled: !activeConfig.schedulerEnabled })}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          activeConfig.schedulerEnabled ? "bg-[#008751]" : "bg-slate-800"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            activeConfig.schedulerEnabled ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-450 mb-1">Polling Interval Rate (Minutes)</label>
                      <input
                        type="number"
                        min={5}
                        required
                        value={activeConfig.schedulerIntervalMins}
                        onChange={(e) => setLocalConfig({ ...activeConfig, schedulerIntervalMins: Number(e.target.value) })}
                        placeholder="e.g., 60"
                        className="w-full text-xs font-mono bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-3 py-2.5 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                      />
                    </div>
                  </div>

                  {/* WORDPRESS CONNECTION CREDENTIALS */}
                  <div className="bg-[#162033]/90 p-6 rounded-2xl border border-slate-700/50 space-y-4">
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2 text-green-400 border-b border-slate-800/80 pb-2.5 font-display">
                      <Globe className="h-4 w-4 text-green-450" /> WordPress XML-RPC / REST Gateway
                    </h3>

                    <div>
                      <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-450 mb-1">Target WordPress URL</label>
                      <input
                        type="url"
                        value={activeConfig.wordpressUrl}
                        onChange={(e) => setLocalConfig({ ...activeConfig, wordpressUrl: e.target.value })}
                        placeholder="https://saamedia.com.ng"
                        className="w-full text-xs bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-3 py-2.5 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-450 mb-1">WP Admin Username</label>
                        <input
                          type="text"
                          value={activeConfig.wordpressUsername}
                          onChange={(e) => setLocalConfig({ ...activeConfig, wordpressUsername: e.target.value })}
                          placeholder="e.g., admin"
                          className="w-full text-xs bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-3 py-2.5 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-450 mb-1">WP Application Password *</label>
                        <input
                          type="password"
                          value={activeConfig.wordpressPassword}
                          onChange={(e) => setLocalConfig({ ...activeConfig, wordpressPassword: e.target.value })}
                          placeholder="Password or WP Application secret key"
                          className="w-full text-xs bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-3 py-2.5 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                        />
                        <p className="text-[10px] text-slate-458 mt-1 font-mono">Create an Application Password in WordPress: User Profile - Application Passwords.</p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-450 mb-1">Publish API Protocol Integration</label>
                      <select
                        value={activeConfig.wordpressMode}
                        onChange={(e) => setLocalConfig({ ...activeConfig, wordpressMode: e.target.value as "xmlrpc" | "rest" })}
                        className="w-full text-xs bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-3 py-2.5 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                      >
                        <option value="rest">WordPress REST Core API (Recommended - Stable & Secure)</option>
                        <option value="xmlrpc">WordPress metaWeblog XML-RPC Protocol (Classic)</option>
                      </select>
                    </div>
                  </div>

                  {/* WHATSAPP NOTIFIER CONTROL */}
                  <div className="bg-[#162033]/90 p-6 rounded-2xl border border-slate-700/50 space-y-4">
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2 text-green-400 border-b border-slate-800/80 pb-2.5 font-display">
                      <Bell className="h-4 w-4 text-green-450" /> WhatsApp Notification Dispatcher
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-450 mb-1">WhatsApp Recipient (Number or Group ID) *</label>
                        <input
                          type="text"
                          value={activeConfig.whatsappRecipient}
                          onChange={(e) => setLocalConfig({ ...activeConfig, whatsappRecipient: e.target.value })}
                          placeholder="e.g., 2348030000000 or group ID"
                          className="w-full text-xs bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-3 py-2.5 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751] font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-455 mb-1">Direct Gateway Selected</label>
                        <select
                          value={activeConfig.whatsappGateway}
                          onChange={(e) => setLocalConfig({ ...activeConfig, whatsappGateway: e.target.value as "twilio" | "custom_webhook" | "mock" | "whatsapp-web" })}
                          className="w-full text-xs bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-3 py-2.5 focus:border-[#008751] focus:outline-none focus:ring-1 focus:ring-[#008751]"
                        >
                          <option value="mock">Log Simulation Channel (Instant - Zero Config Sandbox)</option>
                          <option value="whatsapp-web">Exclusively Free WhatsApp (Baileys Engine Link Device)</option>
                          <option value="twilio">Twilio Programmable WhatsApp SMS Engine (Professional)</option>
                          <option value="custom_webhook">Custom Webhook POST Trigger (Ultramsg, Chat-Api, copy, etc.)</option>
                        </select>
                      </div>
                    </div>

                    {activeConfig.whatsappGateway === "twilio" && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="bg-[#0B0F1A] p-4 rounded-xl border border-slate-800 space-y-4 mt-2"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                          <div>
                            <label className="block font-mono font-semibold text-slate-400 mb-1">Twilio Account SID</label>
                            <input
                              type="text"
                              value={activeConfig.whatsappAccountSid}
                              onChange={(e) => setLocalConfig({ ...activeConfig, whatsappAccountSid: e.target.value })}
                              className="w-full bg-[#162033] border border-slate-700 text-slate-100 rounded-lg px-3 py-2 focus:border-[#008751] focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block font-mono font-semibold text-slate-400 mb-1">Twilio API Auth token</label>
                            <input
                              type="password"
                              value={activeConfig.whatsappApiKey}
                              onChange={(e) => setLocalConfig({ ...activeConfig, whatsappApiKey: e.target.value })}
                              className="w-full bg-[#162033] border border-slate-700 text-slate-100 rounded-lg px-3 py-2 focus:border-[#008751] focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block font-mono font-semibold text-slate-400 mb-1">Sender WhatsApp Number</label>
                            <input
                              type="text"
                              value={activeConfig.whatsappSenderNumber}
                              onChange={(e) => setLocalConfig({ ...activeConfig, whatsappSenderNumber: e.target.value })}
                              placeholder="+14155238886"
                              className="w-full bg-[#162033] border border-slate-700 text-slate-100 rounded-lg px-3 py-2 focus:border-[#008751] focus:outline-none"
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {activeConfig.whatsappGateway === "custom_webhook" && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="bg-[#0B0F1A] p-4 rounded-xl border border-slate-800 mt-2"
                      >
                        <label className="block text-xs font-mono font-semibold text-slate-400 mb-1">JSON Endpoint Webhook URL</label>
                        <input
                          type="url"
                          value={activeConfig.whatsappApiKey}
                          onChange={(e) => setLocalConfig({ ...activeConfig, whatsappApiKey: e.target.value })}
                          placeholder="https://api.ultramsg.com/instanceXXX/messages/chat"
                          className="w-full text-xs font-mono bg-[#162033] border border-slate-700 text-slate-100 rounded-lg px-3 py-2 focus:border-[#008751] focus:outline-none"
                        />
                        <p className="text-[10px] text-slate-458 mt-1">System parses {`{ recipient, message, timestamp }`} and launches HTTP POST on successful publish.</p>
                      </motion.div>
                    )}

                    {activeConfig.whatsappGateway === "whatsapp-web" && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="bg-[#0B0F1A] p-5 rounded-2xl border border-slate-800 space-y-4 mt-2"
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${
                              waStatus.status === "CONNECTED" ? "bg-emerald-500 animate-pulse" :
                              waStatus.status === "QR_RECEIVED" ? "bg-cyan-500 animate-pulse" :
                              waStatus.status === "AUTHENTICATING" ? "bg-amber-500 animate-pulse" :
                              "bg-slate-500"
                            }`} />
                            WhatsApp Web Live Link Client
                          </h4>
                          <span className="text-[11px] font-mono text-slate-400">
                            Status: <strong className="text-slate-200">{waStatus.status}</strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                          {/* QR / Status Display */}
                          <div className="flex flex-col items-center justify-center bg-[#131926] p-5 rounded-xl border border-slate-800/80 min-h-[220px]">
                            {waStatus.status === "QR_RECEIVED" && waStatus.qrCode ? (
                              <div className="bg-white p-3 rounded-lg shadow-xl">
                                <img src={waStatus.qrCode} alt="WhatsApp Web Link QR Code" className="w-[170px] h-[170px] object-contain" />
                              </div>
                            ) : waStatus.status === "CONNECTED" ? (
                              <div className="text-center space-y-2">
                                <div className="text-4xl">🟢</div>
                                <div className="font-semibold text-emerald-400 text-sm">Successfully Connected</div>
                                <p className="text-[10px] text-slate-400 max-w-[220px] mx-auto leading-relaxed">
                                  Your phone has scanned the QR. News alerts will send on-demand to the designated recipient or group!
                                </p>
                              </div>
                            ) : waStatus.status === "AUTHENTICATING" ? (
                              <div className="text-center space-y-2">
                                <div className="animate-spin text-xl text-[#008751] inline-block">⚡</div>
                                <div className="text-xs font-semibold text-slate-300">Spawning Virtual Browser...</div>
                                <p className="text-[10px] text-slate-450 max-w-[170px] mx-auto font-mono">
                                  Whispering secure setup. Generating QR scan-token. Please wait...
                                </p>
                              </div>
                            ) : waStatus.status === "ERROR" ? (
                              <div className="text-center space-y-2 text-rose-450 p-4">
                                <div className="text-3xl">⚠️</div>
                                <div className="text-xs font-semibold uppercase tracking-wider font-mono text-rose-400">Connection Error</div>
                                <p className="text-[10px] text-rose-350 leading-relaxed max-w-[200px] mx-auto bg-rose-950/25 p-2.5 rounded-xl border border-rose-900/30 font-mono break-words">
                                  {waStatus.error || "Headless system standby. Connection timeout or socket failure."}
                                </p>
                              </div>
                            ) : (
                              <div className="text-center space-y-2 text-slate-400">
                                <div className="text-3xl">📵</div>
                                <div className="text-xs font-semibold">Disconnected Session</div>
                                <p className="text-[10px] text-slate-500 max-w-[200px] mx-auto leading-relaxed">
                                  The headless system is standby. Initialize a browser instance to receive scan code.
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Action panel */}
                          <div className="space-y-4">
                            <div>
                              <span className="text-[11px] text-[#008751] font-mono uppercase bg-[#008751]/10 px-2.5 py-1 rounded-full font-semibold">Instructions to pair:</span>
                              <ol className="list-decimal list-inside text-xs text-slate-300 space-y-1.5 mt-2 ml-1 leading-relaxed">
                                <li>Open <strong>WhatsApp</strong> on your mobile device</li>
                                <li>Tap <strong>Settings</strong> or <strong>Menu (3-dots)</strong></li>
                                <li>Click <strong>Linked Devices</strong> &rarr; <strong>Link a Device</strong></li>
                                <li>Scan the live QR code displayed on the left</li>
                              </ol>
                            </div>

                            <div className="pt-2 border-t border-slate-800 space-y-2">
                              <p className="text-[10px] text-slate-450 leading-relaxed">
                                💡 <strong>Aesthetic Recipient Advice:</strong> Insert a country-coded number (e.g. <code className="bg-[#131926] px-1 py-0.5 rounded text-amber-300 font-mono">2348031234567</code>) or a Group ID (e.g. <code className="bg-[#131926] px-1 py-0.5 rounded text-amber-300 font-mono">1203632345678@g.us</code>) to dispatch to groups.
                              </p>

                              <button
                                type="button"
                                onClick={async () => {
                                  setWaLoading(true);
                                  try {
                                    const res = await fetch("/api/whatsapp/reconnect", { method: "POST" });
                                    if (res.ok) {
                                      triggerAlert("success", "Rebuilding browser driver session... Loading new QR soon.");
                                      fetchWaStatus();
                                    } else {
                                      triggerAlert("error", "Failed to reset session.");
                                    }
                                  } catch (err) {
                                    triggerAlert("error", "Error contacting container host.");
                                  } finally {
                                    setWaLoading(false);
                                  }
                                }}
                                disabled={waLoading}
                                className="text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-xl px-4 py-2.5 inline-flex items-center gap-1.5 transition disabled:opacity-50"
                              >
                                {waLoading ? "Booting Driver..." : "🔄 Refresh QR Code or Force Restart"}
                              </button>
                            </div>

                            <div className="pt-3.5 border-t border-slate-800 space-y-3">
                              <span className="text-[11px] text-amber-500 font-mono uppercase bg-amber-500/10 px-2.5 py-1 rounded-full font-semibold">Alternative: Link with Phone Number</span>
                              
                              <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
                                Type your WhatsApp phone number (with country code, e.g. <code className="text-amber-400 bg-black/35 px-1 py-0.5 rounded">2348031234567</code>) to request a temporary 8-digit connection code directly!
                              </p>

                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="e.g., 234803XXXXXXXX"
                                  value={pairingPhoneInput}
                                  onChange={(e) => setPairingPhoneInput(e.target.value)}
                                  className="flex-1 text-xs font-mono bg-[#162033] border border-slate-700 text-slate-100 rounded-lg px-3 py-2 focus:border-amber-500 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={handleRequestPairingCode}
                                  disabled={pairingLoading}
                                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-xs font-bold font-mono transition-colors"
                                >
                                  {pairingLoading ? "Fetching..." : "Request Code"}
                                </button>
                              </div>

                              {waStatus.pairingCode && (
                                <div className="bg-[#1C2C24] border border-emerald-800/80 rounded-xl p-3 text-center space-y-1.5">
                                  <div className="text-[10px] text-emerald-400 uppercase font-bold font-mono tracking-wider">Your Pairing Code</div>
                                  <div className="text-2xl font-extrabold tracking-widest font-mono text-emerald-300 select-all bg-[#09100a]/95 py-2 rounded-lg border border-emerald-700/30">
                                    {waStatus.pairingCode}
                                  </div>
                                  <p className="text-[10px] text-emerald-400 font-mono leading-relaxed">
                                    Enter this code on your WhatsApp mobile app under <strong>Linked Devices &rarr; Link with Phone Number</strong>.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* TELEGRAM BOT NOTIFIER CONTROL */}
                  <div className="bg-[#162033]/90 p-6 rounded-2xl border border-slate-700/50 space-y-4">
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2 text-cyan-400 border-b border-slate-800/80 pb-2.5 font-display">
                      <Send className="h-4 w-4 text-cyan-400" /> Telegram Alternative Dispatcher
                    </h3>

                    <div className="flex items-center justify-between pb-1">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-slate-200">Enable Parallel Telegram Broadcast</span>
                        <p className="text-[10.5px] text-slate-450 leading-relaxed">
                          SaaMedia will automatically forward newly published posts to Telegram as a reliable backup/alternative.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeConfig.telegramEnabled || false}
                          onChange={(e) => setLocalConfig({ ...activeConfig, telegramEnabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                      </label>
                    </div>

                    {activeConfig.telegramEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-4 pt-3 border-t border-slate-800/60"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-400 mb-1">Telegram Bot Token *</label>
                            <input
                              type="text"
                              value={activeConfig.telegramToken || ""}
                              onChange={(e) => setLocalConfig({ ...activeConfig, telegramToken: e.target.value })}
                              placeholder="e.g., 123456789:ABCDefghIjkLmNoP"
                              className="w-full text-xs font-mono bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-3 py-2.5 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            />
                            <p className="text-[10px] text-slate-450 mt-1 font-mono">Create Bot via Telegram <strong>@BotFather</strong> to instantly acquire a token.</p>
                          </div>

                          <div>
                            <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-400 mb-1">Telegram Share Chat/Channel ID *</label>
                            <input
                              type="text"
                              value={activeConfig.telegramChatId || ""}
                              onChange={(e) => setLocalConfig({ ...activeConfig, telegramChatId: e.target.value })}
                              placeholder="e.g., @saamedia_alerts or channel ID"
                              className="w-full text-xs bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-3 py-2.5 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                            />
                            <p className="text-[10px] text-slate-455 mt-1 font-mono">Use channel public link (e.g. <code>@my_channel</code>) or ID (e.g. <code>-100XXXXXXXXXX</code>). Bot must be an administrator.</p>
                          </div>
                        </div>

                        <div className="bg-[#1C2333]/90 border border-cyan-500/20 rounded-xl p-3.5 space-y-1">
                          <div className="text-[11px] text-cyan-400 font-bold font-mono tracking-wider flex items-center gap-1.5 uppercase">
                            📢 Crucial Setup Step
                          </div>
                          <p className="text-[10.5px] text-slate-300 leading-relaxed font-mono">
                            For Telegram to work, you <strong>MUST add your Bot as an Administrator</strong> to your channel or group and allow it to <strong>Post Messages</strong>. If the bot is not an admin, Telegram will reject incoming alerts.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* FACEBOOK BROADCAST CHANNELS */}
                  <div className="bg-[#111625] border border-slate-800/80 rounded-2xl p-6 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between pb-1">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-slate-200 font-display">Enable Facebook Page Broadcast</span>
                        <p className="text-[10.5px] text-slate-450 leading-relaxed">
                          SaaMedia will automatically post newly published news directly to your admin Facebook Page.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeConfig.facebookEnabled || false}
                          onChange={(e) => setLocalConfig({ ...activeConfig, facebookEnabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>

                    {activeConfig.facebookEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-4 pt-3 border-t border-slate-800/60"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-400 mb-1">Facebook Page ID *</label>
                            <input
                              type="text"
                              value={activeConfig.facebookPageId || ""}
                              onChange={(e) => setLocalConfig({ ...activeConfig, facebookPageId: e.target.value })}
                              placeholder="e.g., 102345678901234"
                              className="w-full text-xs font-mono bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-3 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <p className="text-[10px] text-slate-455 mt-1 font-mono">Located in your Facebook Page "About" info tab under "Page transparency" or Page ID.</p>
                          </div>

                          <div>
                            <label className="block text-xs font-mono font-medium uppercase tracking-wider text-slate-400 mb-1">Facebook Page Access Token *</label>
                            <input
                              type="password"
                              value={activeConfig.facebookPageAccessToken || ""}
                              onChange={(e) => setLocalConfig({ ...activeConfig, facebookPageAccessToken: e.target.value })}
                              placeholder="EAAGxxxxx..."
                              className="w-full text-xs bg-[#0B0F1A] border border-slate-700/60 text-slate-100 rounded-xl px-3 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            />
                            <p className="text-[10px] text-slate-455 mt-1 font-mono">Acquire a permanent Page Access Token from the Facebook Developer Portal (Meta Graph API Explorer with <code>pages_manage_posts</code> and <code>pages_read_engagement</code> permissions).</p>
                          </div>
                        </div>

                        <div className="bg-[#1C2333]/90 border border-indigo-500/20 rounded-xl p-3.5 space-y-1">
                          <div className="text-[11px] text-indigo-400 font-bold font-mono tracking-wider flex items-center gap-1.5 uppercase">
                            👥 Facebook Page Publisher Format
                          </div>
                          <p className="text-[10.5px] text-slate-300 leading-relaxed font-mono">
                            Auto-posted notifications will follow the requested style: Title, followed by Excerpt (Summary), followed by direct post link on saamedia.com.ng. Make sure your Meta App is live with matching permissions.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* FORM TRIGGER BUTTONS */}
                  <div className="flex justify-end gap-3 max-w-7xl mx-auto">
                    <button
                      type="submit"
                      id="btn-save-secrets"
                      className="flex items-center gap-2 bg-[#008751] hover:bg-green-655 text-white px-6 py-2.5 text-xs font-bold rounded-xl shadow cursor-pointer transition-all active:scale-95 text-center"
                    >
                      <Save className="h-4 w-4" /> Save Gateways Preferences
                    </button>
                  </div>

                </form>

              </div>
            )}

          </section>

        </div>

      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-slate-800/80 mt-12 text-center text-xs text-slate-458">
        <p className="font-mono">SaaMedia News Automation Agent Center. Powered by multi-AI model intelligence pipeline and Gemini.</p>
        <p className="mt-1 font-mono text-[#008751]">Designed for saamedia.com.ng integration.</p>
      </footer>
    </div>
  );
}
