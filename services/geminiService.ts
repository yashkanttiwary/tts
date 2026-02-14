import { GoogleGenAI, Modality } from "@google/genai";
import { GenerationConfig } from "../types";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const generateSpeechFromText = async (
  config: GenerationConfig, 
  apiKey?: string,
  onStatusUpdate?: (msg: string) => void
): Promise<string> => {
  // Prioritize user-provided key, fallback to env var (safely checked for browser)
  let envKey = '';
  try {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      envKey = process.env.API_KEY;
    }
  } catch (e) {
    // Ignore process errors in browser
  }

  const keyToUse = apiKey || envKey;
  
  if (!keyToUse) {
    throw new Error("API Key is missing. Please click the 'Connect API' button in the top right to configure it.");
  }

  const ai = new GoogleGenAI({ apiKey: keyToUse });
  
  // Reverted to Flash TTS model for speed and higher rate limits
  const modelName = "gemini-2.5-flash-preview-tts";

  // Language direction logic
  let languageDirective = "";
  if (config.language === 'hi') {
    languageDirective = "Strictly speak the following text in Hindi. If the text is written in Devanagari, read it naturally. If the text is written in Latin script (Hinglish), pronounce it with a proper, native Hindi accent.";
  } else if (config.language === 'hinglish') {
    languageDirective = "The following text is in Hinglish (a conversational blend of Hindi and English). Speak it with a natural, urban Indian accent. Pronounce Hindi words authentically (even if written in Latin script) and English words with a slight Indian inflection, just like a native bilingual speaker from India.";
  } else {
    languageDirective = "Read the following text in English.";
  }

  // Construct the final prompt
  const promptText = config.instruction 
    ? `${languageDirective}\nStyle instruction: ${config.instruction}\n\nText to speak:\n${config.text}`
    : `${languageDirective}\n\nText to speak:\n${config.text}`;

  let lastError: any;
  // Increased retries to handle rate limits more robustly during batch processing
  const MAX_RETRIES = 5; 
  let attempt = 0;
  let rateLimitHitCount = 0;

  while (true) {
    try {
      attempt++;
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts: [{ text: promptText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: config.voice
              }
            }
          }
        }
      });

      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) throw new Error("No candidates returned from Gemini");

      const parts = candidates[0].content?.parts;
      if (!parts || parts.length === 0) throw new Error("No content parts returned");

      const audioPart = parts.find(p => p.inlineData);
      
      if (!audioPart || !audioPart.inlineData || !audioPart.inlineData.data) {
         const textPart = parts.find(p => p.text);
         if (textPart) throw new Error(`Model returned text instead of audio: "${textPart.text}". Try adjusting your prompt.`);
         throw new Error("No audio data found in response.");
      }

      return audioPart.inlineData.data;

    } catch (error: any) {
      lastError = error;
      
      // --- RATE LIMIT HANDLING (429) ---
      const isRateLimit = error.status === 429 || (error.message && error.message.includes('429')) || (error.status === 503);
      
      if (isRateLimit) {
        rateLimitHitCount++;
        
        // Try to parse the specific wait time from the error message
        const waitTimeMatch = error.message?.match(/retry in (\d+(\.\d+)?)s/);
        let waitTime = 10000; // Default wait 10s (increased from 5s)
        
        if (waitTimeMatch && waitTimeMatch[1]) {
           // Parse the time
           const parsedTime = parseFloat(waitTimeMatch[1]) * 1000;
           // Add a 2s safety buffer + random jitter (0-2s)
           // Jitter helps prevent multiple parallel chunks from retrying at the EXACT same millisecond and hitting the limit again.
           const safetyBuffer = 2000;
           const jitter = Math.random() * 2000;
           
           waitTime = Math.ceil(parsedTime + safetyBuffer + jitter);
        } else {
           // If we couldn't parse it, use exponential backoff based on how many times we hit it
           waitTime = waitTime * rateLimitHitCount;
        }

        // Active Countdown Loop
        const totalSeconds = Math.ceil(waitTime / 1000);
        for (let i = totalSeconds; i > 0; i--) {
           if (onStatusUpdate) {
             onStatusUpdate(`Rate limit hit. Cooling down: ${i}s...`);
           }
           await delay(1000);
        }
        
        // VISUAL FIX: Explicitly show "Retrying" state for 1.5s
        // This ensures the user sees the timer finish and the system attempt to work again
        // before potentially failing again.
        if (onStatusUpdate) onStatusUpdate("Cool-down complete. Retrying...");
        await delay(1500);

        continue; 
      }

      // --- STANDARD ERROR HANDLING ---
      console.warn(`TTS generation attempt ${attempt} failed:`, error);

      // Don't retry client errors
      if (error.status === 400 || error.status === 403 || (error.message && (error.message.includes("400") || error.message.includes("403") || error.message.includes("404")))) {
        break;
      }
      
      if (attempt < MAX_RETRIES) {
        const backoff = 1000 * Math.pow(2, attempt);
        if (onStatusUpdate) onStatusUpdate(`Error. Retrying in ${backoff/1000}s...`);
        await delay(backoff);
      } else {
        break; // Give up
      }
    }
  }

  throw new Error(lastError?.message || "Failed to generate speech. Please check your API Key and try again.");
};