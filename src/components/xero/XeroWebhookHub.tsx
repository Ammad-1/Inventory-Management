import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import {
  ShieldCheck, Zap, Copy, Check, AlertCircle, CheckCircle2, RefreshCw, Trash2, Sparkles,
  ExternalLink, Globe, Terminal, Key, Play
} from 'lucide-react';

/**
 * Xero webhook verification and local testing.
 *
 * Lives with the rest of the Xero screens: it exercises Xero's Intent To
 * Receive handshake and HMAC signature checking, and has nothing to do with
 * the online stores it used to sit under.
 */
export const XeroWebhookHub: React.FC = () => {
  const { webhookLogs, xeroWebhookConfig, testXeroWebhook, clearWebhookLogs } = useInventory();

  const [webhookTestType, setWebhookTestType] = useState<string>('itr_handshake');
  const [customWebhookKey, setCustomWebhookKey] = useState<string>('');
  const [simulateTamper, setSimulateTamper] = useState<boolean>(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<any>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const handleFireWebhookTest = async () => {
    setIsTestingWebhook(true);
    setWebhookTestResult(null);
    const res = await testXeroWebhook({
      testType: webhookTestType,
      customKey: customWebhookKey.trim() || undefined,
      simulateTamper
    });
    setWebhookTestResult(res);
    setIsTestingWebhook(false);
  };

  return (
    <div className="space-y-6">
        <div className="space-y-6">
          
          <p className="text-xs text-slate-500">
        Xero signs each delivery with HMAC-SHA256 in the <code className="font-mono">x-xero-signature</code> header
        and expects 200 for a valid signature and 401 for an invalid one, within 5 seconds. Xero's own dispatchers
        require a public HTTPS URL, so run a tunnel to test against them; the simulator below exercises the same
        verification locally.
      </p>

      {/* Interactive Webhook Simulator & Diagnostics */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Console */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Terminal className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Xero Webhook Test Console</h3>
                      <p className="text-[10px] text-slate-500">Simulate ITR handshakes & invoice events</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Local Simulator
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Test Type */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Select Webhook Event Scenario</label>
                    <select
                      value={webhookTestType}
                      onChange={(e) => setWebhookTestType(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-medium"
                    >
                      <option value="itr_handshake">🤝 ITR Handshake Validation (Empty events, expects 200 OK)</option>
                      <option value="invoice_create">📄 INVOICE.CREATE Event (New invoice generated in Xero)</option>
                      <option value="invoice_update">🔄 INVOICE.UPDATE Event (Status changed to AUTHORISED)</option>
                    </select>
                  </div>

                  {/* Webhook Secret Key */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Webhook Signing Key</span>
                      <span className="text-[10px] text-slate-400 font-normal">Auto-detected</span>
                    </label>
                    <div className="relative">
                      <Key className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={customWebhookKey}
                        onChange={(e) => setCustomWebhookKey(e.target.value)}
                        placeholder="PRINTBERRY_XERO_WEBHOOK_KEY_DEMO_2026"
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                      />
                    </div>
                  </div>

                  {/* Negative Test Checkbox */}
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simulateTamper}
                      onChange={(e) => setSimulateTamper(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-[11px] font-bold text-slate-800">Simulate Tampered / Bad Signature</div>
                      <div className="text-[10px] text-slate-500">Tests that server safely rejects with HTTP 401 Unauthorized</div>
                    </div>
                  </label>

                  {/* Fire Button */}
                  <button
                    type="button"
                    onClick={handleFireWebhookTest}
                    disabled={isTestingWebhook}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isTestingWebhook ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying HMAC Signature...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Fire Webhook Event to /api/xero/webhook</span>
                      </>
                    )}
                  </button>

                  {/* Diagnostics Output */}
                  {webhookTestResult && (
                    <div className={`p-3.5 rounded-xl border space-y-2 text-xs animate-in fade-in ${
                      webhookTestResult.httpStatus === 200 
                        ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' 
                        : 'bg-rose-50/80 border-rose-200 text-rose-900'
                    }`}>
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5">
                          {webhookTestResult.httpStatus === 200 ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-600" />
                          )}
                          Status: HTTP {webhookTestResult.httpStatus} {webhookTestResult.httpStatus === 200 ? 'OK' : 'Unauthorized'}
                        </span>
                        <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                          {webhookTestResult.latencyMs}ms
                        </span>
                      </div>

                      <p className="text-[11px] leading-relaxed">{webhookTestResult.message}</p>

                      <div className="pt-2 border-t border-slate-200/60 font-mono text-[10px] space-y-1 text-slate-600">
                        <div>
                          <span className="text-slate-400">Header Signature: </span>
                          <span className="truncate block font-bold text-slate-800">{webhookTestResult.receivedSignature}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Calculated HMAC: </span>
                          <span className="truncate block font-bold text-slate-800">{webhookTestResult.calculatedSignature}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Live Webhook Audit Log */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>Webhook Execution & Signature Audit Log</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                        {webhookLogs.length} events
                      </span>
                    </h3>
                    <p className="text-[10px] text-slate-500">Every inbound request is recorded with cryptographic signature verification metrics</p>
                  </div>

                  <button
                    onClick={() => clearWebhookLogs()}
                    className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 p-1 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Logs</span>
                  </button>
                </div>

                {/* Webhook Log List */}
                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {webhookLogs.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs">
                      No webhook requests logged yet. Use the console on the left to fire a test!
                    </div>
                  ) : (
                    webhookLogs.map(log => (
                      <div 
                        key={log.id} 
                        className={`p-3 rounded-xl border text-xs transition-all ${
                          log.httpStatus === 200 
                            ? 'bg-slate-50/70 border-slate-200 hover:border-emerald-300' 
                            : 'bg-rose-50/40 border-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                              log.httpStatus === 200 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              HTTP {log.httpStatus}
                            </span>
                            <span className="font-bold text-slate-800">{log.eventType}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({log.source === 'live_xero' ? 'Live Xero' : 'Simulator'})
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">{log.timestamp.slice(11, 19)}</span>
                        </div>

                        <p className="text-[11px] text-slate-600 mb-1.5">{log.notes}</p>

                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1.5 border-t border-slate-200/50">
                          <span className="truncate max-w-[260px]">HMAC: {log.signatureCalculated.slice(0, 24)}...</span>
                          <span className="text-slate-500 font-semibold">{log.processingTimeMs}ms latency</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

              </div>
            </div>

          </div>

        </div>
    </div>
  );
};
