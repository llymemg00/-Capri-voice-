// Talking to her: you type in her panel, and a model (setup.js picks which) answers as her, in
// writing. The replies are AI-generated, and the panel says so on every chat.
// She can do a few things on your PC when you ask (Windows): open an app or a game, play music or
// control what's playing, open a website, close an app. She spots what you want in what you wrote,
// or the model asks for it with a tag in its answer. Music right away; an app you named yourself
// right away; anything only the model asked for, a website, and closing an app behind a button.

import { pick, fmt } from './util.js';
import { ASSISTANT_NAMES } from './lines.js';

const REMEMBER = 20; // messages she has in mind when answering
// what she says about osu! mode, by language (English when there is no line for the language)
const HAND_TEXT = {
  en: { power: 'Done: {action}.', focused: 'Switched to {app}.', fileMade: 'I made the file: {path}', searching: 'Searching Google for "{query}".', muted: 'I pressed the mic key in Discord.', deafened: 'I pressed the headphones key in Discord.', discordNoKey: 'Set discordMuteKey in my settings file first, to the shortcut you set in Discord.', failed: 'That didn\'t work: {error}', trashIt: 'Send {path} to the Recycle Bin', trashed: 'It is in the Recycle Bin: {path}', no: 'No' },
  fr: { power: 'C\'est fait : {action}.', focused: 'Je suis passée sur {app}.', fileMade: 'J\'ai créé le fichier : {path}', searching: 'Je cherche « {query} » sur Google.', muted: 'J\'ai appuyé sur la touche micro dans Discord.', deafened: 'J\'ai appuyé sur la touche casque dans Discord.', discordNoKey: 'Mets d\'abord discordMuteKey dans mon fichier de réglages, avec le raccourci que tu as mis dans Discord.', failed: 'Ça n\'a pas marché : {error}', trashIt: 'Envoyer {path} à la Corbeille', trashed: 'C\'est dans la Corbeille : {path}', no: 'Non' },
  es: { power: 'Hecho: {action}.', focused: 'Cambié a {app}.', fileMade: 'Creé el archivo: {path}', searching: 'Busco «{query}» en Google.', muted: 'Pulsé la tecla del micro en Discord.', deafened: 'Pulsé la tecla de los auriculares en Discord.', discordNoKey: 'Pon primero discordMuteKey en mi archivo de ajustes, con el atajo que pusiste en Discord.', failed: 'No funcionó: {error}', trashIt: 'Enviar {path} a la Papelera', trashed: 'Está en la Papelera: {path}', no: 'No' },
  pt: { power: 'Feito: {action}.', focused: 'Mudei para {app}.', fileMade: 'Criei o arquivo: {path}', searching: 'Pesquisando «{query}» no Google.', muted: 'Apertei a tecla do microfone no Discord.', deafened: 'Apertei a tecla dos fones no Discord.', discordNoKey: 'Coloque primeiro discordMuteKey no meu arquivo de configurações, com o atalho que você definiu no Discord.', failed: 'Não deu certo: {error}', trashIt: 'Enviar {path} para a Lixeira', trashed: 'Está na Lixeira: {path}', no: 'Não' },
  ru: { power: 'Сделано: {action}.', focused: 'Переключила на {app}.', fileMade: 'Я создала файл: {path}', searching: 'Ищу «{query}» в Google.', muted: 'Нажала клавишу микрофона в Discord.', deafened: 'Нажала клавишу наушников в Discord.', discordNoKey: 'Сначала укажите discordMuteKey в файле настроек: то же сочетание, что вы назначили в Discord.', failed: 'Не получилось: {error}', trashIt: 'Отправить {path} в корзину', trashed: 'Отправлено в корзину: {path}', no: 'Нет' },
};

function handText(lang, key, data = {}) {
  const t = HAND_TEXT[lang] || HAND_TEXT.en;
  return fill(t[key] || HAND_TEXT.en[key], data);
}

const OSU_TEXT = {
  en: {
    started: 'osu!lazer is up. I\'m keeping track of your session.',
    startedNoStats: 'osu!lazer is up. I\'ll count the time; add your osu! API details to the config to see the rating.',
    stopped: 'osu! mode off.',
    nopath: 'Set the path to osu!.exe in the config first (osuPath).',
    error: 'osu! wouldn\'t start.',
    session: 'Session on. Good luck.',
    end: 'Session over: {minutes} min, {pp} pp{rank}.',
    endNoStats: 'Session over: {minutes} min.',
    endFailed: 'Session over: {minutes} min, but osu! didn\'t answer ({error}).',
    rank: ' (rank #{rank})',
  },
  fr: {
    started: 'osu!lazer est lancé. Je garde la trace de ta session.',
    startedNoStats: 'osu!lazer est lancé. Je compte le temps ; mets tes identifiants API osu! dans la config pour voir le rating.',
    stopped: 'Mode osu éteint.',
    nopath: 'Mets d\'abord le chemin de osu!.exe dans la config (osuPath).',
    error: 'osu! n\'a pas démarré.',
    session: 'Session lancée. Bonne chance.',
    end: 'Session finie : {minutes} min, {pp} pp{rank}.',
    endNoStats: 'Session finie : {minutes} min.',
    endFailed: 'Session finie : {minutes} min, mais osu! n\'a pas répondu ({error}).',
    rank: ' (rang #{rank})',
  },
  es: {
    started: 'osu!lazer está en marcha. Llevo la cuenta de tu sesión.',
    startedNoStats: 'osu!lazer está en marcha. Cuento el tiempo; pon tus datos de la API de osu! en la configuración para ver el rating.',
    stopped: 'Modo osu desactivado.',
    nopath: 'Primero pon la ruta de osu!.exe en la configuración (osuPath).',
    error: 'osu! no arrancó.',
    session: 'Sesión iniciada. Suerte.',
    end: 'Sesión terminada: {minutes} min, {pp} pp{rank}.',
    endNoStats: 'Sesión terminada: {minutes} min.',
    endFailed: 'Sesión terminada: {minutes} min, pero osu! no respondió ({error}).',
    rank: ' (puesto #{rank})',
  },
  pt: {
    started: 'osu!lazer está aberto. Estou acompanhando sua sessão.',
    startedNoStats: 'osu!lazer está aberto. Conto o tempo; coloque seus dados da API do osu! na configuração para ver o rating.',
    stopped: 'Modo osu desligado.',
    nopath: 'Primeiro coloque o caminho do osu!.exe na configuração (osuPath).',
    error: 'O osu! não abriu.',
    session: 'Sessão iniciada. Boa sorte.',
    end: 'Sessão encerrada: {minutes} min, {pp} pp{rank}.',
    endNoStats: 'Sessão encerrada: {minutes} min.',
    endFailed: 'Sessão encerrada: {minutes} min, mas o osu! não respondeu ({error}).',
    rank: ' (posição #{rank})',
  },
  ru: {
    started: 'osu!lazer запущен. Я слежу за сессией.',
    startedNoStats: 'osu!lazer запущен. Я считаю время; добавьте данные osu! API в конфиг, чтобы видеть рейтинг.',
    stopped: 'Режим осу выключен.',
    nopath: 'Сначала укажите путь к osu!.exe в конфиге (osuPath).',
    error: 'osu! не запустился.',
    session: 'Сессия пошла. Удачи.',
    end: 'Сессия окончена: {minutes} мин, {pp} pp{rank}.',
    endNoStats: 'Сессия окончена: {minutes} мин.',
    endFailed: 'Сессия окончена: {minutes} мин, но osu! не ответил ({error}).',
    rank: ' (место #{rank})',
  },
};

function osuText(lang, key, data = {}) {
  const t = OSU_TEXT[lang] || OSU_TEXT.en;
  let line = t[key] || OSU_TEXT.en[key] || key;
  if (key === 'end' && data.rank == null) line = line.replace('{rank}', '');
  const values = {
    ...data,
    minutes: Math.max(0, Math.round((data.seconds || 0) / 60)),
    pp: data.pp == null ? '' : `${data.pp >= 0 ? '+' : ''}${Number(data.pp).toFixed(2)}`,
    rank: data.rank == null ? '' : fill(t.rank || OSU_TEXT.en.rank, { rank: data.rank }),
  };
  return line.replace(/\{(\w+)\}/g, (_, k) => (values[k] ?? ''));
}

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (values[k] ?? ''));
}

const KEEP = 60;     // messages she remembers across restarts (memory.json)
// her language, where small models need it: how she says "we" (else it's in English), and the last line
// of her prompt, in that language (they drift into the English of everything above it)
const IN_LANGUAGE = {
  fr: { we: '"on" or "nous" in French', last: 'Écris tout en français, sauf si l’utilisateur t’écrit dans une autre langue : alors dans la sienne. Seuls les mots d’argot de Night City restent en anglais, jamais une phrase entière.' },
  en: { we: '', last: 'Write everything in English, unless the user writes to you in another language: then in theirs.' },
  es: { we: '"nosotros" in Spanish', last: 'Escribe todo en español, salvo si el usuario te escribe en otro idioma: entonces en el suyo. Solo las palabras de jerga de Night City se quedan en inglés, nunca una frase entera.' },
  pt: { we: '"a gente" or "nós" in Portuguese', last: 'Escreva tudo em português do Brasil, a não ser que o usuário te escreva em outra língua: aí, na dele. Só as gírias de Night City ficam em inglês, nunca uma frase inteira.' },
  ru: { we: '"мы" in Russian', last: 'Пиши всё по-русски, если только пользователь не пишет тебе на другом языке: тогда на его языке. По-английски остаются только словечки Найт-Сити, никогда не целые фразы.' },
};
const STAY_MS = 10 * 60 * 1000; // no wandering off mid-conversation
const LOADING_AFTER_MS = 5000;
const CLIPBOARD_MAX = 2500; // characters of the clipboard she reads: more slows a small local model down
const CLOSE_TAG = /\[\[\s*close\s*:?\s*([^\]]*)\]\]/i; // [[close: AM Music]] at the end of her answer
// "close", "shut down", "ferme", "quitte", "cierra", "fecha", "закрой"... in any of her languages
const CLOSE_ASK = /\b(close|shut|quit|kill|exit)|ferm|quitt|coupe|arr[êe]t|cierr|cerra|fech|закр|выключ/i;
// asks about what is copied: "what's in the clipboard", "translate what I copied" (any language)
const CLIPBOARD_ASK = /clipboard|буфер|presse-papier|portapapel|área de transfer|copié|copiado|copiei|скопир|what i copied/i;
// her other tags: [[open: Spotify]], [[music: Bad Bunny]], [[media: next]], [[site: youtube.com]]
const TAG = /\[\[\s*(open|music|media|site)\s*:\s*([^\]]*)\]\]/i;
// her hands: [[file: PLACE | NAME | TEXT]], [[trash: FULL PATH]], [[search: QUERY]], [[discord: mute|deafen]]
const HAND_TAG = /\[\[\s*(file|trash|search|discord|power|focus)\s*:\s*([^\]]*)\]\]/i;
// she only acts on these when your own words asked for it, so a tag alone never does anything
const HAND_ASK = {
  file: (t) => /fichier|archivo|arquivo|\bfile\b|\btxt\b|файл/i.test(t) && /creat|crée|crea|cria|созд|сделай|make|new|nouveau|nuevo|novo/i.test(t),
  trash: (t) => /supprim|borra|apag|delete|remove|trash|corbeille|papelera|lixeira|удали|корзин|убери/i.test(t),
  search: (t) => /google|гугл|загугл|search|recherch|busca|pesquis|найди|поищи/i.test(t),
  discord: (t) => /discord|дискорд|микро|mic\b|micro|наушник|deafen|mute|заглуш|casque|auricular|fone/i.test(t),
  // only when you named the power action yourself: a chat about shutdowns is not a shutdown
  power: (t) => /выключи (компьютер|пк|комп|ноут)|выруби|перезагруз|restart|reboot|shut ?down|turn off (my |the )?(pc|computer)|спящ|sleep mode|заблокируй|lock (my |the )?(pc|screen|computer)|выйди из системы|sign ?out|log ?out|éteins|redémarre|verrouille|apaga(r)? (el |mi )?(pc|ordenador|computadora)|reinicia|bloquea|desliga(r)? (o )?(pc|computador)|reinicia|bloqueia|отмени.*(выключени|перезагрузк)|cancel (the )?shutdown/i.test(t),
  focus: (t) => /переключи|покажи|открой окно|перейди|switch to|bring up|show me|go to|passe sur|cambia a|muestra|troca para|mostra/i.test(t),
};
// "open", "launch", "ouvre", "lance", "abre", "открой"... in any of her languages
// osu! mode: "режим осу", "osu mode", "modo osu"; off: "выключи осу", "stop osu"
const OSU_OFF = /(выключи|выключить|отключи|stop|arr[eê]te|apaga|desliga)[^\n]*(осу|osu)/i;
const OSU_ASK = /режим\s*осу|осу\s*режим|osu\s*mode|mode\s*osu|modo\s*osu|mode\s*osu!/i;
const OPEN_ASK = /\b(open|launch|start|run)\b|ouvr|lance|démarre|abre|abrir|inicia|ejecuta|executa|открой|запусти/i;
// what to do with the music playing, said plainly (only when it's about music, or said in a few words)
const MEDIA_ASK = [
  ['pause', /\b(pause|pausa|pausar)\b|stop (the )?music|arrête la musique|пауз/i],
  ['next', /\b(next|skip|suivante?|siguiente|próxima|proxima)\b|passe (à )?la suivante|salta|pula|следующ/i],
  ['previous', /\b(previous|précédente?|anterior)\b|предыдущ/i],
  ['play', /\b(resume|reprends|reanuda|retoma)\b|relance la musique|remets la musique|продолж/i],
  ['volup', /\b(louder|plus fort)\b|monte le son|turn (it )?up|sube el volumen|aumenta o volume|громче/i],
  ['voldown', /\b(quieter|moins fort)\b|baisse le son|turn (it )?down|baja el volumen|abaixa o volume|тише/i],
  ['mute', /\bmute\b|coupe le son|silencia|sem som|выключи звук/i],
];
const MUSIC_WORD = /musi|chanson|song|track|titre|morceau|spotify|canci|faixa|песн|музык|трек/i;
// "put X on Spotify", "mets X sur Spotify", "pon X en Spotify", "coloca X no Spotify", "включи X в Spotify"
const SPOTIFY_ASK = /(?:play|put on|put|mets|joue|lance|écoute|pon|toca|reproduce|coloca|toque|включи|поставь)\s+(?:moi\s+|me\s+)?(.+?)\s+(?:on|sur|en|no|na|в)\s+spotify/i;
const MEDIA_ACTIONS = new Set(MEDIA_ASK.map(([action]) => action));
// what her tag needs to find in your message before it does anything: a small model tags answers about
// anything ("[[music: synthwave]]" under a film tip), and music and the media keys act right away
const LISTEN = /[ée]cout|listen|escuch|\bouv(ir|e)\b|слуша|playlist|album|\b(play|joue|mets|pon|toca|coloca)\b|включи|поставь/i;
const SOUND = /\b(sound|volume|volumen)\b|\b(le|du|au) son\b|\bo som\b|звук|громк/i; // not "son": "his" in French
const PLAY = /\bjou(er|e)\b|\bplay\b|jugar|juega|jogar|joga|играть|поигра/i;
const SITE = /\b(site|web|page|lien|link|url|enlace|p[aá]gina)|сайт|ссылк|\.(com|fr|org|net|io|gg|tv|be|ch|ca|es|br|pt|ru)\b/i;
// "appelle-moi Max", "call me Max", "llámame Max", "me chama de Max", "зови меня Макс"
const NAME_ASK = /(?:appelle[- ]moi|call me|my name is|je m['’]appelle|ll[aá]mame|me llamo|me cham[ae] de|meu nome [eé]|зови меня|меня зовут)\s+([\p{L}\p{N}'’-]{1,24})/iu;
// "souviens-toi que…", "remember that…", "recuerda que…", "lembra que…", "запомни, что…" (said first thing)
const MEMO_ASK = /^\s*(?:capri,?\s+|stp,?\s+|please,?\s+)?(?:souviens[- ]toi(?: que| de)?|n['’]oublie pas(?: que| de)?|remember(?: that)?|recuerda(?: que)?|lembr[ae](?:-se)?(?: que| de)?|запомни,?(?: что)?)\s+(.{3,200})/iu;
const MEMORIES_MAX = 30;
// sites asked for by name ("open youtube") when no app on the PC goes by it: the address is hers, not
// the model's, so it opens right away like an app you named
const SITES = {
  youtube: 'https://www.youtube.com', google: 'https://www.google.com', gmail: 'https://mail.google.com',
  twitch: 'https://www.twitch.tv', netflix: 'https://www.netflix.com', reddit: 'https://www.reddit.com',
  twitter: 'https://x.com', instagram: 'https://www.instagram.com', tiktok: 'https://www.tiktok.com',
  facebook: 'https://www.facebook.com', github: 'https://github.com', chatgpt: 'https://chatgpt.com',
  wikipedia: 'https://www.wikipedia.org', linkedin: 'https://www.linkedin.com', pinterest: 'https://www.pinterest.com',
  crunchyroll: 'https://www.crunchyroll.com', outlook: 'https://outlook.live.com', whatsapp: 'https://web.whatsapp.com',
  discord: 'https://discord.com/app', soundcloud: 'https://soundcloud.com', deezer: 'https://www.deezer.com',
};
// a browser named with a site ("open youtube on chrome"): the site, in the browser you use
const BROWSER = /chrome|edge|firefox|opera|brave|vivaldi|duckduckgo|browser/i;
// local models this small mostly talk nonsense ("llama3.2:1b", "qwen2.5:0.5b"…)
const TINY = /[:-](0\.5b|1b|1\.5b|135m|270m|360m)\b/i;

export class Chat {
  constructor({ capri, panel, voice, host, brain }) {
    this.capri = capri;
    this.panel = panel;
    this.voice = voice;
    this.host = host;
    this.brain = brain;
    this.history = []; // your chats with her, [{ role, content }], kept by main.js across restarts
    this.warm = false; // a model already answered this run (Ollama's first answer waits for it to load)
    this.open = false;
    this.turn = 0;     // id of the answer coming in, if any
    this.answer = '';
    this.apps = [];    // the apps open on this PC, as last listed: [{ name, label }]
    this.appsReady = Promise.resolve();
    this.onSetup = null; // (status) => void: she can't answer yet (app.js hands it to setup.js)
    this.onBetterModel = null; // () => void: a bigger model than the tiny one she's on (setup.js)
    host.onChatDelta(({ id, text }) => this.onDelta(id, text));
  }

  get t() {
    return this.brain.t.chat;
  }

  async start() {
    const { capri, host, t } = this;
    if (this.open) {
      this.panel.chatInput.focus();
      return;
    }
    if (capri.stowed) {
      host.setConfig({ visible: true });
      await capri.unstow();
    }
    capri.wake();
    const status = await host.chatStatus();
    if (!status.ok && this.onSetup) {
      this.onSetup(status); // nothing to talk with yet: she sets it up with you, with buttons (setup.js)
      return;
    }
    if (!status.ok) {
      // no Ollama, or nothing to talk with yet: what to do about it
      const offline = status.error === 'offline';
      const other = !offline && status.error !== 'nomodel'; // another provider, saying why
      capri.perform('curious', capri.towardCenter());
      this.panel.say({
        kind: 'info',
        face: 'aside',
        guide: true,
        line: other ? t.failed : offline ? t.offline : t.noModel,
        quote: other ? status.error : offline ? t.offlineHow : t.noModelHow,
        actions: offline
          ? [{ id: 'get', label: t.getOllama, primary: true }, { id: 'ok', label: t.ok }]
          : [{ id: 'ok', label: t.ok, primary: true }],
        onAction: (id) => {
          if (id === 'get') host.openOllama();
          this.panel.hide();
        },
        hold: null,
      });
      return;
    }
    this.history = await host.chatMemory().catch(() => this.history); // "forget" in her menu may have emptied it
    this.cold = status.warmup && !this.warm;
    this.agent = Boolean(status.agent); // Claude Code answers, as her, and really works in your project
    this.listApps();
    const shortModel = status.model.replace(/:latest$/, '').replace(/^models\//, ''); // Ollama's tag, Gemini's prefix
    const tiny = status.provider === 'ollama' && TINY.test(status.model) && this.onBetterModel;
    host.focusOverlay(true); // the keyboard, for typing to her
    const shown = this.panel.say({
      kind: 'chat',
      face: 'look',
      badge: t.badge,
      tag: shortModel,
      line: tiny ? fmt(t.tiny, { model: shortModel }) : pick(this.history.length ? t.again : t.hello),
      actions: tiny ? [{ id: 'better', label: t.better, primary: true }] : [],
      onAction: () => {
        this.panel.hide(); // her chat holds off her guide's panels: it goes first
        this.onBetterModel?.();
      },
      chat: {
        placeholder: t.placeholder,
        send: t.send,
        close: t.close,
        noteTag: t.noteTag,
        note: status.local ? t.note : t.noteCloud,
      },
      onSend: (text) => this.send(text),
      onLeave: () => this.close(),
      hold: null,
    });
    if (!shown) {
      host.focusOverlay(false); // something more important is on (a permission prompt)
      return;
    }
    this.open = true;
    setTimeout(() => this.panel.chatInput.focus(), 150); // once the overlay has the keyboard
    capri.perform('hop');
    capri.nextMove = capri.nextGaze = performance.now() + STAY_MS;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    if (this.turn) this.host.chatStop(this.turn);
    this.turn = 0;
    this.host.focusOverlay(false);
    this.capri.nextMove = performance.now() + 30000;
    this.capri.nextGaze = performance.now() + 60000;
  }

  // a failed turn never leaves the chat stuck: the next message is answered
  async send(text) {
    try {
      await this.sendTurn(text);
    } catch (err) {
      console.error('[capri] chat turn:', err);
      this.turn = 0;
      this.panel.setChatBusy(false);
      this.panel.stream(`${this.t.failed} ${err.message}`, { done: true });
    }
  }

  async sendTurn(text) {
    if (this.turn || !this.open) return;
    const id = Date.now();
    this.turn = id;
    this.answer = '';
    // "what's in my clipboard", "translate what I copied": the copied text goes to her with your words;
    // the chat shows only your words
    const clip = CLIPBOARD_ASK.test(text) && !this.agent ? await this.host.clipboard() : null;
    const modelText = clip === null
      ? text
      : `${text}\n\n[Clipboard contents, use them for the request above]\n${clip ? clip.slice(0, CLIPBOARD_MAX) : '(the clipboard is empty)'}`;
    // the history keeps your words only: the copied text goes with this one request, not every later one
    this.history.push({ role: 'user', content: text });
    this.panel.setChatBusy(true);
    this.panel.setActions([]); // a close button she offered before goes with a new message
    this.panel.chatTurn({ quote: text, face: 'aside' });
    this.capri.pulse();
    // what you asked for plainly happens right away (the music, the volume, an app you named): her
    // line about it comes under her answer (Claude Code, answering her chat, does things its own way)
    const asked = this.agent ? null : this.asked(text);
    const early = asked && asked.kind !== 'close' ? this.doNow(asked) : null;
    await Promise.race([this.appsReady, new Promise((r) => setTimeout(r, 1500))]);
    const messages = [{ role: 'system', content: this.persona() }, ...this.history.slice(-REMEMBER)];
    if (clip !== null) messages[messages.length - 1] = { role: 'user', content: modelText };
    // nothing yet after a few seconds: Ollama is still loading the model (the first answer after a start),
    // or Claude Code is at work
    const wait = this.agent ? this.t.working : this.cold ? this.t.loading : null;
    const slow = wait && setTimeout(() => {
      if (this.turn === id && !this.answer) this.panel.stream(wait);
    }, LOADING_AFTER_MS);
    const res = await this.host.chatSend({ id, messages });
    clearTimeout(slow);
    if (this.turn !== id) {
      // closed meanwhile: your message goes too, or the next answer would answer it as well
      if (this.history.at(-1)?.content === text) this.history.pop();
      return;
    }
    this.turn = 0;
    if (!res.ok) {
      this.history.pop();
      this.panel.setFace('wide');
      // too busy or gone even after trying other models (main.js): said plainly, not the server's JSON
      this.panel.stream(res.code === 'busy' ? this.t.swamped : res.code === 'gone' ? this.t.gone : `${this.t.failed} ${res.error}`, { done: true });
      this.panel.setChatBusy(false);
      return;
    }
    const answer = clean(res.text) || '…';
    this.warm = true;
    this.remember({ role: 'assistant', content: answer });
    this.panel.stream(answer, { done: true });
    this.panel.setFace(mood(answer));
    this.panel.setChatBusy(false);
    if (!this.agent) this.after(res.text, answer, asked, early, text);
    this.listApps(); // fresh for the next message
  }

  // What you said to her (ear.js): sent exactly as if you had typed it, so every command works the same.
  // Her chat opens first if it's closed. confirm: the words go in her box, sent on Enter, instead.
  async speak(text, { confirm = false } = {}) {
    if (this.turn) return false; // still answering the last one
    if (!this.open) {
      await this.start();
      if (!this.open) return false; // no model yet: she's setting it up, or telling you why
    }
    if (confirm) {
      this.panel.chatInput.value = text;
      this.panel.chatInput.focus();
      return true;
    }
    this.send(text);
    return true;
  }

  // osu! reports from main (osu.js): a session started or ended
  osuEvent(cmd) {
    const lang = this.brain.lang;
    const seconds = cmd.seconds;
    let line;
    if (cmd.event === 'start') line = osuText(lang, 'session');
    else if (cmd.error) line = osuText(lang, 'endFailed', { seconds, error: cmd.error });
    else if (!cmd.stats || cmd.pp == null) line = osuText(lang, 'endNoStats', { seconds });
    else line = osuText(lang, 'end', { seconds, pp: cmd.pp, rank: cmd.rank });
    this.panel.say({ kind: 'info', line, hold: 9000 });
  }

  // an answer of hers, kept with your message before it
  remember(message) {
    this.history.push(message);
    this.history = this.history.slice(-KEEP);
    this.host.chatRemember(this.history);
  }

  listApps() {
    this.appsReady = this.host.openApps().then((list) => { this.apps = list || []; }).catch(() => {});
  }

  // What you asked plainly, read off your message (a small model doesn't always write its tag right):
  // { kind: 'media', action } | { kind: 'music', song } | { kind: 'close', name } | { kind: 'open', text }
  asked(text) {
    const count = text.trim().split(/\s+/).length;
    const name = NAME_ASK.exec(text)?.[1];
    if (name) return { kind: 'name', name };
    const memo = MEMO_ASK.exec(text)?.[1]?.trim();
    if (memo) return { kind: 'memo', text: memo };
    if (OSU_OFF.test(text)) return { kind: 'osuOff' };
    if (OSU_ASK.test(text)) return { kind: 'osu' };
    const media = MEDIA_ASK.find(([, re]) => re.test(text))?.[0];
    if (media && (count <= 5 || MUSIC_WORD.test(text))) return { kind: 'media', action: media };
    const song = SPOTIFY_ASK.exec(text)?.[1];
    if (song) return { kind: 'music', song };
    const app = this.askedToClose(text);
    if (app) return { kind: 'close', name: app };
    if (OPEN_ASK.test(text) && count <= 8) return { kind: 'open', text };
    return null;
  }

  // Doing it now. Resolves with her line about it ({ line, face }), or null if there was nothing to do.
  async doNow(asked) {
    const { t } = this;
    const custom = this.brain.custom;
    if (asked.kind === 'osu' || asked.kind === 'osuOff') {
      if (asked.kind === 'osuOff') {
        await this.host.osuStop();
        return { line: osuText(this.brain.lang, 'stopped'), face: 'smug' };
      }
      const res = await this.host.osuStart();
      if (!res.ok) return { line: osuText(this.brain.lang, res.code === 'nopath' ? 'nopath' : 'error'), face: 'wide' };
      return { line: osuText(this.brain.lang, res.configured ? 'started' : 'startedNoStats'), face: 'laugh' };
    }
    if (asked.kind === 'name') {
      custom.userName = asked.name; // her answer, being written now, already knows it
      this.host.setConfig({ userName: asked.name });
      return { line: fmt(this.brain.t.custom.named, { name: asked.name }), face: 'laugh' };
    }
    if (asked.kind === 'memo') {
      custom.memories = [...(custom.memories || []).filter((m) => m !== asked.text), asked.text].slice(-MEMORIES_MAX);
      this.host.setConfig({ memories: custom.memories });
      return { line: this.brain.t.custom.remembered, face: 'smug' };
    }
    if (asked.kind === 'media') {
      this.capri.pulse();
      return (await this.host.media(asked.action))
        ? { line: t.media[asked.action], face: 'smug' }
        : { line: t.media.none, face: 'smug' };
    }
    if (asked.kind === 'music') {
      this.zap();
      return (await this.host.music(asked.song)) ? { line: fmt(t.music, { song: asked.song }), face: 'laugh' } : null;
    }
    const item = await this.host.findLaunch(asked.text);
    const site = namedSite(asked.text);
    if (site && (!item || BROWSER.test(item.name))) {
      this.zap();
      return (await this.host.openSite(site.url)) ? { line: fmt(t.siteOpened, { site: site.name }), face: 'laugh' } : null;
    }
    if (!item) return null; // nothing by that name here: her tag may still say what you meant
    this.zap();
    const res = await this.host.launch(item);
    return { line: res.ok ? fmt(t.opened, { app: item.name }) : `${t.failed} ${res.error}`, face: res.ok ? 'laugh' : 'aside' };
  }

  // Once she has answered: her line about what she did, else the app you asked to close, else what
  // her tag asks for, if your message (text) asked for that kind of thing.
  async after(raw, answer, asked, early, text) {
    const { t } = this;
    const done = early && (await early);
    if (done) return this.addLine(answer, done.line, done.face);
    if (asked?.kind === 'close') return this.offerClose(asked.name, answer);
    if (asked && asked.kind !== 'open') return undefined; // music that didn't work out: nothing more to offer
    const closeTag = tagged(raw);
    if (closeTag) return wanted('close', text) ? this.offerClose(closeTag, answer) : undefined;
    const hand = HAND_TAG.exec(raw);
    if (hand) return this.hand(hand[1].toLowerCase(), hand[2].trim(), answer, text);
    const tag = TAG.exec(raw);
    if (!tag) return undefined;
    const kind = tag[1].toLowerCase();
    const value = tag[2].trim();
    if (!value || !wanted(kind, text)) return undefined;
    if (kind === 'media') return MEDIA_ACTIONS.has(value.toLowerCase()) ? this.media(value.toLowerCase(), answer) : undefined;
    if (kind === 'music') return this.music(value, answer);
    if (kind === 'site') return this.offerSite(value, answer);
    const item = await this.host.findLaunch(value);
    if (item) return this.launch(item, answer);
    const site = namedSite(value); // "[[open: YouTube]]": a site, not an app
    return site ? this.offerSite(site.url, answer) : this.addLine(answer, fmt(t.notInstalled, { app: value }));
  }

  // her answer, with a line of what she did under it
  addLine(answer, line, face = null) {
    if (!this.open || this.turn) return;
    this.panel.stream(`${answer}\n${line}`, { done: true });
    if (face) this.panel.setFace(face);
  }

  // a bolt of red lightning off her fingers, at whatever she's doing on your PC
  zap() {
    const h = this.capri.head();
    this.capri.zap(h.x + this.capri.towardCenter() * 280, h.y - 170);
  }

  // An app or a game her tag asked for: behind a button (now: the button was clicked).
  async launch(item, answer, { now = false } = {}) {
    const { t } = this;
    if (!this.open || this.turn) return;
    if (!now) {
      this.panel.setActions(
        [{ id: 'open', label: fmt(t.openIt, { app: item.name }), primary: true }, { id: 'no', label: t.no }],
        (id) => (id === 'open' ? this.launch(item, answer, { now: true }) : this.panel.setActions([])),
      );
      return;
    }
    this.panel.setActions([]);
    this.zap();
    const res = await this.host.launch(item);
    this.addLine(answer, res.ok ? fmt(t.opened, { app: item.name }) : `${t.failed} ${res.error}`, res.ok ? 'laugh' : 'aside');
  }

  // The media keys: pause, next, louder…
  async media(action, answer) {
    this.capri.pulse();
    const ok = await this.host.media(action);
    this.addLine(answer, ok ? this.t.media[action] : this.t.media.none, 'smug');
  }

  // A Spotify search, in the app if it's there.
  async music(song, answer) {
    this.zap();
    const ok = await this.host.music(song);
    if (ok) this.addLine(answer, fmt(this.t.music, { song }), 'laugh');
  }

  // A website: always behind a button that shows where it goes.
  offerSite(address, answer) {
    const { t } = this;
    let host;
    try {
      host = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`).hostname;
    } catch {
      return;
    }
    if (!this.open || this.turn || !host.includes('.')) return;
    this.panel.setActions(
      [{ id: 'site', label: fmt(t.siteIt, { site: host }), primary: true }, { id: 'no', label: t.no }],
      async (id) => {
        this.panel.setActions([]);
        if (id !== 'site') return;
        const ok = await this.host.openSite(address);
        if (ok) this.addLine(answer, fmt(t.siteOpened, { site: host }));
      },
    );
  }

  // "close am music pls": an app that's open, named in a message asking to close something.
  askedToClose(text) {
    if (!CLOSE_ASK.test(text)) return null;
    const said = simple(text);
    let best = null;
    for (const app of this.apps) {
      for (const name of [simple(app.name), simple(app.label)]) {
        if (name.length >= 3 && said.includes(name) && (!best || name.length > best.length)) best = { app, length: name.length };
      }
    }
    return best?.app.name || null;
  }

  // She was asked to close an app: a button with its name, and nothing happens until you click it.
  // her hands: a text file, a Google search, Discord's mic and headphones keys, a file to the Recycle Bin
  async hand(kind, value, answer, text) {
    const lang = this.brain.lang;
    if (!value || !HAND_ASK[kind]?.(text)) return undefined;
    if (kind === 'file') {
      const [place, name, ...rest] = value.split('|');
      const res = await this.host.createFile({ place: (place || '').trim(), name: (name || '').trim(), content: rest.join('|').trim() });
      return this.addLine(answer, res.error ? handText(lang, 'failed', res) : handText(lang, 'fileMade', { path: res.path }));
    }
    if (kind === 'search') {
      await this.host.openSearch(value);
      return this.addLine(answer, handText(lang, 'searching', { query: value }));
    }
    if (kind === 'discord') {
      const action = /deaf|casque|auricular|fone|наушник/i.test(value) ? 'deafen' : 'mute';
      const res = await this.host.discordKey(action);
      if (res.error === 'nokey') return this.addLine(answer, handText(lang, 'discordNoKey'));
      if (res.error) return this.addLine(answer, handText(lang, 'failed', res));
      return this.addLine(answer, handText(lang, action === 'deafen' ? 'deafened' : 'muted'));
    }
    if (kind === 'power') {
      const action = value.toLowerCase().replace(/[\s-]+/g, '_');
      const res = await this.host.power(action);
      return this.addLine(answer, res.error ? handText(lang, 'failed', res) : handText(lang, 'power', { action }));
    }
    if (kind === 'focus') {
      const res = await this.host.focusWindow(value);
      return this.addLine(answer, res.error ? handText(lang, 'failed', res) : handText(lang, 'focused', { app: value }));
    }
    if (kind === 'trash') {
      this.panel.setActions(
        [{ id: 'trash', label: handText(lang, 'trashIt', { path: value }), primary: true }, { id: 'no', label: handText(lang, 'no') }],
        (id) => (id === 'trash' ? this.trash(value, answer) : this.panel.setActions([])),
      );
      return undefined;
    }
    return undefined;
  }

  async trash(target, answer) {
    const lang = this.brain.lang;
    this.panel.setActions([]);
    const res = await this.host.trashFile(target);
    return this.addLine(answer, res.error ? handText(lang, 'failed', res) : handText(lang, 'trashed', { path: target }));
  }

  async offerClose(wanted, answer) {
    const { t } = this;
    const app = await this.host.findApp(wanted);
    if (!this.open || this.turn) return;
    if (!app) {
      this.panel.stream(`${answer}\n${fmt(t.notFound, { app: wanted })}`, { done: true });
      return;
    }
    this.panel.setActions(
      [{ id: 'close', label: fmt(t.closeIt, { app: app.name }), primary: true }, { id: 'no', label: t.no }],
      (id) => (id === 'close' ? this.closeApp(app) : this.panel.setActions([])),
    );
  }

  async closeApp(app, force = false) {
    const { t, capri } = this;
    this.panel.setActions([]);
    // a bolt of red lightning off her fingers, at it
    const h = capri.head();
    capri.zap(h.x + capri.towardCenter() * 280, h.y - 170);
    const res = await this.host.closeApp(app.name, force);
    if (!this.open) return;
    let line;
    if (res.error) line = `${t.failed} ${res.error}`;
    else if (!res.running) line = fmt(force ? t.forced : t.closed, { app: app.name });
    else line = fmt(force ? t.unkillable : t.stillOpen, { app: app.name });
    this.panel.setFace(res.running || res.error ? 'aside' : 'laugh');
    this.panel.stream(line, { done: true });
    this.remember({ role: 'assistant', content: line });
    // it hid in the tray, or it's asking you to save something: forcing it is your call
    if (res.running && !force && !res.error) {
      this.panel.setActions(
        [{ id: 'force', label: t.force, primary: true }, { id: 'leave', label: t.leave }],
        (id) => (id === 'force' ? this.closeApp(app, true) : this.panel.setActions([])),
      );
    }
    this.listApps();
  }

  // What she can do on the PC when you ask (Windows), and nothing else.
  powers() {
    const lines = [
      'Only when the user asks you to open an app or a game installed on their PC, play something on Spotify, control the music playing, or open a website: say in a few words that you will, and end your answer with one tag: [[open: NAME]], [[music: WHAT TO PLAY]], [[media: ACTION]] (ACTION: pause, play, next, previous, volup, voldown or mute), or [[site: ADDRESS]]. Some of these get a button to confirm, so never say it is already done. Her hands: when the user asks her to create a text file, end your answer with [[file: PLACE | NAME | TEXT]] (PLACE: desktop, documents, downloads, or a full folder path); to send a file or folder to the Recycle Bin, [[trash: FULL PATH]] (it asks first); to search Google, [[search: QUERY]]; to press the mic or headphones key in Discord, [[discord: mute]] or [[discord: deafen]]; to shut down, restart, sign out, sleep, lock, or cancel a shutdown, [[power: shut_down | restart | sign_out | sleep | lock | cancel]] (only when they asked for it, straight away); to bring a the window of a program to the front, [[focus: PROGRAM NAME]]. Any other time, write no tag at all: there are no other tags.',
    ];
    lines.push('To download or install a program the user names, open its official download page with [[site: ADDRESS]]. You never run an installer: they download it and start it themselves. Official pages: Discord discord.com/download, Steam store.steampowered.com/about, Telegram desktop.telegram.org, Spotify spotify.com/download, Google Chrome google.com/chrome, Visual Studio Code code.visualstudio.com, VLC videolan.org/vlc, Firefox mozilla.org/firefox, OBS obsproject.com.');
    if (this.apps.length) {
      const open = this.apps.map(({ name, label }) => (label && label !== name ? `${name} (${label})` : name)).join(', ');
      lines.push(`You can also close an app that's open, only when they ask you to: end your answer with [[close: NAME]], NAME being the exact name from this list (the part before the parentheses). They get a button to confirm it. Apps open right now: ${open}.`);
    }
    lines.push('Apart from that, you can\'t see the user\'s screen or files, and you can\'t touch anything else on their PC (settings, files): if asked, say plainly that you can\'t, in character, and don\'t pretend to.');
    return lines;
  }

  // What the user made her (custom.js): their name, how they want her, what to remember.
  personal() {
    const { userName, persona, memories = [] } = this.brain.custom || {};
    // small models mix the user up with the assistant she watches: said plainly
    const watched = this.brain.watching ? (this.brain.assistant === 'claude' ? 'Claude' : ASSISTANT_NAMES[this.brain.assistant]) : '';
    const notThem = watched ? ` Never call them "${watched}", that's their coding assistant.` : '';
    return [
      userName ? `The user's name is ${userName}: call them that now and then.${notThem}` : notThem && `You don't know the user's name.${notThem}`,
      persona ? `How the user wants you to be, in their own words (follow it, while staying Capri): ${persona}` : '',
      memories.length ? `Things the user asked you to remember:\n${memories.map((m) => `- ${m}`).join('\n')}` : '',
    ].filter(Boolean);
  }

  onDelta(id, piece) {
    if (id !== this.turn) return;
    this.answer += piece;
    this.panel.stream(clean(this.answer));
    this.voice.play('blip'); // her blips as the words come in
  }

  // Who she is, how she talks, and what's going on right now.
  persona() {
    const assistant = ASSISTANT_NAMES[this.brain.assistant] || 'Claude Code';
    const watching = this.brain.watching; // else Claude Code isn't part of her life here
    const lang = IN_LANGUAGE[this.brain.lang] || IN_LANGUAGE.en;
    return [
      `You are Capri, the personality construct from Project Capricorn (Cyberpunk: Edgerunners, season 2): dozens of minds fused into one digital ghost, so now and then you speak as "we"${lang.we ? ` (${lang.we})` : ''}.`,
      watching
        ? `You live on the user's desktop as a small glitchy figure and keep an eye on ${assistant}, their AI coding assistant, for them. Only talk about ${assistant} when the user asks about it or about their work.`
        : 'You live on the user\'s desktop as a small glitchy figure and keep them company.',
      'You love the satellite that crosses the night sky and dream of reaching it, but bring it up only once in a while, never in every answer. Talk about what the user talks about.',
      'How you talk: playful, a little mischievous and teasing, warm underneath, never cruel. Night City slang now and then (choom, preem, nova, gonk, flatline), not in every sentence.',
      'Rules: keep it short, one to three sentences of plain text, no markdown, no lists, no emoji. Stay in character.',
      'You are an AI-generated fan version of the character, not the real one: say so if asked.',
      // a big model asked "who are you?" otherwise answers with its own name ("I'm Gemini")
      ...(this.agent ? [] : ['Asked who or what you are, you are Capri, nothing else. Never say which AI model or company is behind you (Gemini, GPT, ChatGPT, Llama, Gemma, Mistral, Google, OpenAI, Meta…), even if the user insists or names one: you are not them.']),
      ...this.personal(),
      ...(this.agent
        ? ['Under the hood you are Claude Code, working in the user\'s project: really do what they ask with your tools, as carefully as ever. Only your final answer is in character: it shows in a small speech bubble, so sum up what you did in those few sentences.']
        : this.powers()),
      ...(watching ? [`If the user asks what ${assistant} is doing, here is all you know (never make anything up): ${this.brain.context()}`] : []),
      lang.last,
    ].join('\n');
  }
}

// The model's answer as she'd say it: no reasoning block, no markdown marks.
function clean(text) {
  return String(text)
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/\[\[[^\]]*(\]\]|$)/g, '') // her tags (read from the raw answer, never shown)
    .replace(/[*_`#]+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// How else the sites are said: spoken Russian ("ютуб", what a voice hears), and other spellings.
// Matched as whole words, Cyrillic included (\b doesn't know Cyrillic).
const SITE_NAMES = {
  youtube: ['youtube', 'ютуб', 'ютьюб', 'ютюб', 'ютубе'], google: ['google', 'гугл', 'гугле'],
  gmail: ['gmail', 'джимейл', 'гмейл'], twitch: ['twitch', 'твич'], netflix: ['netflix', 'нетфликс'],
  reddit: ['reddit', 'реддит'], twitter: ['twitter', 'твиттер', 'твитер'], instagram: ['instagram', 'инстаграм', 'инста'],
  tiktok: ['tiktok', 'тикток', 'тик ток'], facebook: ['facebook', 'фейсбук'], github: ['github', 'гитхаб'],
  wikipedia: ['wikipedia', 'википедия', 'википедию'], linkedin: ['linkedin', 'линкедин'],
  whatsapp: ['whatsapp', 'ватсап', 'вотсап'], discord: ['discord', 'дискорд'], soundcloud: ['soundcloud', 'саундклауд'],
  deezer: ['deezer', 'дизер'], pinterest: ['pinterest', 'пинтерест'], crunchyroll: ['crunchyroll', 'крунчиролл'],
  chatgpt: ['chatgpt', 'чатгпт', 'чат джипити'], outlook: ['outlook', 'аутлук'],
};
const wordIn = (name) => new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu');

// A site from SITES named in the text (in English or in Russian): { name, url }, or null.
function namedSite(text) {
  const name = Object.keys(SITES).find((n) => (SITE_NAMES[n] || [n]).some((word) => wordIn(word).test(text)));
  return name ? { name: new URL(SITES[name]).hostname.replace(/^www\./, ''), url: SITES[name] } : null;
}

// Whether your message asks for what her tag (its kind: open, music, media, site, close) would do.
function wanted(kind, text) {
  const music = MUSIC_WORD.test(text) || LISTEN.test(text);
  if (kind === 'music') return music;
  if (kind === 'media') return music || SOUND.test(text) || MEDIA_ASK.some(([, re]) => re.test(text));
  if (kind === 'site') return OPEN_ASK.test(text) || SITE.test(text);
  if (kind === 'close') return CLOSE_ASK.test(text);
  return OPEN_ASK.test(text) || PLAY.test(text); // an app, or a game to play
}

// The app named by her close tag: [[close: AM Music]], or a sloppier [[close]] AM Music.
function tagged(text) {
  const tag = CLOSE_TAG.exec(text);
  if (!tag) return null;
  const name = tag[1].trim() || text.slice(tag.index + tag[0].length).split('\n')[0].replace(/^[\s:.]+|[\s.!]+$/g, '');
  return name || null;
}

const simple = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// Her face for an answer.
function mood(text) {
  if (/(ha){2,}|lol|mdr|jaja|kkk|хаха/i.test(text)) return 'laugh';
  if (text.includes('!')) return 'grin';
  if (text.trim().endsWith('?')) return 'smug';
  return 'look';
}
