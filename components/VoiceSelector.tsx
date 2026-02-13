import React from 'react';
import { VoiceOption } from '../types';
import { Check, User, Mic } from 'lucide-react';

interface VoiceSelectorProps {
  voices: VoiceOption[];
  selectedVoice: string;
  onSelect: (voiceName: string) => void;
  disabled?: boolean;
}

const VoiceSelector: React.FC<VoiceSelectorProps> = ({ voices, selectedVoice, onSelect, disabled }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/50">
        <User className="w-4 h-4 text-indigo-500" />
        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Voice Persona
        </label>
      </div>
      
      <div className="grid grid-cols-1 gap-3">
        {voices.map((voice) => {
          const isSelected = selectedVoice === voice.name;
          return (
            <button
              key={voice.name}
              onClick={() => onSelect(voice.name)}
              disabled={disabled}
              className={`
                group relative flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 text-left
                ${isSelected 
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 shadow-sm dark:shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                  : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50 hover:border-indigo-300 dark:hover:border-slate-600 hover:shadow-sm'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="flex items-center gap-3.5">
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors shadow-inner
                  ${isSelected 
                    ? 'bg-indigo-500 text-white' 
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-600'}
                `}>
                  {voice.name[0]}
                </div>
                <div>
                  <div className={`font-semibold text-sm transition-colors ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}>
                    {voice.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                    <span className={`
                      px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium uppercase tracking-wide
                      ${isSelected ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}
                    `}>
                      {voice.gender}
                    </span>
                    <span className="truncate max-w-[120px]">{voice.style}</span>
                  </div>
                </div>
              </div>
              
              {isSelected && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-indigo-500 rounded-full p-0.5">
                   <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default VoiceSelector;