
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
  language: string;
  previousContext?: string; // New field for smart cohesion
}

export enum TTSStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  PAUSED = 'PAUSED', // New status
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
