export const NATURE_TEXTURE_BASE = '/assets/textures/nature/generated';
export const GENERATED_GRASS_FIBRES = `${NATURE_TEXTURE_BASE}/grass-fibres-albedo.webp`;

const surface = (file, source, size, span, relief, roughness, options = {}) => ({
  file, source, size, span, relief, roughness, ...options,
  albedo: `${options.base || NATURE_TEXTURE_BASE}/${file}-albedo.webp`,
  normal: `${options.base || NATURE_TEXTURE_BASE}/${file}-normal.webp`,
  roughnessMap: `${options.base || NATURE_TEXTURE_BASE}/${file}-roughness.webp`,
});

const botanical = (file, source, size, span, relief, roughness, options = {}) => surface(
  file, source, size, span, relief, roughness,
  { base: '/assets/textures/nature/botanical', sourceFolder: 'botanical-materials', ...options },
);

// Shared bake/runtime registry. Spans and relief are approximate metres, not
// measured specimen data. Atlas cells stay registered to the procedural UVs.
export const NATURE_SURFACES = {
  'tortoise-shell': surface('tortoise-shell', 'tortoise-shell', [1024, 1024], [2, 2], 0.003, [0.78, 0.94]),
  'tortoise-skin': surface('tortoise-skin', 'tortoise-skin', [1024, 1024], [0.12, 0.12], 0.0006, [0.86, 0.98], { periodic: [0, 1] }),
  'finch-body': surface('finch-body', 'finch-atlas', [512, 512], [0.65, 0.65], 0.00018, [0.90, 0.99], { cell: 0, periodic: [0] }),
  'finch-head': surface('finch-head', 'finch-atlas', [512, 512], [0.25, 0.25], 0.00012, [0.91, 0.99], { cell: 1, periodic: [0] }),
  'finch-armWing': surface('finch-arm-wing', 'finch-atlas', [512, 512], [0.35, 0.35], 0.0002, [0.82, 0.96], { cell: 2 }),
  'finch-handWing': surface('finch-hand-wing', 'finch-atlas', [512, 512], [0.3, 0.3], 0.00018, [0.82, 0.96], { cell: 3 }),
  'finch-covert': surface('finch-covert', 'finch-atlas', [512, 512], [0.3, 0.3], 0.00015, [0.88, 0.98], { cell: 4 }),
  'finch-primary': surface('finch-primary', 'finch-atlas', [512, 256], [0.3, 0.08], 0.00012, [0.82, 0.96], { cell: 5 }),
  'finch-tail': surface('finch-tail', 'finch-atlas', [512, 512], [0.3, 0.3], 0.00018, [0.84, 0.97], { cell: 6 }),
  'palo-bark': botanical('palo-bark', 'palo-bark', [1024, 1024], [0.35, 0.56], 0.0008, [0.85, 0.97], { periodic: [0, 1] }),
  'humid-bark': botanical('humid-bark', 'humid-bark', [1024, 1024], [0.4, 0.4], 0.0015, [0.82, 0.97], { periodic: [0, 1] }),
  'palo-leaf-green': botanical('palo-leaf-green', 'palo-leaf-atlas', [512, 512], [0.07, 0.13], 0.00008, [0.78, 0.94], { cell: 0, atlasGrid: [2, 2] }),
  'palo-leaf-olive': botanical('palo-leaf-olive', 'palo-leaf-atlas', [512, 512], [0.07, 0.13], 0.00008, [0.83, 0.96], { cell: 1, atlasGrid: [2, 2] }),
  'palo-leaf-dry': botanical('palo-leaf-dry', 'palo-leaf-atlas', [512, 512], [0.07, 0.13], 0.00007, [0.91, 0.99], { cell: 2, atlasGrid: [2, 2] }),
  'cactus-skin': botanical('cactus-skin', 'cactus-skin', [1024, 1024], [0.2, 0.2], 0.00015, [0.77, 0.94], { periodic: [0, 1] }),
};
