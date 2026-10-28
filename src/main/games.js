'use strict';

// Is she in a game? Her signal: the window in front fills the whole screen, for longer than the time you set
// (sleepAfterSeconds, 120 by default). A small Windows script looks at the front window every few seconds and
// reports when it changes. Nothing is read from the game itself, and nothing is sent to it.

const { spawn } = require('node:child_process');

// Front window vs the screen, and whether it's the desktop or the taskbar (those are never a game)
const SCRIPT = `
$src = @"
using System; using System.Text; using System.Runtime.InteropServices;
public class CapriFront {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int n);
  [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
}
"@
Add-Type -TypeDefinition $src
$skip = @('Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd')
$w = [CapriFront]::GetSystemMetrics(0); $h = [CapriFront]::GetSystemMetrics(1)
$last = ''
while ($true) {
  $hw = [CapriFront]::GetForegroundWindow()
  $r = New-Object CapriFront+RECT
  $cls = New-Object System.Text.StringBuilder 256
  [void][CapriFront]::GetClassName($hw, $cls, 256)
  $full = $false
  if ([CapriFront]::GetWindowRect($hw, [ref]$r) -and -not ($skip -contains $cls.ToString())) {
    $full = ($r.L -le 0 -and $r.T -le 0 -and $r.R -ge $w -and $r.B -ge $h)
  }
  $now = if ($full) { '1' } else { '0' }
  if ($now -ne $last) { [Console]::Out.WriteLine($now); [Console]::Out.Flush(); $last = $now }
  Start-Sleep -Seconds 3
}
`;

let child = null;
let timer = null;
let fullSince = null;   // when the full-screen window appeared, or null
let asleep = false;     // she's gone to sleep because of it

// onEvent({ on }): true when she should sleep (a game, for long enough), false when she can wake
function start(onEvent, { sleepAfterSeconds = 120 } = {}) {
  if (process.platform !== 'win32' || child) return;
  // the script only reports changes, so the time is checked on a timer as well
  const check = () => {
    if (fullSince && !asleep && Date.now() - fullSince >= sleepAfterSeconds * 1000) {
      asleep = true;
      onEvent({ on: true });
    } else if (!fullSince && asleep) {
      asleep = false;
      onEvent({ on: false });
    }
  };
  child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { windowsHide: true });
  timer = setInterval(check, 5000);
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (line === '1') fullSince = fullSince ?? Date.now();
      if (line === '0') fullSince = null;
      check();
    }
  });
  child.on('exit', () => { child = null; clearInterval(timer); fullSince = null; asleep = false; });
  child.on('error', () => { child = null; clearInterval(timer); });
}

function stop() {
  clearInterval(timer);
  if (child) child.kill();
  child = null;
}

module.exports = { start, stop, SCRIPT };
