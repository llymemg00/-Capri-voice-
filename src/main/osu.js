'use strict';

// osu! mode: starts osu!lazer (osu!.exe) from the path in the config, and watches whether it runs (tasklist, every
// few seconds). Nothing is sent to the game. When it closes, the stats come from the osu! API: the performance points
// gained (the rating) and the play time added during the session. The API needs an OAuth client of your own
// (osu! › Settings › OAuth): osuClientId, osuClientSecret and osuUserId in the config.

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { app } = require('electron');

const EXE = 'osu!.exe';
const POLL_MS = 5000;
const SETTLE_MS = 90 * 1000;  // a play is submitted to the API a little after the game closes
const RETRY_MS = 120 * 1000;  // ...so the stats are read again if they did not move yet
const RETRIES = 3;
const API = 'https://osu.ppy.sh';

let emit = () => {};
let getConfig = () => ({});
let watch = null; // { timer, playing, startedAt, before, busy } while osu! mode is on

const logFile = () => path.join(app.getPath('userData'), 'osu-log.json');

function readLog() {
  try { return JSON.parse(fs.readFileSync(logFile(), 'utf8')); } catch { return { sessions: [] }; }
}
function writeLog(log) {
  try { fs.writeFileSync(logFile(), JSON.stringify(log, null, 2)); }
  catch (err) { console.error('[capri] could not save osu log:', err.message); }
}

function init({ emitEvent, config }) {
  emit = emitEvent;
  getConfig = config;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// only the real osu!.exe, from the path you set: nothing else is started
function exeOk(file) {
  return typeof file === 'string' && path.basename(file).toLowerCase() === EXE.toLowerCase() && fs.existsSync(file);
}

function isRunning() {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `IMAGENAME eq ${EXE}`, '/NH', '/FO', 'CSV'], { windowsHide: true, timeout: 5000 },
      (err, out) => resolve(!err && String(out).toLowerCase().includes(`"${EXE.toLowerCase()}"`)));
  });
}

// the rating and the play time as osu! has them now (client credentials: public data, no login)
async function fetchStats(cfg) {
  if (!cfg.osuClientId || !cfg.osuClientSecret || !cfg.osuUserId) return null;
  const tokenRes = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: Number(cfg.osuClientId),
      client_secret: cfg.osuClientSecret,
      grant_type: 'client_credentials',
      scope: 'public',
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!tokenRes.ok) throw new Error(`osu! API ${tokenRes.status}`);
  const { access_token: token } = await tokenRes.json();
  const res = await fetch(`${API}/api/v2/users/${encodeURIComponent(cfg.osuUserId)}/osu`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`osu! API ${res.status}`);
  const user = await res.json();
  const s = user.statistics || {};
  return {
    pp: Number(s.pp) || 0,
    playSeconds: Number(s.play_time) || 0,
    rank: s.global_rank ?? null,
  };
}

// the session has ended: read the stats again (a few times, the API catches up), log it, tell her
async function finish(s) {
  const cfg = getConfig();
  const seconds = Math.round((s.endedAt - s.startedAt) / 1000);
  let after = null;
  let error = null;
  if (!s.before) {
    // no stats to compare with (no API details, or the API did not answer at the start)
  } else {
    for (let i = 0; i < RETRIES; i++) {
      await sleep(i === 0 ? SETTLE_MS : RETRY_MS);
      try {
        after = await fetchStats(cfg);
      } catch (err) {
        error = err.message;
        break;
      }
      if (after && (after.pp !== s.before.pp || after.playSeconds !== s.before.playSeconds)) break;
    }
  }
  const entry = {
    startedAt: new Date(s.startedAt).toISOString(),
    endedAt: new Date(s.endedAt).toISOString(),
    seconds,
    pp: after ? Math.round((after.pp - s.before.pp) * 100) / 100 : null,      // the rating gained
    apiPlaySeconds: after ? after.playSeconds - s.before.playSeconds : null,  // the play time osu! counted
    rank: after ? after.rank : null,
    error,
  };
  const log = readLog();
  log.sessions.push(entry);
  writeLog(log);
  emit({
    event: 'end',
    seconds,
    pp: entry.pp,
    rank: entry.rank,
    error,
    stats: Boolean(s.before),
  });
}

async function poll() {
  if (!watch || watch.busy) return;
  watch.busy = true;
  try {
    const running = await isRunning();
    if (running && !watch.playing) {
      watch.playing = true;
      watch.startedAt = Date.now();
      watch.before = await fetchStats(getConfig()).catch(() => null);
      emit({ event: 'start' });
    } else if (!running && watch.playing) {
      watch.playing = false;
      const s = { startedAt: watch.startedAt, endedAt: Date.now(), before: watch.before };
      watch.startedAt = null;
      watch.before = null;
      finish(s).catch((err) => console.error('[capri] osu session:', err.message));
    }
  } catch (err) {
    console.error('[capri] osu watch:', err.message);
  } finally {
    if (watch) watch.busy = false;
  }
}

// osu! mode on: start the game (unless it runs already) and watch it
async function start() {
  const cfg = getConfig();
  if (!exeOk(cfg.osuPath)) return { ok: false, code: 'nopath' };
  if (!watch) {
    watch = { timer: null, playing: false, startedAt: null, before: null, busy: false };
    watch.timer = setInterval(poll, POLL_MS);
  }
  if (!(await isRunning())) {
    spawn(cfg.osuPath, [], { detached: true, stdio: 'ignore', windowsHide: false, cwd: path.dirname(cfg.osuPath) })
      .on('error', () => {})
      .unref();
  }
  poll();
  return { ok: true, configured: Boolean(cfg.osuClientId && cfg.osuClientSecret && cfg.osuUserId) };
}

// osu! mode off: stop watching; a session still running counts up to now
function stop() {
  if (!watch) return { ok: true };
  clearInterval(watch.timer);
  const current = watch;
  watch = null;
  if (current.playing) {
    finish({ startedAt: current.startedAt, endedAt: Date.now(), before: current.before })
      .catch((err) => console.error('[capri] osu session:', err.message));
  }
  return { ok: true };
}

function status() {
  return { watching: Boolean(watch), playing: Boolean(watch?.playing) };
}

module.exports = { init, start, stop, status, readLog };
