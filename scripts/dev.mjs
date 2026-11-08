import { spawn } from 'node:child_process';
const children = ['server', 'web'].map(directory => spawn('pnpm', ['--dir', directory, 'dev'], { stdio: 'inherit', detached: process.platform !== 'win32' }));
let closing = false;
function stop(code = 0) {
  if (closing) return; closing = true;
  for (const child of children) {
    try { process.platform === 'win32' ? child.kill() : process.kill(-child.pid, 'SIGTERM'); } catch {}
  }
  process.exitCode = code;
}
for (const child of children) { child.on('error', () => stop(1)); child.on('exit', code => stop(code ?? 0)); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
