import { GoogleGenAI, Modality } from "@google/genai";
import { GenerationConfig } from "../types";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const generateSpeechFromText = async (config: GenerationConfig, apiKey?: string): Promise<string> => {
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
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts: [{ text: promptText }] }],
        config: {
          responseModalities: [Modality.AUDIO], // CRITICAL: Tell Gemini we want Audio back
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: config.voice
              }
            }
          }
        }
      });

      // Extract the inline audio data
      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error("No candidates returned from Gemini");
      }

      const parts = candidates[0].content?.parts;
      if (!parts || parts.length === 0) {
        throw new Error("No content parts returned");
      }

      // Look for inlineData which contains the audio
      const audioPart = parts.find(p => p.inlineData);
      
      if (!audioPart || !audioPart.inlineData || !audioPart.inlineData.data) {
         // Fallback check: sometimes errors come back as text in the parts
         const textPart = parts.find(p => p.text);
         if (textPart) {
           throw new Error(`Model returned text instead of audio: "${textPart.text}". Try adjusting your prompt.`);
         }
         throw new Error("No audio data found in response.");
      }

      return audioPart.inlineData.data; // This is the Base64 string of PCM data

    } catch (error: any) {
      console.warn(`TTS generation attempt ${attempt + 1} failed:`, error);
      lastError = error;

      // Don't retry if it's a client-side prompt issue (400 Bad Request) or Auth error (403)
      if (error.status === 400 || error.status === 403 || (error.message && (error.message.includes("400") || error.message.includes("403")))) {
        break;
      }
      
      // If we haven't reached max retries, wait and try again
      if (attempt < MAX_RETRIES - 1) {
        // Exponential backoff: 1s, 2s, 4s
        await delay(1000 * Math.pow(2, attempt)); 
      }
    }
  }

  // If we exit the loop, we failed
  throw new Error(lastError?.message || "Failed to generate speech. Please check your API Key and try again.");
};