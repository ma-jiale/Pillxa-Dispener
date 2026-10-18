import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = process.cwd();
const result = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'dev'],
  {
    cwd: path.join(root, 'apps/desktop'),
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      CARGO_HOME: path.join(root, '.tools/cargo'),
      RUSTUP_HOME: path.join(root, '.tools/rustup'),
      PATH: path.join(root, '.tools/cargo/bin') + ';' + process.env.PATH,
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
