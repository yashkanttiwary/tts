
import React, { useState, useRef, useEffect } from 'react';
import { VoiceOption } from '../types';
import { Check, User, Mic, Play, Square, Loader2 } from 'lucide-react';

interface VoiceSelectorProps {
  voices: VoiceOption[];
  selectedVoice: string;
  onSelect: (voiceName: string) => void;
  disabled?: boolean;
  onPlayPreview: (voiceName: string) => Promise<string>;
}

const VoiceSelector: React.FC<VoiceSelectorProps> = ({ voices, selectedVoice, onSelect, disabled, onPlayPreview }) => {
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio element once
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.onended = () => setPlayingVoice(null);
    audioRef.current.onerror = () => {
      setPlayingVoice(null);
      setLoadingVoice(null);
    };
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlayToggle = async (e: React.MouseEvent, voiceName: string) => {
    e.stopPropagation(); // Prevent selecting the voice when clicking play
    
    if (playingVoice === voiceName) {
      // Stop
      audioRef.current?.pause();
      setPlayingVoice(null);
    } else {
      // Play new
      try {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setPlayingVoice(null);
        setLoadingVoice(voiceName);
        
        const url = await onPlayPreview(voiceName);
        
        if (audioRef.current) {
          audioRef.current.src = url;
          await audioRef.current.play();
          setPlayingVoice(voiceName);
        }
      } catch (err) {
        console.error("Preview failed", err);
      } finally {
        setLoadingVoice(null);
      }
    }
  };

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
          const isPlaying = playingVoice === voice.name;
          const isLoading = loadingVoice === voice.name;

          return (
            <div
              key={voice.name}
              onClick={() => !disabled && onSelect(voice.name)}
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
                <div 
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors shadow-inner relative
                    ${isSelected 
                      ? 'bg-indigo-500 text-white' 
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-600'}
                  `}
                >
                   {/* Play Button Overlay */}
                   <button
                     onClick={(e) => handlePlayToggle(e, voice.name)}
                     disabled={disabled || (loadingVoice !== null && !isLoading)}
                     className={`
                       absolute inset-0 flex items-center justify-center rounded-full bg-black/10 dark:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity
                       ${isPlaying || isLoading ? 'opacity-100 bg-indigo-600 text-white' : ''}
                     `}
                   >
                     {isLoading ? (
                       <Loader2 className="w-4 h-4 animate-spin" />
                     ) : isPlaying ? (
                       <Square className="w-3.5 h-3.5 fill-current" />
                     ) : (
                       <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                     )}
                   </button>
                   
                   {/* Fallback Initial when not hovering/playing */}
                   <span className={`opacity-100 group-hover:opacity-0 transition-opacity ${isPlaying || isLoading ? 'opacity-0' : ''}`}>
                     {voice.name[0]}
                   </span>
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
              
              {isSelected && !isPlaying && !isLoading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-indigo-500 rounded-full p-0.5">
                   <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VoiceSelector;
