// Census of every shader program alive after boot: which material families
// own them, and which cache-key fields split near-identical variants apart.
// The point is to name the collapse targets — ~360 programs × ~11ms of
// first-use/driver work each is the boot-time budget on every device.
//
//   node scripts/perf-lab/program-census.mjs [ZONE] [SETTLE_MS]
//
// Reads renderer.info.programs through window.__darwinScene (published in
// dev, and in production under ?e2e/?screenshot — the driver sets those).
import { openSession, bootToGameplay } from './driver.mjs';

const ZONE = process.argv[2] || 'POST_OFFICE_BAY';
const SETTLE_MS = Number(process.argv[3] || 12000);

// Positional layout of three r0.182's getProgramCacheKey for built-in
// materials, AFTER the variable-length defines block. Used to name the
// fields that differ inside a family.
const PARAM_NAMES = [
  'precision', 'outputColorSpace', 'envMapMode', 'envMapCubeUVHeight',
  'mapUv', 'alphaMapUv', 'lightMapUv', 'aoMapUv', 'bumpMapUv', 'normalMapUv',
  'displacementMapUv', 'emissiveMapUv', 'metalnessMapUv', 'roughnessMapUv',
  'anisotropyMapUv', 'clearcoatMapUv', 'clearcoatNormalMapUv',
  'clearcoatRoughnessMapUv', 'iridescenceMapUv', 'iridescenceThicknessMapUv',
  'sheenColorMapUv', 'sheenRoughnessMapUv', 'specularMapUv',
  'specularColorMapUv', 'specularIntensityMapUv', 'transmissionMapUv',
  'thicknessMapUv', 'combine', 'fogExp2', 'sizeAttenuation',
  'morphTargetsCount', 'morphAttributeCount', 'numDirLights',
  'numPointLights', 'numSpotLights', 'numSpotLightMaps', 'numHemiLights',
  'numRectAreaLights', 'numDirLightShadows', 'numPointLightShadows',
  'numSpotLightShadows', 'numSpotLightShadowsWithMaps', 'numLightProbes',
  'shadowMapType', 'toneMapping', 'numClippingPlanes', 'numClipIntersection',
  'depthPacking', 'booleanMask', 'rendererColorSpace', 'customProgramCacheKey',
];

const session = await openSession({ width: 1440, height: 900, deviceScaleFactor: 2 });
const { page, browser } = session;

try {
  await bootToGameplay(page, { zone: ZONE, settleMs: SETTLE_MS });

  const census = await page.evaluate(() => {
    const handle = window.__darwinScene;
    if (!handle?.gl) return { error: 'no __darwinScene handle' };
    const { gl, scene } = handle;

    const programs = (gl.info.programs || []).map(program => ({
      name: program.name,
      cacheKey: String(program.cacheKey),
      usedTimes: program.usedTimes,
    }));

    // Scene-side attribution: how many distinct materials each render-source
    // family carries, and how many distinct "program shapes" those imply.
    const families = new Map();
    const seenMaterials = new Set();
    const sourceFor = object => {
      let current = object;
      while (current) {
        const data = current.userData || {};
        if (data.renderSource || data.renderLabel) {
          return data.renderLabel || data.renderSource;
        }
        current = current.parent;
      }
      return '(untagged)';
    };
    scene.traverse(object => {
      const material = object.material;
      if (!material) return;
      const list = Array.isArray(material) ? material : [material];
      const source = sourceFor(object);
      for (const entry of list) {
        if (!entry || seenMaterials.has(entry.uuid)) continue;
        seenMaterials.add(entry.uuid);
        let family = families.get(source);
        if (!family) {
          family = { materials: 0, shapes: new Set(), types: new Set() };
          families.set(source, family);
        }
        family.materials += 1;
        family.types.add(entry.type);
        const defines = entry.defines ? Object.entries(entry.defines).sort().flat().join('|') : '';
        const custom = typeof entry.customProgramCacheKey === 'function'
          ? entry.customProgramCacheKey.call(entry)
          : '';
        const maps = [
          'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
          'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap', 'displacementMap',
        ].map(slot => (entry[slot] ? 1 : 0)).join('');
        const onBeforeCompileTag = entry.onBeforeCompile
          && entry.onBeforeCompile.toString().length > 30
          ? `obc${entry.onBeforeCompile.toString().length}`
          : '';
        family.shapes.add([
          entry.type, defines, custom, maps, onBeforeCompileTag,
          entry.vertexColors ? 'vc' : '', entry.flatShading ? 'flat' : '',
          object.isSkinnedMesh ? 'skin' : '', object.isInstancedMesh ? 'inst' : '',
        ].join('~'));
      }
    });

    return {
      total: programs.length,
      programs,
      families: [...families.entries()].map(([source, family]) => ({
        source,
        materials: family.materials,
        shapes: family.shapes.size,
        types: [...family.types].join(','),
      })),
    };
  });

  if (census.error) throw new Error(census.error);

  console.log(`\nPROGRAM CENSUS  ${ZONE}  — ${census.total} live programs\n`);

  // Group GL programs by family head (shaderID for built-ins, the custom
  // vertex/fragment id pair for ShaderMaterials).
  const groups = new Map();
  for (const program of census.programs) {
    const parts = program.cacheKey.split(',');
    const head = /^\d+$/.test(parts[0]) ? `${program.name}#${parts[0]},${parts[1]}` : parts[0];
    if (!groups.has(head)) groups.set(head, []);
    groups.get(head).push(program);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log('programs by family (top 25):');
  for (const [head, members] of sorted.slice(0, 25)) {
    console.log(`  ${String(members.length).padStart(4)}  ${head}`);
  }

  // For the biggest built-in families, name the cache-key fields that vary.
  console.log('\nvarying fields inside the top built-in families:');
  for (const [head, members] of sorted.slice(0, 8)) {
    if (members.length < 2) continue;
    const keys = members.map(member => member.cacheKey.split(','));
    const lengths = new Set(keys.map(key => key.length));
    if (lengths.size > 1) {
      console.log(`  ${head}: mixed key lengths ${[...lengths].join('/')} — differing defines blocks`);
      continue;
    }
    const length = keys[0].length;
    const varying = [];
    for (let index = 1; index < length; index += 1) {
      const values = new Set(keys.map(key => key[index]));
      if (values.size > 1) varying.push({ index, values: [...values].slice(0, 6) });
    }
    // Positional params sit at the tail: map tail indices to names.
    const tailStart = length - PARAM_NAMES.length;
    const described = varying.map(({ index, values }) => {
      const name = index >= tailStart && tailStart >= 1
        ? PARAM_NAMES[index - tailStart]
        : `defines[${index}]`;
      return `${name}={${values.join('|')}}`;
    });
    console.log(`  ${head} (${members.length}): ${described.join('  ') || 'identical keys?!'}`);
  }

  console.log('\nscene families by distinct material shapes (top 25):');
  const familyRows = census.families.sort((a, b) => b.shapes - a.shapes).slice(0, 25);
  for (const row of familyRows) {
    console.log(`  ${String(row.shapes).padStart(4)} shapes  ${String(row.materials).padStart(4)} materials  ${row.source}  [${row.types}]`);
  }

  const unused = census.programs.filter(program => program.usedTimes === 0).length;
  console.log(`\nprograms never used since link: ${unused}`);

  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('test-results/perf-lab', { recursive: true });
  const outPath = `test-results/perf-lab/program-census-${Date.now()}.json`;
  writeFileSync(outPath, JSON.stringify(census, null, 1));
  console.log(`raw census: ${outPath}`);
} finally {
  await browser.close();
}
