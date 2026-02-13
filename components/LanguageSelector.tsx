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
  { code: 'hinglish', label: 'Hinglish', flag: '🇮🇳', sub: 'Conversational Mix' },
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
        {LANGUAGES.map((lang, index) => {
          const isSelected = selectedLanguage === lang.code;
          // If it's the last item and the total number of items is odd, span full width
          const isFullWidth = index === LANGUAGES.length - 1 && LANGUAGES.length % 2 !== 0;
          
          return (
            <button
              key={lang.code}
              onClick={() => onSelect(lang.code)}
              disabled={disabled}
              className={`
                group relative flex items-center justify-center p-3 rounded-xl border transition-all duration-200 text-center
                ${isSelected 
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 shadow-sm' 
                  : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50 hover:border-emerald-300 dark:hover:border-slate-600 hover:shadow-sm'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${isFullWidth ? 'col-span-2 flex-row gap-4 text-left' : 'col-span-1 flex-col'}
              `}
            >
              <span className={`filter drop-shadow-sm ${isFullWidth ? 'text-3xl' : 'text-2xl mb-1'}`}>{lang.flag}</span>
              <div className={isFullWidth ? "text-left" : ""}>
                <span className={`block text-sm font-semibold ${isSelected ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>
                  {lang.label}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  {lang.sub}
                </span>
              </div>
              
              {isSelected && (
                <div className={`absolute w-2 h-2 rounded-full bg-emerald-500 ${isFullWidth ? 'right-4 top-1/2 -translate-y-1/2' : 'top-2 right-2'}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LanguageSelector;