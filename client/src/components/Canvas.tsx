import React, { useState, useEffect } from 'react';
import { 
  Play, Undo, Redo, SlidersHorizontal, 
  Megaphone, TrendingUp, Code, Box, ShieldAlert,
  Paperclip, AtSign, FilePlus, Sparkles, ArrowRight,
  ZoomIn, Target, ZoomOut, Maximize, Share2, ChevronDown,
  X, MessageSquare, Save, Info, AlertTriangle, Cpu
} from 'lucide-react';
import { AdvisorCard } from './AdvisorCard';

type CardState = {
  advisor_id: string;
  verdict: string;
  body_md: string;
  claims: any[];
  assumptions: string[];
  confidence: string;
  status: 'idle' | 'pending' | 'running' | 'streaming' | 'complete';
  statusText: string;
};

type TraceNode = {
  step_name: string;
  input: any;
  output: any;
  model: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  latency_ms: number;
  tool_calls?: string[];
};

type TraceData = {
  advisor_id: string;
  steps: TraceNode[];
};

type Connection = {
  id: string;
  cardIds: string[];
};

type CrossChatTurn = {
  advisor_id: string;
  turn: number;
  text: string;
};

export function Canvas({ canvasId, initialQuestion, userId }: { canvasId: string, initialQuestion: string, userId: string }) {
  // Canvas navigation states
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [nodes, setNodes] = useState({
    cmo: { x: -480, y: -260 },
    cfo: { x: 120, y: -260 },
    cto: { x: -440, y: 160 },
    coo: { x: 160, y: 160 },
    contrarian: { x: 720, y: -50 }
  });

  // Debate states
  const [question, setQuestion] = useState(initialQuestion);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [costMeter, setCostMeter] = useState(0);
  const [debateId, setDebateId] = useState<string | null>(null);

  const emptyCard = (id: string): CardState => ({
    advisor_id: id, verdict: '', body_md: '', claims: [], assumptions: [], confidence: 'Grounded', status: 'idle', statusText: 'Idle'
  });

  const defaultCards = (): Record<string, CardState> => ({
    cmo: emptyCard('cmo'),
    cfo: emptyCard('cfo'),
    cto: emptyCard('cto'),
    coo: emptyCard('coo'),
    contrarian: emptyCard('contrarian'),
  });

  // Cards state
  const [cards, setCards] = useState<Record<string, CardState>>(defaultCards());

  // Selected cards for cross-chat
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [isCrossChatOpen, setIsCrossChatOpen] = useState(false);
  const [crossChatPrompt, setCrossChatPrompt] = useState('Reconcile the customer acquisition vs cannibalization dispute. Does CFO math back CMO projections?');
  const [crossChatTranscript, setCrossChatTranscript] = useState<CrossChatTurn[]>([]);
  const [isCrossChatLoading, setIsCrossChatLoading] = useState(false);

  // Merged card state
  const [mergedCard, setMergedCard] = useState<CardState | null>(null);
  const [mergedCardPos, setMergedCardPos] = useState({ x: -180, y: -60 });

  // Detail Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerContent, setDrawerContent] = useState<React.ReactNode>(null);

  // Traces state
  const [traces, setTraces] = useState<TraceData[]>([
    { advisor_id: 'cmo', steps: [] },
    { advisor_id: 'cfo', steps: [] },
    { advisor_id: 'cto', steps: [] },
    { advisor_id: 'coo', steps: [] },
    { advisor_id: 'contrarian', steps: [] }
  ]);

  // Decision Record synthesis state
  const [showDrModal, setShowDrModal] = useState(false);
  const [drChosenOption, setDrChosenOption] = useState('');
  const [drRationale, setDrRationale] = useState('');

  // Load canvas state: either previous debate or mockups (only for can_1), or empty/zero cards
  useEffect(() => {
    const loadCanvasData = async () => {
      setMergedCard(null);
      setSelectedCards([]);
      setIsCrossChatOpen(false);
      setCrossChatTranscript([]);
      setIsAnalyzing(false);

      try {
        const response = await fetch(`/api/debates/deb_${canvasId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.cards && data.cards.length > 0) {
            const loadedCards: Record<string, CardState> = { ...defaultCards() };
            for (const c of data.cards) {
              loadedCards[c.advisor_id] = {
                advisor_id: c.advisor_id,
                verdict: c.verdict || '',
                body_md: c.body_md || '',
                claims: c.claims || [],
                assumptions: c.assumptions || [],
                confidence: c.confidence || 'Grounded',
                status: 'complete',
                statusText: c.advisor_id === 'contrarian' ? 'Critique compiled' : 'Analysis compiled'
              };
            }
            setCards(loadedCards);
            setDebateId(data.id);
            setCostMeter(data.cost_usd || 0);

            // Restore traces
            const loadedTraces = data.cards.map((c: any) => ({
              advisor_id: c.advisor_id,
              steps: c.trace || []
            }));
            setTraces(loadedTraces);

            // Restore merged card
            if (data.merged_card) {
              setMergedCard({
                advisor_id: 'merged',
                verdict: data.merged_card.verdict,
                body_md: data.merged_card.body_md,
                claims: data.merged_card.claims || [],
                assumptions: data.merged_card.assumptions || [],
                confidence: data.merged_card.confidence || 'Grounded',
              });
            }

            // Restore cross chat transcript
            if (data.cross_chat_transcript && data.cross_chat_transcript.length > 0) {
              setCrossChatTranscript(data.cross_chat_transcript);
              setIsCrossChatOpen(true);
            }
            return;
          }
        }
      } catch (err) {
        console.error('Failed to load canvas debate:', err);
      }

      // Fallback if not run yet
      setDebateId(null);
      setCostMeter(0);

      if (canvasId === 'can_1') {
        setCards({
          cmo: {
            advisor_id: 'cmo',
            verdict: 'Launch Carefully',
            body_md: 'Marketing sees strong top-of-funnel potential but recommends a limited beta to protect brand value.',
            claims: [
              { text: 'Targeting developers can result in 4x growth in signups.', evidence: { type: 'chunk', ref: 'marketing-strategy.md#chunk_2' } }
            ],
            assumptions: ['Organic CAC remains low.', 'Top-of-funnel interest scales.'],
            confidence: 'Grounded',
            status: 'complete',
            statusText: 'Analysis compiled'
          },
          cfo: {
            advisor_id: 'cfo',
            verdict: 'Positive Unit Economics',
            body_md: 'Financial model shows positive contribution margin at scale, but payback period is longer.',
            claims: [
              { text: 'Current revenue is $235K/mo.', evidence: { type: 'chunk', ref: 'pl-spreadsheet.csv#chunk_0' } }
            ],
            assumptions: ['Revenue CAC scales linearly.', 'Server hosting costs stay within projection.'],
            confidence: 'Grounded',
            status: 'complete',
            statusText: 'Analysis compiled'
          },
          cto: {
            advisor_id: 'cto',
            verdict: 'Technically Feasible',
            body_md: 'Platform can support freemium with minor infrastructure upgrades and feature gating.',
            claims: [
              { text: 'Refactoring gating middleware takes 3-4 weeks.', evidence: { type: 'chunk', ref: 'product-roadmap.md#chunk_1' } }
            ],
            assumptions: ['Redis caching offloads database read hits.', 'SQLite write replica prevents locking.'],
            confidence: 'Grounded',
            status: 'complete',
            statusText: 'Analysis compiled'
          },
          coo: {
            advisor_id: 'coo',
            verdict: 'Operationally Manageable',
            body_md: 'Support and onboarding impact is manageable with automation and process adjustments.',
            claims: [
              { text: 'Support team ticket capacity requires self-service password recovery.', evidence: { type: 'chunk', ref: 'team-ops.md#chunk_2' } }
            ],
            assumptions: ['Support ticketing redirects non-Pro users to Discord community.', 'Hires 1 support contractor.'],
            confidence: 'Grounded',
            status: 'complete',
            statusText: 'Analysis compiled'
          },
          contrarian: {
            advisor_id: 'contrarian',
            verdict: 'High Risk of Cannibalization',
            body_md: 'Freemium may cannibalize existing paid plans and attract low-quality users who never convert.',
            claims: [
              { text: 'Self-cannibalization averages 15-22% of baseline plans.', evidence: { type: 'web', ref: 'competitor.com/blog/freemium-launch' } }
            ],
            assumptions: ['Competitors match the free offer quickly.', 'Conversion to Pro drops.'],
            confidence: 'Grounded',
            status: 'complete',
            statusText: 'Critique compiled'
          }
        });
      } else {
        // Clear all info for new canvases
        setCards(defaultCards());
      }
    };

    loadCanvasData();
  }, [canvasId, initialQuestion]);

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startCameraX = camera.x;
    const startCameraY = camera.y;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setCamera({
        x: startCameraX + (moveEvent.clientX - startX) / zoom,
        y: startCameraY + (moveEvent.clientY - startY) / zoom
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleNodePointerDown = (e: React.PointerEvent, id: keyof typeof nodes | 'merged') => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startNodeX = id === 'merged' ? mergedCardPos.x : nodes[id];
    const startNodeY = id === 'merged' ? mergedCardPos.y : nodes[id];

    if (!startNodeX || !startNodeY) return;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const newX = startNodeX.x + (moveEvent.clientX - startX) / zoom;
      const newY = startNodeY.y + (moveEvent.clientY - startY) / zoom;
      
      if (id === 'merged') {
        setMergedCardPos({ x: newX, y: newY });
      } else {
        setNodes(prev => ({
          ...prev,
          [id]: { x: newX, y: newY }
        }));
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const drawPathFromCenter = (endX: number, endY: number) => {
    const midX = endX / 2;
    const midY = endY / 2 - 30;
    return `M 0,0 Q ${midX},${midY} ${endX},${endY}`;
  };

  const drawDottedPath = (startX: number, startY: number, endX: number, endY: number) => {
    const dx = endX - startX;
    const dy = endY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const midX = startX + dx / 2;
    const midY = startY + dy / 2 - Math.max(dist * 0.25, 40);
    return `M ${startX},${startY} Q ${midX},${midY} ${endX},${endY}`;
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));
  const handleZoomReset = () => {
    setZoom(1);
    setCamera({ x: 0, y: 0 });
  };

  // Triggers debate via Express Backend and SSE
  const handleAnalyze = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setMergedCard(null);
    setSelectedCards([]);
    setIsCrossChatOpen(false);

    // Set all cards to pending initial brief state
    setCards(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        next[k] = {
          ...next[k],
          status: 'pending',
          statusText: 'Spawning agent node...',
          verdict: '',
          body_md: '',
          claims: [],
          assumptions: [],
        };
      });
      return next;
    });

    try {
      const response = await fetch('/api/debates', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({ question, canvasId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to initialize debate');

      const id = data.debate_id;
      setDebateId(id);

      // Vercel async mode: poll for results instead of SSE
      if (data.mode === 'async') {
        setStatusMessage('Debate is processing on the server...');
        const pollInterval = setInterval(async () => {
          try {
            const pollRes = await fetch(`/api/debates/${id}`);
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              
              // 1. Update status message dynamically
              const statusStr = pollData.status || '';
              if (statusStr.startsWith('running: ')) {
                setStatusMessage(statusStr.substring(9));
              } else {
                setStatusMessage(statusStr);
              }

              // 2. Load any cards completed so far
              if (pollData.cards && pollData.cards.length > 0) {
                setCards(prev => {
                  const next = { ...prev };
                  for (const c of pollData.cards) {
                    next[c.advisor_id] = {
                      advisor_id: c.advisor_id,
                      verdict: c.verdict || '',
                      body_md: c.body_md || '',
                      claims: c.claims || [],
                      assumptions: c.assumptions || [],
                      confidence: c.confidence || 'Grounded',
                      status: 'complete',
                      statusText: c.advisor_id === 'contrarian' ? 'Critique compiled' : 'Analysis compiled'
                    };
                  }
                  return next;
                });
                
                if (pollData.cost_usd) {
                  setCostMeter(pollData.cost_usd);
                }

                const loadedTraces = pollData.cards.map((c: any) => ({
                  advisor_id: c.advisor_id,
                  steps: c.trace || []
                }));
                setTraces(loadedTraces);
              }

              // 3. Update status of cards currently running
              if (statusStr.includes('phase1_')) {
                setCards(prev => {
                  const next = { ...prev };
                  ['cmo', 'cfo', 'cto', 'coo'].forEach(k => {
                    if (next[k].status !== 'complete') {
                      next[k].status = 'running';
                      next[k].statusText = 'Investigating KB...';
                    }
                  });
                  return next;
                });
              } else if (statusStr.includes('phase2_')) {
                setCards(prev => {
                  const next = { ...prev };
                  ['cmo', 'cfo', 'cto', 'coo'].forEach(k => {
                    if (next[k].status !== 'complete') {
                      next[k].status = 'running';
                      next[k].statusText = 'Coordinated synthesis...';
                    }
                  });
                  return next;
                });
              } else if (statusStr.includes('contrarian_') || statusStr.includes('contrarian')) {
                setCards(prev => {
                  const next = { ...prev };
                  if (next.contrarian.status !== 'complete') {
                    next.contrarian.status = 'running';
                    next.contrarian.statusText = 'Analyzing consensus...';
                  }
                  return next;
                });
              }

              // 4. Check for final completion
              if (statusStr === 'complete') {
                clearInterval(pollInterval);
                setIsAnalyzing(false);
                setStatusMessage('Debate complete!');
              } else if (statusStr === 'failed') {
                clearInterval(pollInterval);
                setIsAnalyzing(false);
                setStatusMessage('Debate failed on the server.');
              }
            }
          } catch (pollErr) {
            console.error('Polling error:', pollErr);
          }
        }, 2500);
        return;
      }

      // Local mode: Listen to SSE Stream
      const eventSource = new EventSource(`/api/debates/${id}/stream?userId=${userId}`);
      
      eventSource.onmessage = (event) => {
        if (event.data === '[DONE]') {
          eventSource.close();
          setIsAnalyzing(false);
          setStatusMessage('Debate complete!');
          return;
        }

        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch (parseErr) {
          console.warn('SSE received non-JSON data:', event.data);
          return; // Skip non-JSON messages safely
        }
        const { step, message, brief, card, cards: allCards, traces: allTraces, total_cost } = data;

        if (total_cost) {
          setCostMeter(parseFloat((total_cost).toFixed(2)));
        }

        if (message) {
          setStatusMessage(message);
        }

        // Handle states
        if (step === 'phase1_start') {
          setCards(prev => {
            const next = { ...prev };
            ['cmo', 'cfo', 'cto', 'coo'].forEach(k => {
              next[k].status = 'running';
              next[k].statusText = 'Investigating KB...';
            });
            return next;
          });
        } else if (step.startsWith('phase1_') && step.endsWith('_running')) {
          const adv = step.split('_')[1];
          setCards(prev => ({
            ...prev,
            [adv]: { ...prev[adv], status: 'running', statusText: message }
          }));
        } else if (step.startsWith('phase1_') && step.endsWith('_done')) {
          const adv = step.split('_')[1];
          setCards(prev => ({
            ...prev,
            [adv]: { ...prev[adv], status: 'running', statusText: `Sharing initial stance: "${brief?.verdict || '...'}"` }
          }));
        } else if (step === 'phase2_start') {
          setCards(prev => {
            const next = { ...prev };
            ['cmo', 'cfo', 'cto', 'coo'].forEach(k => {
              next[k].status = 'running';
              next[k].statusText = 'Coordinated synthesis...';
            });
            return next;
          });
        } else if (step.startsWith('phase2_') && step.endsWith('_running')) {
          const adv = step.split('_')[1];
          setCards(prev => ({
            ...prev,
            [adv]: { ...prev[adv], status: 'running', statusText: message }
          }));
        } else if (step.startsWith('phase2_') && step.endsWith('_done')) {
          const adv = step.split('_')[1];
          setCards(prev => ({
            ...prev,
            [adv]: {
              ...prev[adv],
              status: 'complete',
              statusText: 'Synthesis complete',
              verdict: card.verdict,
              body_md: card.body_md,
              claims: card.claims,
              assumptions: card.assumptions,
              confidence: card.confidence,
            }
          }));
        } else if (step === 'contrarian_start') {
          setCards(prev => ({
            ...prev,
            contrarian: { ...prev.contrarian, status: 'running', statusText: message }
          }));
        } else if (step === 'debate_complete') {
          setCards(prev => {
            const next = { ...prev };
            allCards.forEach((c: any) => {
              next[c.advisor_id] = {
                ...next[c.advisor_id],
                status: 'complete',
                statusText: 'Ready',
                verdict: c.verdict,
                body_md: c.body_md,
                claims: c.claims,
                assumptions: c.assumptions,
                confidence: c.confidence,
              };
            });
            return next;
          });
          setTraces(allTraces);
          setIsAnalyzing(false);
          eventSource.close();
        } else if (step === 'failed') {
          setIsAnalyzing(false);
          setStatusMessage(`Error: ${data.error}`);
          eventSource.close();
        }
      };

      // On SSE disconnect (tab switch, network blip), try to recover state from DB
      eventSource.onerror = (e) => {
        console.warn('SSE connection interrupted. Attempting to recover debate state from server...');
        eventSource.close();
        // Poll the debate endpoint to recover completed cards instead of losing state
        const pollRecovery = async () => {
          try {
            const recoverRes = await fetch(`/api/debates/${id}`);
            if (recoverRes.ok) {
              const recoverData = await recoverRes.json();
              if (recoverData.status === 'complete' && recoverData.cards && recoverData.cards.length > 0) {
                const loadedCards: Record<string, CardState> = { ...defaultCards() };
                for (const c of recoverData.cards) {
                  loadedCards[c.advisor_id] = {
                    advisor_id: c.advisor_id,
                    verdict: c.verdict || '',
                    body_md: c.body_md || '',
                    claims: c.claims || [],
                    assumptions: c.assumptions || [],
                    confidence: c.confidence || 'Grounded',
                    status: 'complete',
                    statusText: 'Recovered'
                  };
                }
                setCards(loadedCards);
                const loadedTraces = recoverData.cards.map((c: any) => ({
                  advisor_id: c.advisor_id,
                  steps: c.trace || []
                }));
                setTraces(loadedTraces);
                setStatusMessage('Debate recovered from server.');
              } else if (recoverData.status === 'running') {
                setStatusMessage('Debate still processing on server. Please wait and refresh.');
              }
            }
          } catch (recoverErr) {
            console.error('Recovery failed:', recoverErr);
          }
          setIsAnalyzing(false);
        };
        // Delay recovery poll slightly to let backend finish writing
        setTimeout(pollRecovery, 2000);
      };

    } catch (err: any) {
      setIsAnalyzing(false);
      setStatusMessage(`Failed: ${err.message || err}`);
    }
  };

  // Card Selection for Cross-Chat
  const handleCardToggleSelection = (id: string) => {
    setSelectedCards(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      if (prev.length >= 3) return prev; // max 3 cards
      return [...prev, id];
    });
  };

  // Trigger Cross-Chat Conversation
  const handleStartCrossChat = async () => {
    if (selectedCards.length < 2) return;
    setIsCrossChatLoading(true);
    setIsCrossChatOpen(true);
    setCrossChatTranscript([]);

    try {
      const response = await fetch('/api/cross-chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({
          card_ids: selectedCards.map(id => `${debateId || 'deb_mock'}_${id}`),
          user_prompt: crossChatPrompt,
          cards: selectedCards.map(id => ({
            advisor_id: id,
            verdict: cards[id].verdict,
            body_md: cards[id].body_md
          }))
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed cross-chat');

      setCrossChatTranscript(data.transcript);
    } catch (err: any) {
      alert(`Cross-chat failed: ${err.message}`);
    } finally {
      setIsCrossChatLoading(false);
    }
  };

  // Merge chat transcript into a Merged Card
  const handleMergeCards = async () => {
    if (crossChatTranscript.length === 0) return;
    setIsCrossChatLoading(true);

    try {
      const response = await fetch('/api/cross-chat/merge', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({
          card_ids: selectedCards.map(id => `${debateId || 'deb_mock'}_${id}`),
          transcript: crossChatTranscript,
          cards: selectedCards.map(id => ({
            advisor_id: id,
            verdict: cards[id].verdict,
            body_md: cards[id].body_md
          }))
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed merge');

      setMergedCard({
        advisor_id: 'merged',
        verdict: data.verdict,
        body_md: data.body_md,
        claims: data.claims,
        assumptions: data.assumptions,
        confidence: data.confidence,
        status: 'complete',
        statusText: 'Merged synthesis complete',
      });
      setIsCrossChatOpen(false);
    } catch (err: any) {
      alert(`Merge failed: ${err.message}`);
    } finally {
      setIsCrossChatLoading(false);
    }
  };

  // Click on citation chip to open source details in sliding drawer
  const handleCitationClick = async (ref: string, type: string) => {
    setDrawerTitle(`Citation Details: ${ref.split('/').pop()}`);
    setDrawerOpen(true);
    setDrawerContent(
      <div className="flex flex-col gap-4 text-sm text-gray-700">
        <div className="flex items-center gap-2 font-semibold text-gray-900 border-b border-gray-100 pb-2">
          <Info className="w-4 h-4 text-blue-500" />
          Source Type: {type.toUpperCase()}
        </div>
        <p className="font-mono text-xs text-gray-500 select-all border border-gray-100 bg-gray-50 p-1.5 rounded">
          Reference ID: {ref}
        </p>
        <div className="border border-gray-200 bg-white p-4 rounded-lg shadow-inner max-h-[400px] overflow-y-auto whitespace-pre-line leading-relaxed font-sans">
          {/* Detailed text representation based on ref */}
          {ref.includes('pl-spreadsheet.csv') ? (
            <div className="overflow-x-auto text-[11px] font-mono">
              Month | Revenue | Server_Cost | Salaries | Net_Income<br/>
              2026-01 | 150000 | 12000 | 60000 | 30000<br/>
              2026-06 | 180000 | 14500 | 65000 | 43800<br/>
              2026-12 | 235000 | 18000 | 75000 | 73000
            </div>
          ) : ref.includes('marketing-strategy.md') ? (
            `Gating features like advanced analytics, multi-workspace collaboration, and high-frequency webhook pipelines is required to avoid self-cannibalization. Most competitors offer limited free tiers. Self-cannibalization averages 15-22% if gating is too loose.`
          ) : ref.includes('team-ops.md') ? (
            `Support ticketing redirects non-Pro users to Discord community, keeping our ticketing system reserved strictly for paying Pro customers. Hiring 1 contractor is required to cover the capacity shortfall.`
          ) : ref.includes('product-roadmap.md') ? (
            `Gating analytics requires refactoring our database queries to count weekly data volumes per user. This is estimated at 3-4 developer-weeks of effort.`
          ) : (
            `This assertion is verified by a web competitor benchmark: Self-cannibalization average is 15-22% for developer tools launching a free tier without feature restrictions.`
          )}
        </div>
      </div>
    );
  };

  // View trace of an advisor card
  const handleViewTrace = (advisorId: string) => {
    const trace = traces.find(t => t.advisor_id === advisorId);
    setDrawerTitle(`Workflow Execution Trace: Chief ${advisorId.toUpperCase()} Officer`);
    setDrawerOpen(true);

    if (!trace || trace.steps.length === 0) {
      setDrawerContent(
        <div className="text-gray-500 text-sm">
          No workflow trace is currently cached for this advisor. Run a live debate query to compile traces.
        </div>
      );
      return;
    }

    setDrawerContent(
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex items-center gap-2 font-semibold text-gray-900 border-b border-gray-100 pb-2">
          <Cpu className="w-4 h-4 text-blue-500" />
          5-Step Pipeline execution data
        </div>
        <div className="relative border-l border-gray-200 pl-4 ml-2 space-y-4">
          {trace.steps.map((step, idx) => (
            <div key={idx} className="relative">
              <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-white" />
              <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col gap-1.5">
                <span className="font-bold text-gray-800 text-xs uppercase">{step.step_name.replace(/_/g, ' ')}</span>
                <div className="grid grid-cols-2 gap-x-2 text-[10px] text-gray-400">
                  <span>Model: {step.model}</span>
                  <span>Latency: {step.latency_ms} ms</span>
                  {step.cost_usd && <span>Cost: ${step.cost_usd.toFixed(5)}</span>}
                  {step.tool_calls && <span>Tools: {step.tool_calls.join(', ')}</span>}
                </div>
                <details className="mt-2 text-xs">
                  <summary className="text-blue-500 hover:underline cursor-pointer select-none">Show output details</summary>
                  <pre className="mt-1 bg-gray-50 p-2 rounded text-[10px] font-mono overflow-x-auto max-h-[150px]">
                    {JSON.stringify(step.output, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Pre-fill and save a Decision Record in database
  const handleSaveDecisionRecord = async () => {
    if (!drChosenOption || !drRationale) {
      alert('Please fill out all fields before saving.');
      return;
    }

    try {
      const response = await fetch('/api/decision-records', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({
          debate_id: debateId || 'deb_mock',
          question,
          chosen_option: drChosenOption,
          rationale_md: drRationale,
          dissents_json: [
            cards.contrarian.verdict,
          ],
          assumptions_json: [
            ...cards.cfo.assumptions,
            ...cards.cmo.assumptions,
          ],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save');

      alert(`Decision Record saved successfully! Reference ID: ${data.id}`);
      setShowDrModal(false);
      setDrChosenOption('');
      setDrRationale('');
    } catch (e: any) {
      alert(`Save failed: ${e.message}`);
    }
  };

  return (
    <main className="flex-1 bg-dotted-pattern relative overflow-hidden flex flex-col h-screen pt-[72px] pl-0 md:pl-64">
      {/* Top Controls */}
      <div className="absolute top-4 sm:top-6 left-0 right-0 flex justify-between items-start px-4 sm:px-8 z-10 pointer-events-none md:ml-64">
        <div className="flex-1 flex justify-center pointer-events-auto">
          <div className="bg-white border border-gray-200 shadow-sm rounded-full px-4 py-2 flex items-center gap-2 text-sm font-medium text-gray-800">
            <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="hidden sm:inline">{question}</span>
            <span className="sm:hidden">Debate Query</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Analyze / Run Debate trigger */}
          <button 
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="bg-white border border-gray-200 shadow-sm rounded-md px-3 py-2 flex items-center gap-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Play className="w-4 h-4 shrink-0 text-blue-500" />
            <span className="hidden lg:inline">{isAnalyzing ? 'Running...' : 'Run Debate'}</span>
          </button>

          {/* Save Decision Record button */}
          <button 
            onClick={() => setShowDrModal(true)}
            className="bg-white border border-gray-200 shadow-sm rounded-md px-3 py-2 flex items-center gap-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Save className="w-4 h-4 shrink-0 text-emerald-500" />
            <span className="hidden lg:inline">Save DR</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div 
        className="relative w-full h-full flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onPointerDown={handleCanvasPointerDown}
      >
        <div 
          className="absolute top-1/2 left-[45%] w-0 h-0 transition-transform duration-75" 
          style={{ transform: `translate(calc(-50% + ${camera.x}px), calc(-50% + ${camera.y}px)) scale(${zoom})` }}
        >
          {/* Central Connecting Node */}
          <div className="absolute w-3 h-3 bg-white border-2 border-gray-300 rounded-full z-10 -ml-1.5 -mt-1.5" />

          {/* Connection Lines SVG */}
          <svg className="absolute top-0 left-0 overflow-visible pointer-events-none" style={{ zIndex: 0 }}>
             <g stroke="#d1d5db" strokeWidth="2" fill="none">
               {/* CMO (top-left) */}
               <path d={drawPathFromCenter(nodes.cmo.x + 280, nodes.cmo.y + 125)} />
               <circle cx={nodes.cmo.x + 280} cy={nodes.cmo.y + 125} r="3" fill="white" stroke="#d1d5db" />
               
               {/* CFO (top-right) */}
               <path d={drawPathFromCenter(nodes.cfo.x, nodes.cfo.y + 125)} />
               <circle cx={nodes.cfo.x} cy={nodes.cfo.y + 125} r="3" fill="white" stroke="#d1d5db" />

               {/* CTO (bottom-left) */}
               <path d={drawPathFromCenter(nodes.cto.x + 280, nodes.cto.y + 125)} />
               <circle cx={nodes.cto.x + 280} cy={nodes.cto.y + 125} r="3" fill="white" stroke="#d1d5db" />

               {/* COO (bottom-right) */}
               <path d={drawPathFromCenter(nodes.coo.x, nodes.coo.y + 125)} />
               <circle cx={nodes.coo.x} cy={nodes.coo.y + 125} r="3" fill="white" stroke="#d1d5db" />
             </g>

             {/* Dotted Line CFO to Contrarian */}
             <g stroke="#fca5a5" strokeWidth="2" strokeDasharray="4,4" fill="none">
                <path d={drawDottedPath(nodes.cfo.x + 280, nodes.cfo.y + 125, nodes.contrarian.x, nodes.contrarian.y + 125)} />
                <circle cx={nodes.contrarian.x} cy={nodes.contrarian.y + 125} r="4" fill="white" stroke="#ef4444" strokeWidth="2" />
             </g>

             {/* Dynamic gradient lines between selected cross-chat cards */}
             {selectedCards.length >= 2 && (
               <g stroke="url(#chatGradient)" strokeWidth="3" fill="none">
                 <defs>
                   <linearGradient id="chatGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                     <stop offset="0%" stopColor="#3b82f6" />
                     <stop offset="100%" stopColor="#10b981" />
                   </linearGradient>
                 </defs>
                 {selectedCards.map((id, idx) => {
                   if (idx === selectedCards.length - 1) return null;
                   const nextId = selectedCards[idx + 1];
                   const nodeA = nodes[id as keyof typeof nodes];
                   const nodeB = nodes[nextId as keyof typeof nodes];
                   if (!nodeA || !nodeB) return null;
                   return (
                     <path 
                       key={idx}
                       d={drawDottedPath(nodeA.x + 140, nodeA.y + 125, nodeB.x + 140, nodeB.y + 125)} 
                     />
                   );
                 })}
               </g>
             )}
          </svg>

          {/* CMO Card */}
          <div className={`absolute ${selectedCards.includes('cmo') ? 'ring-4 ring-blue-500/50 rounded-xl' : ''}`} style={{ left: nodes.cmo.x, top: nodes.cmo.y }}>
            <AdvisorCard
              role="CMO"
              title={cards.cmo.verdict}
              description={cards.cmo.body_md}
              evidence={cards.cmo.claims.length}
              confidence={cards.cmo.confidence}
              assumptions={cards.cmo.assumptions.length}
              colorClass="green"
              icon={<Megaphone className="w-4 h-4" />}
              status={cards.cmo.status}
              statusText={cards.cmo.statusText}
              claims={cards.cmo.claims}
              onCardClick={() => handleCardToggleSelection('cmo')}
              onCitationClick={handleCitationClick}
              onPointerDown={(e) => handleNodePointerDown(e, 'cmo')}
              className="cursor-grab active:cursor-grabbing hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow"
            />
            {cards.cmo.status === 'complete' && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleViewTrace('cmo'); }}
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-white/90 px-2 py-0.5 rounded border border-gray-200 text-[9px] font-bold text-gray-500 hover:bg-gray-50 hover:text-gray-800 shadow-sm z-30"
              >
                View Pipeline Trace
              </button>
            )}
          </div>

          {/* CFO Card */}
          <div className={`absolute ${selectedCards.includes('cfo') ? 'ring-4 ring-blue-500/50 rounded-xl' : ''}`} style={{ left: nodes.cfo.x, top: nodes.cfo.y }}>
            <AdvisorCard
              role="CFO"
              title={cards.cfo.verdict}
              description={cards.cfo.body_md}
              evidence={cards.cfo.claims.length}
              confidence={cards.cfo.confidence}
              assumptions={cards.cfo.assumptions.length}
              colorClass="blue"
              icon={<TrendingUp className="w-4 h-4" />}
              status={cards.cfo.status}
              statusText={cards.cfo.statusText}
              claims={cards.cfo.claims}
              onCardClick={() => handleCardToggleSelection('cfo')}
              onCitationClick={handleCitationClick}
              onPointerDown={(e) => handleNodePointerDown(e, 'cfo')}
              className="cursor-grab active:cursor-grabbing hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow"
            />
            {cards.cfo.status === 'complete' && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleViewTrace('cfo'); }}
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-white/90 px-2 py-0.5 rounded border border-gray-200 text-[9px] font-bold text-gray-500 hover:bg-gray-50 hover:text-gray-800 shadow-sm z-30"
              >
                View Pipeline Trace
              </button>
            )}
          </div>

          {/* CTO Card */}
          <div className={`absolute ${selectedCards.includes('cto') ? 'ring-4 ring-blue-500/50 rounded-xl' : ''}`} style={{ left: nodes.cto.x, top: nodes.cto.y }}>
            <AdvisorCard
              role="CTO"
              title={cards.cto.verdict}
              description={cards.cto.body_md}
              evidence={cards.cto.claims.length}
              confidence={cards.cto.confidence}
              assumptions={cards.cto.assumptions.length}
              colorClass="purple"
              icon={<Code className="w-4 h-4" />}
              status={cards.cto.status}
              statusText={cards.cto.statusText}
              claims={cards.cto.claims}
              onCardClick={() => handleCardToggleSelection('cto')}
              onCitationClick={handleCitationClick}
              onPointerDown={(e) => handleNodePointerDown(e, 'cto')}
              className="cursor-grab active:cursor-grabbing hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow"
            />
            {cards.cto.status === 'complete' && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleViewTrace('cto'); }}
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-white/90 px-2 py-0.5 rounded border border-gray-200 text-[9px] font-bold text-gray-500 hover:bg-gray-50 hover:text-gray-800 shadow-sm z-30"
              >
                View Pipeline Trace
              </button>
            )}
          </div>

          {/* COO Card */}
          <div className={`absolute ${selectedCards.includes('coo') ? 'ring-4 ring-blue-500/50 rounded-xl' : ''}`} style={{ left: nodes.coo.x, top: nodes.coo.y }}>
            <AdvisorCard
              role="COO"
              title={cards.coo.verdict}
              description={cards.coo.body_md}
              evidence={cards.coo.claims.length}
              confidence={cards.coo.confidence}
              assumptions={cards.coo.assumptions.length}
              colorClass="orange"
              icon={<Box className="w-4 h-4" />}
              status={cards.coo.status}
              statusText={cards.coo.statusText}
              claims={cards.coo.claims}
              onCardClick={() => handleCardToggleSelection('coo')}
              onCitationClick={handleCitationClick}
              onPointerDown={(e) => handleNodePointerDown(e, 'coo')}
              className="cursor-grab active:cursor-grabbing hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow"
            />
            {cards.coo.status === 'complete' && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleViewTrace('coo'); }}
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-white/90 px-2 py-0.5 rounded border border-gray-200 text-[9px] font-bold text-gray-500 hover:bg-gray-50 hover:text-gray-800 shadow-sm z-30"
              >
                View Pipeline Trace
              </button>
            )}
          </div>

          {/* Contrarian Card */}
          <div className="absolute" style={{ left: nodes.contrarian.x, top: nodes.contrarian.y }}>
            <AdvisorCard
              role="CONTRARIAN"
              title={cards.contrarian.verdict}
              description={cards.contrarian.body_md}
              evidence={cards.contrarian.claims.length}
              confidence={cards.contrarian.confidence}
              assumptions={cards.contrarian.assumptions.length}
              colorClass="red"
              icon={<ShieldAlert className="w-4 h-4" />}
              status={cards.contrarian.status}
              statusText={cards.contrarian.statusText}
              claims={cards.contrarian.claims}
              onCitationClick={handleCitationClick}
              onPointerDown={(e) => handleNodePointerDown(e, 'contrarian')}
              className="cursor-grab active:cursor-grabbing hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow"
            />
            {cards.contrarian.status === 'complete' && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleViewTrace('contrarian'); }}
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-white/90 px-2 py-0.5 rounded border border-gray-200 text-[9px] font-bold text-gray-500 hover:bg-gray-50 hover:text-gray-800 shadow-sm z-30"
              >
                View Pipeline Trace
              </button>
            )}
          </div>

          {/* Merged Card (spawns from Cross-Chat merge) */}
          {mergedCard && (
            <div className="absolute" style={{ left: mergedCardPos.x, top: mergedCardPos.y }}>
              <AdvisorCard
                role="MERGED SYNTHESIS"
                title={mergedCard.verdict}
                description={mergedCard.body_md}
                evidence={mergedCard.claims.length}
                confidence={mergedCard.confidence}
                assumptions={mergedCard.assumptions.length}
                colorClass="purple"
                icon={<Sparkles className="w-4 h-4" />}
                status={mergedCard.status}
                statusText={mergedCard.statusText}
                claims={mergedCard.claims}
                onCitationClick={handleCitationClick}
                onPointerDown={(e) => handleNodePointerDown(e, 'merged')}
                className="cursor-grab active:cursor-grabbing border-2 border-dashed border-violet-300 ring-2 ring-violet-50"
              />
            </div>
          )}
        </div>
      </div>

      {/* Floating Controls Right */}
      <div className="hidden md:flex absolute right-6 bottom-32 flex-col gap-2 z-20">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col overflow-hidden">
          <button onClick={handleZoomIn} className="p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-900 border-b border-gray-100 transition-colors">
            <ZoomIn className="w-5 h-5" />
          </button>
          <button onClick={handleZoomReset} className="p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-900 border-b border-gray-100 transition-colors">
            <Target className="w-5 h-5" />
          </button>
          <button onClick={handleZoomOut} className="p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors">
            <ZoomOut className="w-5 h-5" />
          </button>
        </div>
        <button onClick={() => document.documentElement.requestFullscreen().catch(() => {})} className="bg-white p-2 rounded-lg shadow-sm border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors">
          <Maximize className="w-5 h-5" />
        </button>
      </div>

      <div className="hidden md:block absolute right-6 bottom-6 z-20">
        <button 
          onClick={() => {
            navigator.clipboard.writeText(window.location.href);
            alert('Canvas sharing link copied to clipboard!');
          }}
          className="bg-white p-3 rounded-full shadow-lg border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all"
          title="Copy Share Link"
        >
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Selection Toolbar for Cross-Chat */}
      {selectedCards.length >= 2 && !isCrossChatOpen && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-4 z-20 md:ml-32 animate-bounce">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span>Selected {selectedCards.map(s => s.toUpperCase()).join(' & ')}</span>
          </div>
          <button 
            onClick={handleStartCrossChat}
            className="bg-blue-500 text-white font-medium text-xs px-3.5 py-1.5 rounded-full hover:bg-blue-600 transition-all flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Start Cross-Chat Debate
          </button>
          <button 
            onClick={() => setSelectedCards([])}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Floating Cross-Chat Panel */}
      {isCrossChatOpen && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl border border-gray-200 shadow-2xl p-5 w-full max-w-xl flex flex-col gap-4 z-30 md:ml-32">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="font-semibold text-gray-800 text-base flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-500" />
              Cross-Chat: {selectedCards.map(s => s.toUpperCase()).join(' x ')}
            </h3>
            <button onClick={() => setIsCrossChatOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Debate input prompt */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Debate Prompt</label>
            <textarea 
              value={crossChatPrompt}
              onChange={(e) => setCrossChatPrompt(e.target.value)}
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50"
            />
          </div>

          {/* Conversation transcript */}
          <div className="border border-gray-100 bg-gray-50 rounded-lg p-3 max-h-[250px] overflow-y-auto flex flex-col gap-3">
            {isCrossChatLoading && (
              <div className="py-6 flex flex-col items-center justify-center gap-2">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-400 animate-pulse">C-level advisors arguing in progress...</span>
              </div>
            )}
            {!isCrossChatLoading && crossChatTranscript.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">Click "Argue Now" to spawn the round-robin debate (capped at 6 turns).</p>
            )}
            {crossChatTranscript.map((turn, idx) => (
              <div key={idx} className="flex flex-col gap-1 text-xs">
                <span className="font-bold text-gray-900 uppercase text-[10px]">
                  Chief {turn.advisor_id.toUpperCase()} Officer:
                </span>
                <p className="bg-white p-2.5 rounded-lg shadow-sm border border-gray-100 text-gray-700 leading-relaxed">
                  {turn.text}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <button 
              onClick={handleStartCrossChat}
              disabled={isCrossChatLoading}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                crossChatTranscript.length === 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md border-none'
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {crossChatTranscript.length === 0 ? 'Argue Now' : 'Re-run Debate'}
            </button>
            <div className="flex gap-2">
              {crossChatTranscript.length > 0 && (
                <button 
                  onClick={handleMergeCards}
                  disabled={isCrossChatLoading}
                  className="bg-violet-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-violet-700 transition-colors flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Merged Card
                </button>
              )}
              <button 
                onClick={() => setIsCrossChatOpen(false)}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Side Drawer for Citations and Traces */}
      {drawerOpen && (
        <div className="fixed top-[72px] right-0 bottom-0 w-full max-w-md bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col transition-transform duration-300 animate-slide-in">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h4 className="font-semibold text-gray-800 text-sm">{drawerTitle}</h4>
            <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {drawerContent}
          </div>
        </div>
      )}

      {/* Decision Record Modal */}
      {showDrModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-lg flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="font-semibold text-gray-800 text-base flex items-center gap-2">
                <Save className="w-5 h-5 text-emerald-500" />
                Synthesize Decision Record (DR)
              </h3>
              <button onClick={() => setShowDrModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-gray-400 uppercase">Question Debated</span>
              <p className="text-sm font-semibold text-gray-800 bg-gray-50 p-2.5 rounded border border-gray-100">
                {question}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Chosen Action/Option</label>
              <input 
                type="text" 
                value={drChosenOption}
                onChange={(e) => setDrChosenOption(e.target.value)}
                placeholder="e.g. Launch a limited beta freemium plan with analytics feature gates"
                className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Decision Rationale</label>
              <textarea 
                value={drRationale}
                onChange={(e) => setDrRationale(e.target.value)}
                rows={4}
                placeholder="Explain the rationale, trade-offs, and why this option was chosen despite dissents..."
                className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button 
                onClick={() => setShowDrModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveDecisionRecord}
                className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-600 transition-colors"
              >
                Save Decision & Index
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Progress Toast */}
      {isAnalyzing && statusMessage && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 sm:px-0 z-20 md:pl-64">
          <div className="bg-slate-900/95 text-white text-xs font-semibold px-5 py-3.5 rounded-2xl border border-slate-800 shadow-2xl flex items-center gap-3 backdrop-blur w-fit mx-auto transition-all animate-pulse">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="tracking-wide text-slate-200">{statusMessage}</span>
          </div>
        </div>
      )}

      {/* Bottom Input Area */}
      <div className="absolute bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 sm:px-0 z-20 md:pl-64">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-3 pl-5 flex items-center justify-between gap-3">
          <input 
            type="text" 
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What decision are we making today?"
            className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 focus:outline-none text-sm sm:text-base font-semibold"
          />
          <button 
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-850 transition-all flex items-center gap-2 shrink-0 disabled:opacity-50"
          >
            {isAnalyzing ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Analyze</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
