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
}

export enum TTSStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}