import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
}
run(['node_modules/@typespec/compiler/cmd/tsp.js', 'compile', 'packages/contracts']);
const spec = JSON.parse(await readFile('packages/contracts/generated/openapi.json', 'utf8'));
// The SDK generator currently handles additionalProperties, but not the equivalent
// unevaluatedProperties on a plain map. No composed schemas are transformed.
function normalize(value) {
  if (!value || typeof value !== 'object') return;
  if (
    value.type === 'object' &&
    value.unevaluatedProperties &&
    typeof value.unevaluatedProperties === 'object' &&
    !value.allOf &&
    !value.anyOf &&
    !value.oneOf
  ) {
    value.additionalProperties = value.unevaluatedProperties;
    delete value.unevaluatedProperties;
  }
  for (const child of Object.values(value)) normalize(child);
}
normalize(spec);
await writeFile('packages/contracts/generated/openapi.json', JSON.stringify(spec, null, 2) + '\n');
run([
  'tooling/contracts/node_modules/openapi-typescript/bin/cli.js',
  'packages/contracts/generated/openapi.json',
  '-o',
  'packages/contracts/generated/openapi.d.ts',
]);
const names = Object.keys(spec.components.schemas);
await writeFile(
  'packages/contracts/generated/models.ts',
  `// Generated from packages/contracts/main.tsp. Run: node tooling/generate-contracts.mjs\nimport type {components} from './openapi.d.ts';\n` +
    names.map((name) => `export type ${name} = components['schemas']['${name}'];`).join('\n') +
    '\n',
);
