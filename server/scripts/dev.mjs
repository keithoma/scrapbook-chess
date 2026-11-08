import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import { options } from './build.mjs';
if (process.env.NODE_ENV === 'production') throw new Error('The development server cannot run in production.');
let child;
const build = await context({ ...options, plugins: [...options.plugins, { name: 'restart-server', setup(api) {
  api.onEnd(async result => {
    if (result.errors.length) return;
    if (child && child.exitCode === null) { const previous = child; await new Promise(resolve => { previous.once('exit', resolve); previous.kill(); }); }
    child = spawn(process.execPath, ['dist/index.js'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' } });
  });
} }] });
await build.watch();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { child?.kill(); await build.dispose(); process.exit(); });
