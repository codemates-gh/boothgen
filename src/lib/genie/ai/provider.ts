import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// One image-to-image call to Google's image model (Gemini paid tier: inputs aren't used for training) through the AI
// SDK. Only the shot and the prompt are sent. Blocked = Google's safety filter refused it; failed = anything else.
export type ProviderResult =
  | { ok: true; image: Buffer }
  | { ok: false; blocked: boolean; message: string };

export async function renderWithGoogle(input: Buffer, prompt: string, model: string): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, blocked: false, message: 'The AI provider isn’t set up (GEMINI_API_KEY).' };
  const google = createGoogleGenerativeAI({ apiKey });
  try {
    const r = await generateText({
      model: google(model),
      messages: [{ role: 'user', content: [{ type: 'image', image: input, mediaType: 'image/jpeg' }, { type: 'text', text: prompt }] }],
      providerOptions: { google: { responseModalities: ['IMAGE'] } },
      maxRetries: 1,
    });
    const file = r.files.find(f => f.mediaType.startsWith('image/'));
    if (file) return { ok: true, image: Buffer.from(file.uint8Array) };
    const blocked = r.finishReason === 'content-filter';
    return { ok: false, blocked, message: blocked ? 'The AI provider’s safety filter refused this photo.' : 'The AI provider returned no image.' };
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    const blocked = /safety|blocked|prohibited/i.test(text);
    console.error('[geniefied] provider error', model, text.slice(0, 500));
    return { ok: false, blocked, message: blocked ? 'The AI provider’s safety filter refused this photo.' : 'The AI provider couldn’t render this photo.' };
  }
}
