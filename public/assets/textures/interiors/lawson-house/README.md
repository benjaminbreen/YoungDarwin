# Lawson House Interior Textures

Runtime PBR sources embedded by `scripts/blender_build_lawson_house.py`.

## Poly Haven: Wood Planks

- Source: https://polyhaven.com/a/wood_planks
- Author: Amal Kumar
- License: CC0
- Runtime source files: `wood-planks-{diff,normal,rough}-1k.jpg`
- Use: worn wide-board floor, color-graded darker and less saturated in Blender.

## Poly Haven: Beige Wall 001

- Source: https://polyhaven.com/a/beige_wall_001
- Authors: Dimitrios Savva (photography), Rico Cilliers (processing)
- License: CC0
- Runtime source files: `limewash-{diff,normal,rough}-1k.jpg`
- Use: subtly porous lime/distemper finish over the public-room wall panels;
  separate warm ivory, muted grey-green, and ochre material tints distinguish
  public, office, and private functions without implying imported wallpaper.

## Shared Project Sources

The colony-store face selectively reuses the CC0 distressed painted-plank set
documented in `public/assets/textures/interiors/beagle-cabin/README.md`. It is
not used as the public-room wall finish.

The generated GLBs embed their textures. These files remain in the repository
to make later rebuilds deterministic.
