
// This worker handles heavy text manipulation and audio decoding
// to keep the UI thread responsive.

const splitTextRobust = (text: string, maxLength: number): string[] => {
  if (text.length <= maxLength) return [text];
  
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // If small enough, just take it
    if (remaining.length <= maxLength) {
      chunks.push(remaining.trim());
      break;
    }

    // Find best split point
    const searchBuffer = remaining.substring(0, maxLength);
    let splitIndex = -1;

    // Priority 1: Paragraphs
    let candidate = searchBuffer.lastIndexOf('\n\n');
    if (candidate > maxLength * 0.3) splitIndex = candidate + 2;

    // Priority 2: Sentence endings
    if (splitIndex === -1) {
       // Look for [.!?] followed by space
       const regex = /[.!?]\s/g;
       let match;
       let lastGoodMatchIndex = -1;
       while ((match = regex.exec(searchBuffer)) !== null) {
          if (match.index > maxLength * 0.3) {
             lastGoodMatchIndex = match.index + match[0].length;
          }
       }
       if (lastGoodMatchIndex !== -1) splitIndex = lastGoodMatchIndex;
    }

    // Priority 3: Clauses
    if (splitIndex === -1) {
       candidate = Math.max(searchBuffer.lastIndexOf(', '), searchBuffer.lastIndexOf('; '));
       if (candidate > maxLength * 0.3) splitIndex = candidate + 2;
    }

    // Priority 4: Words
    if (splitIndex === -1) {
       splitIndex = searchBuffer.lastIndexOf(' ');
    }

    // Fallback: Force cut if no spaces found (e.g. giant URL or garbage)
    if (splitIndex === -1 || splitIndex === 0) {
       splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }
  
  return chunks.filter(c => c.length > 0);
};

const base64ToFloat32 = (base64: string): { audioData: Float32Array; rawPcm: Uint8Array } => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Convert Int16 PCM to Float32
  const dataView = new DataView(bytes.buffer);
  const float32 = new Float32Array(bytes.length / 2);
  
  for (let i = 0; i < float32.length; i++) {
    const int16 = dataView.getInt16(i * 2, true); // Little-endian
    // Normalize Int16 (-32768 to 32767) to Float32 (-1.0 to 1.0)
    float32[i] = int16 < 0 ? int16 / 32768 : int16 / 32767;
  }

  return { audioData: float32, rawPcm: bytes };
};

self.onmessage = (e: MessageEvent) => {
  const { type } = e.data;

  try {
    if (type === 'SPLIT_TEXT') {
      const { text, maxLength } = e.data;
      const chunks = splitTextRobust(text, maxLength);
      self.postMessage({ type: 'SPLIT_COMPLETE', chunks });
    } 
    else if (type === 'DECODE_AUDIO') {
      const { id, base64 } = e.data;
      const { audioData, rawPcm } = base64ToFloat32(base64);
      
      // We must cast self to any or DedicatedWorkerGlobalScope to avoid TS errors with transfer lists
      (self as any).postMessage(
        { type: 'DECODE_COMPLETE', id, audioData, rawPcm }, 
        [audioData.buffer, rawPcm.buffer]
      );
    }
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', message: err.message });
  }
};

// Export default to satisfy bundlers that treat this as a module
export default {};
