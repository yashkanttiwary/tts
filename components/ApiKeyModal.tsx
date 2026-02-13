import React, { useState, useEffect } from 'react';
import { Key, X, Check, Trash2, Eye, EyeOff, ExternalLink, ShieldCheck } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string) => void;
  onDisconnect: () => void;
  hasKey: boolean;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSave, onDisconnect, hasKey }) => {
  const [inputValue, setInputValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInputValue('');
      setError('');
      setShowKey(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const cleanedKey = inputValue.trim();
    if (!cleanedKey) {
      setError('Please enter a valid API key');
      return;
    }
    if (!cleanedKey.startsWith('AIza')) {
       // Just a soft warning, not a blocker, as formats can change
       // setError('That doesn\'t look like a standard Google API key');
    }
    onSave(cleanedKey);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${hasKey ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>
              {hasKey ? <ShieldCheck className="w-5 h-5" /> : <Key className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {hasKey ? 'API Connected' : 'Connect API'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {hasKey ? 'Your session is active' : 'Enter your Gemini API key'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {hasKey ? (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 rounded-xl p-4 flex items-start gap-3">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                    You are connected
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300/80 leading-relaxed">
                    Your API key is securely stored in your browser's local storage. It is never sent to our servers, only directly to Google's API.
                  </p>
                </div>
              </div>
              
              <button
                onClick={() => {
                  onDisconnect();
                  onClose();
                }}
                className="w-full py-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-200 dark:hover:border-red-900/30 text-slate-700 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Disconnect & Clear Key
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">
                  API Key
                </label>
                <div className="relative group">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      setError('');
                    }}
                    placeholder="AIzaSy..."
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-12 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-400 font-mono"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-500 rounded-lg transition-colors"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {error && (
                  <p className="text-xs text-red-500 font-medium ml-1 animate-in slide-in-from-top-1">
                    {error}
                  </p>
                )}
              </div>

              <div className="pt-2">
                <button
                  onClick={handleSave}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Key className="w-4 h-4" />
                  Connect Key
                </button>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"
                >
                  <span>Get a free API key from Google AI Studio</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;