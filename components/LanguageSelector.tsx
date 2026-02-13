import React from 'react';
import { Languages } from 'lucide-react';

interface LanguageSelectorProps {
  selectedLanguage: string;
  onSelect: (lang: string) => void;
  disabled?: boolean;
}

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸', sub: 'Standard' },
  { code: 'hi', label: 'Hindi', flag: '🇮🇳', sub: 'हिंदी' },
];

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ selectedLanguage, onSelect, disabled }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/50">
        <Languages className="w-4 h-4 text-emerald-500" />
        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Language
        </label>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        {LANGUAGES.map((lang) => {
          const isSelected = selectedLanguage === lang.code;
          return (
            <button
              key={lang.code}
              onClick={() => onSelect(lang.code)}
              disabled={disabled}
              className={`
                group relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 text-center
                ${isSelected 
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 shadow-sm' 
                  : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50 hover:border-emerald-300 dark:hover:border-slate-600 hover:shadow-sm'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <span className="text-2xl mb-1 filter drop-shadow-sm">{lang.flag}</span>
              <span className={`text-sm font-semibold ${isSelected ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>
                {lang.label}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {lang.sub}
              </span>
              
              {isSelected && (
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LanguageSelector;