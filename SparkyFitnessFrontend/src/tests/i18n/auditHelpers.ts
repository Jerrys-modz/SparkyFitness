import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const SRC_ROOT = path.resolve(__dirname, '../..');
export const REPO_ROOT = path.resolve(SRC_ROOT, '../..');
export const EN_CATALOG_PATH = path.resolve(
  SRC_ROOT,
  '../public/locales/en/translation.json'
);

export type Catalog = { [key: string]: string | Catalog };

export const readCatalog = (file: string): Catalog =>
  JSON.parse(fs.readFileSync(file, 'utf8')) as Catalog;

export const lookup = (catalog: Catalog, key: string): string | undefined => {
  let node: string | Catalog | undefined = catalog;
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
};

export const listSourceFiles = (
  dir: string,
  options: { skipDirs?: string[]; extensions?: RegExp } = {}
): string[] => {
  const { skipDirs = ['tests', 'node_modules'], extensions = /\.tsx?$/ } =
    options;
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.includes(entry.name))
        out.push(...listSourceFiles(full, options));
    } else if (extensions.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out.sort();
};

export const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

export const lineOf = (sf: ts.SourceFile, node: ts.Node): number =>
  sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;

export const literalText = (node: ts.Node | undefined): string | null =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;

export const placeholders = (text: string): string =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');
