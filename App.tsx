import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Loader2, AlertCircle, Sun, Moon, Sparkles, Download, Layers, StopCircle, XCircle, Settings2, Key, X } from 'lucide-react';
import { VoiceOption, PresetOption, TTSStatus } from './types';
import { pcmToWav } from './utils/audioUtils';
import VoiceSelector from './components/VoiceSelector';
import StylePresets from './components/StylePresets';
import ApiKeyModal from './components/ApiKeyModal';
import { useBookPlayer } from './hooks/useBookPlayer';

const VOICES: VoiceOption[] = [
  { name: 'Puck', gender: 'Male', style: 'Upbeat & Playful', description: 'Great for storytelling and lively content.' },
  { name: 'Kore', gender: 'Female', style: 'Firm & Clear', description: 'Excellent for educational and instructional content.' },
  { name: 'Charon', gender: 'Male', style: 'Deep & Authoritative', description: 'Perfect for news, announcements, and serious topics.' },
  { name: 'Fenrir', gender: 'Male', style: 'Fast & Energetic', description: 'Ideal for gaming, hype, and high-energy narration.' },
  { name: 'Aoede', gender: 'Female', style: 'Warm & Breezy', description: 'Good for podcasts, blogs, and casual conversation.' },
];

const PRESETS: PresetOption[] = [
  { label: 'Storyteller', prompt: 'Read this slowly and dramatically, emphasizing the emotions:' },
  { label: 'News Anchor', prompt: 'Read this in a professional, neutral, and fast-paced broadcast tone:' },
  { label: 'Excited', prompt: 'Say this with extreme excitement and high energy, almost shouting with joy:' },
  { label: 'Whisper', prompt: 'Whisper this very quietly, intimately, and secretively:' },
];

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  
  // API Key Management
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('gemini_api_key') || process.env.API_KEY || '';
  });

  const handleSaveKey = (key: string) => {
    localStorage.setItem('gemini_api_key', key);
    setApiKey(key);
  };

  const handleDisconnectKey = () => {
    localStorage.removeItem('gemini_api_key');
    setApiKey(process.env.API_KEY || '');
  };

  // Content Inputs
  const [text, setText] = useState('Welcome to the Gemini Voice Studio. I can transform any text into lifelike speech with just a click. Paste your whole book here, I will handle it chunk by chunk, streaming the audio as soon as it is ready.');
  const [instruction, setInstruction] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Puck');
  
  // Player Hook
  const { 
    chunks, 
    status, 
    currentChunkId, 
    error, 
    actions 
  } = useBookPlayer(apiKey);

  const editorRef = useRef<HTMLDivElement>(null);
  const activeChunkRef = useRef<HTMLDivElement>(null);

  // Sync editor text
  useEffect(() => {
    if (editorRef.current && text && editorRef.current.innerText === '') {
      editorRef.current.innerText = text;
    }
  }, []); 

  const handleInput = () => {
    if (editorRef.current) setText(editorRef.current.innerText);
  };

  // Auto-scroll to active chunk
  useEffect(() => {
    if (activeChunkRef.current) {
      activeChunkRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentChunkId]);

  // Open modal on error
  useEffect(() => {
    if (error && (error.includes('API Key') || error.includes('403'))) {
      setIsApiKeyModalOpen(true);
    }
  }, [error]);

  const handleGenerate = () => {
    if (!apiKey) {
      setIsApiKeyModalOpen(true);
      return;
    }
    const currentText = editorRef.current?.innerText || text;
    actions.start(currentText, selectedVoice, instruction);
  };

  const togglePlayPause = () => {
    if (status === TTSStatus.PLAYING) {
      actions.pause();
    } else if (status === TTSStatus.PAUSED) {
      actions.resume();
    }
  };

  const handleDownload = () => {
    const rawData = actions.getFullAudioBlob();
    if (!rawData) return;
    
    const wav = pcmToWav(rawData.buffer);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `gemini-speech-${Date.now()}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const completedCount = chunks.filter(c => c.status === 'ready' || c.status === 'playing' || c.status === 'played').length;
  const totalCount = chunks.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  
  const isBusy = status === TTSStatus.PREPARING || status === TTSStatus.PROCESSING || status === TTSStatus.PLAYING || status === TTSStatus.PAUSED;

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <ApiKeyModal 
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onSave={handleSaveKey}
        onDisconnect={handleDisconnectKey}
        hasKey={!!apiKey}
      />
      
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-800 dark:selection:text-indigo-200 transition-colors duration-300">
        
        {/* Background Gradients */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/40 dark:bg-indigo-900/10 blur-[100px] transition-colors duration-500"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-200/40 dark:bg-purple-900/10 blur-[100px] transition-colors duration-500"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 py-4 md:py-10 space-y-6 md:space-y-8 flex flex-col min-h-screen">
          
          {/* Header */}
          <header className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6 pb-2">
            <div className="text-center md:text-left space-y-2 flex-1">
              <div className="inline-flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur border border-slate-200 dark:border-slate-700/50 px-3 py-1 rounded-full text-xs font-semibold text-indigo-600 dark:text-indigo-300 shadow-sm">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Gemini 2.5 Flash TTS</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Gemini Voice Studio
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base max-w-lg">
                Pro-grade streaming TTS. No length limits. Gapless playback.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileSettingsOpen(true)}
                className="lg:hidden px-4 py-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm flex items-center gap-2 font-medium text-sm"
              >
                <Settings2 className="w-4 h-4" />
                <span>Voice & Style</span>
              </button>

              <button
                onClick={() => setIsApiKeyModalOpen(true)}
                className={`p-2.5 rounded-full border transition-all shadow-sm ${
                  apiKey 
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                aria-label="API Key Settings"
              >
                <Key className="w-5 h-5" />
              </button>

              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shadow-sm"
                aria-label="Toggle theme"
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </header>

          <main className="grid lg:grid-cols-12 gap-6 lg:h-[750px] relative">
            
            {/* Sidebar */}
            <aside className="hidden lg:col-span-4 lg:flex flex-col gap-4 min-h-0">
              <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6 shadow-sm dark:shadow-xl overflow-y-auto flex-1 custom-scrollbar">
                <VoiceSelector 
                  voices={VOICES} 
                  selectedVoice={selectedVoice} 
                  onSelect={setSelectedVoice}
                  disabled={isBusy}
                />
                <div className="h-px bg-slate-200 dark:bg-slate-800 my-6" />
                <StylePresets 
                  presets={PRESETS} 
                  onSelect={setInstruction}
                  disabled={isBusy}
                />
              </div>
            </aside>

            {/* Editor & Player */}
            <section className="lg:col-span-8 flex flex-col min-h-[500px] lg:h-full">
              <div className="bg-white/90 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-2xl shadow-lg dark:shadow-2xl flex flex-col h-full overflow-hidden transition-all">
                
                {/* Toolbar */}
                <div className="flex items-center gap-3 p-3 border-b border-slate-200 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 z-20 shrink-0">
                  <div className="flex-1">
                     <input 
                        type="text"
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        placeholder="Style Direction (e.g. 'Whisper urgently...')"
                        disabled={isBusy}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all shadow-sm"
                     />
                  </div>
                  
                  {isBusy && (
                     <div className="flex items-center gap-2">
                       <div className="text-xs font-mono bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5">
                         <Layers className="w-3 h-3" />
                         <span>{completedCount}/{totalCount}</span>
                       </div>
                     </div>
                  )}

                  <div className={`text-[10px] md:text-xs font-mono font-medium px-2.5 py-1.5 rounded-md border text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800`}>
                    {text.length.toLocaleString()} chars
                  </div>
                </div>

                {/* Progress Bar */}
                {isBusy && (
                  <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}

                {/* Content Area */}
                <div className="flex-1 relative min-h-0 z-10 group bg-transparent flex flex-col">
                  {chunks.length > 0 ? (
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar scroll-smooth">
                      {chunks.map((chunk) => {
                         const isActive = chunk.id === currentChunkId;
                         return (
                          <div 
                            key={chunk.id}
                            ref={isActive ? activeChunkRef : null}
                            className={`
                              p-3 rounded-lg border transition-all duration-300 text-lg leading-relaxed
                              ${isActive
                                ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-500/50 text-indigo-900 dark:text-indigo-100 shadow-sm scale-[1.01]' 
                                : chunk.status === 'ready' || chunk.status === 'played'
                                  ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                                  : chunk.status === 'error'
                                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30 text-red-800 dark:text-red-200'
                                    : 'opacity-50 border-transparent text-slate-400'
                              }
                            `}
                          >
                            <div className="flex justify-between items-start gap-4">
                               <span>{chunk.text}</span>
                               <div className="shrink-0 mt-1">
                                 {chunk.status === 'generating' && <Loader2 className="w-4 h-4 animate-spin text-amber-500" />}
                                 {chunk.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                 {isActive && <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />}
                               </div>
                            </div>
                            {chunk.error && <div className="text-xs text-red-500 mt-2 font-mono">{chunk.error}</div>}
                          </div>
                        );
                      })}
                      <div className="h-20" />
                    </div>
                  ) : (
                    <div
                      ref={editorRef}
                      contentEditable={true}
                      onInput={handleInput}
                      data-placeholder="Enter or paste your text here..."
                      className="rich-text-editor w-full h-full p-6 text-base md:text-lg leading-loose text-slate-800 dark:text-slate-200 focus:outline-none custom-scrollbar"
                      suppressContentEditableWarning={true}
                    />
                  )}
                </div>

                {/* Footer Controls */}
                <div className="p-4 md:p-6 bg-slate-50/80 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-700/50 flex flex-col gap-4 z-20 shrink-0 backdrop-blur-md">
                  
                  {error && (
                     <div className="flex items-center justify-between text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-100 dark:border-red-800 mb-2">
                       <span>{error}</span>
                     </div>
                  )}

                  <div className="flex flex-col md:flex-row items-center gap-4">
                    
                    {isBusy ? (
                      <div className="flex-1 w-full flex items-center gap-4 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                         <button
                           onClick={togglePlayPause}
                           className="w-12 h-12 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all active:scale-95"
                         >
                           {status === TTSStatus.PLAYING ? (
                             <Pause className="w-5 h-5 fill-current" />
                           ) : (
                             <Play className="w-5 h-5 fill-current ml-0.5" />
                           )}
                         </button>

                         <div className="flex-1 flex flex-col justify-center gap-1">
                           <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                              {status === TTSStatus.PAUSED ? 'Paused' : status === TTSStatus.PREPARING ? 'Preparing...' : 'Streaming Playback'}
                           </div>
                           <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                             {completedCount} segments ready
                           </div>
                         </div>

                         <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2" />
                         
                         <button 
                           onClick={() => actions.stop()}
                           className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                           title="Stop & Clear"
                         >
                           <StopCircle className="w-5 h-5" />
                         </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleGenerate}
                        disabled={!text.trim()}
                        className={`
                          w-full flex-1 px-8 py-4 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-3 transition-all transform
                          ${!text.trim()
                            ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed opacity-70 shadow-none' 
                            : 'bg-indigo-600 hover:bg-indigo-500 hover:scale-[1.01] active:scale-[0.99] shadow-indigo-500/20'
                          }
                        `}
                      >
                        <Play className="w-5 h-5 fill-current" />
                        <span className="text-lg">Generate Audio</span>
                      </button>
                    )}

                    {completedCount > 0 && (
                      <button 
                        onClick={handleDownload}
                        className="px-5 py-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 text-slate-700 dark:text-slate-200 font-semibold shadow-sm hover:shadow-md transition-all flex items-center gap-2"
                      >
                        <Download className="w-5 h-5" />
                        <span className="hidden md:inline">Download Full WAV</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>

        {/* Mobile Settings Drawer would go here (omitted for brevity as it was unchanged) */}
        {isMobileSettingsOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex flex-col animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMobileSettingsOpen(false)} />
            <div className="relative bg-slate-50 dark:bg-slate-900 h-[90%] mt-auto rounded-t-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                <div className="w-full flex justify-center pt-3 pb-1" onClick={() => setIsMobileSettingsOpen(false)}>
                  <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
                </div>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Settings2 className="w-5 h-5 text-indigo-500" />
                      Studio Settings
                  </h2>
                  <button onClick={() => setIsMobileSettingsOpen(false)} className="p-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 hover:bg-slate-300">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 p-6 space-y-6">
                  <VoiceSelector 
                    voices={VOICES} 
                    selectedVoice={selectedVoice} 
                    onSelect={setSelectedVoice}
                    disabled={isBusy} 
                  />
                  <div className="h-px bg-slate-200 dark:bg-slate-800" />
                  <StylePresets 
                    presets={PRESETS} 
                    onSelect={setInstruction}
                    disabled={isBusy}
                  />
                </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}