import { build } from 'esbuild';
import { mkdir, cp, readFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const root = process.cwd(),
  out = path.join(root, 'apps/desktop/src-tauri/resources');
await mkdir(path.join(out, 'server'), { recursive: true });
await cp('assets/fonts', path.join(out, 'server/fonts'), { recursive: true });
await build({
  entryPoints: ['apps/api/src/main.ts'],
  outfile: path.join(out, 'server/api.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  mainFields: ['main', 'module'],
  external: ['pg', 'pdfkit'],
  logLevel: 'info',
});
await cp('node_modules/pdfkit/js/data', path.join(out, 'server/data'), { recursive: true });
await cp(process.execPath, path.join(out, 'node.exe'));
await cp(
  'native/target/release/pillxa-machine-runtime.exe',
  path.join(out, 'pillxa-machine-runtime.exe'),
);
const seen = new Set();
async function copyPackage(name, from) {
  const resolve = createRequire(from);
  const entry = resolve.resolve(name);
  let dir = path.dirname(entry);
  while (true) {
    let pkg;
    try {
      pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    } catch {}
    if (pkg?.name === name) {
      if (seen.has(name)) return;
      seen.add(name);
      await cp(dir, path.join(out, 'server/node_modules', name), {
        recursive: true,
        dereference: true,
        filter: (source) => !path.relative(dir, source).split(path.sep).includes('node_modules'),
      });
      for (const dependency of Object.keys(pkg.dependencies || {}))
        await copyPackage(dependency, path.join(dir, 'package.json'));
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Cannot resolve ${name}`);
    dir = parent;
  }
}
await copyPackage('pg', path.join(root, 'package.json'));
await copyPackage('pdfkit', path.join(root, 'package.json'));
// Icons preserve the approved bitmap inside a rounded tile; building needs no system image tools.
await access('apps/desktop/src-tauri/icons/icon.ico');
await access('apps/desktop/src-tauri/icons/128x128.png');
