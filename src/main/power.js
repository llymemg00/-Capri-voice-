'use strict';

// Her hand on the PC's power: shut down, restart, sleep, lock, sign out, or cancel a shutdown she started.
// Only these actions exist; nothing you say is passed to a command.

const { execFile } = require('node:child_process');

const ACTIONS = {
  shut_down: ['shutdown', ['/s', '/t', '0']],
  restart: ['shutdown', ['/r', '/t', '0']],
  sign_out: ['shutdown', ['/l']],
  cancel: ['shutdown', ['/a']],
  sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']],
  lock: ['rundll32.exe', ['user32.dll,LockWorkStation']],
};

function run(action) {
  if (process.platform !== 'win32') return Promise.resolve({ error: 'only on Windows' });
  const spec = ACTIONS[action];
  if (!spec) return Promise.resolve({ error: 'unknown action' });
  return new Promise((resolve) => {
    execFile(spec[0], spec[1], { windowsHide: true }, (err) => resolve(err ? { error: err.message } : { ok: true }));
  });
}

module.exports = { run, ACTIONS };
