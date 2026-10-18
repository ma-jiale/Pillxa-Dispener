import ts from './contracts/node_modules/typescript/lib/typescript.js';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
async function visit(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (['node_modules', 'target', 'generated', 'resources'].includes(entry.name)) continue;
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await visit(file);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(file) || file.endsWith('.d.ts')) continue;
    const source = ts.createSourceFile(
      file,
      await readFile(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const used = new Set();
    function walk(node) {
      if (ts.isImportDeclaration(node)) return;
      if (ts.isIdentifier(node)) used.add(node.text);
      ts.forEachChild(node, walk);
    }
    walk(source);
    const statements = source.statements.flatMap((node) => {
      if (!ts.isImportDeclaration(node) || !node.importClause) return [node];
      const clause = node.importClause;
      const name = clause.name && used.has(clause.name.text) ? clause.name : undefined;
      let bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        const elements = bindings.elements.filter((e) => used.has(e.name.text));
        bindings = elements.length ? ts.factory.updateNamedImports(bindings, elements) : undefined;
      } else if (bindings && !used.has(bindings.name.text)) bindings = undefined;
      if (!name && !bindings) return [];
      return [
        ts.factory.updateImportDeclaration(
          node,
          node.modifiers,
          ts.factory.updateImportClause(clause, clause.isTypeOnly, name, bindings),
          node.moduleSpecifier,
          node.attributes,
        ),
      ];
    });
    const updated = ts.factory.updateSourceFile(source, statements);
    await writeFile(file, ts.createPrinter().printFile(updated));
  }
}
for (const root of ['apps', 'tests', 'packages/dispensing-policy', 'packages/contracts/src'])
  await visit(root);
