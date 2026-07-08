import { MoreVertical, MessageSquare, Pin } from 'lucide-react';
import React, { useState } from 'react';

interface AdvisorCardProps {
  role: string;
  title: string;
  description: string;
  evidence?: number;
  confidence?: number | string;
  assumptions?: number;
  colorClass: string;
  icon: React.ReactNode;
  style?: React.CSSProperties;
  onPointerDown?: (e: React.PointerEvent) => void;
  className?: string;
  status?: 'idle' | 'pending' | 'running' | 'streaming' | 'complete';
  statusText?: string;
  onCardClick?: () => void;
  onCitationClick?: (ref: string, type: string) => void;
  claims?: { text: string; evidence: { type: string; ref?: string } }[];
}

function parseInlineStyles(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-extrabold text-gray-900">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function parseMarkdownToReact(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 mb-4">
      {lines.map((line, idx) => {
        const cleanLine = line.trim();
        
        if (cleanLine.startsWith('### ')) {
          return <h4 key={idx} className="font-bold text-gray-900 text-xs mt-3 mb-1">{parseInlineStyles(cleanLine.substring(4))}</h4>;
        }
        if (cleanLine.startsWith('## ')) {
          return <h3 key={idx} className="font-bold text-gray-900 text-sm mt-3 mb-1">{parseInlineStyles(cleanLine.substring(3))}</h3>;
        }
        if (cleanLine.startsWith('# ')) {
          return <h2 key={idx} className="font-bold text-gray-900 text-base mt-4 mb-2">{parseInlineStyles(cleanLine.substring(2))}</h2>;
        }
        if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ')) {
          return (
            <ul key={idx} className="list-disc pl-4 text-[11px] text-gray-600 leading-relaxed">
              <li>{parseInlineStyles(cleanLine.substring(2))}</li>
            </ul>
          );
        }
        const numMatch = cleanLine.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <ol key={idx} className="list-decimal pl-4 text-[11px] text-gray-600 leading-relaxed">
              <li>{parseInlineStyles(numMatch[2])}</li>
            </ol>
          );
        }
        if (cleanLine === '') {
          return <div key={idx} className="h-1.5" />;
        }
        return (
          <p key={idx} className="text-[11px] text-gray-600 leading-relaxed">
            {parseInlineStyles(line)}
          </p>
        );
      })}
    </div>
  );
}

export function AdvisorCard({
  role,
  title,
  description,
  evidence = 0,
  confidence = 0,
  assumptions = 0,
  colorClass,
  icon,
  style,
  onPointerDown,
  className = '',
  status = 'idle',
  statusText = 'Waiting...',
  onCardClick,
  onCitationClick,
  claims = [],
}: AdvisorCardProps) {
  const [isPinned, setIsPinned] = useState(false);

  const colorMap: Record<string, { bg: string; text: string; lightBg: string; ring: string }> = {
    green: { bg: 'bg-emerald-500', text: 'text-emerald-500', lightBg: 'bg-emerald-50', ring: 'ring-emerald-100' },
    blue: { bg: 'bg-blue-500', text: 'text-blue-500', lightBg: 'bg-blue-50', ring: 'ring-blue-100' },
    purple: { bg: 'bg-violet-500', text: 'text-violet-500', lightBg: 'bg-violet-50', ring: 'ring-violet-100' },
    orange: { bg: 'bg-amber-500', text: 'text-amber-500', lightBg: 'bg-amber-50', ring: 'ring-amber-100' },
    red: { bg: 'bg-red-500', text: 'text-red-500', lightBg: 'bg-red-50', ring: 'ring-red-100' },
  };

  const theme = colorMap[colorClass] || colorMap.green;

  return (
    <div
      className={`absolute bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex overflow-hidden w-[280px] min-h-[250px] max-h-[360px] flex-col ${className}`}
      style={style}
      onPointerDown={onPointerDown}
      onClick={onCardClick}
    >
      {/* Left colored border strip */}
      <div className={`h-1.5 w-full shrink-0 ${theme.bg}`} />

      <div className="flex-1 p-4 flex flex-col overflow-y-auto no-scrollbar justify-between">
        <div>
          <div className="flex items-start justify-between mb-2">
            <div className="flex gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${theme.lightBg} ${theme.text} ring-4 ${theme.ring}`}>
                {icon}
              </div>
              <div>
                <div className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${theme.text}`}>
                  {role}
                </div>
                <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                  {status === 'pending' || status === 'running' ? 'Processing' : title || 'Not Started'}
                </h3>
              </div>
            </div>
            <button className="text-gray-400 hover:text-gray-600 -mr-1">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>

          {/* Loading or Normal State */}
          {status === 'pending' || status === 'running' ? (
            <div className="py-6 flex flex-col items-center justify-center gap-3">
              <div className={`w-6 h-6 border-2 ${theme.text} border-t-transparent rounded-full animate-spin`} />
              <p className="text-xs text-gray-400 text-center px-4 animate-pulse">
                {statusText}
              </p>
            </div>
          ) : (
            <>
              {description ? (
                parseMarkdownToReact(description)
              ) : (
                <p className="text-xs text-gray-600 leading-relaxed mb-4">
                  No analysis compiled yet. Run a debate query to begin.
                </p>
              )}

              {/* Claims / Citation Chips */}
              {claims.length > 0 && (
                <div className="mb-3">
                  <div className="flex flex-wrap gap-1">
                    {claims.map((claim, idx) => (
                      <button
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (claim.evidence.ref) {
                            onCitationClick?.(claim.evidence.ref, claim.evidence.type);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200 text-[10px] text-gray-500 hover:bg-gray-100 hover:text-gray-800 hover:border-gray-300 transition-all font-medium"
                        title={claim.text}
                      >
                        {claim.evidence.type === 'chunk' ? '📄' : claim.evidence.type === 'web' ? '🌐' : '💾'} {claim.evidence.ref?.split('/').pop() || 'source'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Card Footer (only if not loading) */}
        {status !== 'pending' && status !== 'running' && description.length > 0 && (
          <div className="mt-auto">
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-[10px] border-t border-gray-100 pt-3 mb-2">
              <div>
                <div className="text-gray-400 font-medium">Confidence</div>
                <div className={`font-bold text-xs ${theme.text}`}>{confidence}</div>
              </div>
              <div>
                <div className="text-gray-400 font-medium">Assumptions</div>
                <div className="text-gray-900 font-semibold">{assumptions} tracked</div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
