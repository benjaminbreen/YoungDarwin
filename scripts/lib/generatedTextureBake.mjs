// Match opposite texels in a narrow feather, identically for color and height.
// Generated "seamless" sources still need a periodic boundary before deriving
// normals. Work in linear light for albedo; height is already linear data.
export function makePeriodic(bytes, channels, color = false, size = 1024, axes = [0, 1]) {
  const values = Float32Array.from(bytes, value => {
    const v = value / 255;
    return color ? (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) : v;
  });
  const band = size / 32;
  for (const axis of axes) {
    for (let line = 0; line < size; line += 1) {
      for (let d = 0; d < band; d += 1) {
        const weight = 0.5 * (1 - d / band) ** 2;
        const a = (axis === 0 ? line * size + d : d * size + line) * channels;
        const b = (axis === 0 ? line * size + size - 1 - d : (size - 1 - d) * size + line) * channels;
        for (let c = 0; c < channels; c += 1) {
          const va = values[a + c];
          const vb = values[b + c];
          values[a + c] = va * (1 - weight) + vb * weight;
          values[b + c] = vb * (1 - weight) + va * weight;
        }
      }
    }
  }
  return Buffer.from(Uint8Array.from(values, value => {
    const v = color ? (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055) : value;
    return Math.round(Math.max(0, Math.min(1, v)) * 255);
  }));
}

