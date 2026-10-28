'use strict';

// Bring a program's window to the front, by its name (what Windows shows in the taskbar): "Spotify", "Discord".
// The name is checked against a plain pattern first, so nothing else reaches the script.

const { powershell } = require('./apps');

const NAME = /^[\p{L}\p{N} .+_-]{1,60}$/u;

async function focus(name) {
  if (process.platform !== 'win32') return { error: 'only on Windows' };
  const wanted = String(name || '').trim();
  if (!NAME.test(wanted)) return { error: 'not a program name' };
  const out = await powershell(
    `$s = New-Object -ComObject WScript.Shell; $p = Get-Process | Where-Object { $_.MainWindowTitle -and ($_.ProcessName -like '*${wanted.replace(/'/g, "''")}*' -or $_.MainWindowTitle -like '*${wanted.replace(/'/g, "''")}*') } | Select-Object -First 1; if ($p -and $s.AppActivate($p.Id)) { 'ok' } else { 'none' }`,
    10000,
  ).catch(() => 'none');
  return out === 'ok' ? { ok: true } : { error: 'no such window open' };
}

module.exports = { focus, NAME };
