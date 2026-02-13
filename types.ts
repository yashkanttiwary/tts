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
  PROCESSING = 'PROCESSING', // Fetching audio
  PLAYING = 'PLAYING',       // Audio is outputting
  PAUSED = 'PAUSED',         // Playback paused
  COMPLETED = 'COMPLETED',   // All chunks finished
  ERROR = 'ERROR'
}

export interface AudioChunk {
  id: string;
  text: string;
  status: 'pending' | 'generating' | 'ready' | 'error';
  audioData?: Float32Array; // For Web Audio API playback
  rawPcm?: Uint8Array;      // For WAV download (Int16)
  duration?: number;        // In seconds
  error?: string;
}
