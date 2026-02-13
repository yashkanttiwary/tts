import React from 'react';
import { Languages } from 'lucide-react';

interface LanguageSelectorProps {
  selectedLanguage: string;
  onSelect: (lang: string) => void;
  disabled?: boolean;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ selectedLanguage, onSelect, disabled }) => {
  const options = [
    { id: 'en', label: 'English', sub: 'Standard', flag: '🇺🇸', colSpan: 'col-span-1' },
    { id: 'hi', label: 'Hindi', sub: 'हिंदी', flag: '🇮🇳', colSpan: 'col-span-1' },
    { id: 'hinglish', label: 'Hinglish', sub: 'Conversational Mix', flag: '🇮🇳', colSpan: 'col-span-2' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/50">
        <Languages className="w-4 h-4 text-emerald-500" />
        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Language
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => {
          const isSelected = selectedLanguage === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onSelect(opt.id)}
              disabled={disabled}
              className={`
                relative ${opt.colSpan} p-3 rounded-xl border transition-all duration-200 text-center flex flex-col items-center justify-center gap-1.5
                ${isSelected 
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 shadow-sm' 
                  : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50 hover:border-emerald-300 dark:hover:border-slate-600 hover:shadow-sm'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <span className="text-2xl mb-1 filter drop-shadow-sm">{opt.flag}</span>
              <div className="flex flex-col items-center">
                <span className={`text-sm font-bold ${isSelected ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-700 dark:text-slate-200'}`}>
                  {opt.label}
                </span>
                <span className={`text-[10px] font-medium uppercase tracking-wide ${isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                  {opt.sub}
                </span>
              </div>
              
              {isSelected && (
                <div className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full shadow-sm animate-in zoom-in" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LanguageSelector;