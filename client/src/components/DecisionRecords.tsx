import React, { useState, useEffect } from 'react';
import { FileText, Calendar, ShieldAlert, Book, Sparkles, X, ChevronRight } from 'lucide-react';
import { API_BASE } from '../utils/api';

type DecisionRecord = {
  id: string;
  debate_id: string;
  question: string;
  chosen_option: string;
  rationale_md: string;
  dissents: string[];
  assumptions: string[];
  created_at: string;
};

export function DecisionRecords({ userId }: { userId: string }) {
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<DecisionRecord | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/decision-records`, {
        headers: { 'x-user-id': userId }
      });
      const data = await response.json();
      if (response.ok) {
        setRecords(data);
      }
    } catch (e) {
      console.error('Failed to fetch decision records:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [userId]);

  return (
    <main className="flex-1 bg-white relative overflow-hidden flex flex-col h-screen pt-[72px] pl-0 md:pl-64">
      {/* Top Header */}
      <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center bg-gray-50/50">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            Decision Records Ledger
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Immutable record of C-level board choices and assumptions.</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-400">Loading saved decisions...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="py-20 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 max-w-xl mx-auto mt-10">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-700 text-sm">No Decisions Saved</h3>
            <p className="text-xs text-gray-400 max-w-xs mx-auto mt-1">Run a debate on the advisors canvas, click 'Save DR' to synthesize a record, and it will be archived here.</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            {records.map(record => (
              <div 
                key={record.id} 
                onClick={() => setSelectedRecord(record)}
                className="border border-gray-200 hover:border-blue-300 rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-start group"
              >
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-2">
                    <span className="bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{record.id}</span>
                    <span className="text-gray-400">•</span>
                    <span className="flex items-center gap-1 text-gray-500 normal-case font-normal">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(record.created_at).toLocaleDateString()} at {new Date(record.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  <h3 className="font-bold text-gray-900 text-sm leading-tight mb-2 group-hover:text-blue-600 transition-colors">
                    Query: "{record.question}"
                  </h3>
                  
                  <div className="text-xs text-gray-600 font-medium">
                    <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px] mr-1">Chosen Option:</span>
                    {record.chosen_option}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 self-center text-gray-400 group-hover:text-blue-500 transition-colors">
                  <span className="text-xs font-semibold hidden sm:inline">Inspect Ledger</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Decision Record Inspection Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-2xl flex flex-col h-[580px] gap-4 animate-scale-in">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                <Book className="w-5 h-5 text-blue-500" />
                Decision Ledger: {selectedRecord.id}
              </h3>
              <button onClick={() => setSelectedRecord(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Debated Question</span>
                <p className="text-sm font-bold text-gray-800 bg-gray-50 border border-gray-100 p-3 rounded-lg leading-snug">
                  "{selectedRecord.question}"
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Chosen Resolution</span>
                <p className="text-xs font-semibold text-gray-700 bg-emerald-50 border border-emerald-100 p-3 rounded-lg leading-relaxed">
                  {selectedRecord.chosen_option}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Strategic Rationale</span>
                <div className="border border-gray-100 p-3.5 rounded-lg whitespace-pre-line leading-relaxed bg-white text-gray-600">
                  {selectedRecord.rationale_md}
                </div>
              </div>

              {selectedRecord.dissents && selectedRecord.dissents.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Archived Dissents & Objections
                  </span>
                  <div className="bg-red-50/50 border border-red-100 p-3 rounded-lg flex flex-col gap-2">
                    {selectedRecord.dissents.map((diss, idx) => (
                      <div key={idx} className="flex gap-2 items-start font-medium text-red-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                        <p>{diss}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRecord.assumptions && selectedRecord.assumptions.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Key Stated Assumptions</span>
                  <div className="bg-gray-50 border border-gray-100 p-3 rounded-lg flex flex-wrap gap-2">
                    {selectedRecord.assumptions.map((ass, idx) => (
                      <span key={idx} className="bg-white border border-gray-200 px-2 py-1 rounded text-gray-600 font-medium">
                        {ass}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button 
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 bg-gray-950 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition-colors"
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
