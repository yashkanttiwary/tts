
import { GoogleGenAI, Modality } from "@google/genai";
import { GenerationConfig } from "../types";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// The default style if none is provided
const DEFAULT_STYLE = "Great storyteller, perfect YouTuber delivering the narratives as they land most effectively with sometimes high-pitched, low-pitched modulations, as for perfect timings";

// Helper to get key from string or function
// Now supports passing a 'peek' flag to check next key without side effects (like recording usage)
const resolveKey = (keyOrProvider: string | ((peek?: boolean) => string), peek: boolean = false): string => {
  if (typeof keyOrProvider === 'function') {
    return keyOrProvider(peek);
  }
  return keyOrProvider;
};

export const generateSpeechFromText = async (
  config: GenerationConfig, 
  apiKeyOrProvider: string | ((peek?: boolean) => string),
  onStatusUpdate?: (msg: string) => void
): Promise<string> => {
  
  // Initial check
  let currentKey = resolveKey(apiKeyOrProvider, false);

  // Fallback to env if not provided
  try {
    if (!currentKey && typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      currentKey = process.env.API_KEY;
    }
  } catch (e) {
    // Ignore process errors
  }
  
  if (!currentKey) {
    throw new Error("API Key is missing. Please click the 'Connect API' button to configure it.");
  }

  // Switched to Gemini 2.0 Flash
  const modelName = "gemini-2.0-flash";

  // Language direction logic
  let languageDirective = "";
  if (config.language === 'hi') {
    languageDirective = "Strictly speak the following text in Hindi. If the text is written in Devanagari, read it naturally. If the text is written in Latin script (Hinglish), pronounce it with a proper, native Hindi accent.";
  } else if (config.language === 'hinglish') {
    languageDirective = "The following text is in Hinglish (a conversational blend of Hindi and English). Speak it with a natural, urban Indian accent. Pronounce Hindi words authentically (even if written in Latin script) and English words with a slight Indian inflection, just like a native bilingual speaker from India.";
  } else {
    languageDirective = "Read the following text in English.";
  }

  // --- SMART PROMPTING LOGIC ---
  let finalPrompt = `${languageDirective}\n`;

  const styleInstruction = config.instruction && config.instruction.trim().length > 0 
    ? config.instruction 
    : DEFAULT_STYLE;

  finalPrompt += `Style Instruction: ${styleInstruction}\n`;

  if (config.previousContext) {
    finalPrompt += `
[CONTEXT - PREVIOUS SENTENCES]
(Do NOT read the text below out loud. Use it only to determine the correct tone, flow, and emotion for the continuation.)
"${config.previousContext}"
[END CONTEXT]
`;
  }

  finalPrompt += `
[TEXT TO READ]
(Read ONLY the text below out loud. Maintain the flow from the context above.)
${config.text}
`;

  let lastError: any;
  const MAX_RETRIES = 5; 
  let attempt = 0;
  let consecutiveRateLimitHits = 0;

  while (true) {
    try {
      // DYNAMIC KEY RE-FETCH:
      // We fetch the key *inside* the loop. If the user changed the key in the UI
      // while we were waiting in the 'catch' block below, this will pick up the NEW key.
      currentKey = resolveKey(apiKeyOrProvider, false);
      
      const ai = new GoogleGenAI({ apiKey: currentKey });

      attempt++;
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts: [{ text: finalPrompt }] }],
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

      // Success! Reset counters
      consecutiveRateLimitHits = 0;
      return audioPart.inlineData.data;

    } catch (error: any) {
      lastError = error;
      
      // --- ROBUST RATE LIMIT HANDLING (429/503) ---
      const isRateLimit = error.status === 429 || (error.message && error.message.includes('429')) || (error.status === 503);
      
      if (isRateLimit) {
        consecutiveRateLimitHits++;
        
        // 1. Parse the "official" wait time
        const waitTimeMatch = error.message?.match(/retry in (\d+(\.\d+)?)s/);
        let baseWaitTime = 10000; // Minimum baseline of 10s
        
        if (waitTimeMatch && waitTimeMatch[1]) {
           baseWaitTime = parseFloat(waitTimeMatch[1]) * 1000;
        }

        // 2. Apply "Pessimistic Buffer" Strategy
        const safetyPadding = 5000; 
        const percentagePadding = baseWaitTime * 0.10; 
        const jitter = Math.random() * 2000;

        let totalWaitTime = Math.ceil(baseWaitTime + safetyPadding + percentagePadding + jitter);

        // 3. Exponential Penalty
        if (consecutiveRateLimitHits > 1) {
          totalWaitTime = totalWaitTime * 2;
        }

        // 4. Execute the Countdown with POLL LOGIC
        const totalSeconds = Math.ceil(totalWaitTime / 1000);
        
        // Flag to check if we broke out due to key switch
        let switchedKey = false;

        for (let i = totalSeconds; i > 0; i--) {
           // Poll for key change every second
           if (typeof apiKeyOrProvider === 'function') {
             // Pass true to 'peek' without triggering side effects like usage counting
             const freshKey = resolveKey(apiKeyOrProvider, true);
             if (freshKey && freshKey !== currentKey) {
               if (onStatusUpdate) onStatusUpdate("Skipping wait... switching to fresh API Key!");
               await delay(800); 
               switchedKey = true;
               break; // EXIT THE WAIT LOOP IMMEDIATELY
             }
           }

           if (onStatusUpdate) {
             const extraContext = consecutiveRateLimitHits > 1 ? " (Extended wait)" : "";
             onStatusUpdate(`Rate limit hit. Cooling down: ${i}s${extraContext}... (Click 'Skip Key' to bypass)`);
           }
           await delay(1000);
        }
        
        // If we switched keys, continue loop immediately (which re-fetches key)
        if (switchedKey) {
          continue;
        }

        // 5. Visual "Verifying" Phase
        if (onStatusUpdate) onStatusUpdate("Verifying server availability...");
        await delay(1000);

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
        if (onStatusUpdate) onStatusUpdate(`Connection glitch. Retrying in ${backoff/1000}s...`);
        await delay(backoff);
      } else {
        break; // Give up
      }
    }
  }

  throw new Error(lastError?.message || "Failed to generate speech. Please check your API Key and try again.");
};
