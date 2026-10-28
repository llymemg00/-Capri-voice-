// Her ears: the voice key (set in her menu, Ctrl+Alt+V by default) starts listening, a pause after you
// spoke or a second press stops it. What you said is turned into text (stt.js, through main.js) and sent
// to her chat, as if you had typed it. Recording and encoding happen here, in the overlay: the audio is a
// 16 kHz mono WAV. The same file also takes the new key when you press one for her (capture).

const MAX_MS = 20000;      // a message is never longer than this
const NO_SPEECH_MS = 8000; // nothing said within this: she gives up
const SILENCE_MS = 1400;   // a pause this long, after you spoke, ends the message
const LEVEL = 0.02;        // loudness (RMS of the sound, 0 to 1) that counts as speech
const MIN_MS = 400;        // shorter than this, nothing was said

// the key as it reads on screen: Ctrl+Alt+V
const shown = (key) => String(key || '').replace('Control', 'Ctrl');

const TEXT = {
  fr: {
    listen: (k) => `Je t’écoute… (${k} pour arrêter)`, nothing: 'Je n’ai rien entendu.', busy: 'Je te réponds encore, attends un peu.',
    mic: 'Je n’ai pas accès au micro. Vérifie l’autorisation du micro dans Windows.',
    nokey: 'Pour m’écouter, il me faut une clé Groq ou OpenAI : clic droit sur moi › Modèle IA › Clé API.',
    failed: 'Mes oreilles ont décroché :',
    capture: 'Appuie sur la nouvelle combinaison (Ctrl et Alt + une touche). Échap pour annuler.',
    captured: (k) => `C’est noté : ${k}. Appuie dessus pour me parler.`,
    taken: 'Cette combinaison est prise par une autre appli, ou réservée. Essaie une autre.',
    invalid: 'Il faut Ctrl et Alt, plus une lettre, un chiffre ou une touche F.',
  },
  en: {
    listen: (k) => `Listening… (${k} to stop)`, nothing: 'Didn’t catch anything.', busy: 'Still answering the last one, hold on.',
    mic: 'I can’t reach the microphone. Check the microphone permission in Windows.',
    nokey: 'To hear you, I need a Groq or OpenAI key: right-click me › AI model › API key.',
    failed: 'My ears gave out:',
    capture: 'Press the new combination (Ctrl and Alt + a key). Esc to cancel.',
    captured: (k) => `Got it: ${k}. Press it to talk to me.`,
    taken: 'That combination is taken by another app, or reserved. Try another.',
    invalid: 'It needs Ctrl and Alt, plus a letter, a digit or an F key.',
  },
  es: {
    listen: (k) => `Te escucho… (${k} para parar)`, nothing: 'No he oído nada.', busy: 'Todavía te estoy respondiendo, espera.',
    mic: 'No tengo acceso al micrófono. Revisa el permiso del micrófono en Windows.',
    nokey: 'Para escucharte necesito una clave de Groq o OpenAI: clic derecho sobre mí › Modelo de IA › Clave API.',
    failed: 'Mis oídos se rindieron:',
    capture: 'Pulsa la nueva combinación (Ctrl y Alt + una tecla). Esc para cancelar.',
    captured: (k) => `Anotado: ${k}. Púlsala para hablarme.`,
    taken: 'Esa combinación la usa otra app o está reservada. Prueba otra.',
    invalid: 'Necesita Ctrl y Alt, más una letra, un número o una tecla F.',
  },
  pt: {
    listen: (k) => `Estou ouvindo… (${k} para parar)`, nothing: 'Não ouvi nada.', busy: 'Ainda estou respondendo, espera um pouco.',
    mic: 'Não tenho acesso ao microfone. Confira a permissão do microfone no Windows.',
    nokey: 'Para te ouvir preciso de uma chave da Groq ou da OpenAI: clique direito em mim › Modelo de IA › Chave de API.',
    failed: 'Meus ouvidos falharam:',
    capture: 'Aperte a nova combinação (Ctrl e Alt + uma tecla). Esc para cancelar.',
    captured: (k) => `Anotado: ${k}. Aperte para falar comigo.`,
    taken: 'Essa combinação é de outro app ou está reservada. Tente outra.',
    invalid: 'Precisa de Ctrl e Alt, mais uma letra, um número ou uma tecla F.',
  },
  ru: {
    listen: (k) => `Слушаю… (${k}, чтобы остановить)`, nothing: 'Ничего не расслышала.', busy: 'Я ещё отвечаю на прошлое, подожди.',
    mic: 'Нет доступа к микрофону. Проверь разрешение для микрофона в Windows.',
    nokey: 'Чтобы тебя слушать, нужен ключ Groq или OpenAI: правый клик по мне › ИИ-модель › API-ключ.',
    failed: 'Мои уши сдались:',
    capture: 'Нажми новую комбинацию (Ctrl и Alt + клавиша). Esc — отмена.',
    captured: (k) => `Запомнила: ${k}. Нажми, чтобы со мной поговорить.`,
    taken: 'Эта комбинация занята другой программой или зарезервирована. Попробуй другую.',
    invalid: 'Нужен Ctrl и Alt, плюс буква, цифра или клавиша F.',
  },
};

// the key a keyboard code names (KeyV → V, Digit3 → 3, F5 → F5), or null
function keyOf(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return null;
}

export class Ear {
  constructor({ host, chat, panel, capri, brain }) {
    this.host = host;
    this.chat = chat;
    this.panel = panel;
    this.capri = capri;
    this.brain = brain;
    this.recorder = null;
    this.stream = null;
    this.audio = null;
    this.chunks = [];
    this.meter = null;
    this.timer = null;
    this.busy = false;
    this.spoke = false;
    this.startedAt = 0;
    this.quietSince = 0;
  }

  get t() {
    return TEXT[this.brain.lang] || TEXT.en;
  }

  toggle() {
    if (this.recorder) return this.stop();
    if (this.busy) return undefined;
    return this.start();
  }

  async start() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      return this.say(this.t.mic);
    }
    this.stream = stream;
    this.chunks = [];
    this.spoke = false;
    this.quietSince = 0;
    this.startedAt = performance.now();
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    recorder.onstop = () => this.finish();
    this.recorder = recorder;
    recorder.start();
    this.watchVoice();
    this.timer = setTimeout(() => this.stop(), MAX_MS);
    this.capri.pulse();
    const { voiceKey } = await this.host.getConfig();
    this.say(this.t.listen(shown(voiceKey)));
  }

  // Loudness every tenth of a second: a pause after you spoke ends it, and so does a silence
  // that never breaks.
  watchVoice() {
    this.audio = new AudioContext();
    const analyser = this.audio.createAnalyser();
    analyser.fftSize = 2048;
    this.audio.createMediaStreamSource(this.stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    this.meter = setInterval(() => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      const loud = Math.sqrt(sum / data.length) > LEVEL;
      const now = performance.now();
      if (loud) {
        this.spoke = true;
        this.quietSince = 0;
      } else if (this.spoke) {
        this.quietSince ||= now;
        if (now - this.quietSince > SILENCE_MS) this.stop();
      } else if (now - this.startedAt > NO_SPEECH_MS) {
        this.stop();
      }
    }, 100);
  }

  stop() {
    if (!this.recorder) return;
    clearTimeout(this.timer);
    clearInterval(this.meter);
    const { recorder } = this;
    this.recorder = null;
    if (recorder.state !== 'inactive') recorder.stop(); // then finish(), once the last bit is in
  }

  // The recording: released, turned into text, and sent to her chat.
  async finish() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.audio?.close().catch(() => {});
    this.audio = null;
    if (!this.spoke || performance.now() - this.startedAt < MIN_MS) return this.say(this.t.nothing);
    if (this.chat.turn) return this.say(this.t.busy);
    this.busy = true;
    try {
      const wav = await toWav16k(new Blob(this.chunks, { type: this.chunks[0]?.type || 'audio/webm' }));
      const res = await this.host.transcribe(wav);
      if (!res.ok) return this.say(res.code === 'nokey' ? this.t.nokey : `${this.t.failed} ${res.error}`);
      const text = res.text.trim();
      if (!text) return this.say(this.t.nothing);
      const { voiceConfirm } = await this.host.getConfig();
      await this.chat.speak(text, { confirm: Boolean(voiceConfirm) });
    } catch (err) {
      this.say(`${this.t.failed} ${err.message}`);
    } finally {
      this.busy = false;
    }
    return undefined;
  }

  // "Other combination…" in her menu: the next key pressed (with Ctrl or Alt) becomes the voice key.
  // Esc cancels. Her keyboard is taken while she waits for it.
  capture() {
    if (this.recorder || this.busy) return;
    const finish = () => {
      document.removeEventListener('keydown', onKey, true);
      this.host.focusOverlay(false);
    };
    const onKey = async (e) => {
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return; // a modifier on its own: keep waiting
      e.preventDefault();
      e.stopPropagation();
      finish();
      if (e.key === 'Escape') return;
      const key = keyOf(e.code);
      const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean);
      if (!key || !(e.ctrlKey && e.altKey)) return this.say(this.t.invalid);
      this.keySet(await this.host.setVoiceKey([...mods, key].join('+')));
    };
    this.host.focusOverlay(true);
    this.say(this.t.capture);
    document.addEventListener('keydown', onKey, true);
  }

  // The result of picking or capturing a voice key: what she says about it.
  keySet(res) {
    if (res.ok) this.say(this.t.captured(shown(res.key)));
    else this.say(res.error === 'taken' ? this.t.taken : this.t.invalid);
  }

  // Her line about it: under her answer when her chat is open, else in her speech bubble.
  say(line) {
    if (this.chat.open) this.panel.stream(line, { done: true });
    else this.panel.say({ kind: 'info', line, hold: 3800 });
  }
}

// What the recording holds, as 16 kHz mono 16-bit WAV: the form the speech service takes.
async function toWav16k(blob) {
  const decoder = new AudioContext();
  const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
  await decoder.close();
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination); // a stereo recording comes down to mono here
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);
  return encodeWav(samples, rate);
}

function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset, s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);       // PCM header size
  view.setUint16(20, 1, true);        // PCM
  view.setUint16(22, 1, true);        // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // bytes per second
  view.setUint16(32, 2, true);        // bytes per frame
  view.setUint16(34, 16, true);       // bits per sample
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}
