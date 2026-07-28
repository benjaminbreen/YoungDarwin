// What distance does to a colour AT BAKE TIME.
//
// Every vista generator used to fold a fixed `#b9d7de` toward its far end — a
// cool midday blue, frozen into the .bin buffers. That is wrong twice over.
// It freezes one sky into geometry that has to survive dawn, golden hour,
// garua and night, so at any other time the distant land carries a colour that
// exists nowhere else in the frame. And it double-counts: the runtime already
// mixes these layers toward the live fog and horizon colour, so the baked cast
// was a second haze system fighting the first.
//
// What IS legitimate to bake is the part of aerial perspective that does not
// depend on the sky: distance eats contrast and saturation. Pulling a colour
// toward its own luminance does exactly that and adds no hue of its own, so
// the live sky remains the only source of the haze's colour.

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

export function bakeDistanceWash(color, amount) {
  if (!(amount > 0)) return color;
  const t = Math.min(1, amount);
  const luma = color.r * LUMA_R + color.g * LUMA_G + color.b * LUMA_B;
  color.r += (luma - color.r) * t;
  color.g += (luma - color.g) * t;
  color.b += (luma - color.b) * t;
  return color;
}
