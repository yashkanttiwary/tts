
import { useState, useEffect, useRef, useCallback } from 'react';
import { ChunkMetadata, TTSStatus, WorkerMessage, WorkerResponse } from '../types';
import { generateSpeechFromText } from '../services/geminiService';
import { AudioEngine } from '../services/AudioEngine';

// Constants
const FETCH_WINDOW = 3; // How many chunks ahead to buffer
const CHUNK_SIZE = 400; // Characters per chunk

export const useBookPlayer = (apiKey: string) => {
  // State
  const [chunks, setChunks] = useState<ChunkMetadata[]>([]);
  const [status, setStatus] = useState<TTSStatus>(TTSStatus.IDLE);
  const [currentChunkId, setCurrentChunkId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  
  // Refs for non-render state
  const engineRef = useRef<AudioEngine | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const playQueueRef = useRef<string[]>([]); // Order of IDs to play
  const isFetchingRef = useRef<boolean>(false);
  const rawPcmStorageRef = useRef<Map<string, Uint8Array>>(new Map()); // Store RAW for download

  // Initialize Worker and Engine
  useEffect(() => {
    // Use standard ESM Worker instantiation which works better with Vite/TS than the suffix import in some cases
    workerRef.current = new Worker(new URL('../workers/audioWorker.ts', import.meta.url), { type: 'module' });
    engineRef.current = new AudioEngine();

    // Wire up Engine events
    engineRef.current.onChunkStart = (id) => {
      setCurrentChunkId(id);
      setChunks(prev => prev.map(c => 
        c.id === id ? { ...c, status: 'playing' } : 
        c.status === 'playing' ? { ...c, status: 'played' } : c
      ));
    };

    engineRef.current.onChunkEnd = (id) => {
      // Trigger next schedule check
      scheduleNext();
      
      // Memory Cleanup: Prune old audio from engine to save RAM
      if (engineRef.current) {
        engineRef.current.prune([id]); 
      }
    };

    return () => {
      workerRef.current?.terminate();
      engineRef.current?.stop();
    };
  }, []);

  // Worker Message Handler
  useEffect(() => {
    if (!workerRef.current) return;

    workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { type } = e.data;

      if (type === 'SPLIT_COMPLETE') {
        const { chunks: textChunks } = e.data as any;
        const metadata: ChunkMetadata[] = textChunks.map((text: string, i: number) => ({
          id: `chunk-${Date.now()}-${i}`,
          text,
          status: 'pending'
        }));
        
        setChunks(metadata);
        playQueueRef.current = metadata.map(c => c.id);
        setStatus(TTSStatus.PROCESSING); // Start processing
      }
      else if (type === 'DECODE_COMPLETE') {
        const { id, audioData, rawPcm } = e.data as any;
        
        // 1. Store Float32 in Engine for playback
        if (engineRef.current) {
          engineRef.current.enqueue(id, audioData);
        }

        // 2. Store Uint8 in Ref for download
        rawPcmStorageRef.current.set(id, rawPcm);

        // 3. Update Status
        setChunks(prev => prev.map(c => 
          c.id === id ? { ...c, status: 'ready', duration: audioData.length / 24000 } : c
        ));
        
        // 4. Try to schedule immediately if we are active
        scheduleNext();
        isFetchingRef.current = false; // Release lock
      }
      else if (type === 'ERROR') {
        const { message } = e.data as any;
        console.error("Worker Error:", message);
        setError(message);
        setStatus(TTSStatus.ERROR);
        isFetchingRef.current = false;
      }
    };
  }, []);

  // Buffer Management / Fetch Loop
  useEffect(() => {
    if (status !== TTSStatus.PROCESSING && status !== TTSStatus.PLAYING) return;
    if (isFetchingRef.current) return;

    // Find first 'pending' chunk
    const pendingIdx = chunks.findIndex(c => c.status === 'pending');
    
    // If no pending chunks, check if we are completely done
    if (pendingIdx === -1) {
      if (chunks.every(c => c.status === 'played' || c.status === 'ready')) {
         // All fetched.
         return;
      }
      return;
    }

    // Logic: Only fetch if the pending chunk is within WINDOW of current playback
    let currentPlayIdx = chunks.findIndex(c => c.id === currentChunkId);
    if (currentPlayIdx === -1) currentPlayIdx = -1; // Not started yet

    // If pending index is too far ahead, wait.
    if (currentPlayIdx !== -1 && pendingIdx > currentPlayIdx + FETCH_WINDOW) {
      return; 
    }

    // Trigger Fetch
    const chunkToFetch = chunks[pendingIdx];
    triggerFetch(chunkToFetch);

  }, [chunks, status, currentChunkId]);

  const triggerFetch = async (chunk: ChunkMetadata) => {
    isFetchingRef.current = true;
    
    // Optimistic update
    setChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, status: 'generating' } : c));

    try {
      const base64 = await generateSpeechFromText({
        text: chunk.text,
        instruction: sessionConfigRef.current.instruction,
        voice: sessionConfigRef.current.voice
      }, apiKey);

      // Send to Worker for Decode
      workerRef.current?.postMessage({
        type: 'DECODE_AUDIO',
        id: chunk.id,
        base64
      });

    } catch (err: any) {
      console.error("Fetch Error:", err);
      setChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, status: 'error', error: err.message } : c));
      isFetchingRef.current = false;
      // Don't stop the whole thing, maybe it skips?
      // For now, let's pause so user sees error
      setStatus(TTSStatus.PAUSED);
      if (err.message && err.message.includes("API Key")) {
         setError("API Key Error");
      }
    }
  };

  const scheduleNext = () => {
    if (!engineRef.current || status === TTSStatus.PAUSED) return;

    let startIdx = 0;
    if (currentChunkId) {
       startIdx = playQueueRef.current.indexOf(currentChunkId) + 1;
    }
    
    for (let i = startIdx; i < playQueueRef.current.length; i++) {
       const id = playQueueRef.current[i];
       const chunk = chunks.find(c => c.id === id);
       
       if (chunk && chunk.status === 'ready') {
          const success = engineRef.current.schedule(id);
       } else {
          break;
       }
    }
  };

  // Config persistence
  const sessionConfigRef = useRef({ voice: 'Puck', instruction: '' });

  const start = async (text: string, voice: string, instruction: string) => {
    if (!text.trim()) return;
    
    // Reset
    await engineRef.current?.init();
    engineRef.current?.stop();
    engineRef.current?.clearQueue();
    rawPcmStorageRef.current.clear();
    setError('');
    setCurrentChunkId(null);
    sessionConfigRef.current = { voice, instruction };

    setStatus(TTSStatus.PREPARING);
    
    // Send to worker for splitting
    workerRef.current?.postMessage({
      type: 'SPLIT_TEXT',
      text,
      maxLength: CHUNK_SIZE
    });
  };

  const pause = () => {
    engineRef.current?.pause();
    setStatus(TTSStatus.PAUSED);
  };

  const resume = async () => {
    await engineRef.current?.init();
    engineRef.current?.resume();
    setStatus(TTSStatus.PLAYING);
    scheduleNext();
  };

  const stop = () => {
    engineRef.current?.stop();
    setStatus(TTSStatus.IDLE);
    setCurrentChunkId(null);
  };

  const getFullAudioBlob = () => {
    const buffers: Uint8Array[] = [];
    playQueueRef.current.forEach(id => {
       const buf = rawPcmStorageRef.current.get(id);
       if (buf) buffers.push(buf);
    });
    
    if (buffers.length === 0) return null;
    
    const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const b of buffers) {
      result.set(b, offset);
      offset += b.length;
    }
    return result;
  };

  return {
    chunks,
    status,
    currentChunkId,
    error,
    actions: { start, pause, resume, stop, getFullAudioBlob }
  };
};
