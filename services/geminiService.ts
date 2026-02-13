import { GoogleGenAI, Modality } from "@google/genai";
import { GenerationConfig } from "../types";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const generateSpeechFromText = async (config: GenerationConfig, apiKey?: string): Promise<string> => {
  // Prioritize user-provided key, fallback to env var
  const keyToUse = apiKey || process.env.API_KEY;
  
  if (!keyToUse) {
    throw new Error("API Key is missing. Please click the 'Connect API' button in the top right to configure it.");
  }

  const ai = new GoogleGenAI({ apiKey: keyToUse });
  const modelName = "gemini-2.5-flash-preview-tts";

  // Construct the prompt. If there's an instruction, we prepend it as a directive.
  const promptText = config.instruction 
    ? `${config.instruction}\n\nText to speak:\n${config.text}`
    : config.text;

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