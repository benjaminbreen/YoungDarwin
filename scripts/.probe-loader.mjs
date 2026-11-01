import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const projectRequire = createRequire(path.resolve('package.json'));
const cache = new Map();
const EXT = ['', '.js', '.jsx', '.mjs', '/index.js'];
function resolve(spec, from) { const b = path.resolve(path.dirname(from), spec); for (const e of EXT) { const c = b + e; if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; } throw new Error(spec); }
export function load(p) {
  const abs = path.resolve(p); if (cache.has(abs)) return cache.get(abs).exports;
  const src = fs.readFileSync(abs, 'utf8'); const ext = path.extname(abs);
  if (ext === '.json') { const m = { exports: JSON.parse(src) }; cache.set(abs, m); return m.exports; }
  const out = ts.transpileModule(src, { fileName: ext === '.mjs' ? abs.replace(/\.mjs$/, '.js') : abs, compilerOptions: { allowJs: true, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} }; cache.set(abs, m);
  new Function('exports', 'require', 'module', '__filename', '__dirname', out)(m.exports, s => (s.startsWith('.') ? load(resolve(s, abs)) : projectRequire(s)), m, abs, path.dirname(abs));
  return m.exports;
}
