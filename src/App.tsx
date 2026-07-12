import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import { 
  Copy, 
  Check, 
  Settings, 
  Terminal, 
  Trash2, 
  RefreshCw, 
  ExternalLink, 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Info, 
  FileJson, 
  Play, 
  Send, 
  HelpCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { WebhookConfig, WebhookLog } from './types';

export default function App() {
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [inputToken, setInputToken] = useState('');
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'simulator' | 'custom'>('simulator');
  
  // Copy states
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  // Custom Simulator state
  const [customBody, setCustomBody] = useState(JSON.stringify({
    event: "user.created",
    data: {
      id: "usr_942817",
      name: "Alice Johnson",
      email: "alice@example.com",
      created_at: new Date().toISOString()
    }
  }, null, 2));

  // Loading/Error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isUpdatingToken, setIsUpdatingToken] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<{success: boolean; message: string} | null>(null);

  const hasConnectedOnce = useRef(false);

  // Computed Callback URL based on server's public APP_URL or current origin
  const callbackUrl = config?.appUrl 
    ? `${config.appUrl}/api/webhook` 
    : (typeof window !== 'undefined' ? `${window.location.origin}/api/webhook` : '');

  // Fetch initial config and logs
  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [configRes, logsRes] = await Promise.all([
        fetch('/api/webhook/config'),
        fetch('/api/webhook/logs')
      ]);

      if (!configRes.ok || !logsRes.ok) {
        throw new Error('Failed to retrieve configuration or logs from server.');
      }

      const configContentType = configRes.headers.get('content-type') || '';
      const logsContentType = logsRes.headers.get('content-type') || '';

      if (!configContentType.includes('application/json') || !logsContentType.includes('application/json')) {
        throw new Error('Server returned an unexpected non-JSON response (possibly still starting up or routing incorrectly).');
      }

      const configData: WebhookConfig = await configRes.json();
      const logsData: WebhookLog[] = await logsRes.json();

      setConfig(configData);
      setInputToken(configData.verifyToken);
      setLogs(logsData);
      setError(null);
      setIsReconnecting(false);
      hasConnectedOnce.current = true;
    } catch (err: any) {
      console.error(err);
      if (hasConnectedOnce.current) {
        setIsReconnecting(true);
      } else {
        setError(err.message || 'Could not connect to the server. Please verify the backend is running.');
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  // Fetch immediately on mount, then poll logs
  useEffect(() => {
    fetchData(true);

    const interval = setInterval(() => {
      fetchData(false);
    }, 1500);

    return () => clearInterval(interval);
  }, [fetchData]);

  // Copy helper
  const handleCopy = (text: string, type: 'url' | 'token' | 'log', id?: string) => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else if (type === 'token') {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else if (type === 'log' && id) {
      setCopiedLogId(id);
      setTimeout(() => setCopiedLogId(null), 2000);
    }
  };

  // Save updated verification token to server
  const handleUpdateToken = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputToken.trim()) return;

    setIsUpdatingToken(true);
    try {
      const res = await fetch('/api/webhook/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifyToken: inputToken.trim() }),
      });

      if (!res.ok) throw new Error('Failed to update verification token');

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Server returned an unexpected non-JSON response.');
      }

      const data = await res.json();
      setConfig(data.config);
      setSimulationResult({
        success: true,
        message: `Verification token updated successfully to "${data.config.verifyToken}"`
      });
      setTimeout(() => setSimulationResult(null), 4000);
    } catch (err: any) {
      setSimulationResult({
        success: false,
        message: err.message || 'Error updating token.'
      });
    } finally {
      setIsUpdatingToken(false);
    }
  };

  // Clear webhook logs
  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/webhook/logs', { method: 'DELETE' });
      if (res.ok) {
        setLogs([]);
        setActiveLogId(null);
      }
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  // Run mock simulation requests
  const triggerSimulation = async (type: 'verify-success' | 'verify-fail' | 'whatsapp' | 'custom') => {
    setIsSimulating(true);
    setSimulationResult(null);

    let payload: any = { type: 'event' };

    if (type === 'verify-success') {
      payload = {
        type: 'verify',
        customQuery: {
          'hub.mode': 'subscribe',
          'hub.verify_token': config?.verifyToken || 'token_placeholder',
          'hub.challenge': `challenge_${Math.floor(Math.random() * 900000 + 100000)}`
        }
      };
    } else if (type === 'verify-fail') {
      payload = {
        type: 'verify',
        customQuery: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_and_invalid_token_999',
          'hub.challenge': 'unauthorized_attempt'
        }
      };
    } else if (type === 'whatsapp') {
      // Keep payload as WhatsApp format (handled by backend or generated here)
      payload = { type: 'whatsapp' };
    } else if (type === 'custom') {
      try {
        const parsed = JSON.parse(customBody);
        payload = {
          type: 'custom',
          customBody: parsed
        };
      } catch (err) {
        setSimulationResult({
          success: false,
          message: 'Invalid JSON payload structure. Please fix the syntax.'
        });
        setIsSimulating(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/webhook/mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Simulation failed on backend');

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Server returned an unexpected non-JSON response.');
      }

      const data = await res.json();

      setSimulationResult({
        success: data.success,
        message: data.message || 'Simulation completed.'
      });

      // Quick fetch logs to update list immediately
      fetchData(false);
    } catch (err: any) {
      setSimulationResult({
        success: false,
        message: err.message || 'Simulation error.'
      });
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafbfc] text-[#24292f] font-sans">
      {/* Top Navigation / Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-[#e1e4e6] px-6 py-4 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100">
              <Terminal size={24} className="stroke-[2]" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Webhook Verification Tool</h1>
              <p className="text-xs text-slate-500 font-medium">Meta Messenger, WhatsApp, &amp; Universal Developer Webhook Tester</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(true)}
              disabled={loading}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
              title="Refresh connection"
            >
              <RefreshCw size={14} className={`${loading ? 'animate-spin' : ''}`} />
              Sync Status
            </button>
            {isReconnecting ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Reconnecting...
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Server Active
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Error State Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800">
            <AlertCircle className="shrink-0 mt-0.5 text-red-500" size={18} />
            <div>
              <p className="font-semibold text-sm">Server Connection Issue</p>
              <p className="text-xs text-red-700 mt-1">{error}</p>
              <button 
                onClick={() => fetchData(true)} 
                className="mt-2 text-xs font-bold underline hover:text-red-900 cursor-pointer"
              >
                Retry connection
              </button>
            </div>
          </div>
        )}

        {/* Dual Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Config and Simulation */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* 1. Callback & Credentials Configuration */}
            <div className="bg-white rounded-2xl border border-[#e1e4e6] p-6 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
              
              <div className="flex items-center gap-2 mb-4">
                <Shield className="text-indigo-600" size={18} />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Webhook Connection Setup</h2>
              </div>

              <div className="space-y-5">
                {/* Callback URL Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>CALLBACK URL</span>
                    <span className="text-[10px] text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded">Enter in Meta Portal</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      readOnly
                      value={callbackUrl}
                      className="w-full pr-12 pl-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-600 focus:outline-none select-all"
                    />
                    <button
                      onClick={() => handleCopy(callbackUrl, 'url')}
                      className="absolute right-1 p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition-all cursor-pointer"
                      title="Copy URL"
                    >
                      {copiedUrl ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">This endpoint parses verification checks and accepts standard event notifications.</p>
                </div>

                {/* Verification Token Form */}
                <form onSubmit={handleUpdateToken}>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>VERIFY TOKEN</span>
                    <span className="text-[10px] text-purple-600 font-medium bg-purple-50 px-1.5 py-0.5 rounded">Shared Secret</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1 flex items-center">
                      <input
                        type="text"
                        value={inputToken}
                        onChange={(e) => setInputToken(e.target.value)}
                        placeholder="e.g. my_custom_secret_123"
                        className="w-full pr-10 pl-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(config?.verifyToken || '', 'token')}
                        className="absolute right-1 p-1.5 text-slate-400 hover:text-purple-600 hover:bg-slate-100 rounded-md transition-all cursor-pointer"
                        title="Copy current token"
                      >
                        {copiedToken ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={isUpdatingToken || inputToken === config?.verifyToken}
                      className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 transition-all border border-transparent shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      Update
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Set a secret phrase here and enter the identical phrase in the <span className="font-semibold text-slate-600">Verify token</span> field on Meta.
                  </p>
                </form>
              </div>
            </div>

            {/* 2. Setup Guide Card */}
            <div className="bg-white rounded-2xl border border-[#e1e4e6] p-6 shadow-xs">
              <div className="flex items-center gap-2 mb-3">
                <HelpCircle className="text-slate-500" size={18} />
                <h3 className="text-sm font-semibold text-slate-800">Quick Configuration Steps</h3>
              </div>
              <ol className="space-y-3.5 text-xs text-slate-600">
                <li className="flex gap-2.5 items-start">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 font-bold shrink-0 text-[11px] border border-indigo-100">1</span>
                  <span>Copy the <strong className="text-slate-900">Callback URL</strong> input above.</span>
                </li>
                <li className="flex gap-2.5 items-start">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 font-bold shrink-0 text-[11px] border border-indigo-100">2</span>
                  <span>Set a secure <strong className="text-slate-900">Verify Token</strong> and click Update.</span>
                </li>
                <li className="flex gap-2.5 items-start">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 font-bold shrink-0 text-[11px] border border-indigo-100">3</span>
                  <span>Paste both into the developer portal (as seen in your screen capture) and hit <strong className="text-slate-900">Verify and save</strong>.</span>
                </li>
                <li className="flex gap-2.5 items-start">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 font-bold shrink-0 text-[11px] border border-indigo-100">4</span>
                  <span>The portal will fire a GET challenge, verify instantly, and display events in the ledger on the right!</span>
                </li>
              </ol>
            </div>

            {/* 3. Local Webhook Simulator (Crucial for sandbox usability) */}
            <div className="bg-white rounded-2xl border border-[#e1e4e6] p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Play className="text-emerald-600 fill-emerald-600" size={16} />
                  <h3 className="font-semibold text-sm text-slate-900">Developer Local Simulator</h3>
                </div>
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    onClick={() => { setActiveTab('simulator'); setSimulationResult(null); }}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                      activeTab === 'simulator' 
                        ? 'bg-white text-slate-900 shadow-xs' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    PRESETS
                  </button>
                  <button
                    onClick={() => { setActiveTab('custom'); setSimulationResult(null); }}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                      activeTab === 'custom' 
                        ? 'bg-white text-slate-900 shadow-xs' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    CUSTOM JSON
                  </button>
                </div>
              </div>

              {/* Tab: Presets */}
              {activeTab === 'simulator' ? (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">
                    Instantly simulate Webhook requests directly within AI Studio. Test how your endpoint responds before connecting a external account.
                  </p>

                  <div className="grid grid-cols-1 gap-2.5">
                    <button
                      onClick={() => triggerSimulation('verify-success')}
                      disabled={isSimulating}
                      className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:border-indigo-200 hover:bg-indigo-50/20 text-left transition-all group cursor-pointer disabled:opacity-50"
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                          <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 font-semibold rounded text-[9px]">GET</span>
                          Success Verification
                        </div>
                        <p className="text-[10px] text-slate-400">Mocking Meta's subscribe request with correct Verify Token.</p>
                      </div>
                      <Send size={12} className="text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                    </button>

                    <button
                      onClick={() => triggerSimulation('verify-fail')}
                      disabled={isSimulating}
                      className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:border-red-200 hover:bg-red-50/20 text-left transition-all group cursor-pointer disabled:opacity-50"
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                          <span className="px-1.5 py-0.2 bg-red-50 text-red-600 font-semibold rounded text-[9px]">GET</span>
                          Mismatched Token (403)
                        </div>
                        <p className="text-[10px] text-slate-400">Mocking Meta's challenge verification with a wrong token.</p>
                      </div>
                      <Send size={12} className="text-slate-400 group-hover:text-red-500 group-hover:translate-x-0.5 transition-all" />
                    </button>

                    <button
                      onClick={() => triggerSimulation('whatsapp')}
                      disabled={isSimulating}
                      className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:border-emerald-200 hover:bg-emerald-50/20 text-left transition-all group cursor-pointer disabled:opacity-50"
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                          <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 font-semibold rounded text-[9px]">POST</span>
                          WhatsApp Text Event
                        </div>
                        <p className="text-[10px] text-slate-400">Incoming message hook containing sender, WA ID and text body.</p>
                      </div>
                      <Send size={12} className="text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Tab: Custom JSON */
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block uppercase">Custom Webhook JSON Payload</label>
                    <textarea
                      rows={6}
                      value={customBody}
                      onChange={(e) => setCustomBody(e.target.value)}
                      className="w-full p-2.5 bg-slate-900 text-slate-100 font-mono text-xs rounded-lg border border-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    onClick={() => triggerSimulation('custom')}
                    disabled={isSimulating}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <Send size={13} />
                    {isSimulating ? 'Sending Payload...' : 'Send Custom Payload (POST)'}
                  </button>
                </div>
              )}

              {/* Simulation Response Feedback Area */}
              {simulationResult && (
                <div className={`mt-4 p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                  simulationResult.success 
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                    : 'bg-red-50 border-red-100 text-red-800'
                }`}>
                  {simulationResult.success ? (
                    <ShieldCheck className="text-emerald-600 shrink-0 mt-0.5" size={16} />
                  ) : (
                    <ShieldAlert className="text-red-500 shrink-0 mt-0.5" size={16} />
                  )}
                  <div className="space-y-1">
                    <p className="font-semibold">{simulationResult.success ? 'Success Response' : 'Simulation Failed'}</p>
                    <p className="text-[11px] leading-relaxed opacity-90">{simulationResult.message}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Webhook Log Ledger */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl border border-[#e1e4e6] shadow-xs overflow-hidden">
              {/* Log Header */}
              <div className="px-6 py-4 border-b border-[#e1e4e6] flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <FileJson className="text-slate-600" size={18} />
                  <h3 className="font-bold text-slate-900 text-sm">Incoming Request Ledger</h3>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold rounded-full text-[10px] border border-slate-200">
                    {logs.length}
                  </span>
                </div>
                {logs.length > 0 && (
                  <button
                    onClick={handleClearLogs}
                    className="text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 size={13} />
                    Clear Logs
                  </button>
                )}
              </div>

              {/* Logs Content Area */}
              <div className="p-4 sm:p-6 min-h-[480px] max-h-[700px] overflow-y-auto space-y-3">
                {logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-24 px-4">
                    <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mb-4 shadow-2xs">
                      <Terminal size={28} className="opacity-75 stroke-[1.5]" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-800">No Webhook Requests Detected Yet</h4>
                    <p className="text-xs text-slate-400 max-w-sm mt-1 mb-6 leading-relaxed">
                      Awaiting connection setup. Your app is configured to receive and render both validation challenges and payload notifications in real-time.
                    </p>
                    <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl text-left max-w-md">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 mb-1">
                        <Info size={14} className="text-indigo-600" />
                        Quick Test Tip:
                      </div>
                      <p className="text-[11px] text-slate-600 leading-normal">
                        Use the <strong className="text-indigo-900">Developer Local Simulator</strong> panel on the left to fire mock verification and event requests immediately!
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <AnimatePresence initial={false}>
                      {logs.map((log) => {
                        const isExpanded = activeLogId === log.id;
                        const logDate = new Date(log.timestamp);
                        const formattedTime = logDate.toLocaleTimeString(undefined, { 
                          hour12: false, 
                          hour: '2-digit', 
                          minute: '2-digit', 
                          second: '2-digit' 
                        }) + '.' + String(logDate.getMilliseconds()).padStart(3, '0');

                        return (
                          <motion.div
                            key={log.id}
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className={`border rounded-xl overflow-hidden transition-all duration-150 ${
                              isExpanded 
                                ? 'border-slate-300 shadow-sm bg-slate-50/20' 
                                : 'border-slate-200 hover:border-slate-300 bg-white hover:shadow-2xs'
                            }`}
                          >
                            {/* Log Header Accordion Trigger */}
                            <div
                              onClick={() => setActiveLogId(isExpanded ? null : log.id)}
                              className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer select-none"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {/* Method badge */}
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-center w-12 shrink-0 ${
                                  log.method === 'GET' 
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' 
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                }`}>
                                  {log.method}
                                </span>

                                {/* Timestamp */}
                                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1 shrink-0">
                                  <Clock size={11} />
                                  {formattedTime}
                                </span>

                                {/* Status badge */}
                                {log.status === 'verified' && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold flex items-center gap-1 shrink-0">
                                    <ShieldCheck size={11} />
                                    Verified
                                  </span>
                                )}
                                {log.status === 'failed' && (
                                  <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-[10px] font-semibold flex items-center gap-1 shrink-0">
                                    <ShieldAlert size={11} />
                                    Failed
                                  </span>
                                )}
                                {log.status === 'received' && (
                                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold flex items-center gap-1 shrink-0">
                                    <Info size={11} />
                                    Received
                                  </span>
                                )}

                                {/* Summary Message snippet */}
                                <span className="text-xs text-slate-600 truncate hidden md:inline font-medium ml-1">
                                  {log.message || (log.method === 'POST' ? 'Payload processed' : 'API Request')}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/60 font-semibold uppercase">
                                  ID: {log.id}
                                </span>
                                {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                              </div>
                            </div>

                            {/* Collapsible Details */}
                            {isExpanded && (
                              <div className="px-4 pb-4 border-t border-slate-100 bg-white space-y-4 pt-3.5 animate-fadeIn">
                                {/* Mobile view message snippet */}
                                <div className="md:hidden text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                  <strong className="text-[10px] uppercase text-slate-500 block mb-1">EVENT SUMMARY</strong>
                                  {log.message || (log.method === 'POST' ? 'Payload processed' : 'API Request')}
                                </div>

                                {/* Request Details: Query String */}
                                {Object.keys(log.query).length > 0 && (
                                  <div className="space-y-1.5">
                                    <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Query Parameters</h5>
                                    <div className="border border-slate-100 rounded-lg overflow-hidden">
                                      <table className="w-full text-xs text-left">
                                        <thead className="bg-slate-50 text-slate-500 font-semibold text-[10px]">
                                          <tr>
                                            <th className="px-3 py-1.5">Key</th>
                                            <th className="px-3 py-1.5">Value</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                                          {Object.entries(log.query).map(([key, value]) => (
                                            <tr key={key} className="hover:bg-slate-50/50">
                                              <td className="px-3 py-1.5 font-semibold text-slate-700">{key}</td>
                                              <td className="px-3 py-1.5 text-indigo-600 break-all">{value}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {/* Request Details: Selected Headers */}
                                <div className="space-y-1.5">
                                  <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Request Headers</h5>
                                  <div className="border border-slate-100 rounded-lg overflow-hidden">
                                    <table className="w-full text-xs text-left">
                                      <thead className="bg-slate-50 text-slate-500 font-semibold text-[10px]">
                                        <tr>
                                          <th className="px-3 py-1.5">Header</th>
                                          <th className="px-3 py-1.5">Value</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-600">
                                        {Object.entries(log.headers)
                                          .filter(([k]) => ['user-agent', 'content-type', 'x-hub-signature-256', 'host'].includes(k.toLowerCase()))
                                          .map(([key, value]) => (
                                            <tr key={key} className="hover:bg-slate-50/50">
                                              <td className="px-3 py-1.5 font-semibold text-slate-500">{key}</td>
                                              <td className="px-3 py-1.5 text-slate-700 break-all">{value}</td>
                                            </tr>
                                          ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                {/* Request Details: Body Payload JSON */}
                                {log.body ? (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payload Body (JSON)</h5>
                                      <button
                                        onClick={() => handleCopy(JSON.stringify(log.body, null, 2), 'log', log.id)}
                                        className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 cursor-pointer"
                                      >
                                        {copiedLogId === log.id ? (
                                          <>
                                            <Check size={11} className="text-emerald-600" />
                                            Copied Payload
                                          </>
                                        ) : (
                                          <>
                                            <Copy size={11} />
                                            Copy JSON
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-[11px] overflow-x-auto font-mono leading-relaxed max-h-[350px]">
                                      {JSON.stringify(log.body, null, 2)}
                                    </pre>
                                  </div>
                                ) : (
                                  <div className="p-3 bg-slate-50 border border-slate-100 text-slate-500 text-xs rounded-lg font-mono flex items-center gap-2">
                                    <Info size={14} className="text-slate-400 shrink-0" />
                                    No JSON payload body was sent with this GET/Verification request.
                                  </div>
                                )}
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
