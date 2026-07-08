import React, { useState } from 'react';
import { ShieldCheck, Database, Key, Sparkles, User, Lock, ArrowRight, Server } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (userId: string, email: string) => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('demo@quorum.ai');
  const [password, setPassword] = useState('password');
  const [isSignUp, setIsSignUp] = useState(false);
  const [useSupabase, setUseSupabase] = useState(true); // Default enabled as predefined project
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    
    const endpoint = isSignUp ? '/api/auth/signup' : '/api/auth/login';
    
    try {
      const { API_BASE } = await import('../utils/api');
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      let data: any;
      try {
        data = await response.json();
      } catch (parseErr) {
        throw new Error('Server returned an invalid response. Please check that the backend is running and Supabase tables are created.');
      }
      
      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      localStorage.setItem('q_user_id', data.userId);
      localStorage.setItem('q_user_email', data.email);
      
      onLoginSuccess(data.userId, data.email);
    } catch (err: any) {
      setErrorMessage(err.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex items-center justify-center p-4 selection:bg-blue-100 font-sans overflow-y-auto">
      {/* Dynamic glow decoration */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-violet-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md bg-white/95 backdrop-blur rounded-3xl shadow-2xl border border-gray-100 p-8 flex flex-col gap-6 z-10 animate-scale-in">
        <div className="text-center">
          <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-100 mx-auto mb-4 animate-pulse">
            <ShieldCheck className="w-6 h-6 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">QUORUM AI</h2>
          <p className="text-xs text-gray-500 mt-1">Multi-Perspective Executive Decision Support Board</p>
        </div>

        {errorMessage && (
          <div className="bg-red-50 text-red-600 text-xs p-3.5 rounded-xl border border-red-100 font-semibold leading-relaxed">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-gray-400" />
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-gray-400" />
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50/50"
            />
          </div>

          {/* Toggle Supabase Sync Notification */}
          <div className="border border-gray-100 bg-gray-50/70 rounded-2xl p-4 mt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-violet-600" />
                <span className="text-xs font-bold text-gray-700">Sync with Supabase Backend</span>
              </div>
              <input
                type="checkbox"
                disabled
                checked={useSupabase}
                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 border-gray-300 opacity-60 cursor-not-allowed"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed font-medium">
              Pre-configured to project <strong className="text-violet-600 font-bold">orqoogpjyhlszwwilzms</strong>. Automatically replicates all decision canvas structures, history logs, and file attachments in real-time.
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{isSignUp ? 'Create Workspace Account' : 'Sign In Workspace'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMessage('');
            }}
            className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>

        <div className="text-center pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400 font-medium">
          <span className="flex items-center gap-1">
            <Server className="w-3.5 h-3.5" />
            Live Cloud Sync
          </span>
          <span className="flex items-center gap-0.5 text-blue-500">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            v2.5.0 (Enterprise)
          </span>
        </div>
      </div>
    </div>
  );
}
