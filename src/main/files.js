'use strict';

// Her hands on your files: she creates a text file where you ask, and sends a file or folder to the Recycle Bin.
// Nothing is deleted for good: the Recycle Bin keeps it until you empty it. Windows and the programs' own folders
// are off limits, and so is Capri's own folder.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const { powershell } = require('./apps');

const MAX_CONTENT = 100 * 1024;

// the folders she may create files in, by the name you say; anything else must be a full path of yours
const PLACES = { desktop: 'Desktop', documents: 'MyDocuments', downloads: 'Downloads' };

// things that keep Windows or the programs running: never touched, whatever the path
const FORBIDDEN = [
  process.env.SystemRoot || 'C:\\Windows',
  process.env.ProgramFiles || 'C:\\Program Files',
  process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  process.env.ProgramData || 'C:\\ProgramData',
  'C:\\Recovery',
  'C:\\System Volume Information',
  'C:\\$Recycle.Bin',
  path.join(os.homedir(), 'AppData'), // programs' own data
  app.getPath('userData'),            // Capri's settings and logs
];

// Windows rules for comparing paths, whatever system the check runs on
const norm = (p) => path.win32.resolve(String(p)).replace(/[\\/]+$/, '').toLowerCase();

// true when the path is a drive root, a folder of the system, or inside one of the protected folders
function protectedPath(p) {
  const full = norm(p);
  if (/^[a-z]:$/.test(full)) return true;                     // a whole drive
  if (full === norm(os.homedir())) return true;               // your whole user folder
  return FORBIDDEN.some((root) => full === norm(root) || full.startsWith(norm(root) + path.win32.sep));
}

// a name she may use for a file: no folders, no characters Windows refuses
function safeName(name) {
  const clean = String(name || '').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/^\.+/, '').slice(0, 120);
  return clean || null;
}

async function placeFolder(place) {
  const key = String(place || '').trim().toLowerCase();
  if (PLACES[key]) {
    const out = await powershell(`[Environment]::GetFolderPath('${PLACES[key]}')`, 10000).catch(() => '');
    if (out && fs.existsSync(out)) return out;
    return path.join(os.homedir(), key === 'desktop' ? 'Desktop' : key === 'documents' ? 'Documents' : 'Downloads');
  }
  return path.isAbsolute(String(place || '')) ? String(place).trim() : null;
}

// a free name in the folder: "notes.txt", then "notes (2).txt"...
function freePath(folder, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let target = path.join(folder, name);
  for (let i = 2; fs.existsSync(target); i++) target = path.join(folder, `${base} (${i})${ext}`);
  return target;
}

async function create({ place, name, content = '' }) {
  if (process.platform !== 'win32') return { error: 'only on Windows' };
  const folder = await placeFolder(place);
  if (!folder) return { error: 'unknown folder' };
  if (protectedPath(folder) || !fs.existsSync(folder)) return { error: 'I may not make files there' };
  const file = safeName(name);
  if (!file) return { error: 'no usable file name' };
  const text = String(content || '').slice(0, MAX_CONTENT);
  const target = freePath(folder, file);
  fs.writeFileSync(target, text, 'utf8');
  return { path: target };
}

// to the Recycle Bin, after you pressed the button in her panel; checked again here
async function trash(target) {
  if (process.platform !== 'win32') return { error: 'only on Windows' };
  const full = path.resolve(String(target || ''));
  if (!path.isAbsolute(full) || !fs.existsSync(full)) return { error: 'not found' };
  if (protectedPath(full)) return { error: 'that folder is protected' };
  const isDir = fs.statSync(full).isDirectory();
  const quoted = full.replace(/'/g, "''");
  const method = isDir ? 'DeleteDirectory' : 'DeleteFile';
  await powershell(
    `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${method}('${quoted}', 'OnlyErrorDialogs', 'SendToRecycleBin')`,
    60000,
  );
  return { path: full, folder: isDir };
}

module.exports = { create, trash, protectedPath, safeName, freePath, MAX_CONTENT };
