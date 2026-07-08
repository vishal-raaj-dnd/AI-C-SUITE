import React, { useState } from 'react';
import { ChevronDown, Menu, LogOut, User } from 'lucide-react';

interface HeaderProps {
  onMenuClick: () => void;
  userEmail?: string;
  onLogout?: () => void;
}

export function Header({ onMenuClick, userEmail, onLogout }: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="h-[72px] bg-white border-b border-gray-200 fixed top-0 w-full z-50 flex items-center px-4 md:px-6 justify-between select-none">
      <div className="flex items-center gap-4 md:gap-8">
        <button 
          className="md:hidden p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-md"
          onClick={onMenuClick}
        >
          <Menu className="w-5 h-5" />
        </button>
        {/* Logo */}
        <div className="flex items-center gap-2.5 font-bold text-xl tracking-tight text-gray-900">
          <div className="w-9 h-9 bg-blue-600 rounded-2xl flex items-center justify-center border border-blue-500 shadow-md shadow-blue-500/10">
            <span className="text-white font-black text-lg">Q</span>
          </div>
          <span className="hidden sm:inline font-extrabold text-sm tracking-widest text-gray-900">QUORUM</span>
        </div>
      </div>

      {/* Search removed as per user instruction */}
      <div className="hidden md:block flex-1 max-w-xl mx-8" />

      {/* Right Actions */}
      <div className="flex items-center gap-3 relative">
        <button 
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 hover:bg-gray-50 p-1.5 rounded-xl transition-colors border border-gray-100/50 bg-white"
        >
          <img
            src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
            alt="User avatar"
            className="w-7 h-7 rounded-lg border border-gray-200"
          />
          <span className="hidden sm:block text-xs font-semibold text-gray-700 max-w-[120px] truncate">{userEmail || 'User'}</span>
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        </button>

        {/* Profile Dropdown containing only Logout option */}
        {dropdownOpen && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setDropdownOpen(false)}
            />
            <div className="absolute right-0 top-11 w-48 bg-white border border-gray-200 rounded-xl shadow-xl py-1 z-20 animate-scale-in">
              <div className="px-4 py-2 border-b border-gray-100 text-left">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Signed in as</p>
                <p className="text-xs text-gray-700 truncate font-medium mt-0.5">{userEmail || 'Account'}</p>
              </div>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  if (onLogout) onLogout();
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 text-left font-semibold transition-colors"
              >
                <LogOut className="w-4 h-4 text-red-500" />
                Logout Account
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
