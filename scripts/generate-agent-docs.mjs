import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputPath = path.join(root, 'docs', 'generated', 'repo-inventory.md');
const checkMode = process.argv.includes('--check');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function listFiles(dir, accept) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(rel, accept));
    else if (!accept || accept(rel)) files.push(rel);
  }
  return files.sort();
}

function matchingBrace(source, openIndex) {
  let depth = 0;
  let state = 'code';
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (state === 'line') {
      if (char === '\n') state = 'code';
      continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') {
        state = 'code';
        i += 1;
      }
      continue;
    }
    if (state === 'single' || state === 'double' || state === 'template') {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if ((state === 'single' && char === "'")
        || (state === 'double' && char === '"')
        || (state === 'template' && char === '`')) {
        state = 'code';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      state = 'line';
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      state = 'block';
      i += 1;
      continue;
    }
    if (char === "'") {
      state = 'single';
      continue;
    }
    if (char === '"') {
      state = 'double';
      continue;
    }
    if (char === '`') {
      state = 'template';
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`No matching brace found at ${openIndex}.`);
}

function objectBody(source, name) {
  const marker = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=`);
  const match = marker.exec(source);
  if (!match) return '';
  const open = source.indexOf('{', match.index);
  if (open === -1) return '';
  const close = matchingBrace(source, open);
  return source.slice(open + 1, close);
}

function topLevelObjectEntries(body) {
  const entries = [];
  const keyPattern = /(?:^|,|\n)\s*([A-Za-z_$][\w$]*)\s*:/g;
  let match;
  while ((match = keyPattern.exec(body))) {
    const key = match[1];
    let cursor = keyPattern.lastIndex;
    while (/\s/.test(body[cursor] || '')) cursor += 1;
    if (body[cursor] !== '{') continue;
    const close = matchingBrace(body, cursor);
    entries.push({ key, body: body.slice(cursor + 1, close) });
    keyPattern.lastIndex = close + 1;
  }
  return entries;
}

function stringValue(body, key) {
  const match = new RegExp(`${key}:\\s*'([^']*)'`).exec(body);
  return match?.[1] || '';
}

function constStringValue(source, name) {
  const match = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*'([^']*)'`).exec(source);
  return match?.[1] || '';
}

function importedConstStringValue(source, name, fromRelPath) {
  const importPattern = /import\s+\{([^}]+)\}\s+from\s+'\.\/([^']+)'/g;
  let match;
  while ((match = importPattern.exec(source))) {
    const importedNames = match[1]
      .split(',')
      .map(part => part.trim().split(/\s+as\s+/).pop())
      .filter(Boolean);
    if (!importedNames.includes(name)) continue;
    const dir = path.dirname(fromRelPath);
    const importedPath = path.join(dir, `${match[2]}.js`);
    try {
      const importedSource = read(importedPath);
      const value = constStringValue(importedSource, name);
      if (value) return value;
    } catch {
      return '';
    }
  }
  return '';
}

function regionIdValue(regionBody, source, fromRelPath) {
  const direct = stringValue(regionBody, 'id');
  if (direct) return direct;
  const identifier = /id:\s*([A-Z0-9_]+)/.exec(regionBody)?.[1];
  if (!identifier) return '';
  return constStringValue(source, identifier) || importedConstStringValue(source, identifier, fromRelPath);
}

function boolValue(body, key) {
  const match = new RegExp(`${key}:\\s*(true|false)`).exec(body);
  return match ? match[1] === 'true' : null;
}

function numberValue(body, key) {
  const match = new RegExp(`${key}:\\s*([0-9.]+)`).exec(body);
  return match ? Number(match[1]) : null;
}

function inlineList(items) {
  return items.length ? items.map(item => `\`${item}\``).join(', ') : '_none_';
}

function packageScripts() {
  const pkg = JSON.parse(read('package.json'));
  return Object.entries(pkg.scripts || {}).map(([name, command]) => ({ name, command }));
}

function modelAssets() {
  const source = read('three-game/modelAssets.js');
  const defaultMatch = /export const DEFAULT_PLAYER_MODEL_ASSET_ID = '([^']+)'/.exec(source);
  const entries = topLevelObjectEntries(objectBody(source, 'modelAssets')).map(entry => {
    const paths = [...entry.body.matchAll(/\bpath:\s*'([^']+)'/g)].map(match => match[1]);
    return {
      id: entry.key,
      path: paths[0] || '',
      animationBanks: paths.slice(1),
      enabled: boolValue(entry.body, 'enabled'),
      preload: boolValue(entry.body, 'preload'),
      targetTriangles: numberValue(entry.body, 'targetTriangles'),
    };
  }).filter(asset => asset.path);
  return {
    defaultPlayerModel: defaultMatch?.[1] || '',
    entries,
  };
}

function authoredRegionTerrain() {
  const body = objectBody(read('game-core/regionMaps.js'), 'AUTHORED_REGION_TERRAIN');
  const entryPattern = /([A-Z0-9_]+):\s*\{\s*preset:\s*'([^']+)'\s*,\s*segments:\s*([0-9]+)/g;
  return [...body.matchAll(entryPattern)].map(match => ({
    id: match[1],
    preset: match[2],
    segments: Number(match[3]),
  }));
}

function registeredRegions() {
  const source = read('three-game/world/regions/index.js');
  const imports = [...source.matchAll(/import \{ ([A-Za-z0-9_]+Region) \} from '\.\/([^']+)\/terrain';/g)]
    .map(match => ({ symbol: match[1], module: match[2] }));
  return imports.map(item => {
    const terrainPath = `three-game/world/regions/${item.module}/terrain.js`;
    let id = '';
    let aliases = [];
    try {
      const terrainSource = read(terrainPath);
      const regionBody = objectBody(terrainSource, item.symbol);
      id = regionIdValue(regionBody, terrainSource, terrainPath);
      const aliasMatch = /aliases:\s*\[([^\]]*)\]/.exec(regionBody);
      aliases = aliasMatch
        ? [...aliasMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1])
        : [];
    } catch {
      id = '';
    }
    return { ...item, id, aliases };
  });
}

function ecologyBuilders() {
  const body = objectBody(read('three-game/world/ecology/index.js'), 'builders');
  const pattern = /([A-Z0-9_]+):\s*([A-Za-z0-9_]+)/g;
  return [...body.matchAll(pattern)].map(match => ({
    zoneId: match[1],
    builder: match[2],
  }));
}

function playableModes() {
  const entries = topLevelObjectEntries(objectBody(read('three-game/playable/playableModes.js'), 'playableModes'));
  return entries.map(entry => {
    const abilitiesMatch = /abilities:\s*\[([^\]]*)\]/.exec(entry.body);
    const abilities = abilitiesMatch
      ? [...abilitiesMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1])
      : [];
    return {
      id: stringValue(entry.body, 'id') || entry.key,
      label: stringValue(entry.body, 'label'),
      kind: stringValue(entry.body, 'kind'),
      assetId: stringValue(entry.body, 'assetId'),
      specimenId: stringValue(entry.body, 'specimenId'),
      abilities,
    };
  });
}

function legacyDarwinScriptRefs() {
  return listFiles('scripts', rel => /\.(mjs|js|py)$/.test(rel))
    .filter(rel => rel !== 'scripts/generate-agent-docs.mjs')
    .map(rel => {
      const source = read(rel);
      if (!source.includes('darwin-final-animated.glb')) return null;
      const count = source.split('darwin-final-animated.glb').length - 1;
      return { file: rel, count };
    })
    .filter(Boolean);
}

function markdownTable(headers, rows) {
  const escapeCell = value => String(value ?? '').replace(/\|/g, '\\|');
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];
  rows.forEach(row => {
    lines.push(`| ${row.map(escapeCell).join(' | ')} |`);
  });
  return lines.join('\n');
}

function render() {
  const scripts = packageScripts();
  const assets = modelAssets();
  const authored = authoredRegionTerrain();
  const registered = registeredRegions();
  const ecology = ecologyBuilders();
  const modes = playableModes();
  const legacyScripts = legacyDarwinScriptRefs();

  return `# Repo Inventory

Generated by \`npm run docs:generate\`. Do not edit by hand.

## Runtime Defaults

- Primary route: \`/three\`
- Default player model: \`${assets.defaultPlayerModel || 'unknown'}\`
- Runtime asset manifest: \`three-game/modelAssets.js\`
- Authored terrain source: \`game-core/regionMaps.js\`
- Region registry: \`three-game/world/regions/index.js\`
- Ecology registry: \`three-game/world/ecology/index.js\`
- Playable modes source: \`three-game/playable/playableModes.js\`

## Package Scripts

${markdownTable(['Script', 'Command'], scripts.map(item => [`\`${item.name}\``, `\`${item.command}\``]))}

## Playable Modes

${markdownTable(
  ['Mode', 'Kind', 'Asset', 'Specimen', 'Abilities'],
  modes.map(mode => [
    `\`${mode.id}\`${mode.label ? ` (${mode.label})` : ''}`,
    mode.kind || '',
    mode.assetId ? `\`${mode.assetId}\`` : '',
    mode.specimenId ? `\`${mode.specimenId}\`` : '',
    inlineList(mode.abilities),
  ]),
)}

## Authored Terrain Presets

Region IDs are opaque persistence keys; do not expand them into prose. Resolve
canonical display names through \`game-core/regionMaps.js\`. For example,
\`E_MID\` is **Rocky Clearing** and \`WATKINS_CREEK\` is **Highland Creek Fork**.

${markdownTable(
  ['Region ID', 'Preset', 'Segments'],
  authored.map(region => [`\`${region.id}\``, `\`${region.preset}\``, region.segments]),
)}

## Registered Region Modules

${markdownTable(
  ['Module', 'Region ID', 'Aliases'],
  registered.map(region => [
    `\`${region.module}\``,
    region.id ? `\`${region.id}\`` : '_unknown_',
    inlineList(region.aliases),
  ]),
)}

## Registered Ecology Builders

${markdownTable(
  ['Zone ID', 'Builder'],
  ecology.map(item => [`\`${item.zoneId}\``, `\`${item.builder}\``]),
)}

## Runtime Model Assets

${markdownTable(
  ['Asset ID', 'Enabled', 'Preload', 'Path', 'Animation Banks', 'Target Tris'],
  assets.entries.map(asset => [
    `\`${asset.id}\``,
    asset.enabled === null ? '' : String(asset.enabled),
    asset.preload === null ? '' : String(asset.preload),
    `\`${asset.path}\``,
    inlineList(asset.animationBanks || []),
    asset.targetTriangles ?? '',
  ]),
)}

## Legacy Darwin Final Script References

These scripts still mention \`darwin-final-animated.glb\`. Confirm intent before
using them for current Darwin5 work.

${legacyScripts.length
  ? markdownTable(['File', 'References'], legacyScripts.map(item => [`\`${item.file}\``, item.count]))
  : '_No legacy Darwin final script references found._'}
`;
}

const next = render();

if (checkMode) {
  let current = '';
  try {
    current = fs.readFileSync(outputPath, 'utf8');
  } catch {
    console.error(`${path.relative(root, outputPath)} is missing. Run npm run docs:generate.`);
    process.exit(1);
  }
  if (current !== next) {
    console.error(`${path.relative(root, outputPath)} is stale. Run npm run docs:generate.`);
    process.exit(1);
  }
  console.log(`${path.relative(root, outputPath)} is current.`);
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, next);
  console.log(`Wrote ${path.relative(root, outputPath)}`);
}
