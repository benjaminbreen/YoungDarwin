// Checks that what is on screen actually reached the GPU. The untextured
// basalt bug (a cached texture left at version 0, so three never uploaded it)
// rendered without any error; this walks the visible scene and names every
// material in that state, plus shader programs that failed to compile.

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'specularMap',
  'lightMap',
];

function imageLoaded(image) {
  if (!image) return false;
  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
    return image.complete && image.naturalWidth > 0;
  }
  if (Array.isArray(image)) return image.length > 0 && image.every(imageLoaded);
  // ImageBitmap, canvas, video, DataTexture payloads.
  return Number(image.width) > 0 || Number(image.data?.length) > 0;
}

function objectLabel(object) {
  const parts = [];
  let current = object;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const label = current.name || current.userData?.renderSource || null;
    if (label) parts.unshift(label);
    current = current.parent;
  }
  return parts.join(' > ') || object.type;
}

export function auditRenderIntegrity(handle, { summaryOnly = false, maxIssues = 40, maxDistance = 120 } = {}) {
  if (!handle?.scene || !handle?.gl || !handle?.camera) {
    return { available: false, ok: null, issues: [], note: 'window.__darwinScene is not published' };
  }
  const { scene, gl, camera, THREE } = handle;
  const issues = [];
  const counts = {
    visibleMeshes: 0,
    texturesChecked: 0,
    texturesPending: 0,
    neverMarked: 0,
    notUploaded: 0,
    brokenPrograms: 0,
    missingMaterial: 0,
  };
  const seenTextures = new Set();
  const frustum = THREE ? new THREE.Frustum() : null;
  if (frustum) {
    const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(matrix);
  }
  const cameraPosition = THREE ? camera.getWorldPosition(new THREE.Vector3()) : null;
  const addIssue = issue => {
    if (issues.length < maxIssues) issues.push(issue);
  };

  scene.traverseVisible(object => {
    if (!object.isMesh && !object.isPoints && !object.isLine && !object.isSprite) return;
    counts.visibleMeshes += 1;
    if (!object.material) {
      counts.missingMaterial += 1;
      addIssue({ kind: 'missing-material', object: objectLabel(object) });
      return;
    }
    let inView = true;
    if (frustum && object.frustumCulled !== false && object.geometry) {
      try {
        inView = frustum.intersectsObject(object);
      } catch {
        inView = true;
      }
    }
    if (inView && cameraPosition && !object.isInstancedMesh) {
      const distance = object.getWorldPosition(new THREE.Vector3()).distanceTo(cameraPosition);
      if (distance > maxDistance) inView = false;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const slot of TEXTURE_SLOTS) {
        const texture = material[slot];
        if (!texture?.isTexture || texture.isRenderTargetTexture || texture.isDepthTexture) continue;
        const key = `${texture.uuid}:${material.uuid}:${slot}`;
        if (seenTextures.has(key)) continue;
        seenTextures.add(key);
        counts.texturesChecked += 1;
        const image = texture.source?.data ?? texture.image;
        const loaded = imageLoaded(image);
        if (!loaded) {
          counts.texturesPending += 1;
          continue;
        }
        if (texture.version === 0) {
          counts.neverMarked += 1;
          addIssue({
            kind: 'texture-never-uploaded',
            detail: 'image is loaded but texture.version is 0, so three will never upload it',
            object: objectLabel(object),
            material: material.name || material.type,
            slot,
            texture: texture.name || image?.currentSrc || image?.src || texture.uuid,
          });
          continue;
        }
        if (inView && !gl.properties.get(texture)?.__webglTexture) {
          counts.notUploaded += 1;
          addIssue({
            kind: 'texture-not-on-gpu',
            detail: 'in view and marked for upload, but no GPU texture yet',
            object: objectLabel(object),
            material: material.name || material.type,
            slot,
            texture: texture.name || image?.currentSrc || image?.src || texture.uuid,
          });
        }
      }
    }
  });

  for (const program of gl.info?.programs || []) {
    if (program?.diagnostics && program.diagnostics.runnable === false) {
      counts.brokenPrograms += 1;
      addIssue({
        kind: 'shader-program-failed',
        program: program.name || program.cacheKey?.slice?.(0, 80) || 'unknown',
        log: String(program.diagnostics.programLog || program.diagnostics.fragmentShader?.log || '').slice(0, 400),
      });
    }
  }

  const ok = counts.neverMarked === 0 && counts.brokenPrograms === 0 && counts.missingMaterial === 0;
  return {
    available: true,
    ok,
    counts,
    issues: summaryOnly ? issues.slice(0, 5) : issues,
  };
}
