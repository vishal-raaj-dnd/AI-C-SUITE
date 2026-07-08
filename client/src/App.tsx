import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { KnowledgeBase } from './components/KnowledgeBase';
import { DecisionRecords } from './components/DecisionRecords';
import { Login } from './components/Login';
import { API_BASE } from './utils/api';

type CanvasData = {
  id: string;
  title: string;
  question: string;
  created_at: string;
};

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'canvas' | 'knowledge' | 'decisions'>('canvas');
  
  // Workspace Canvases state
  const [canvases, setCanvases] = useState<CanvasData[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string>('can_1');
  const [activeCanvasQuestion, setActiveCanvasQuestion] = useState<string>('Should we launch a freemium tier?');

  // SaaS User Session Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('q_user_id'));
  const [userId, setUserId] = useState(localStorage.getItem('q_user_id') || '');
  const [userEmail, setUserEmail] = useState(localStorage.getItem('q_user_email') || '');

  const fetchCanvases = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/canvases`, {
        headers: { 'x-user-id': userId }
      });
      const data = await response.json();
      if (response.ok) {
        setCanvases(data);
        if (data.length > 0) {
          const exists = data.some((c: CanvasData) => c.id === activeCanvasId);
          if (!exists) {
            setActiveCanvasId(data[0].id);
            setActiveCanvasQuestion(data[0].question);
          } else {
            const active = data.find((c: CanvasData) => c.id === activeCanvasId);
            if (active) {
              setActiveCanvasQuestion(active.question);
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch canvases:', e);
    }
  };

  useEffect(() => {
    if (isLoggedIn && userId) {
      fetchCanvases();
    }
  }, [isLoggedIn, userId]);

  // Sync question when active canvas changes
  useEffect(() => {
    const active = canvases.find(c => c.id === activeCanvasId);
    if (active) {
      setActiveCanvasQuestion(active.question);
    }
  }, [activeCanvasId, canvases]);

  const handleSelectCanvas = (id: string) => {
    setActiveCanvasId(id);
    setCurrentView('canvas');
  };

  const handleCreateCanvas = async () => {
    const title = prompt('Enter a title for the new workspace decision:', 'New Decision Workspace');
    if (!title) return;
    const question = prompt('What is the query/decision question for this canvas?', 'Should we launch a freemium tier?');
    if (!question) return;

    try {
      const response = await fetch(`${API_BASE}/api/canvases`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({ title, question })
      });
      const data = await response.json();
      if (response.ok) {
        await fetchCanvases();
        setActiveCanvasId(data.id);
        setCurrentView('canvas');
      } else {
        throw new Error(data.error || 'Failed to create canvas');
      }
    } catch (e: any) {
      alert(`Creation failed: ${e.message}`);
    }
  };

  const handleDeleteCanvas = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this decision workspace canvas?')) return;

    try {
      const response = await fetch(`/api/canvases/${id}`, { 
        method: 'DELETE',
        headers: { 'x-user-id': userId }
      });
      if (response.ok) {
        await fetchCanvases();
        if (activeCanvasId === id) {
          setActiveCanvasId('can_1'); // default fallback
        }
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed delete');
      }
    } catch (err: any) {
      alert(`Deletion failed: ${err.message}`);
    }
  };

  const handleLoginSuccess = (uid: string, email: string) => {
    setUserId(uid);
    setUserEmail(email);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('q_user_id');
    localStorage.removeItem('q_user_email');
    setUserId('');
    setUserEmail('');
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex flex-col h-screen font-sans bg-gray-50 text-gray-900 selection:bg-blue-100">
      <Header 
        onMenuClick={() => setSidebarOpen(!sidebarOpen)} 
        userEmail={userEmail}
        onLogout={handleLogout}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)} 
          currentView={currentView}
          onViewChange={(view) => setCurrentView(view)}
          canvases={canvases}
          activeCanvasId={activeCanvasId}
          onSelectCanvas={handleSelectCanvas}
          onCreateCanvas={handleCreateCanvas}
          onDeleteCanvas={handleDeleteCanvas}
        />
        
        {currentView === 'canvas' && (
          <Canvas 
            canvasId={activeCanvasId}
            initialQuestion={activeCanvasQuestion} 
            userId={userId}
          />
        )}
        {currentView === 'knowledge' && <KnowledgeBase userId={userId} />}
        {currentView === 'decisions' && <DecisionRecords userId={userId} />}
      </div>
    </div>
  );
}
