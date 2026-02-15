
import React, { useState } from 'react';
import { Settings, X, Save, AlertTriangle, Zap } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRpm: number;
  onSave: (rpm: number) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentRpm, onSave }) => {
  const [rpm, setRpm] = useState(currentRpm);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(rpm);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Settings</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Request Rate Limit (RPM)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="5"
                max="100"
                step="1"
                value={rpm}
                onChange={(e) => setRpm(Number(e.target.value))}
                className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <span className="w-12 text-center font-mono font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 py-1 rounded">
                {rpm}
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Default is 9. Increase this ONLY if you have a paid Google Cloud account with higher quotas. 
              Setting this too high on a free tier will cause frequent 429 (Too Many Requests) errors.
            </p>
          </div>

          {rpm > 20 && (
            <div className="flex gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 p-3 rounded-lg text-amber-800 dark:text-amber-200 text-xs">
               <AlertTriangle className="w-5 h-5 shrink-0" />
               <p>High RPM selected. Ensure your API project has "Pay-as-you-go" billing enabled to avoid service interruptions.</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-500/20 transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
