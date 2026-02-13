import React from 'react';
import { PresetOption } from '../types';
import { Wand2 } from 'lucide-react';

interface StylePresetsProps {
  presets: PresetOption[];
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

const StylePresets: React.FC<StylePresetsProps> = ({ presets, onSelect, disabled }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/50">
        <Wand2 className="w-4 h-4 text-purple-500" />
        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Quick Styles
        </label>
      </div>
      
      <div className="grid grid-cols-2 gap-2.5">
        {presets.map((preset) => (
          <button
            key={preset.label}
            onClick={() => onSelect(preset.prompt)}
            disabled={disabled}
            className={`
              p-2.5 text-xs font-medium rounded-lg text-left transition-all border
              bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50 
              text-slate-700 dark:text-slate-300
              hover:border-purple-400 dark:hover:border-slate-600 hover:text-purple-600 dark:hover:text-purple-300
              hover:shadow-sm
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => onSelect('')}
          disabled={disabled}
          className={`
            col-span-2 p-2.5 text-xs font-medium rounded-lg transition-all border border-dashed
            bg-slate-50 dark:bg-slate-800/20 border-slate-300 dark:border-slate-700/30
            text-slate-500 dark:text-slate-400
            hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-700 dark:hover:text-slate-200
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          Reset Style
        </button>
      </div>
    </div>
  );
};

export default StylePresets;