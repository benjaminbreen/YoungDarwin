import * as THREE from 'three';

export const STANDARD_FOOT_PATH_SPLAT_BOUNDS = {
  originX: -42,
  originZ: -42,
  width: 84,
  depth: 84,
  size: 1024,
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash2(x, z, salt = 0) {
  const value = Math.sin((x * 127.1 + z * 311.7 + salt * 17.13) * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

function valueNoise(x, z, scale = 1, salt = 0) {
  const gx = x * scale;
  const gz = z * scale;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = THREE.MathUtils.lerp(hash2(ix, iz, salt), hash2(ix + 1, iz, salt), ux);
  const b = THREE.MathUtils.lerp(hash2(ix, iz + 1, salt), hash2(ix + 1, iz + 1, salt), ux);
  return THREE.MathUtils.lerp(a, b, uz);
}

function fbm(x, z, scale = 1, salt = 0) {
  let value = 0;
  let amp = 0.5;
  let sx = x * scale;
  let sz = z * scale;
  for (let i = 0; i < 5; i += 1) {
    value += valueNoise(sx, sz, 1, salt + i * 19) * amp;
    const nx = sx * 1.72 - sz * 0.92 + 4.4;
    const nz = sx * 0.92 + sz * 1.72 - 3.1;
    sx = nx;
    sz = nz;
    amp *= 0.52;
  }
  return value;
}

function segmentFrame(px, pz, ax, az, aw, bx, bz, bw) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz || 1;
  const t = THREE.MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const centerX = ax + abx * t;
  const centerZ = az + abz * t;
  const length = Math.sqrt(lengthSq);
  return {
    centerX,
    centerZ,
    distance: Math.hypot(px - centerX, pz - centerZ),
    width: THREE.MathUtils.lerp(aw, bw, t),
    yaw: Math.atan2(abz / length, abx / length),
  };
}

// pathPoints may be a single polyline ([[x, z, w], ...]) or a list of
// polylines (a branching network); consecutive points only connect within a
// polyline, so branches never grow phantom joining segments.
function asPolylines(pathPoints) {
  return Array.isArray(pathPoints[0][0]) ? pathPoints : [pathPoints];
}

export function pathFrameAt(pathPoints, x, z) {
  let nearest = null;
  for (const polyline of asPolylines(pathPoints)) {
    for (let i = 0; i < polyline.length - 1; i += 1) {
      const [ax, az, aw] = polyline[i];
      const [bx, bz, bw] = polyline[i + 1];
      const frame = segmentFrame(x, z, ax, az, aw, bx, bz, bw);
      if (!nearest || frame.distance < nearest.distance) nearest = frame;
    }
  }
  return nearest;
}

function elongatedSplat(along, across, scale, softness, threshold, stretchX = 1, stretchY = 1, salt = 0) {
  const cellX = Math.floor(along * scale);
  const cellY = Math.floor(across * scale);
  const localX = along * scale - cellX;
  const localY = across * scale - cellY;
  let value = 0;
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      const cx = cellX + x;
      const cy = cellY + y;
      const h = hash2(cx, cy, salt + 17);
      const centerX = x + hash2(cx, cy, salt + 3.1);
      const centerY = y + hash2(cx, cy, salt - 5.7);
      const angle = hash2(cx, cy, salt + 29) * Math.PI * 2;
      const dx = (localX - centerX) * stretchX;
      const dy = (localY - centerY) * stretchY;
      const rx = Math.cos(angle) * dx - Math.sin(angle) * dy;
      const ry = Math.sin(angle) * dx + Math.cos(angle) * dy;
      const blob = 1 - smoothstep(0, softness, rx * rx + ry * ry);
      value = Math.max(value, blob * smoothstep(threshold, 1, h));
    }
  }
  return clamp01(value);
}

export function createStandardFootPathSplatTexture({
  pathPoints,
  bounds = STANDARD_FOOT_PATH_SPLAT_BOUNDS,
  size = bounds.size || STANDARD_FOOT_PATH_SPLAT_BOUNDS.size,
  minimumWidth = 2.55,
} = {}) {
  if (!pathPoints || pathPoints.length < 2) {
    throw new Error('createStandardFootPathSplatTexture requires at least two path points.');
  }

  const data = new Uint8Array(size * size * 4);
  let cursor = 0;
  for (let row = 0; row < size; row += 1) {
    const z = bounds.originZ + (row / (size - 1)) * bounds.depth;
    for (let col = 0; col < size; col += 1) {
      const x = bounds.originX + (col / (size - 1)) * bounds.width;
      const frame = pathFrameAt(pathPoints, x, z);
      const dirX = Math.cos(frame.yaw);
      const dirZ = Math.sin(frame.yaw);
      const sideX = -dirZ;
      const sideZ = dirX;
      const dx = x - frame.centerX;
      const dz = z - frame.centerZ;
      const along = x * dirX + z * dirZ;
      const across = dx * sideX + dz * sideZ;
      const edgeNoise = Math.sin(along * 0.31 + frame.centerX * 0.08) * 0.46
        + Math.sin(along * 0.11 - frame.centerZ * 0.17) * 0.34
        + (fbm(along, frame.width * 6.4, 0.055, 41) - 0.5) * 1.35;
      const width = Math.max(minimumWidth, frame.width + edgeNoise);
      const distance = Math.hypot(dx, dz);
      const path = 1 - smoothstep(width * 0.58, width * 1.1, distance);
      const tread = 1 - smoothstep(width * 0.28, width * 0.76, distance);
      const shoulder = smoothstep(width * 0.52, width * 1.02, distance)
        * (1 - smoothstep(width * 0.92, width * 1.42, distance));
      const brokenEdge = path * (0.76 + fbm(along, across, 0.16, 73) * 0.35);
      const broadScuff = elongatedSplat(along, across, 0.44, 0.78, 0.34, 1.6, 0.72, 101);
      const footScuff = elongatedSplat(along + 3.4, across - 0.2, 0.9, 0.5, 0.54, 1.9, 0.64, 139);
      const compacted = tread * clamp01(0.18 + fbm(along, across, 0.34, 113) * 0.64 + broadScuff * 0.46 + footScuff * 0.32);
      const centerDust = (1 - smoothstep(0.14, Math.max(0.9, width * 0.24), Math.abs(across))) * tread;
      const lightFleck = path * clamp01(
        smoothstep(0.78, 0.94, valueNoise(along, across, 8.8, 151)) * 0.55
        + elongatedSplat(along - 2.0, across + 0.3, 1.18, 0.2, 0.76, 1.35, 0.74, 181) * 0.5
        + centerDust * 0.16,
      );
      const edgeDust = clamp01(shoulder * (0.52 + fbm(along, across, 0.28, 197) * 0.62) + path * (1 - tread) * 0.24);

      data[cursor] = Math.round(clamp01(brokenEdge) * 255);
      data[cursor + 1] = Math.round(clamp01(compacted) * 255);
      data[cursor + 2] = Math.round(clamp01(lightFleck) * 255);
      data[cursor + 3] = Math.round(clamp01(edgeDust) * 255);
      cursor += 4;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

function transparentPathSplatTexture() {
  if (typeof document === 'undefined') {
    const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return new THREE.Texture(canvas);
}

// Runtime terrain materials should consume a baked splat. Generating the
// authored 768-1024px mask performs millions of noise/path calculations and
// previously froze the transition on the main thread. A transparent texture
// is a safe failure mode: terrain remains playable and uses its base layer.
export function loadStandardFootPathSplatTexture(path) {
  const texture = transparentPathSplatTexture();
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  if (typeof window === 'undefined' || !path) return texture;

  const loader = new THREE.ImageBitmapLoader();
  loader.setOptions({
    imageOrientation: 'flipY',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  loader.load(
    path,
    bitmap => {
      texture.image?.close?.();
      texture.image = bitmap;
      texture.flipY = false;
      texture.needsUpdate = true;
    },
    undefined,
    error => {
      console.error(`[terrain-path-splat] ${path}: ${error?.message || error}`);
    },
  );
  texture.addEventListener('dispose', () => texture.image?.close?.());
  return texture;
}

export function standardFootPathSplatUniforms(texture, {
  bounds = STANDARD_FOOT_PATH_SPLAT_BOUNDS,
  textureUniform = 'uStandardFootPathSplat',
  boundsUniform = 'uStandardFootPathSplatBounds',
} = {}) {
  return {
    [textureUniform]: { value: texture },
    [boundsUniform]: { value: new THREE.Vector4(bounds.originX, bounds.originZ, bounds.width, bounds.depth) },
  };
}

export function standardFootPathSplatGLSL({
  functionName = 'standardFootPathSplat',
  textureUniform = 'uStandardFootPathSplat',
  boundsUniform = 'uStandardFootPathSplatBounds',
} = {}) {
  return /* glsl */`
        uniform sampler2D ${textureUniform};
        uniform vec4 ${boundsUniform};

        vec4 ${functionName}(vec2 p) {
          vec2 uv = (p - ${boundsUniform}.xy) / ${boundsUniform}.zw;
          vec2 clampedUv = clamp(uv, vec2(0.0), vec2(1.0));
          vec4 splat = texture2D(${textureUniform}, clampedUv);
          float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
          return splat * inside;
        }`;
}

function glslNumber(value) {
  return Number(value).toFixed(3);
}

export function standardFootPathFrameGLSL(pathPoints, {
  segmentFunctionName = 'standardFootPathSegmentFrame',
  frameFunctionName = 'standardFootPathFrame',
} = {}) {
  if (!pathPoints || pathPoints.length < 2) {
    throw new Error('standardFootPathFrameGLSL requires at least two path points.');
  }

  // Flatten (possibly branching) polylines into explicit [a, b] segments so
  // the emitted GLSL never bridges the gap between two separate polylines.
  const segments = [];
  for (const polyline of asPolylines(pathPoints)) {
    for (let i = 0; i < polyline.length - 1; i += 1) {
      segments.push([polyline[i], polyline[i + 1]]);
    }
  }

  const segmentCall = (a, b) => `${segmentFunctionName}(p, vec3(${glslNumber(a[0])}, ${glslNumber(a[1])}, ${glslNumber(a[2])}), vec3(${glslNumber(b[0])}, ${glslNumber(b[1])}, ${glslNumber(b[2])}))`;
  const first = segmentCall(segments[0][0], segments[0][1]);
  const candidates = [];
  for (let i = 1; i < segments.length; i += 1) {
    const [a, b] = segments[i];
    candidates.push(`          candidate = ${segmentCall(a, b)};
          if (candidate.z < nearest.z) { nearest = candidate; dir = normalize(vec2(${glslNumber(b[0] - a[0])}, ${glslNumber(b[1] - a[1])})); }`);
  }

  const [a0, b0] = segments[0];
  return /* glsl */`
        vec4 ${segmentFunctionName}(vec2 p, vec3 a, vec3 b) {
          vec2 ab = b.xy - a.xy;
          float t = clamp(dot(p - a.xy, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
          vec2 c = a.xy + ab * t;
          float w = mix(a.z, b.z, t);
          return vec4(c, length(p - c), w);
        }
        vec4 ${frameFunctionName}(vec2 p) {
          vec4 nearest = ${first};
          vec2 dir = normalize(vec2(${glslNumber(b0[0] - a0[0])}, ${glslNumber(b0[1] - a0[1])}));
          vec4 candidate;
${candidates.join('\n')}
          return vec4(nearest.xy, nearest.w, atan(dir.y, dir.x));
        }`;
}
