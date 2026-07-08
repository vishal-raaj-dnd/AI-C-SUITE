import React from 'react';
import { 
  LayoutDashboard, 
  BrainCircuit, 
  BookOpen, 
  FileText, 
  Plus,
  Trash2,
  X
} from 'lucide-react';

type CanvasData = {
  id: string;
  title: string;
  question: string;
  created_at: string;
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: 'canvas' | 'knowledge' | 'decisions';
  onViewChange: (view: 'canvas' | 'knowledge' | 'decisions') => void;
  canvases: CanvasData[];
  activeCanvasId: string;
  onSelectCanvas: (id: string) => void;
  onCreateCanvas: () => void;
  onDeleteCanvas: (id: string, e: React.MouseEvent) => void;
}

export function Sidebar({ 
  isOpen, 
  onClose, 
  currentView, 
  onViewChange,
  canvases,
  activeCanvasId,
  onSelectCanvas,
  onCreateCanvas,
  onDeleteCanvas
}: SidebarProps) {
  const getLinkClass = (view: 'canvas' | 'knowledge' | 'decisions') => {
    const isSelected = currentView === view;
    return `flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-all rounded-lg select-none cursor-pointer ${
      isSelected 
        ? 'text-gray-900 bg-gray-100/80 shadow-sm border-l-4 border-blue-500 rounded-l-none pl-2.5' 
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }`;
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-30 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}
      
      <aside className={`
        w-64 border-r border-gray-200 bg-white h-screen flex flex-col fixed left-0 top-0 pt-[72px] z-40
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Close button for mobile */}
        <button 
          className="md:hidden absolute top-4 right-4 p-2 text-gray-500 hover:bg-gray-100 rounded-md"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Quorum Branding Segment */}
        <div className="px-6 py-4 border-b border-gray-100 hidden md:flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center border border-blue-500 shadow-md shadow-blue-500/10">
            <span className="text-white font-black text-sm">Q</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-gray-900 leading-none">QUORUM AI</span>
            <span className="text-[10px] text-gray-400 font-semibold mt-0.5 leading-none">Executive Board</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4">
          <nav className="space-y-1.5 mb-10">
            <div 
              onClick={() => { onViewChange('canvas'); onClose(); }} 
              className={getLinkClass('canvas')}
            >
              <BrainCircuit className={`w-5 h-5 ${currentView === 'canvas' ? 'text-blue-500' : 'text-gray-400'}`} />
              Advisors Canvas
            </div>
            <div 
              onClick={() => { onViewChange('knowledge'); onClose(); }} 
              className={getLinkClass('knowledge')}
            >
              <BookOpen className={`w-5 h-5 ${currentView === 'knowledge' ? 'text-blue-500' : 'text-gray-400'}`} />
              Knowledge Base
            </div>
            <div 
              onClick={() => { onViewChange('decisions'); onClose(); }} 
              className={getLinkClass('decisions')}
            >
              <FileText className={`w-5 h-5 ${currentView === 'decisions' ? 'text-blue-500' : 'text-gray-400'}`} />
              Decision Records
            </div>
          </nav>

          <div>
            <div className="flex items-center justify-between px-3 mb-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">
              Recent Canvases
              <button 
                onClick={onCreateCanvas}
                className="text-gray-400 hover:text-blue-600 transition-colors p-0.5 rounded hover:bg-gray-100"
                title="Create New Canvas"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="space-y-1">
              {canvases.map(canvas => {
                const isActive = currentView === 'canvas' && activeCanvasId === canvas.id;
                return (
                  <div 
                    key={canvas.id}
                    onClick={() => { onSelectCanvas(canvas.id); onClose(); }}
                    className={`flex items-center justify-between px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors group select-none ${
                      isActive 
                        ? 'bg-blue-50 text-blue-700 font-semibold' 
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-500' : 'text-gray-400'}`} />
                      <span className="truncate">{canvas.title}</span>
                    </div>
                    
                    {/* Only show delete button for non-default workspace or if multiple exist */}
                    {canvases.length > 1 && (
                      <button
                        onClick={(e) => onDeleteCanvas(canvas.id, e)}
                        className="text-gray-400 hover:text-red-500 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1"
                        title="Delete Canvas Workspace"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
