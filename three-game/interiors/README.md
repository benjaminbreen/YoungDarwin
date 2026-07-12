# Interior Lighting

`InteriorLightingRig.jsx` is the shared lighting template for ship cabins,
houses, caves, and other enclosed zones. Each interior supplies a `lighting`
object from `interiorRegistry.js`; the rig contains no Beagle coordinates.

## Portals

Add a portal for every window group, skylight, or open doorway that materially
lights the room:

- `position`: center of the opening in game coordinates.
- `normal`: unit vector pointing from the room toward the exterior.
- `width` / `height`: emitting dimensions for diffuse sky light.
- `diffuseIntensity`: soft weather- and time-aware light entering the opening.
- `direct`: optional sun projector. It follows the shared celestial sun and is
  active only when the sun lies outside the portal normal.
- `direct.shaft`: optional volumetric beam configuration. Add `shaft.panes` for
  restrained rectangular volumes that follow individual skylight panes instead
  of one broad cone.
- `bounce`: optional low reflected-light surface inside the room.

Direct projectors can define `shadowRadiusClear` / `shadowRadiusOvercast` and
`penumbraClear` / `penumbraOvercast`. The rig interpolates these from the shared
weather state so clear sun remains legible while cloud light softens naturally.
`direct.warmth` warms only the shadow-casting projector, volumetric shaft, and
localized bounce patch; it does not tint the portal's broad diffuse fill.
Pane shafts can set `panes.axis` to the opening's long world-space axis. This
keeps separate beams aligned with vertical windows as the sun direction moves.

Ship interiors may opt into `scene.water` and `scene.exteriorAtmosphere` to
show the shared animated ocean and distant cloud deck through openings. Local
rain, mist, lightning, and ground weather remain outdoor-only.

Window groups can use one broad portal when their physical muntins already cast
the detailed shadows. A cave mouth usually needs one portal and no practical
lamps. A house can use separate portals for differently oriented elevations.

## Practical Lamps

`lamps` define local point lights independently of the visible lamp geometry.
`dayIntensity` keeps a restrained flame pool during daylight;
`nightIntensity` provides the primary night illumination. The rig adds
deterministic asynchronous flicker. Limit shadow-casting lamps to the sources
whose moving shadows matter most so interiors stay within GPU texture limits.
Movable candlesticks carry their own short-range flame light in `PropVisuals`,
so their glow follows the Rapier body when the player moves them.

## Postprocessing

The optional `lighting.postprocessing` block controls interior-specific AO,
bloom, and composer multisampling. Outdoor defaults remain unchanged. Interior
AO should be tight enough to ground furniture without staining whole walls;
bloom should support bright apertures and flames after the underlying lights
already illuminate the room.

`exposureDay`, `exposureNight`, and `exposureResponse` provide a tunable eye-
adaptation curve. Keep night targets conservative and use portal bounce before
raising global exposure; otherwise apertures clip before the room becomes
readable.
