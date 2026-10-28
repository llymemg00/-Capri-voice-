'use strict';

// Pressing a keyboard shortcut for her, the way you would: Discord's own mute or deafen keys. Only the shortcut you
// set in config.json is pressed, and only when you ask. Discord has no default key for it: you choose one in Discord
// (User Settings › Keybinds › Toggle Mute / Toggle Deafen) and write the same here.

const { powershell } = require('./apps');

const KEY_DOWN = 0x0000;
const KEY_UP = 0x0002;
const MODIFIERS = { ctrl: 0x11, alt: 0x12, shift: 0x10 };

// "ctrl+alt+m", "shift+f9", "ctrl+1": only these shapes are accepted, so nothing else reaches the script
function parseCombo(combo) {
  const text = String(combo || '').trim().toLowerCase();
  const parts = text.split('+');
  if (!text || parts.length > 4) return null;
  const last = parts.pop();
  const mods = parts.map((m) => MODIFIERS[m]);
  if (mods.some((m) => m === undefined)) return null;
  let key = null;
  if (/^[a-z]$/.test(last) || /^[0-9]$/.test(last)) key = last.toUpperCase().charCodeAt(0);
  else if (/^f([1-9]|1[0-2])$/.test(last)) key = 0x70 + Number(last.slice(1)) - 1;
  if (key === null) return null;
  return { mods, key };
}

// the Windows script that presses the combo: hold the modifiers, tap the key, let go
function comboScript({ mods, key }) {
  const down = mods.map((m) => `[Capri.Keys2]::keybd_event(${m}, 0, ${KEY_DOWN}, [UIntPtr]::Zero)`);
  const up = mods.slice().reverse().map((m) => `[Capri.Keys2]::keybd_event(${m}, 0, ${KEY_UP}, [UIntPtr]::Zero)`);
  return 'Add-Type -Namespace Capri -Name Keys2 -MemberDefinition \'[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, System.UIntPtr extra);\'; '
    + [
      ...down,
      `[Capri.Keys2]::keybd_event(${key}, 0, ${KEY_DOWN}, [UIntPtr]::Zero)`,
      `[Capri.Keys2]::keybd_event(${key}, 0, ${KEY_UP}, [UIntPtr]::Zero)`,
      ...up,
    ].join('; ');
}

// action: 'mute' or 'deafen'. cfg: the config (discordMuteKey, discordDeafenKey).
async function discord(action, cfg) {
  if (process.platform !== 'win32') return { error: 'only on Windows' };
  const combo = action === 'deafen' ? cfg.discordDeafenKey : cfg.discordMuteKey;
  if (!combo) return { error: 'nokey' };
  const parsed = parseCombo(combo);
  if (!parsed) return { error: 'badkey' };
  await powershell(comboScript(parsed), 15000);
  return { ok: true };
}

module.exports = { discord, parseCombo, comboScript };
