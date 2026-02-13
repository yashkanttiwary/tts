
export interface VoiceOption {
  name: string;
  gender: 'Male' | 'Female';
  style: string;
  description: string;
}

export interface PresetOption {
  label: string;
  prompt: string;
}

export interface GenerationConfig {
  text: string;
  instruction: string;
  voice: string;
}

export enum TTSStatus {
  IDLE = 'IDLE',
  PREPARING = 'PREPARING',   // Splitting text
  PROCESSING = 'PROCESSING', // Fetching/Buffering
  PLAYING = 'PLAYING',       // Active playback
  PAUSED = 'PAUSED',         // User paused
  COMPLETED = 'COMPLETED',   // All done
  ERROR = 'ERROR'
}

export interface ChunkMetadata {
  id: string;
  text: string;
  status: 'pending' | 'generating' | 'ready' | 'playing' | 'played' | 'error';
  duration?: number;
  error?: string;
}

// Worker Types
export type WorkerMessage = 
  | { type: 'SPLIT_TEXT'; text: string; maxLength: number }
  | { type: 'DECODE_AUDIO'; id: string; base64: string };

export type WorkerResponse = 
  | { type: 'SPLIT_COMPLETE'; chunks: string[] }
  | { type: 'DECODE_COMPLETE'; id: string; audioData: Float32Array; rawPcm: Uint8Array }
  | { type: 'ERROR'; message: string };
