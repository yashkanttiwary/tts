
import React, { useState, useEffect } from 'react';
import { Key, X, Check, Trash2, Plus, ShieldCheck, Layers, AlertCircle } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (keysString: string) => void;
  onDisconnect: () => void;
  hasKey: boolean;
  initialKeys?: string[];
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSave, onDisconnect, hasKey }) => {
  // We manage keys as an array of objects to handle unique IDs for React keys if needed, 
  // but simple string array is fine for this scope.
  const [keys, setKeys] = useState<string[]>(['']);
  const [error, setError] = useState('');

  // Load existing keys from localStorage when modal opens
  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem('gemini_api_keys');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setKeys(parsed);
          } else {
            setKeys(['']);
          }
        } catch (e) {
          setKeys(['']);
        }
      } else {
        setKeys(['']);
      }
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyChange = (index: number, value: string) => {
    const newKeys = [...keys];
    newKeys[index] = value;
    setKeys(newKeys);
    setError('');
  };

  const addKeyField = () => {
    setKeys([...keys, '']);
  };

  const removeKeyField = (index: number) => {
    const newKeys = keys.filter((_, i) => i !== index);
    // Ensure at least one field remains
    if (newKeys.length === 0) {
      setKeys(['']);
    } else {
      setKeys(newKeys);
    }
  };

  const handleSave = () => {
    // Filter empty keys
    const validKeys = keys.map(k => k.trim()).filter(k => k.length > 0);
    
    if (validKeys.length === 0) {
      setError('Please enter at least one valid API key');
      return;
    }
    
    // Pass as comma-joined string to match original interface or just save directly
    // The parent expects a string based on previous impl, but we can adhere to that
    // or we can update the parent. The parent uses `keysString.split` so joining is fine.
    onSave(validKeys.join(','));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${hasKey ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>
              {hasKey ? <ShieldCheck className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                API Configuration
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage your Google Gemini API keys
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

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          
          <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Why multiple keys?
            </h3>
            <p className="text-xs text-blue-700 dark:text-blue-300/80 leading-relaxed">
              Gemini has rate limits. By adding multiple keys, the app automatically rotates between them. If one key needs to cool down, we seamlessly switch to the next one to keep your generation fast.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">
              Your API Keys
            </label>
            
            {keys.map((keyVal, index) => (
              <div key={index} className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200" style={{ animationDelay: `${index * 50}ms` }}>
                <div className="relative flex-1 group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={keyVal}
                    onChange={(e) => handleKeyChange(index, e.target.value)}
                    placeholder="AIzaSy..."
                    className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono"
                    autoFocus={index === keys.length - 1 && index > 0}
                  />
                </div>
                <button
                  onClick={() => removeKeyField(index)}
                  disabled={keys.length <= 1 && keyVal === ''}
                  className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  title="Remove key"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button
              onClick={addKeyField}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Another Key
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-3 rounded-xl text-xs font-medium border border-red-100 dark:border-red-900/20 animate-in slide-in-from-bottom-1">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0 flex flex-col gap-3">
          <button
            onClick={handleSave}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            Save & Connect Keys
          </button>
          
          {hasKey && (
             <button
              onClick={() => {
                onDisconnect();
                onClose();
              }}
              className="w-full py-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-200 dark:hover:border-red-900/30 text-slate-700 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 rounded-xl font-medium text-xs transition-all flex items-center justify-center gap-2"
            >
              Disconnect All Keys
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
