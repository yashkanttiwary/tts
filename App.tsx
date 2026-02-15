
import React, { useState, useRef, useEffect } from 'react';
import { Play, Loader2, AlertCircle, Wand2, RefreshCcw, Sun, Moon, Sparkles, Key, Check, Download, Gauge, Volume2, StopCircle, Clock, Pause, PlayCircle, Save, Layers, Zap, FastForward } from 'lucide-react';
import { VoiceOption, PresetOption, TTSStatus } from './types';
import { generateSpeechFromText } from './services/geminiService';
import { pcmToWav, base64ToUint8Array, mergeBuffers, convertInt16ToFloat32 } from './utils/audioUtils';
import VoiceSelector from './components/VoiceSelector';
import StylePresets from './components/StylePresets';
import LanguageSelector from './components/LanguageSelector';
import ApiKeyModal from './components/ApiKeyModal';

// STRATEGY 1: Increase Chunk Size to reduce request frequency
const MAX_CHARS = 500000;
const CHUNK_SIZE = 3000; 

// STRATEGY 4: Hardcoded Request Limit
const MAX_RPM_PER_KEY = 9; 
const RATE_WINDOW_MS = 60000; // 1 Minute

const VOICES: VoiceOption[] = [
  { name: 'Puck', gender: 'Male', style: 'Upbeat & Playful', description: 'Great for storytelling and lively content.' },
  { name: 'Kore', gender: 'Female', style: 'Firm & Clear', description: 'Excellent for educational and instructional content.' },
  { name: 'Charon', gender: 'Male', style: 'Deep & Authoritative', description: 'Perfect for news, announcements, and serious topics.' },
  { name: 'Fenrir', gender: 'Male', style: 'Fast & Energetic', description: 'Ideal for gaming, hype, and high-energy narration.' },
  { name: 'Aoede', gender: 'Female', style: 'Warm & Breezy', description: 'Good for podcasts, blogs, and casual conversation.' },
];

const PRESETS: PresetOption[] = [
  { label: 'YouTuber (Default)', prompt: 'Great storyteller, perfect YouTuber delivering the narratives as they land most effectively with sometimes high-pitched, low-pitched modulations, as for perfect timings' },
  { label: 'Storyteller', prompt: 'Read this slowly and dramatically, emphasizing the emotions:' },
  { label: 'News Anchor', prompt: 'Read this in a professional, neutral, and fast-paced broadcast tone:' },
  { label: 'Excited', prompt: 'Say this with extreme excitement and high energy, almost shouting with joy:' },
  { label: 'Whisper', prompt: 'Whisper this very quietly, intimately, and secretively:' },
];

function splitTextIdeally(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let currentText = text;
  while (currentText.length > 0) {
    if (currentText.length <= maxLength) {
      chunks.push(currentText);
      break;
    }
    let splitIndex = -1;
    const sentenceEndings = ['. ', '! ', '? ', '.\n', '!\n', '?\n', '." ', '!" ', '?" '];
    for (let i = maxLength; i > maxLength * 0.8; i--) {
        const char = currentText[i];
        if (char === '\n' && currentText[i-1] === '\n') { splitIndex = i; break; }
        if (sentenceEndings.some(end => currentText.substring(i - 1, i + end.length - 1) === end)) { splitIndex = i + 1; break; }
    }
    if (splitIndex === -1) splitIndex = currentText.lastIndexOf(' ', maxLength);
    if (splitIndex === -1) splitIndex = maxLength;
    chunks.push(currentText.substring(0, splitIndex).trim());
    currentText = currentText.substring(splitIndex).trim();
  }
  return chunks;
}

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // API Key State
  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const apiKeysRef = useRef<string[]>([]);
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);

  // Rate Limiting History Ref
  const requestHistoryRef = useRef<Record<string, number[]>>({});
  
  // Active Key Tracking
  const [activeKeyIndex, setActiveKeyIndex] = useState<number | null>(null);
  const activeKeyRef = useRef<string | null>(null);

  // Content State
  const [text, setText] = useState('Welcome to the Gemini Voice Studio. I can transform any text into lifelike speech.\n\nSelect Hindi from the menu to hear me speak in a native Indian accent. I will highlight the text as I read it.');
  
  const [instruction, setInstruction] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Puck');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  
  // Generation State
  const [status, setStatus] = useState<TTSStatus>(TTSStatus.IDLE);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Timeline & Buffer State
  const [progress, setProgress] = useState(0); 
  const [processedChunks, setProcessedChunks] = useState(0);
  const [totalChunksCount, setTotalChunksCount] = useState(0);
  const pcmChunksRef = useRef<Uint8Array[]>([]);

  // Playback State
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [livePreview, setLivePreview] = useState(true);
  const [isPreviewPaused, setIsPreviewPaused] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextAudioStartTimeRef = useRef<number>(0);

  // Load API keys
  useEffect(() => {
    const storedKeys = localStorage.getItem('gemini_api_keys');
    if (storedKeys) {
      try {
        const parsed = JSON.parse(storedKeys);
        if (Array.isArray(parsed)) {
          setApiKeys(parsed);
          apiKeysRef.current = parsed;
        }
      } catch (e) { console.error("Error loading keys", e); }
    }
  }, []);

  useEffect(() => {
    return () => { 
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [audioUrl]);

  useEffect(() => {
     if (audioRef.current) {
       audioRef.current.playbackRate = playbackRate;
     }
  }, [playbackRate]);

  useEffect(() => {
    if (editorRef.current && text && editorRef.current.innerText === '') {
      editorRef.current.innerText = text;
    }
  }, []);

  const handleInput = () => {
    if (editorRef.current) {
      setText(editorRef.current.innerText);
    }
  };

  const handleSaveApiKeys = (keysString: string) => {
    const keys = keysString.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
    setApiKeys(keys);
    apiKeysRef.current = keys;
    localStorage.setItem('gemini_api_keys', JSON.stringify(keys));
  };

  const handleDisconnectApiKey = () => {
    setApiKeys([]);
    apiKeysRef.current = [];
    localStorage.removeItem('gemini_api_keys');
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `gemini-speech-${Date.now()}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPartial = () => {
    if (pcmChunksRef.current.length === 0) return;
    try {
      const mergedPcm = mergeBuffers(pcmChunksRef.current);
      const wavBuffer = pcmToWav(mergedPcm.buffer);
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gemini-speech-partial-${processedChunks}-chunks.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to download partial audio", e);
    }
  };

  // --- SMART KEY POOL LOGIC ---
  
  const getKeyStatus = (key: string, now: number) => {
    if (!requestHistoryRef.current[key]) {
      requestHistoryRef.current[key] = [];
    }
    // Clean up old timestamps
    requestHistoryRef.current[key] = requestHistoryRef.current[key].filter(
      timestamp => now - timestamp < RATE_WINDOW_MS
    );
    const history = requestHistoryRef.current[key];
    const count = history.length;
    let waitTime = 0;
    if (count >= MAX_RPM_PER_KEY) {
      const oldestRequestTime = history[0];
      const timeSinceOldest = now - oldestRequestTime;
      const needed = RATE_WINDOW_MS - timeSinceOldest + 1000;
      waitTime = Math.max(0, needed);
    }
    return { key, waitTime, count };
  };

  const getBestKey = () => {
     const keys = apiKeysRef.current;
     if (keys.length === 0) return null;
     
     const now = Date.now();
     const statuses = keys.map(k => getKeyStatus(k, now));

     statuses.sort((a, b) => {
       // 1. Sort by wait time (ascending) - Free keys first
       if (a.waitTime !== b.waitTime) return a.waitTime - b.waitTime;
       // 2. Sort by usage count (ascending) - Load balancing
       return a.count - b.count;
     });
     
     return statuses[0];
  };

  const recordKeyUsage = (key: string) => {
    if (!requestHistoryRef.current[key]) requestHistoryRef.current[key] = [];
    requestHistoryRef.current[key].push(Date.now());
  };

  const handleSkipKey = () => {
    const currentKey = activeKeyRef.current;
    if (!currentKey) return;

    // Artificially fill the history for this key to force a cooldown
    if (!requestHistoryRef.current[currentKey]) requestHistoryRef.current[currentKey] = [];
    
    const now = Date.now();
    const needed = MAX_RPM_PER_KEY - requestHistoryRef.current[currentKey].length;
    
    // Add enough fake timestamps to max it out + 1 to be safe
    // This effectively "bans" the key for 1 minute
    for (let i = 0; i <= needed + 1; i++) {
        requestHistoryRef.current[currentKey].push(now);
    }
    
    setProgressMessage(`Skipping Key ${apiKeysRef.current.indexOf(currentKey) + 1}... switching...`);
    // Note: The service will automatically pick the NEW best key on its next internal retry or chunk
    // because we supply a provider function (getBestKey) instead of a static key.
  };

  // --- LIVE PREVIEW LOGIC ---
  const initAudioContext = () => {
    if (!livePreview) return;
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
        nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
      } else if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      setIsPreviewPaused(false);
    } catch (e) {
      console.warn("Web Audio API error:", e);
    }
  };

  const playChunkLive = (pcmData: Uint8Array) => {
    if (!audioContextRef.current || !livePreview) return;
    try {
      const ctx = audioContextRef.current;
      const float32Data = convertInt16ToFloat32(pcmData);
      const buffer = ctx.createBuffer(1, float32Data.length, 24000);
      buffer.getChannelData(0).set(float32Data);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      const startTime = Math.max(ctx.currentTime, nextAudioStartTimeRef.current);
      source.start(startTime);
      nextAudioStartTimeRef.current = startTime + buffer.duration;
    } catch (e) {
      console.warn("Live preview scheduling error:", e);
    }
  };

  const togglePreviewPause = () => {
    if (!audioContextRef.current) return;
    if (audioContextRef.current.state === 'running') {
      audioContextRef.current.suspend();
      setIsPreviewPaused(true);
    } else if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
      setIsPreviewPaused(false);
    }
  };

  const handleGenerate = async () => {
    let keysToUse = apiKeysRef.current;
    if (keysToUse.length === 0) {
      setIsApiModalOpen(true);
      return;
    }

    const currentText = editorRef.current?.innerText || text;
    if (!currentText.trim()) return;

    setStatus(TTSStatus.GENERATING);
    setError('');
    setProgress(0);
    setProcessedChunks(0);
    setActiveKeyIndex(null);
    activeKeyRef.current = null;
    pcmChunksRef.current = []; 
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);

    initAudioContext();
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const chunks = splitTextIdeally(currentText, CHUNK_SIZE);
      setTotalChunksCount(chunks.length);

      // --- KEY PROVIDER FUNCTION ---
      // This is the Magic Fix. Instead of passing a static key, we pass a function.
      // The service calls this function EVERY time it tries (or retries) to make a request.
      // This allows 'handleSkipKey' to work instantly because the very next retry will
      // call this, get the NEW best key, and use it.
      const dynamicKeyProvider = () => {
        const best = getBestKey();
        if (!best) throw new Error("No keys available");
        
        // Update UI state synchronously for user feedback
        // (Note: setState inside a loop/callback is fine, React batches or handles it)
        const idx = apiKeysRef.current.indexOf(best.key);
        if (idx !== -1) {
          // We only update if it changed to avoid flicker
          if (activeKeyRef.current !== best.key) {
             activeKeyRef.current = best.key;
             setActiveKeyIndex(idx + 1);
          }
        }
        
        // Record usage here because we are about to use it
        recordKeyUsage(best.key);
        
        return best.key;
      };

      for (let i = 0; i < chunks.length; i++) {
        if (controller.signal.aborted) throw new Error("Generation cancelled.");

        // Initial check before starting the chunk (just for waiting logic)
        // We do this to provide a nice "Cooling down" UI if ALL keys are busy.
        // The actual key used is determined by the provider passed to generateSpeechFromText.
        let bestKeyData = getBestKey();
        if (!bestKeyData) throw new Error("No API keys available.");
        
        // If the BEST key has a wait time, it means ALL keys are busy (since we sort by waitTime).
        if (bestKeyData.waitTime > 0) {
           const seconds = Math.ceil(bestKeyData.waitTime / 1000);
           for (let w = seconds; w > 0; w--) {
             if (controller.signal.aborted) throw new Error("Cancelled.");
             
             // Check if a better key appeared (user added one, or user skipped and we cycled to a fresh one?)
             // Actually if user skips, the current key waitTime goes UP, so we might switch to another key which might be free.
             const freshCheck = getBestKey();
             if (freshCheck && freshCheck.waitTime === 0) {
                 break; // Found a free key, stop waiting!
             }

             // Show which key is causing the hold up (the one with shortest wait)
             const holdUpIndex = apiKeysRef.current.indexOf(bestKeyData.key) + 1;
             setProgressMessage(`All keys busy. Cooling down: ${w}s... (Waiting on Key ${holdUpIndex})`);
             await new Promise(r => setTimeout(r, 1000));
           }
        }
        
        setProgressMessage(`Rendering segment ${i + 1} of ${chunks.length}`);

        const previousContext = i > 0 ? chunks[i-1].slice(-200) : undefined;

        // We pass the PROVIDER, not the key string.
        const base64Audio = await generateSpeechFromText({
          text: chunks[i],
          instruction,
          voice: selectedVoice,
          language: selectedLanguage,
          previousContext: previousContext,
        }, dynamicKeyProvider, (statusMsg) => {
           if (statusMsg.includes('limit') || statusMsg.includes('Cooling') || statusMsg.includes('Verifying')) {
             setProgressMessage(statusMsg);
           }
        });

        if (controller.signal.aborted) throw new Error("Cancelled.");

        const pcmData = base64ToUint8Array(base64Audio);
        pcmChunksRef.current.push(pcmData);
        
        if (livePreview) playChunkLive(pcmData);

        setProcessedChunks(i + 1);
        setProgress(((i + 1) / chunks.length) * 100);
      }

      setProgressMessage('Finalizing audio...');
      const mergedPcm = mergeBuffers(pcmChunksRef.current);
      const wavBuffer = pcmToWav(mergedPcm.buffer);
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      
      setAudioUrl(url);
      setStatus(TTSStatus.SUCCESS);
      setProgressMessage('');
      setActiveKeyIndex(null);

    } catch (err: any) {
      if (err.message === "Cancelled." || err.message.includes("cancelled")) {
        setStatus(TTSStatus.IDLE);
        setProgressMessage('Stopped by user.');
      } else {
        setError(err.message || "An unexpected error occurred.");
        setStatus(TTSStatus.ERROR);
        setProgressMessage('');
      }
      setActiveKeyIndex(null);
    } finally {
      setAbortController(null);
    }
  };

  const handleStop = () => {
    if (abortController) abortController.abort();
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setStatus(TTSStatus.IDLE);
    setProgressMessage('Stopped.');
    setActiveKeyIndex(null);
  };

  const isGenerating = status === TTSStatus.GENERATING;
  const isRateLimit = progressMessage.toLowerCase().includes('cooling') || progressMessage.toLowerCase().includes('limit');
  const keyCount = apiKeys.length;

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-800 dark:selection:text-indigo-200 transition-colors duration-300">
        
        {/* Background Gradients */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/40 dark:bg-indigo-900/10 blur-[100px] transition-colors duration-500"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-200/40 dark:bg-purple-900/10 blur-[100px] transition-colors duration-500"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 py-6 md:py-10 space-y-8 flex flex-col h-screen md:h-auto">
          
          {/* Header */}
          <header className="flex flex-col md:flex-row items-center justify-between gap-6 pb-2">
            <div className="text-center md:text-left space-y-2">
              <div className="inline-flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur border border-slate-200 dark:border-slate-700/50 px-3 py-1 rounded-full text-xs font-semibold text-indigo-600 dark:text-indigo-300 shadow-sm">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Gemini 2.5 Flash TTS</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Gemini Voice Studio
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base max-w-lg">
                Create cohesive long-form speech using Smart Context.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsApiModalOpen(true)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all shadow-sm
                  ${keyCount > 0 
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-slate-600'
                  }
                  ${isGenerating && isRateLimit ? 'animate-pulse ring-2 ring-amber-400 border-amber-400' : ''}
                `}
              >
                {keyCount > 0 ? (keyCount > 1 ? <Layers className="w-4 h-4" /> : <Check className="w-4 h-4" />) : <Key className="w-4 h-4" />}
                <span>
                  {keyCount > 0 
                    ? (isRateLimit ? 'Add More Keys' : `${keyCount} Key${keyCount > 1 ? 's' : ''} Active`) 
                    : 'Connect API'}
                </span>
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

          <main className="grid lg:grid-cols-12 gap-6 lg:h-[750px] min-h-0">
            
            {/* Sidebar: Controls */}
            <aside className="lg:col-span-4 flex flex-col gap-4 min-h-0">
              <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6 shadow-sm dark:shadow-xl overflow-y-auto flex-1 custom-scrollbar">
                
                <LanguageSelector 
                  selectedLanguage={selectedLanguage}
                  onSelect={setSelectedLanguage}
                  disabled={isGenerating}
                />
                <div className="h-px bg-slate-200 dark:bg-slate-800 my-6" />

                <VoiceSelector 
                  voices={VOICES} 
                  selectedVoice={selectedVoice} 
                  onSelect={setSelectedVoice}
                  disabled={isGenerating} 
                />
                <div className="h-px bg-slate-200 dark:bg-slate-800 my-6" />
                <StylePresets 
                  presets={PRESETS} 
                  onSelect={setInstruction}
                  disabled={isGenerating}
                />
              </div>
              
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-500/10 rounded-xl p-4 flex gap-3 items-start shrink-0">
                 <div className="bg-indigo-100 dark:bg-indigo-500/20 p-2 rounded-lg shrink-0">
                   <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                 </div>
                 <div>
                   <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 mb-1">Smart Key Pool</h3>
                   <p className="text-xs text-indigo-700/80 dark:text-indigo-300/70 leading-relaxed">
                     We balance load across all available keys. Hit "Skip" if a key gets stuck cooling down to force a rotation.
                   </p>
                 </div>
              </div>
            </aside>

            {/* Main Content: Editor & Player */}
            <section className="lg:col-span-8 flex flex-col min-h-[500px]">
              <div className="bg-white/90 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-2xl shadow-lg dark:shadow-2xl flex flex-col h-full overflow-hidden transition-all">
                
                {/* Toolbar */}
                <div className="flex items-center gap-3 p-3 border-b border-slate-200 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 z-20 shrink-0">
                  <div className="flex-1">
                     <input 
                        type="text"
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        placeholder="Style Direction (e.g. 'Whisper urgently...')"
                        disabled={isGenerating}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all shadow-sm"
                     />
                  </div>
                  
                  {/* Live Preview Toggle */}
                  <button
                    onClick={() => setLivePreview(!livePreview)}
                    disabled={isGenerating}
                    className={`
                       flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all
                       ${livePreview 
                          ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300' 
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                       }
                    `}
                    title="Play audio chunks as soon as they are generated"
                  >
                    <Volume2 className={`w-3.5 h-3.5 ${livePreview ? 'animate-pulse' : ''}`} />
                    <span className="hidden sm:inline">Live Preview</span>
                  </button>
                </div>

                {/* Editor */}
                <div className="flex-1 relative min-h-0 z-10 group bg-transparent">
                  <div
                    ref={editorRef}
                    contentEditable={!isGenerating}
                    onInput={handleInput}
                    data-placeholder="Enter or paste your text here..."
                    className="rich-text-editor w-full h-full p-6 text-base md:text-lg leading-loose text-slate-800 dark:text-slate-200 focus:outline-none custom-scrollbar"
                    suppressContentEditableWarning={true}
                  />
                  
                  {/* Generation Overlay / Processing State */}
                  {isGenerating && (
                    <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center pointer-events-none">
                      {/* We leave pointer events on buttons in the overlay if we add specific controls, but here we just show status */}
                    </div>
                  )}
                </div>

                {/* TIMELINE / PROGRESS BAR */}
                {isGenerating && (
                  <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-6 py-4 z-30">
                     <div className="flex items-center justify-between mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                           <span>Progress</span>
                           {activeKeyIndex !== null && (
                             <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] animate-in fade-in">
                               Using Key {activeKeyIndex}
                             </span>
                           )}
                        </div>
                        <span>{Math.round(progress)}% Complete</span>
                     </div>
                     <div className="relative h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                           className="absolute top-0 left-0 h-full bg-indigo-500 transition-all duration-300 ease-out"
                           style={{ width: `${progress}%` }}
                        />
                     </div>
                     <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                           Segment {processedChunks + 1} / {totalChunksCount}
                        </span>
                        
                        {/* Status Message & Skip */}
                        <div className="flex items-center gap-3">
                           {isRateLimit ? (
                             <span className="text-xs text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                               <Clock className="w-3 h-3" /> {progressMessage}
                             </span>
                           ) : (
                             <span className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                               <Loader2 className="w-3 h-3 animate-spin" /> {progressMessage || 'Rendering...'}
                             </span>
                           )}

                           {keyCount > 1 && (
                             <button
                               onClick={handleSkipKey}
                               className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:border-amber-300 hover:text-amber-600 transition-all flex items-center gap-1 pointer-events-auto shadow-sm"
                               title="Force switch to another API key"
                             >
                               <FastForward className="w-3 h-3" /> Skip Key
                             </button>
                           )}
                        </div>
                     </div>
                  </div>
                )}

                {/* Error Banner */}
                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border-y border-red-200 dark:border-red-900/30 px-6 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in z-20 shrink-0">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</p>
                    <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700 dark:hover:text-red-200 text-sm font-medium">
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Action Bar */}
                <div className="p-4 md:p-6 bg-slate-50/80 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-700/50 flex flex-col md:flex-row items-center gap-4 md:gap-6 z-20 shrink-0">
                  
                  {/* Player Interface */}
                  <div className={`flex-1 w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all overflow-hidden ${status === TTSStatus.SUCCESS ? 'p-0' : 'p-2 flex items-center min-h-[56px]'}`}>
                    {status === TTSStatus.SUCCESS && audioUrl ? (
                      <div className="w-full flex flex-col">
                        <audio 
                          ref={audioRef}
                          controls 
                          src={audioUrl} 
                          className="w-full h-12 block focus:outline-none" 
                        />
                        <div className="flex items-center justify-between px-4 py-2 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
                          <button 
                            onClick={handleDownload}
                            className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" /> Download Full Audio
                          </button>
                        </div>
                      </div>
                    ) : isGenerating ? (
                      // GENERATING STATE CONTROLS
                      <div className="w-full flex items-center justify-between px-4">
                         <div className="flex items-center gap-3">
                           {livePreview && (
                              <button 
                                onClick={togglePreviewPause}
                                className={`
                                  flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all
                                  ${isPreviewPaused
                                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 text-amber-700 dark:text-amber-400'
                                    : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 text-indigo-700 dark:text-indigo-400 animate-pulse'
                                  }
                                `}
                              >
                                {isPreviewPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
                                <span>{isPreviewPaused ? 'Resume Preview' : 'Live Preview'}</span>
                              </button>
                           )}
                           
                           {processedChunks > 0 && (
                             <button
                               onClick={handleDownloadPartial}
                               className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-xs font-bold uppercase tracking-wider hover:bg-green-100 transition-all"
                               title="Download what has been generated so far"
                             >
                               <Save className="w-3.5 h-3.5" />
                               <span>Save So Far</span>
                             </button>
                           )}
                         </div>
                         
                         <button 
                            onClick={handleStop}
                            className="flex items-center gap-2 text-xs font-bold text-red-500 hover:text-red-700 px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                         >
                           <StopCircle className="w-4 h-4" />
                           <span>Cancel</span>
                         </button>
                      </div>
                    ) : (
                      <div className="w-full text-center text-sm text-slate-500 italic">
                        Ready to generate high-quality speech
                      </div>
                    )}
                  </div>

                  {/* Generate Button (Hidden when generating to show Stop/Pause instead) */}
                  {!isGenerating && (
                    <button
                      onClick={handleGenerate}
                      disabled={!text.trim()}
                      className={`
                        w-full md:w-auto px-8 py-3.5 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2.5 transition-all transform
                        ${!text.trim()
                          ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed opacity-70 shadow-none' 
                          : 'bg-indigo-600 hover:bg-indigo-500 dark:bg-gradient-to-r dark:from-indigo-600 dark:to-purple-600 dark:hover:from-indigo-500 dark:hover:to-purple-500 hover:scale-[1.02] active:scale-[0.98] shadow-indigo-500/20'
                        }
                      `}
                    >
                      {status === TTSStatus.SUCCESS ? <RefreshCcw className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                      <span>{status === TTSStatus.SUCCESS ? 'Regenerate' : 'Generate'}</span>
                    </button>
                  )}
                </div>
              </div>
            </section>
          </main>
          
          <ApiKeyModal 
            isOpen={isApiModalOpen}
            onClose={() => setIsApiModalOpen(false)}
            onSave={handleSaveApiKeys}
            onDisconnect={handleDisconnectApiKey}
            hasKey={keyCount > 0}
          />
        </div>
      </div>
    </div>
  );
}
