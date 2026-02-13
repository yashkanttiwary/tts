import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, Loader2, AlertCircle, Sun, Moon, Sparkles, Download, Layers, StopCircle, XCircle, Settings2, X, Key } from 'lucide-react';
import { VoiceOption, PresetOption, TTSStatus, AudioChunk } from './types';
import { generateSpeechFromText } from './services/geminiService';
import { pcmToWav, base64ToUint8Array, mergeBuffers, convertInt16ToFloat32 } from './utils/audioUtils';
import VoiceSelector from './components/VoiceSelector';
import StylePresets from './components/StylePresets';
import LanguageSelector from './components/LanguageSelector';
import ApiKeyModal from './components/ApiKeyModal';

// Increased limit significantly as we now stream chunks
const MAX_CHARS = 1000000; 
// Target size for each request (approx 1-2 paragraphs) for optimal streaming speed vs rate limits
const IDEAL_CHUNK_SIZE = 400; 

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

// Advanced splitter that respects sentence boundaries for natural pauses
function smartSplitText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining.trim());
      break;
    }

    // Try to split at paragraph
    let splitIndex = -1;
    const searchBuffer = remaining.substring(0, maxLength);
    
    // Priority 1: Double Newlines (Paragraphs)
    let candidate = searchBuffer.lastIndexOf('\n\n');
    if (candidate > maxLength * 0.3) splitIndex = candidate + 2;

    // Priority 2: Sentence endings (. ! ?)
    if (splitIndex === -1) {
       const sentenceMatches = [...searchBuffer.matchAll(/[.!?]\s/g)];
       if (sentenceMatches.length > 0) {
          const lastMatch = sentenceMatches[sentenceMatches.length - 1];
          if (lastMatch.index && lastMatch.index > maxLength * 0.3) {
             splitIndex = lastMatch.index + lastMatch[0].length;
          }
       }
    }

    // Priority 3: Commas or semicols (Soft pauses)
    if (splitIndex === -1) {
       candidate = Math.max(searchBuffer.lastIndexOf(', '), searchBuffer.lastIndexOf('; '));
       if (candidate > maxLength * 0.3) splitIndex = candidate + 2;
    }

    // Priority 4: Spaces
    if (splitIndex === -1) {
       splitIndex = searchBuffer.lastIndexOf(' ');
    }

    // Fallback: Hard cut
    if (splitIndex === -1) splitIndex = maxLength;

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }
  
  return chunks.filter(c => c.length > 0);
}

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

  // Content State
  const [text, setText] = useState('Welcome to the Gemini Voice Studio. I can transform any text into lifelike speech. Select Hindi from the menu to hear me speak in a native Indian accent.');
  const [instruction, setInstruction] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Puck');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  
  // Queue & Playback State
  const [chunks, setChunks] = useState<AudioChunk[]>([]);
  const [status, setStatus] = useState<TTSStatus>(TTSStatus.IDLE);
  const [playingChunkId, setPlayingChunkId] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [error, setError] = useState('');
  
  // Refs
  const editorRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const schedulerTimerRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  
  // Load Audio Context
  useEffect(() => {
    // Initialize Audio Context on user interaction usually, but here we prep ref
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  // Editor Sync
  useEffect(() => {
    if (editorRef.current && text && editorRef.current.innerText === '') {
      editorRef.current.innerText = text;
    }
  }, []); // Run once on mount

  const handleInput = () => {
    if (editorRef.current) setText(editorRef.current.innerText);
  };

  const stopPlayback = () => {
    // Stop API generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Stop Audio
    if (audioContextRef.current) {
      audioContextRef.current.close().then(() => {
         const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
         audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      });
    }
    if (schedulerTimerRef.current) {
      window.clearInterval(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
    
    setStatus(TTSStatus.IDLE);
    setPlayingChunkId(null);
    isPlayingRef.current = false;
  };

  const handleReset = () => {
    stopPlayback();
    setChunks([]);
    setError('');
  };

  // --- Core Logic: Generator Loop ---
  // This effect watches the chunks. If there is a PENDING chunk and we are processing, it fetches it.
  useEffect(() => {
    const processNextChunk = async () => {
      if (status !== TTSStatus.PROCESSING && status !== TTSStatus.PLAYING) return;
      
      const pendingIndex = chunks.findIndex(c => c.status === 'pending');
      if (pendingIndex === -1) {
        // All done processing?
        if (chunks.every(c => c.status === 'ready' || c.status === 'error')) {
          // If we aren't playing, we are completely done. 
          // If we ARE playing, the play loop will handle setting COMPLETED status when audio ends.
        }
        return;
      }

      const chunk = chunks[pendingIndex];
      
      // Update status to generating
      setChunks(prev => prev.map((c, i) => i === pendingIndex ? { ...c, status: 'generating' } : c));

      try {
        const base64Audio = await generateSpeechFromText({
          text: chunk.text,
          instruction,
          voice: selectedVoice,
          language: selectedLanguage
        }, apiKey);

        const rawPcm = base64ToUint8Array(base64Audio);
        const audioFloat32 = convertInt16ToFloat32(rawPcm);
        
        // Calculate duration: samples / sampleRate (24000)
        const duration = audioFloat32.length / 24000;

        setChunks(prev => prev.map((c, i) => 
          i === pendingIndex 
            ? { ...c, status: 'ready', rawPcm, audioData: audioFloat32, duration } 
            : c
        ));

      } catch (err: any) {
        console.error("Chunk failed", err);
        setChunks(prev => prev.map((c, i) => 
          i === pendingIndex 
            ? { ...c, status: 'error', error: err.message || "Failed to generate" } 
            : c
        ));
        
        // Pause processing on error so user can see it
        setStatus(TTSStatus.PAUSED); 
        
        // UX Enhancement: If it's an API Key error, open the modal automatically
        if (err.message && (err.message.includes("API Key") || err.message.includes("403"))) {
           setIsApiKeyModalOpen(true);
        }
      }
    };

    processNextChunk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks, status]); // Re-run when chunks change (one finishes) or status changes (resume)


  // --- Core Logic: Audio Player ---
  // Simple queue watcher that schedules chunks one by one using onended
  useEffect(() => {
    if (status !== TTSStatus.PLAYING && status !== TTSStatus.PROCESSING) {
       // Paused or Idle, pause context?
       if (audioContextRef.current?.state === 'running') {
         audioContextRef.current.suspend();
       }
       return;
    }

    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }

    const scheduleNext = () => {
      const ctx = audioContextRef.current;
      if (!ctx) return;

      // Determine next chunk index
      let nextIndex = 0;
      if (playingChunkId) {
        const currentIdx = chunks.findIndex(c => c.id === playingChunkId);
        if (currentIdx !== -1) nextIndex = currentIdx + 1;
      }

      if (nextIndex >= chunks.length) {
         // Check if we are totally done
         if (status === TTSStatus.PROCESSING) {
            // Still waiting for generation
            return;
         }
         // All done
         setStatus(TTSStatus.COMPLETED);
         setPlayingChunkId(null);
         return;
      }

      const nextChunk = chunks[nextIndex];

      if (nextChunk.status === 'ready' && nextChunk.audioData) {
        // Prepare Source
        const buffer = ctx.createBuffer(1, nextChunk.audioData.length, 24000);
        buffer.getChannelData(0).set(nextChunk.audioData);
        
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;
        source.connect(ctx.destination);
        
        source.onended = () => {
           // Trigger next
           if (isPlayingRef.current) {
              // Wait a tick to ensure state updates don't clash
              setTimeout(scheduleNext, 0); 
           }
        };

        setPlayingChunkId(nextChunk.id);
        source.start(0);
        isPlayingRef.current = true;
      } else if (nextChunk.status === 'error') {
         // Skip error chunks
         setPlayingChunkId(nextChunk.id); // Mark as passed
         setTimeout(scheduleNext, 100);
      } else {
         // Next chunk not ready yet. 
         // We wait. The effect dependency on [chunks] will re-trigger this when chunk becomes ready.
      }
    };
    
    // Trigger if we aren't playing anything
    if (!isPlayingRef.current && playingChunkId === null && chunks.length > 0) {
       scheduleNext();
    } 
    // Trigger if we are stuck waiting (chunk just became ready)
    else if (isPlayingRef.current && playingChunkId) {
       const currentIdx = chunks.findIndex(c => c.id === playingChunkId);
       const nextChunk = chunks[currentIdx + 1];
       if (nextChunk && nextChunk.status === 'ready' && !isPlayingRef.current) {
         scheduleNext();
       }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks, status, playbackRate]);


  // --- Handlers ---

  const handleGenerate = async () => {
    if (!apiKey) {
      setIsApiKeyModalOpen(true);
      return;
    }

    const currentText = editorRef.current?.innerText || text;
    if (!currentText.trim()) return;

    handleReset();
    setError('');

    // 1. Split Text
    const textSegments = smartSplitText(currentText, IDEAL_CHUNK_SIZE);
    
    // 2. Initialize Queue
    const newChunks: AudioChunk[] = textSegments.map((seg, i) => ({
      id: `chunk-${Date.now()}-${i}`,
      text: seg,
      status: 'pending'
    }));
    
    setChunks(newChunks);
    setStatus(TTSStatus.PROCESSING);
    isPlayingRef.current = false;
    
    // Initialize Audio Context if needed
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  };

  const togglePlayPause = () => {
    if (status === TTSStatus.PLAYING || status === TTSStatus.PROCESSING) {
      setStatus(TTSStatus.PAUSED);
      audioContextRef.current?.suspend();
      isPlayingRef.current = false;
    } else if (status === TTSStatus.PAUSED) {
      // Resume
      setStatus(chunks.some(c => c.status === 'pending' || c.status === 'generating') ? TTSStatus.PROCESSING : TTSStatus.PLAYING);
      audioContextRef.current?.resume();
      isPlayingRef.current = true;
    }
  };

  const handleDownloadFull = () => {
    const readyChunks = chunks.filter(c => c.status === 'ready' && c.rawPcm);
    if (readyChunks.length === 0) return;
    
    const buffers = readyChunks.map(c => c.rawPcm!);
    const merged = mergeBuffers(buffers);
    // Cast buffer to ArrayBuffer to fix TS error
    const wav = pcmToWav(merged.buffer as ArrayBuffer);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `gemini-full-speech.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const completedCount = chunks.filter(c => c.status === 'ready').length;
  const totalCount = chunks.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const isGenerating = status === TTSStatus.PROCESSING;

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

        {/* Updated Container Class: min-h-screen instead of h-screen to allow scrolling on mobile */}
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
              {/* Mobile Settings Toggle */}
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
            
            {/* Sidebar: Controls (Hidden on Mobile, Visible on Desktop) */}
            <aside className="hidden lg:col-span-4 lg:flex flex-col gap-4 min-h-0">
              <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6 shadow-sm dark:shadow-xl overflow-y-auto flex-1 custom-scrollbar">
                
                {/* Language Selector Added Here */}
                <LanguageSelector 
                  selectedLanguage={selectedLanguage}
                  onSelect={setSelectedLanguage}
                  disabled={chunks.length > 0}
                />
                <div className="h-px bg-slate-200 dark:bg-slate-800 my-6" />

                <VoiceSelector 
                  voices={VOICES} 
                  selectedVoice={selectedVoice} 
                  onSelect={setSelectedVoice}
                  disabled={chunks.length > 0} // Lock voice while generating
                />
                <div className="h-px bg-slate-200 dark:bg-slate-800 my-6" />
                <StylePresets 
                  presets={PRESETS} 
                  onSelect={setInstruction}
                  disabled={chunks.length > 0}
                />
              </div>
            </aside>

            {/* Mobile Settings Drawer */}
            {isMobileSettingsOpen && (
              <div className="fixed inset-0 z-50 lg:hidden flex flex-col animate-in fade-in duration-200">
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMobileSettingsOpen(false)} />
                
                {/* Drawer Content */}
                <div className="relative bg-slate-50 dark:bg-slate-900 h-[90%] mt-auto rounded-t-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                   {/* Handle bar for visual cue */}
                   <div className="w-full flex justify-center pt-3 pb-1" onClick={() => setIsMobileSettingsOpen(false)}>
                      <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
                   </div>

                   <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                         <Settings2 className="w-5 h-5 text-indigo-500" />
                         Studio Settings
                      </h2>
                      <button 
                        onClick={() => setIsMobileSettingsOpen(false)}
                        className="p-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700"
                      >
                        <X className="w-5 h-5" />
                      </button>
                   </div>
                   
                   <div className="overflow-y-auto flex-1 p-6 space-y-6">
                      <div className="space-y-4">
                        <LanguageSelector 
                          selectedLanguage={selectedLanguage}
                          onSelect={setSelectedLanguage}
                          disabled={chunks.length > 0}
                        />
                      </div>
                      <div className="h-px bg-slate-200 dark:bg-slate-800" />
                      <div className="space-y-4">
                         <VoiceSelector 
                           voices={VOICES} 
                           selectedVoice={selectedVoice} 
                           onSelect={setSelectedVoice}
                           disabled={chunks.length > 0} 
                         />
                      </div>
                      <div className="h-px bg-slate-200 dark:bg-slate-800" />
                      <div className="space-y-4">
                         <StylePresets 
                           presets={PRESETS} 
                           onSelect={setInstruction}
                           disabled={chunks.length > 0}
                         />
                      </div>
                   </div>
                </div>
              </div>
            )}

            {/* Main Content: Editor & Player */}
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
                        disabled={chunks.length > 0}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all shadow-sm"
                     />
                  </div>
                  
                  {/* Status Badges */}
                  {chunks.length > 0 && (
                     <div className="flex items-center gap-2">
                       <div className="text-xs font-mono bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5">
                         <Layers className="w-3 h-3" />
                         <span>{completedCount}/{totalCount} Processed</span>
                       </div>
                       {isGenerating && (
                         <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 animate-pulse px-2">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Streaming...
                         </div>
                       )}
                     </div>
                  )}

                  <div className={`text-[10px] md:text-xs font-mono font-medium px-2.5 py-1.5 rounded-md border 
                    ${text.length > MAX_CHARS 
                      ? 'text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10' 
                      : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'}
                  `}>
                    {text.length.toLocaleString()} chars
                  </div>
                </div>

                {/* Queue Visualization Overlay (Visible when processing) */}
                {chunks.length > 0 && (
                  <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}

                {/* Editor Area */}
                <div className="flex-1 relative min-h-0 z-10 group bg-transparent flex flex-col">
                  {/* If we are processing, show the split text chunks to visualize playback */}
                  {chunks.length > 0 ? (
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar scroll-smooth">
                      {chunks.map((chunk) => (
                        <div 
                          key={chunk.id}
                          className={`
                            p-3 rounded-lg border transition-all duration-300 text-lg leading-relaxed
                            ${chunk.id === playingChunkId 
                              ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-500/50 text-indigo-900 dark:text-indigo-100 shadow-sm scale-[1.01]' 
                              : chunk.status === 'ready'
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
                               {chunk.id === playingChunkId && <Volume2 className="w-4 h-4 text-indigo-500 animate-pulse" />}
                             </div>
                          </div>
                          {chunk.error && <div className="text-xs text-red-500 mt-2 font-mono">{chunk.error}</div>}
                        </div>
                      ))}
                      
                      {/* Spacer for bottom scrolling */}
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

                {/* Controls Area */}
                <div className="p-4 md:p-6 bg-slate-50/80 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-700/50 flex flex-col gap-4 z-20 shrink-0 backdrop-blur-md">
                  
                  {/* Error Message */}
                  {error && (
                     <div className="flex items-center justify-between text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-100 dark:border-red-800 mb-2">
                       <span>{error}</span>
                       <button onClick={() => setError('')}><XCircle className="w-4 h-4" /></button>
                     </div>
                  )}

                  <div className="flex flex-col md:flex-row items-center gap-4">
                    
                    {/* Playback Controls */}
                    {chunks.length > 0 ? (
                      <div className="flex-1 w-full flex items-center gap-4 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                         <button
                           onClick={togglePlayPause}
                           className="w-12 h-12 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all active:scale-95"
                         >
                           {status === TTSStatus.PLAYING || status === TTSStatus.PROCESSING ? (
                             <Pause className="w-5 h-5 fill-current" />
                           ) : (
                             <Play className="w-5 h-5 fill-current ml-0.5" />
                           )}
                         </button>

                         <div className="flex-1 flex flex-col justify-center gap-1">
                           <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                              {status === TTSStatus.COMPLETED ? 'Playback Complete' : status === TTSStatus.PAUSED ? 'Paused' : 'Playing & Streaming...'}
                           </div>
                           <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                             {completedCount} chunks ready
                           </div>
                         </div>

                         <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2" />

                         {/* Playback Rate */}
                         <div className="flex items-center gap-1">
                            {[1, 1.25, 1.5, 2].map(rate => (
                              <button
                                key={rate}
                                onClick={() => setPlaybackRate(rate)}
                                className={`text-[10px] font-bold px-2 py-1 rounded ${playbackRate === rate ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                              >
                                {rate}x
                              </button>
                            ))}
                         </div>
                         
                         <button 
                           onClick={handleReset}
                           className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                           title="Stop & Clear"
                         >
                           <StopCircle className="w-5 h-5" />
                         </button>
                      </div>
                    ) : (
                      /* Initial Generate Button */
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
                        <span className="text-lg">Generate Speech</span>
                      </button>
                    )}

                    {/* Download Button (Only visible if we have data) */}
                    {completedCount > 0 && (
                      <button 
                        onClick={handleDownloadFull}
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
      </div>
    </div>
  );
}