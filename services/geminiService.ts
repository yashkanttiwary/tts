
import { GoogleGenAI, Modality } from "@google/genai";
import { GenerationConfig } from "../types";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// The default style if none is provided
const DEFAULT_STYLE = "Great storyteller, perfect YouTuber delivering the narratives as they land most effectively with sometimes high-pitched, low-pitched modulations, as for perfect timings";

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

  // --- SMART PROMPTING LOGIC ---
  // We construct a structured prompt that separates instructions, context, and the actual text to read.
  let finalPrompt = `${languageDirective}\n`;

  // Use user instruction if present, otherwise fallback to default YouTuber style
  const styleInstruction = config.instruction && config.instruction.trim().length > 0 
    ? config.instruction 
    : DEFAULT_STYLE;

  finalPrompt += `Style Instruction: ${styleInstruction}\n`;

  // If we have context from the previous chunk, we add it so the AI knows the flow.
  // Crucially, we tell it NOT to read this part.
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

        // 3. Exponential Penalty for stubborn errors
        if (consecutiveRateLimitHits > 1) {
          totalWaitTime = totalWaitTime * 2;
        }

        // 4. Execute the Countdown
        const totalSeconds = Math.ceil(totalWaitTime / 1000);
        for (let i = totalSeconds; i > 0; i--) {
           if (onStatusUpdate) {
             const extraContext = consecutiveRateLimitHits > 1 ? " (Extended wait due to retry failure)" : "";
             onStatusUpdate(`Rate limit hit. Cooling down: ${i}s${extraContext}...`);
           }
           await delay(1000);
        }
        
        // 5. Visual "Verifying" Phase
        if (onStatusUpdate) onStatusUpdate("Verifying server availability...");
        await delay(2000);

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
