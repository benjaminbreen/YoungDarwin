import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOTS = ['app', 'components', 'data', 'field-notebook', 'game-core', 'hooks', 'multiplayer-worker', 'pages', 'three-game', 'utils'];
const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = [
  'next.config.ts',
  ...ROOTS.flatMap(root => walk(root)),
];

let failed = false;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const extension = path.extname(file);
  const jsx = extension === '.tsx' || extension === '.jsx'
    ? ts.JsxEmit.ReactJSX
    : ts.JsxEmit.Preserve;

  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      allowJs: true,
      esModuleInterop: true,
      isolatedModules: true,
      jsx,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  });

  const errors = (result.diagnostics || [])
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);

  if (errors.length > 0) {
    failed = true;
    console.error(`\n${file}`);
    for (const error of errors) {
      const message = ts.flattenDiagnosticMessageText(error.messageText, '\n');
      if (error.file && typeof error.start === 'number') {
        const position = error.file.getLineAndCharacterOfPosition(error.start);
        console.error(`  ${position.line + 1}:${position.character + 1} ${message}`);
      } else {
        console.error(`  ${message}`);
      }
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} source files.`);
