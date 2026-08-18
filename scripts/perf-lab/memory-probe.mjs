// Memory footprint across a zone travel: JS heap, renderer counts, and an
// estimated GPU texture residency (walking every texture the renderer still
// holds, sized by dimensions and format). The iOS crash question is "what
// ratchets", so the probe reads after boot, after travel, and after a return
// travel.
//
//   node scripts/perf-lab/memory-probe.mjs POST_OFFICE_BAY PENAL_COLONY
import { openSession, bootToGameplay } from './driver.mjs';

const FROM = process.argv[2] || 'POST_OFFICE_BAY';
const TO = process.argv[3] || 'PENAL_COLONY';

const session = await openSession({ width: 1440, height: 900, deviceScaleFactor: 2 });
const { page, browser } = session;

async function snapshot(label) {
  const data = await page.evaluate(() => {
    const handle = window.__darwinScene;
    if (!handle?.gl) return null;
    const { gl, scene } = handle;
    const info = gl.info.memory;
    // Estimate resident texture bytes through the renderer's own property
    // table: every texture that has been uploaded has a webgl texture entry.
    // Walk the scene AND the drei cache indirectly via gl.properties is not
    // exposed, so approximate: scene-reachable textures plus render targets.
    const seen = new Set();
    let textureBytes = 0;
    let textureCount = 0;
    let maxDim = 0;
    const measure = texture => {
      if (!texture?.isTexture || seen.has(texture)) return;
      seen.add(texture);
      const image = texture.image;
      const width = image?.width || 0;
      const height = image?.height || 0;
      if (!width || !height) return;
      textureCount += 1;
      maxDim = Math.max(maxDim, width, height);
      const mips = texture.generateMipmaps ? 4 / 3 : 1;
      textureBytes += width * height * 4 * mips;
    };
    scene.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material) continue;
        for (const value of Object.values(material)) {
          if (value?.isTexture) measure(value);
        }
        if (material.uniforms) {
          for (const uniform of Object.values(material.uniforms)) {
            if (uniform?.value?.isTexture) measure(uniform.value);
          }
        }
      }
    });
    return {
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      geometries: info.geometries,
      textures: info.textures,
      programs: gl.info.programs?.length ?? null,
      sceneTextureCount: textureCount,
      sceneTextureMB: Math.round(textureBytes / 1048576),
      maxTextureDim: maxDim,
      gltfCache: window.__darwinGltfCacheStats?.() || null,
    };
  });
  console.log(label, JSON.stringify(data));
}

async function travelTo(zone) {
  await page.evaluate(target => window.__darwinE2E?.travelTo(target), zone);
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(250);
    const done = await page.evaluate(target => {
      const state = window.__darwinE2E?.getState();
      return state?.currentZoneId === target && !state?.transition;
    }, zone);
    if (done) break;
  }
  await page.waitForTimeout(6000);
}

try {
  await bootToGameplay(page, { zone: FROM, settleMs: 10000 });
  await snapshot(`after boot ${FROM}:`);
  await travelTo(TO);
  await snapshot(`after travel ${TO}:`);
  await travelTo(FROM);
  await snapshot(`after return ${FROM}:`);
} finally {
  await browser.close();
}
