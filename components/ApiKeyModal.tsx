
import React, { useState, useEffect } from 'react';
import { Key, X, Check, Trash2, Eye, EyeOff, ExternalLink, ShieldCheck, Layers } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string) => void;
  onDisconnect: () => void;
  hasKey: boolean;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSave, onDisconnect, hasKey }) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInputValue('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const cleanedKey = inputValue.trim();
    if (!cleanedKey) {
      setError('Please enter at least one valid API key');
      return;
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
              {hasKey ? <ShieldCheck className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {hasKey ? 'API Connected' : 'Connect API'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {hasKey ? 'Your keys are active' : 'Enter one or more keys'}
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
                    Keys Configured
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300/80 leading-relaxed">
                    Your API keys are stored in your browser. We will rotate through them to maximize generation speed and avoid rate limits.
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                 <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Add more keys or replace existing ones:</p>
                 <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Enter additional API keys here (one per line)..."
                    className="w-full h-24 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-400 font-mono resize-none"
                  />
                  <button
                    onClick={handleSave}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs shadow-md transition-all"
                  >
                    Update / Add Keys
                  </button>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />
              
              <button
                onClick={() => {
                  onDisconnect();
                  onClose();
                }}
                className="w-full py-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-200 dark:hover:border-red-900/30 text-slate-700 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Disconnect All Keys
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">
                  API Key(s)
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                  Paste one key per line. We will rotate them automatically.
                </p>
                <div className="relative group">
                  <textarea
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      setError('');
                    }}
                    placeholder={`AIzaSy...\nAIzaSy...`}
                    className="w-full h-32 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-400 font-mono resize-none"
                    autoFocus
                  />
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
                  Connect Keys
                </button>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"
                >
                  <span>Get free API keys from Google AI Studio</span>
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
