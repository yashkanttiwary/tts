/* eslint-disable no-restricted-globals */

// --- UTILITY FUNCTIONS (Inlined to avoid import issues in Worker context) ---

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const pcmToWav = (pcmData: ArrayBuffer, sampleRate = 24000): ArrayBuffer => {
  const headerLength = 44;
  const buffer = new ArrayBuffer(headerLength + pcmData.byteLength);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmData.byteLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, pcmData.byteLength, true);

  const pcmArray = new Uint8Array(pcmData);
  const wavArray = new Uint8Array(buffer, headerLength);
  wavArray.set(pcmArray);

  return buffer;
};

const mergeBuffers = (buffers: Uint8Array[]): Uint8Array => {
  const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const b of buffers) {
    result.set(b, offset);
    offset += b.length;
  }
  return result;
};

const convertInt16ToFloat32 = (pcmData: Uint8Array): Float32Array => {
  const int16Data = new Int16Array(pcmData.buffer);
  const float32Data = new Float32Array(int16Data.length);
  for (let i = 0; i < int16Data.length; i++) {
    float32Data[i] = int16Data[i] / 32768.0;
  }
  return float32Data;
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// --- TEXT SPLITTING LOGIC (Enhanced with Hard Fallback) ---

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
    
    // Smart split attempt
    for (let i = maxLength; i > maxLength * 0.8; i--) {
        const char = currentText[i];
        if (char === '\n' && currentText[i-1] === '\n') { splitIndex = i; break; }
        if (sentenceEndings.some(end => currentText.substring(i - 1, i + end.length - 1) === end)) { splitIndex = i + 1; break; }
    }
    
    // Fallback 1: Spaces
    if (splitIndex === -1) splitIndex = currentText.lastIndexOf(' ', maxLength);
    
    // Fallback 2: Hard Cut (M-02 Fix)
    if (splitIndex === -1 || splitIndex === 0) {
        splitIndex = maxLength; 
    }
    
    chunks.push(currentText.substring(0, splitIndex).trim());
    currentText = currentText.substring(splitIndex).trim();
  }
  return chunks;
}

// --- WORKER MESSAGE HANDLER ---

self.onmessage = (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  try {
    switch (type) {
      case 'SPLIT_TEXT': {
        const { text, chunkSize } = payload;
        const chunks = splitTextIdeally(text, chunkSize);
        self.postMessage({ type: 'SPLIT_COMPLETE', id, payload: chunks });
        break;
      }

      case 'PROCESS_PCM': {
        // Receives Base64, returns Float32 (for visualizer) and Uint8 (for storage)
        const { base64 } = payload;
        const pcmUint8 = base64ToUint8Array(base64);
        const float32 = convertInt16ToFloat32(pcmUint8);
        
        // We transfer the buffers to avoid copying overhead where possible
        (self as any).postMessage(
          { type: 'PROCESS_COMPLETE', id, payload: { pcmUint8, float32 } },
          [pcmUint8.buffer, float32.buffer]
        );
        break;
      }

      case 'EXPORT_WAV': {
        const { chunks } = payload;
        // chunks is array of Uint8Arrays
        const merged = mergeBuffers(chunks);
        const wavBuffer = pcmToWav(merged.buffer);
        // Create Blob in main thread, we just send buffer back
        (self as any).postMessage(
          { type: 'EXPORT_COMPLETE', id, payload: wavBuffer },
          [wavBuffer]
        );
        break;
      }

      default:
        console.warn('Unknown worker message type:', type);
    }
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', id, payload: error.message });
  }
};
