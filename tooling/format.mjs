import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { format } from 'prettier';
async function visit(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (['target', 'node_modules', 'resources', 'generated'].includes(entry.name)) continue;
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (/\.(ts|tsx|css|json|mjs)$/.test(file))
      await writeFile(
        file,
        await format(await readFile(file, 'utf8'), {
          filepath: file,
          singleQuote: true,
          printWidth: 100,
        }),
      );
  }
}
for (const root of ['apps', 'packages', 'tests', 'tooling']) await visit(root);
