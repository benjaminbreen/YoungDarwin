// Live global tuning for the direct neighbor apron, the camera-relative Cerro
// Pajas silhouette, and their shared aerial perspective.

const STORAGE_KEY = 'darwin.distanceScenery.tuning.v4';

export const CENTRAL_PEAK_DEV_DEFAULTS = Object.freeze({
  // Aerial perspective for distant vista layers. 0 keeps the scene's fogExp2
  // verbatim (anything past ~130 m is >90% fog); 1 compresses fog distance for
  // those layers so the island reads to the horizon. Scene fog for local
  // terrain is never touched.
  //
  // This now shares the frame with the unified `vistaAir` curve below. Scene
  // fog is a local-terrain curve borrowed by the backdrop; vistaAir is the
  // backdrop's own. Lowering this and raising vistaAirMax moves ownership of
  // the distance falloff from the former to the latter.
  aerialPerspective: 0.54,

  // --- shared aerial perspective (vistaAtmosphere.js) -----------------------
  // One curve by true camera distance for the apron and central backdrop.
  vistaAirStart: 115,
  vistaAirScale: 320,
  vistaAirCurve: 2.5,
  vistaAirMax: 0.98,
  // Post-fog dissolve toward the sky's own horizon colour. This is what stops
  // a fully hazed ridge from reading as a flat plate of fog colour cut out
  // against a differently coloured sky. 0 restores the old behaviour.
  vistaSkyMatch: 0.2,
  vistaSkyLift: 1.42,
  vistaSkyFull: 220,
  // Horizon colour construction, driven by SkyController. 0 uses the graded
  // fog colour verbatim; 1 uses the sky dome's horizon band. The fog colour is
  // luminance-clamped for local mist and reads too dark at the horizon line,
  // so the useful range sits high.
  vistaSkyBlend: 0.36,
  // What distance does to the surface itself, before haze is mixed over it.
  // Saturation is how much colour survives at full haze; contrast is the value
  // multiplier there, which is the direct control on how hard a distant ridge
  // reads as a silhouette rather than as a wash.
  vistaSaturation: 0.96,
  vistaContrast: 1,
  // Near-field surface grain on the apron. Was hardcoded.
  vistaGrain: 1.8,
  // Valley haze — pools low, thins toward ridgelines. Feathers the hard line
  // where a distant layer meets the ground in front of it.
  vistaValleyHaze: 0.5,
  vistaValleyHeight: 44,
  // --- distance softening (far-field depth of field) ------------------------
  // Distant landform is low-frequency by nature, but it is drawn with hard
  // polygon silhouettes and per-vertex colour steps, and those high-frequency
  // edges are what read as "glitchy" at range. A real lens resolves distance
  // softly; matching that dissolves aliased ridgelines and layer seams into
  // organic shapes for a fraction of the cost of building geometry fine enough
  // to survive being sharp. Focus stays near the player so the foreground is
  // untouched — this only softens what is already far away.
  distanceSoftening: true,
  softeningFocus: 5,
  // Range controls how quickly defocus builds. At 400 m the circle of confusion
  // stayed near zero out to ~250 m, and a near-zero CoC is the worst case for a
  // downsampled bokeh: the kernel is about one low-res pixel wide, so there is
  // no blur to disguise the low-res buffer and the mid-distance just resolves
  // as visible blocks. Bringing this in gives the mid-ground an actual kernel,
  // which is both the look we want and what hides the sampling.
  softeningRange: 220,
  softeningBokeh: 2.8,
  // The downsample is only free when the blur is wide enough to cover it;
  // below ~0.7 the grid can show anywhere the CoC is small. 0.55 is the
  // screenshot-tuned balance point (2026-07-30 bake).
  softeningResolution: 0.55,
  // Diagnostic tint for the direct apron.
  debugLayerTint: false,

  // --- Cerro Pajas billboard ----------------------------------------------
  visible: true,
  widthScale: 1.9,
  heightScale: 0.6,
  // resolveCentralPeakAppearance supplies a -4.2 m baseline.
  verticalOffset: -1,
  nearContrast: 0.58,
  farContrast: 0.07,
  hazeNearKm: 1.6,
  hazeFarKm: 6,
  weatherHaze: 0.78,
  baseDissolve: 0.42,
  ridgeSoftness: 4,

  // --- neighbour apron -----------------------------------------------------
  neighborApronVisible: true,
  neighborApronRelief: 0.75,
  neighborApronVertical: -2.5,
  neighborApronHazeStart: 0.58,
  neighborApronNearHaze: 0,
  neighborApronFarHaze: 0.55,
  neighborApronSoftFocus: 0,

});

// Tuning this system means many small screenshot-verified adjustments, and
// losing them to a reload made every session start from scratch. Persisted
// values are filtered against the current default keys, so removing a knob in
// code drops it from storage instead of resurrecting a dead field.
function storedTuning() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const clean = {};
    for (const key of Object.keys(CENTRAL_PEAK_DEV_DEFAULTS)) {
      const value = parsed[key];
      if (value === undefined) continue;
      if (typeof value !== typeof CENTRAL_PEAK_DEV_DEFAULTS[key]) continue;
      clean[key] = value;
    }
    return clean;
  } catch {
    return null;
  }
}

export const centralPeakDev = {
  ...CENTRAL_PEAK_DEV_DEFAULTS,
  ...(storedTuning() || {}),
};

let revision = 0;
const listeners = new Set();

function persist() {
  if (typeof window === 'undefined') return;
  try {
    const dirty = {};
    for (const key of Object.keys(CENTRAL_PEAK_DEV_DEFAULTS)) {
      if (centralPeakDev[key] !== CENTRAL_PEAK_DEV_DEFAULTS[key]) dirty[key] = centralPeakDev[key];
    }
    if (Object.keys(dirty).length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dirty));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing or a full quota: tuning simply stops surviving reloads.
  }
}

function publish() {
  revision += 1;
  persist();
  listeners.forEach(listener => listener());
}

export function setCentralPeakDev(patch) {
  Object.assign(centralPeakDev, patch);
  publish();
}

export function resetCentralPeakDev() {
  Object.assign(centralPeakDev, CENTRAL_PEAK_DEV_DEFAULTS);
  publish();
}

// Only the values that differ from the shipping defaults, formatted so they can
// be pasted straight into CENTRAL_PEAK_DEV_DEFAULTS above. Screenshot tuning is
// worthless if promoting it to code means transcribing sliders by eye.
export function centralPeakDevDiffSource() {
  const lines = [];
  for (const key of Object.keys(CENTRAL_PEAK_DEV_DEFAULTS)) {
    const value = centralPeakDev[key];
    if (value === CENTRAL_PEAK_DEV_DEFAULTS[key]) continue;
    const literal = typeof value === 'string' ? `'${value}'` : String(value);
    lines.push(`  ${key}: ${literal},`);
  }
  return lines.length ? lines.join('\n') : '// matches defaults';
}

export function subscribeCentralPeakDev(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCentralPeakDevRevision() {
  return revision;
}
