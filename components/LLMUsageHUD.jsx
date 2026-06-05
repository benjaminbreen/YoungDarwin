'use client';

import React, { useEffect, useState } from 'react';

const shouldShowHUD = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SHOW_LLM_HUD === 'true';

function formatRoute(route) {
  return String(route || 'llm').replace('/api/', '');
}

export default function LLMUsageHUD({ sessionId }) {
  const [snapshot, setSnapshot] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!shouldShowHUD || !sessionId) return undefined;

    let cancelled = false;
    const loadUsage = async () => {
      try {
        const response = await fetch(`/api/llm-usage?sessionId=${encodeURIComponent(sessionId)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setSnapshot(data);
      } catch (error) {
        if (!cancelled) {
          setSnapshot(previous => previous || { error: error.message });
        }
      }
    };

    loadUsage();
    const interval = setInterval(loadUsage, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  if (!shouldShowHUD || !sessionId) {
    return null;
  }

  const recent = snapshot?.recent || [];
  const limits = snapshot?.limits || {};
  const estimatedTokens = snapshot?.sessionEstimatedTokens ?? snapshot?.estimatedTotalTokens ?? 0;
  const tokenLimit = limits.maxEstimatedTokensPerSession;
  const tokenPercent = tokenLimit ? Math.min(100, Math.round((estimatedTokens / tokenLimit) * 100)) : 0;

  return (
    <div className="border-t border-amber-200 bg-stone-100 px-4 py-2 text-xs text-stone-800">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        className="flex w-full items-center justify-between gap-3 text-left font-semibold"
        aria-expanded={expanded}
      >
        <span>LLM usage guard</span>
        <span className="font-mono text-[11px] text-stone-600">
          {snapshot ? `${snapshot.totalCalls || 0} calls / ${snapshot.blockedCalls || 0} blocked` : 'loading'}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 grid gap-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase text-stone-500">Per minute</div>
              <div className="font-mono">{limits.maxCallsPerMinute ?? '-'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-stone-500">Per session</div>
              <div className="font-mono">{limits.maxCallsPerSession ?? '-'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-stone-500">Background/min</div>
              <div className="font-mono">{limits.maxBackgroundCallsPerMinute ?? '-'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-stone-500">Pending cap</div>
              <div className="font-mono">{limits.maxPendingPerSession ?? '-'}</div>
            </div>
          </div>

          <div className="rounded border border-stone-200 bg-white p-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase text-stone-500">Estimated session tokens</div>
              <div className="font-mono">
                {estimatedTokens}{tokenLimit ? ` / ${tokenLimit}` : ''}
              </div>
            </div>
            {tokenLimit && (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div
                  className={tokenPercent >= 85 ? 'h-full bg-red-600' : tokenPercent >= 65 ? 'h-full bg-amber-600' : 'h-full bg-green-700'}
                  style={{ width: `${tokenPercent}%` }}
                />
              </div>
            )}
          </div>

          <div className="max-h-28 overflow-auto rounded border border-stone-200 bg-white">
            {recent.length === 0 ? (
              <div className="px-2 py-1 text-stone-500">No LLM requests recorded for this session.</div>
            ) : (
              recent.slice(0, 8).map(entry => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-stone-100 px-2 py-1 last:border-b-0"
                >
                  <span className="truncate">{formatRoute(entry.route)}</span>
                  <span className={entry.status === 'blocked' ? 'text-red-700' : 'text-stone-600'}>
                    {entry.status}
                  </span>
                  <span className="font-mono text-stone-500">
                    {entry.background ? 'bg' : 'play'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
