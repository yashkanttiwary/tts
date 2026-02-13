/**
 * Writes a string to a DataView at a specific offset.
 */
const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * Converts raw PCM audio data (from Gemini API) into a WAV file format.
 * Gemini usually returns mono 24kHz audio.
 * 
 * @param pcmData The raw ArrayBuffer of PCM data
 * @param sampleRate The sample rate (default 24000 for Gemini TTS)
 * @returns An ArrayBuffer containing the complete WAV file
 */
export const pcmToWav = (pcmData: ArrayBuffer, sampleRate = 24000): ArrayBuffer => {
  // WAV Header is 44 bytes
  const headerLength = 44;
  const buffer = new ArrayBuffer(headerLength + pcmData.byteLength);
  const view = new DataView(buffer);

  // RIFF identifier 'RIFF'
  writeString(view, 0, 'RIFF');
  // file length minus RIFF identifier length and file description length
  view.setUint32(4, 36 + pcmData.byteLength, true);
  // RIFF type 'WAVE'
  writeString(view, 8, 'WAVE');
  // format chunk identifier 'fmt '
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 is PCM)
  view.setUint16(20, 1, true);
  // channel count (1 for mono)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier 'data'
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, pcmData.byteLength, true);

  // Write the PCM samples
  const pcmArray = new Uint8Array(pcmData);
  const wavArray = new Uint8Array(buffer, headerLength);
  wavArray.set(pcmArray);

  return buffer;
};

/**
 * Decodes a base64 string into a Uint8Array
 */
export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Merges multiple Uint8Array buffers into a single Uint8Array.
 * Useful for stitching together audio chunks.
 */
export const mergeBuffers = (buffers: Uint8Array[]): Uint8Array => {
  const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const b of buffers) {
    result.set(b, offset);
    offset += b.length;
  }
  return result;
};