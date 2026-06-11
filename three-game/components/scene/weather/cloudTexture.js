// Procedural cloud-puff sprite for drei <Clouds>, generated once on the
// client and handed over as a data URL so we never depend on drei's remote
// default texture (CDN fetch) at runtime.
let cachedUrl = null;

export function getCloudTextureUrl() {
  if (cachedUrl) return cachedUrl;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const core = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  core.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  core.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  core.addColorStop(0.8, 'rgba(255,255,255,0.12)');
  core.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);

  // A few dimples of varied alpha so overlapping segments read as vapour
  // rather than identical stamped blobs.
  const lobes = [
    [0.36, 0.42, 0.2, 0.22],
    [0.64, 0.38, 0.17, 0.18],
    [0.5, 0.62, 0.22, 0.16],
    [0.42, 0.3, 0.12, 0.14],
  ];
  lobes.forEach(([x, y, r, a]) => {
    const g = ctx.createRadialGradient(size * x, size * y, 0, size * x, size * y, size * r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });

  cachedUrl = canvas.toDataURL('image/png');
  return cachedUrl;
}
