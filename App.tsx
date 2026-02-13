import React, { useState, useRef, useEffect } from 'react';
import { Play, Loader2, AlertCircle, Wand2, RefreshCcw, Sun, Moon, Sparkles, Key, Check, Download, Gauge, Volume2, StopCircle } from 'lucide-react';
import { VoiceOption, PresetOption, TTSStatus } from './types';
import { generateSpeechFromText } from './services/geminiService';
import { pcmToWav, base64ToUint8Array, mergeBuffers, convertInt16ToFloat32 } from './utils/audioUtils';
import VoiceSelector from './components/VoiceSelector';
import StylePresets from './components/StylePresets';
import LanguageSelector from './components/LanguageSelector';
import ApiKeyModal from './components/ApiKeyModal';

// Increased limit for "Book Mode"
const MAX_CHARS = 500000;
const CHUNK_SIZE = 1000; 
// Batch size set to 1 for sequential processing to handle rate limits gracefully
const BATCH_SIZE = 1;    

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
  const [apiKey, setApiKey] = useState('');
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);

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
  
  // Playback State
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [livePreview, setLivePreview] = useState(true);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  
  // Refs for Live Preview (Web Audio API)
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextAudioStartTimeRef = useRef<number>(0);

  // Load API key from local storage on mount
  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) setApiKey(storedKey);
  }, []);

  useEffect(() => {
    return () => { 
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [audioUrl]);

  // Handle auto-play and playback rate application
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      
      // Only auto-play the final stitched audio if we DIDN'T just listen to it live
      // Otherwise it's annoying to hear it start over immediately
      if (status === TTSStatus.SUCCESS && audioUrl && !livePreview) {
        audioRef.current.play().catch(e => console.log("Auto-play blocked"));
      }
    }
  }, [status, audioUrl, playbackRate, livePreview]);

  // Initial content setup
  useEffect(() => {
    if (editorRef.current && text && editorRef.current.innerText === '') {
      editorRef.current.innerText = text;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInput = () => {
    if (editorRef.current) {
      setText(editorRef.current.innerText);
    }
  };

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
  };

  const handleDisconnectApiKey = () => {
    setApiKey('');
    localStorage.removeItem('gemini_api_key');
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

  // Helper to play a single PCM chunk immediately
  const playChunkLive = (pcmData: Uint8Array) => {
    if (!audioContextRef.current) return;
    
    try {
      const ctx = audioContextRef.current;
      
      // Convert raw bytes to Float32 AudioBuffer
      const float32Data = convertInt16ToFloat32(pcmData);
      
      // Create buffer (Mono, matches array length, 24kHz sample rate of Gemini)
      const buffer = ctx.createBuffer(1, float32Data.length, 24000);
      buffer.getChannelData(0).set(float32Data);

      // Create Source
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      // Schedule Playback
      // If we are falling behind (gap in audio), start immediately (currentTime).
      // If we are ahead (streaming fast), append to end of queue (nextAudioStartTimeRef).
      const startTime = Math.max(ctx.currentTime, nextAudioStartTimeRef.current);
      source.start(startTime);
      
      // Advance the pointer
      nextAudioStartTimeRef.current = startTime + buffer.duration;
    } catch (e) {
      console.warn("Live preview error:", e);
    }
  };

  const handleGenerate = async () => {
    // Check for API key safely
    let envKey = '';
    try {
      if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        envKey = process.env.API_KEY;
      }
    } catch (e) {}

    if (!apiKey && !envKey) {
      setIsApiModalOpen(true);
      return;
    }

    const currentText = editorRef.current?.innerText || text;
    
    if (!currentText.trim()) return;
    if (currentText.length > MAX_CHARS) {
      setError(`Text exceeds limit of ${MAX_CHARS.toLocaleString()} characters.`);
      return;
    }

    setStatus(TTSStatus.GENERATING);
    setError('');
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);

    // Initialize Web Audio Context for Live Preview
    if (livePreview) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
        nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
      } catch (e) {
        console.warn("Web Audio API not supported, disabling live preview");
      }
    }

    try {
      const chunks = splitTextIdeally(currentText, CHUNK_SIZE);
      const pcmChunks: Uint8Array[] = new Array(chunks.length);
      const totalChunks = chunks.length;

      // Sequential processing to respect strict rate limits
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        setProgressMessage(`Processing part ${i + 1} of ${totalChunks}...`);

        // We pass setProgressMessage to the service so it can update us if it hits a rate limit wait
        const base64Audio = await generateSpeechFromText({
          text: chunk,
          instruction,
          voice: selectedVoice,
          language: selectedLanguage
        }, apiKey, (statusMsg) => setProgressMessage(`Part ${i + 1}/${totalChunks}: ${statusMsg}`));

        const pcmData = base64ToUint8Array(base64Audio);
        pcmChunks[i] = pcmData;

        // --- LIVE PREVIEW ---
        // If enabled, play this chunk immediately while the next one generates
        if (livePreview && audioContextRef.current) {
          playChunkLive(pcmData);
        }

        // Optional: Artificial small delay between successful chunks to be nice to the API
        if (i < chunks.length - 1) {
           await new Promise(r => setTimeout(r, 500));
        }
      }

      setProgressMessage('Stitching audio...');
      const mergedPcm = mergeBuffers(pcmChunks);
      const wavBuffer = pcmToWav(mergedPcm.buffer);
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      
      setAudioUrl(url);
      setStatus(TTSStatus.SUCCESS);
      setProgressMessage('');

    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setStatus(TTSStatus.ERROR);
      setProgressMessage('');
    } finally {
      // We don't close the audio context here immediately because the audio might still be playing from the buffer
      // However, we can let it garbage collect or close it when the new generation starts
    }
  };

  const isLoading = status === TTSStatus.GENERATING;

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
                <span>Gemini 2.5 Pro</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Gemini Voice Studio
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base max-w-lg">
                Create lifelike speech with emotional intelligence.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsApiModalOpen(true)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all shadow-sm
                  ${apiKey 
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-slate-600'
                  }
                `}
              >
                {apiKey ? <Check className="w-4 h-4" /> : <Key className="w-4 h-4" />}
                <span>{apiKey ? 'API Connected' : 'Connect API'}</span>
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
                  disabled={isLoading}
                />
                <div className="h-px bg-slate-200 dark:bg-slate-800 my-6" />

                <VoiceSelector 
                  voices={VOICES} 
                  selectedVoice={selectedVoice} 
                  onSelect={setSelectedVoice}
                  disabled={isLoading} 
                />
                <div className="h-px bg-slate-200 dark:bg-slate-800 my-6" />
                <StylePresets 
                  presets={PRESETS} 
                  onSelect={setInstruction}
                  disabled={isLoading}
                />
              </div>
              
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-500/10 rounded-xl p-4 flex gap-3 items-start shrink-0">
                 <div className="bg-indigo-100 dark:bg-indigo-500/20 p-2 rounded-lg shrink-0">
                   <Wand2 className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                 </div>
                 <div>
                   <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 mb-1">Rich Text Ready</h3>
                   <p className="text-xs text-indigo-700/80 dark:text-indigo-300/70 leading-relaxed">
                     Paste your formatted text directly. We preserve the look while generating seamless audio from the content.
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
                        disabled={isLoading}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all shadow-sm"
                     />
                  </div>
                  
                  {/* Live Preview Toggle */}
                  <button
                    onClick={() => setLivePreview(!livePreview)}
                    disabled={isLoading}
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

                  <div className={`text-[10px] md:text-xs font-mono font-medium px-2.5 py-1.5 rounded-md border 
                    ${text.length > MAX_CHARS 
                      ? 'text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10' 
                      : text.length > MAX_CHARS * 0.9 
                        ? 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10' 
                        : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'}
                  `}>
                    {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                  </div>
                </div>

                {/* Editor */}
                <div className="flex-1 relative min-h-0 z-10 group bg-transparent">
                  <div
                    ref={editorRef}
                    contentEditable={!isLoading}
                    onInput={handleInput}
                    data-placeholder="Enter or paste your text here..."
                    className="rich-text-editor w-full h-full p-6 text-base md:text-lg leading-loose text-slate-800 dark:text-slate-200 focus:outline-none custom-scrollbar"
                    suppressContentEditableWarning={true}
                  />
                </div>

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
                        
                        {/* Audio Controls Toolbar */}
                        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
                          
                          {/* Speed Controls */}
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                              <Gauge className="w-4 h-4" />
                              <span className="text-xs font-bold uppercase tracking-wider">Speed</span>
                            </div>
                            <div className="flex items-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
                              {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                                <button
                                  key={rate}
                                  onClick={() => setPlaybackRate(rate)}
                                  className={`
                                    px-2.5 py-1 text-xs font-medium rounded-md transition-all
                                    ${playbackRate === rate 
                                      ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 shadow-sm' 
                                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                    }
                                  `}
                                >
                                  {rate}x
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Download Button */}
                          <button 
                            onClick={handleDownload}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-bold transition-all shadow-sm hover:shadow"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download WAV</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full text-center text-sm text-slate-500 dark:text-slate-500 italic flex items-center justify-center gap-2">
                         {isLoading ? (
                           <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                             {livePreview && <Volume2 className="w-4 h-4 animate-pulse" />}
                             <span className="animate-pulse font-medium">{progressMessage || 'Initializing...'}</span>
                           </div>
                         ) : (
                           'Ready to generate'
                         )}
                      </div>
                    )}
                  </div>

                  {/* Generate Button */}
                  <button
                    onClick={handleGenerate}
                    disabled={isLoading || !text.trim()}
                    className={`
                      w-full md:w-auto px-8 py-3.5 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2.5 transition-all transform
                      ${isLoading || !text.trim()
                        ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed opacity-70 shadow-none' 
                        : 'bg-indigo-600 hover:bg-indigo-500 dark:bg-gradient-to-r dark:from-indigo-600 dark:to-purple-600 dark:hover:from-indigo-500 dark:hover:to-purple-500 hover:scale-[1.02] active:scale-[0.98] shadow-indigo-500/20'
                      }
                    `}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Processing</span>
                      </>
                    ) : (
                      <>
                        {status === TTSStatus.SUCCESS ? <RefreshCcw className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                        <span>{status === TTSStatus.SUCCESS ? 'Regenerate' : 'Generate'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>
          </main>
          
          <ApiKeyModal 
            isOpen={isApiModalOpen}
            onClose={() => setIsApiModalOpen(false)}
            onSave={handleSaveApiKey}
            onDisconnect={handleDisconnectApiKey}
            hasKey={!!apiKey}
          />
        </div>
      </div>
    </div>
  );
}