'use strict';

// Her ears (ear.js): your voice, sent as a recording to a Whisper service, and the text back. It uses
// the key you already gave her for that service (llm.js), and keeps nothing: the recording goes out
// and is forgotten on this side.

const PROVIDERS = {
  groq: { label: 'Groq', url: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3-turbo', env: 'GROQ_API_KEY' },
  openai: { label: 'OpenAI', url: 'https://api.openai.com/v1', model: 'whisper-1', env: 'OPENAI_API_KEY' },
};
const MAX_BYTES = 25 * 1024 * 1024; // the service's own limit
const TIMEOUT_MS = 30000;

// wav: an ArrayBuffer of 16 kHz mono 16-bit WAV (built in the overlay, ear.js). The language is
// detected by the service, so French, Russian, Spanish or Portuguese work as they are.
async function transcribe(wav, { provider = 'groq', key } = {}) {
  const service = PROVIDERS[provider];
  if (!service) throw Object.assign(new Error('unknown speech service'), { code: 'unknown' });
  if (!key) throw Object.assign(new Error(`no API key for ${service.label}`), { code: 'nokey' });
  if (!wav || !wav.byteLength || wav.byteLength > MAX_BYTES) {
    throw Object.assign(new Error('recording empty or too long'), { code: 'size' });
  }
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'voice.wav');
  form.append('model', service.model);
  form.append('response_format', 'json');
  const res = await fetch(`${service.url}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(body.slice(0, 200) || `answered ${res.status}`), {
      status: res.status,
      code: res.status === 429 || res.status === 503 ? 'busy' : null,
    });
  }
  const json = await res.json();
  return String(json.text || '').trim();
}

module.exports = { transcribe, PROVIDERS };
