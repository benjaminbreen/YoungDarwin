"""Build the walkable HMS Beagle (1835 bark rig) and export a game GLB.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --disable-autoexec --python scripts/blender_build_hms_beagle_deck.py -- \
    [--out public/assets/models/ships/hms-beagle-deck.glb] [--render test-results/beagle-deck]

Coordinate contract (KEEP IN SYNC with three-game/world/regions/beagleDeck/hull.js):
  Game: +x bow, +y up, +z port.  Blender: +x bow, +z up, -y port.
  glTF export maps blender (x, y, z) -> game (x, z, -y), so game_z = -blender_y.

The terrain heightfield in-game provides every walkable surface (waist deck,
forecastle, poop, side ladders, boarding ramp). This model provides everything
else: hull shell + bulwarks wrap the terrain plateau, so the deck-outline and
deck-height functions here must match hull.js exactly.
"""

import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

# ---------------------------------------------------------------------------
# Shared hull constants — mirrored in three-game/world/regions/beagleDeck/hull.js
# ---------------------------------------------------------------------------
WAIST_Y = 1.6          # waist (main weather deck) height above sea-region origin
FOCSLE_Y = 2.45        # forecastle deck
POOP_Y = 3.45          # poop deck
FOCSLE_BREAK = 9.6     # x of forecastle front bulkhead
FOCSLE_RAMP0 = 8.0     # ladder ramps rise from here up to the break
POOP_BREAK = -7.6      # x of poop front bulkhead
POOP_RAMP0 = -5.0      # ladder ramps rise (going aft) from here
RAMP_Z0 = 1.0          # ladder band |z| range
RAMP_Z1 = 2.3
BOW_TIP = 13.4
STERN = -13.2
BEAM_HALF = 3.62
# The GLB renders in-game at SHIP_SCALE 1.8 (hull.js). Ship-proportional
# geometry stays true to the 1835 lines; human-interface fittings (rail
# height, doors, wheel, steps) are authored at ~1/1.8 so they read
# human-sized at world scale.
BULWARK_H = 0.64
HULL_OUT = 0.12        # hull planking sits this far outside the deck outline
GANGWAY_X0 = 0.8       # entry port (bulwark gap), port side
GANGWAY_X1 = 2.2
KEEL_Z = -3.6
WATERLINE = -0.9       # game sea level

MAST_FORE_X = 7.2
MAST_MAIN_X = -1.2
MAST_MIZZEN_X = -9.8


def clamp(v, lo, hi):
  return max(lo, min(hi, v))


def smoothstep(edge0, edge1, x):
  t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0)
  return t * t * (3 - 2 * t)


def half_beam(x):
  """Deck outline half-width at station x (game coords). Mirrors hull.js."""
  if x >= BOW_TIP:
    return 0.0
  fore = 1.0
  if x > 2.0:
    t = (x - 2.0) / 11.4
    fore = math.sqrt(max(0.0, 1.0 - t ** 2.35))
  u = clamp((-0.5 - x) / 12.7, 0.0, 1.0)
  aft = 1.0 - 0.30 * (u * u * (3 - 2 * u)) ** 1.35
  return BEAM_HALF * fore * aft


def deck_edge_y(x):
  """Sheer line at the deck edge: waist with smoothed raised fo'c'sle/poop."""
  y = WAIST_Y
  y += (FOCSLE_Y - WAIST_Y) * smoothstep(9.2, 9.9, x)
  y += (POOP_Y - WAIST_Y) * smoothstep(7.2, 7.9, -x)
  return y


def cap_z(x, port_side):
  """Bulwark cap height. The port entry port drops the rail to a low sill."""
  base = deck_edge_y(x) + BULWARK_H
  if port_side and GANGWAY_X0 - 0.28 < x < GANGWAY_X1 + 0.28:
    inside = smoothstep(GANGWAY_X0 - 0.28, GANGWAY_X0 + 0.1, x) * \
             smoothstep(GANGWAY_X1 + 0.28, GANGWAY_X1 - 0.1, -(-x))
    inside = smoothstep(GANGWAY_X0 - 0.28, GANGWAY_X0 + 0.1, x) * \
             (1.0 - smoothstep(GANGWAY_X1 - 0.1, GANGWAY_X1 + 0.28, x))
    return base - inside * (BULWARK_H - 0.10)
  return base


def keel_z(x):
  zk = KEEL_Z
  bow = smoothstep(10.6, BOW_TIP, x)
  zk = zk + (1.9 - zk) * bow ** 1.35
  stern_rise = smoothstep(11.6, 13.1, -x)
  zk = zk + (-1.0 - zk) * stern_rise if stern_rise > 0 else zk
  return zk


def section_fullness(x):
  """Section shape exponent: full-bodied midships, V at bow, eased aft."""
  e = 0.62
  e += 1.35 * smoothstep(6.0, 12.8, x)
  e += 0.45 * smoothstep(9.5, 13.0, -x)
  return e


def section_half_width(x, u):
  """Hull half-width at station x, height parameter u in [0..1] keel->cap."""
  b = (half_beam(x) + HULL_OUT)
  if b <= 0.0:
    return 0.0
  e = section_fullness(x)
  if u < 0.62:
    s = math.sin(min(1.0, u / 0.62) * math.pi * 0.5) ** e
  else:
    t = (u - 0.62) / 0.38
    s = 1.0 - 0.10 * t ** 1.6
  return b / 0.93 * s * 0.93  # normalised so deck line lands on b


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
MATS = {}
ROOT = Path(__file__).resolve().parents[1]
BEAGLE_TEXTURE_ROOT = ROOT / 'public/assets/textures/world/beagle-deck'
TEXTURED_UV_SCALES = {}


def mat(name, color, rough=0.85, metal=0.0):
  if name in MATS:
    return MATS[name]
  m = bpy.data.materials.new(name)
  m.use_nodes = True
  bsdf = m.node_tree.nodes.get('Principled BSDF')
  bsdf.inputs['Base Color'].default_value = (*color, 1.0)
  bsdf.inputs['Roughness'].default_value = rough
  bsdf.inputs['Metallic'].default_value = metal
  MATS[name] = m
  return m


def srgb(hexcode):
  h = hexcode.lstrip('#')
  return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def to_linear(c):
  return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def pmat(name, hexcode, rough=0.85, metal=0.0):
  return mat(name, to_linear(srgb(hexcode)), rough, metal)


def texture_noise01(x, y, seed=0.0):
  return math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453 % 1.0


def packed_canvas_image(name, size=256):
  image = bpy.data.images.new(name, width=size, height=size)
  base = to_linear(srgb('#d7ccb0'))
  warm = to_linear(srgb('#b9ab8a'))
  dark = to_linear(srgb('#8f8062'))
  pixels = []
  for y in range(size):
    for x in range(size):
      nx = x / size
      ny = y / size
      weave = 0.5 + 0.5 * math.sin(x * 0.55) * math.sin(y * 0.48)
      thread = 0.5 + 0.5 * math.sin((x + y * 0.18) * 0.19)
      fleck = texture_noise01(x, y, 3.7)
      stain = 1.0 - 0.10 * smoothstep(0.72, 1.0, texture_noise01(x * 0.08, y * 0.08, 9.4))
      edge_wear = 1.0 - 0.06 * (smoothstep(0.00, 0.10, nx) * (1.0 - smoothstep(0.90, 1.0, nx)))
      mix_warm = 0.10 + 0.10 * weave + 0.05 * thread
      mix_dark = 0.035 * smoothstep(0.76, 1.0, fleck)
      color = []
      for i in range(3):
        c = base[i] * (1.0 - mix_warm) + warm[i] * mix_warm
        c = c * (1.0 - mix_dark) + dark[i] * mix_dark
        color.append(clamp(c * stain * edge_wear, 0.0, 1.0))
      pixels.extend([color[0], color[1], color[2], 1.0])
  image.pixels = pixels
  image.pack()
  return image


def image_pmat(name, image_path=None, image=None, rough=0.85, metal=0.0, uv_scale=1.0):
  if name in MATS:
    return MATS[name]
  if image is None:
    try:
      image = bpy.data.images.load(str(image_path))
      image.pack()
    except Exception as exc:
      print(f'texture skipped for {name}: {exc}')
      return pmat(name, '#8a6b42', rough, metal)
  m = bpy.data.materials.new(name)
  m.use_nodes = True
  nodes = m.node_tree.nodes
  bsdf = nodes.get('Principled BSDF')
  bsdf.inputs['Roughness'].default_value = rough
  bsdf.inputs['Metallic'].default_value = metal
  tex = nodes.new('ShaderNodeTexImage')
  tex.image = image
  tex.extension = 'REPEAT'
  m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
  MATS[name] = m
  TEXTURED_UV_SCALES[name] = uv_scale
  return m


def init_materials():
  pmat('HullBlack', '#282219', 0.82)
  pmat('BandWhite', '#d8cfb6', 0.8)
  pmat('Copper', '#8f6a50', 0.62, 0.35)
  pmat('BulwarkInner', '#cfc3a4', 0.85)
  pmat('CapRail', '#4a3826', 0.75)
  pmat('DeckTrim', '#8a6b42', 0.85)
  pmat('SparBuff', '#c9a86a', 0.8)
  pmat('SparBlack', '#26221c', 0.8)
  pmat('SparWhite', '#d8d2c0', 0.8)
  pmat('Canvas', '#d9cdae', 0.92)
  pmat('RopeTar', '#3d3126', 0.95)
  pmat('RopeHemp', '#8a7657', 0.95)
  pmat('Brass', '#8f7434', 0.4, 1.0)
  pmat('IronBlack', '#211f1e', 0.55, 0.6)
  pmat('Glass', '#31424a', 0.15, 0.4)
  pmat('BoatWhite', '#d8d2c0', 0.85)
  pmat('BoatPaintWear', '#b7ad95', 0.9)
  pmat('BoatWoodDark', '#4c3724', 0.86)
  pmat('CanvasSeam', '#8d7f60', 0.98)
  image_pmat('BoatWood', BEAGLE_TEXTURE_ROOT / 'Planks037A_1K-JPG_Color.jpg', rough=0.82, uv_scale=0.62)
  image_pmat('BoatCanvas', image=packed_canvas_image('BeagleBoatCanvasTexture'), rough=0.98, uv_scale=1.55)
  pmat('GratingOak', '#6e5433', 0.9)


# ---------------------------------------------------------------------------
# Mesh helpers
# ---------------------------------------------------------------------------
COLLECTION = None


def new_object(name, mesh):
  ob = bpy.data.objects.new(name, mesh)
  COLLECTION.objects.link(ob)
  return ob


def apply_world_uv(ob, scale=1.0):
  me = ob.data
  uv_layer = me.uv_layers.new(name='UVMap') if not me.uv_layers else me.uv_layers[0]
  me.update()
  for poly in me.polygons:
    normal = poly.normal
    ax, ay, az = abs(normal.x), abs(normal.y), abs(normal.z)
    for loop_index in poly.loop_indices:
      vertex = me.vertices[me.loops[loop_index].vertex_index]
      co = vertex.co
      if az >= ax and az >= ay:
        u, v = co.x, co.y
      elif ax >= ay:
        u, v = co.y, co.z
      else:
        u, v = co.x, co.z
      uv_layer.data[loop_index].uv = (u * scale, v * scale)


def mesh_from_pydata(name, verts, faces, material):
  me = bpy.data.meshes.new(name)
  me.from_pydata(verts, [], faces)
  me.validate()
  me.update()
  ob = new_object(name, me)
  if material is not None:
    me.materials.append(material)
    uv_scale = TEXTURED_UV_SCALES.get(material.name)
    if uv_scale:
      apply_world_uv(ob, uv_scale)
  return ob


def loft_rings(name, rings, material, close_start=False, close_end=False, smooth=True):
  """Loft a list of rings (equal length lists of Vector) into a surface."""
  verts = []
  faces = []
  k = len(rings[0])
  for ring in rings:
    assert len(ring) == k
    verts.extend([tuple(p) for p in ring])
  for i in range(len(rings) - 1):
    for j in range(k - 1):
      a = i * k + j
      b = i * k + j + 1
      c = (i + 1) * k + j + 1
      d = (i + 1) * k + j
      faces.append((a, b, c, d))
  if close_start:
    faces.append(tuple(range(k - 1, -1, -1)))
  if close_end:
    base = (len(rings) - 1) * k
    faces.append(tuple(range(base, base + k)))
  ob = mesh_from_pydata(name, verts, faces, material)
  if smooth:
    for poly in ob.data.polygons:
      poly.use_smooth = True
  return ob


def add_box(name, center, size, material, yaw=0.0):
  """center/size in game coords (x, y_up, z_port). yaw about up axis."""
  cx, cy, cz = center
  sx, sy, sz = size
  hx, hy, hz = sx / 2, sy / 2, sz / 2
  cosy, siny = math.cos(yaw), math.sin(yaw)
  verts = []
  for dz in (-hz, hz):
    for dy in (-hy, hy):
      for dx in (-hx, hx):
        # rotate in plan (x, z_game), then convert game->blender (y_b = -z_g)
        px = dx * cosy - dz * siny
        pz = dx * siny + dz * cosy
        verts.append((cx + px, -(cz + pz), cy + dy))
  faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
  return mesh_from_pydata(name, verts, faces, material)


def add_cylinder(name, p0, p1, r0, r1, material, sides=10, cap=True):
  """Tapered cylinder between two game-space points."""
  a = Vector((p0[0], -p0[2], p0[1]))
  b = Vector((p1[0], -p1[2], p1[1]))
  axis = (b - a)
  length = axis.length
  if length < 1e-6:
    return None
  axis.normalize()
  # build orthonormal frame
  up = Vector((0, 0, 1)) if abs(axis.z) < 0.93 else Vector((1, 0, 0))
  u = axis.cross(up).normalized()
  v = axis.cross(u).normalized()
  verts = []
  for center, radius in ((a, r0), (b, r1)):
    for s in range(sides):
      ang = s / sides * math.tau
      p = center + (u * math.cos(ang) + v * math.sin(ang)) * radius
      verts.append(tuple(p))
  faces = []
  for s in range(sides):
    s2 = (s + 1) % sides
    faces.append((s, s2, sides + s2, sides + s))
  if cap:
    faces.append(tuple(range(sides - 1, -1, -1)))
    faces.append(tuple(range(sides, 2 * sides)))
  ob = mesh_from_pydata(name, verts, faces, material)
  for poly in ob.data.polygons:
    poly.use_smooth = True
  return ob


def add_rope(name, points, r, material, sides=5):
  """Poly-line rope as chained cylinders (merged later)."""
  for i in range(len(points) - 1):
    add_cylinder(f'{name}.{i}', points[i], points[i + 1], r, r, material, sides=sides, cap=False)


def noise01(*values):
  v = 0.0
  for i, value in enumerate(values, start=1):
    v += float(value) * (12.9898 * i + 37.719)
  return math.sin(v) * 43758.5453 % 1.0


def apply_mottled_materials(ob, materials, base_bias=0.68, mid_bias=0.9):
  """Assign broad, stable face-level color variation to flat GLB materials."""
  if not ob or not getattr(ob, 'data', None):
    return
  for material in materials[1:]:
    ob.data.materials.append(material)
  for poly in ob.data.polygons:
    c = poly.center
    n = noise01(c.x * 1.7, c.y * 2.3, c.z * 3.1, len(poly.vertices))
    if n > mid_bias:
      poly.material_index = min(2, len(materials) - 1)
    elif n > base_bias:
      poly.material_index = 1


def sag_points(p0, p1, sag, n=5):
  pts = []
  for i in range(n + 1):
    t = i / n
    x = p0[0] + (p1[0] - p0[0]) * t
    y = p0[1] + (p1[1] - p0[1]) * t - math.sin(t * math.pi) * sag
    z = p0[2] + (p1[2] - p0[2]) * t
    pts.append((x, y, z))
  return pts


# ---------------------------------------------------------------------------
# Hull
# ---------------------------------------------------------------------------

def hull_ring(x, k=13):
  """Full ring: starboard cap -> keel -> port cap. Game z: starboard -z, port +z."""
  zk = keel_z(x)
  ring = []
  cap_s = cap_z(x, port_side=False)
  cap_p = cap_z(x, port_side=True)
  # starboard side, from cap down to keel
  for i in range(k):
    u = 1.0 - i / (k - 1)
    z_up = zk + (cap_s - zk) * (u ** 0.92)
    w = section_half_width(x, u)
    ring.append(Vector((x, w, z_up)))   # blender y = -game z; starboard = -game z => +blender y
  # port side, keel back up to cap (skip duplicate keel point)
  for i in range(1, k):
    u = i / (k - 1)
    z_up = zk + (cap_p - zk) * (u ** 0.92)
    w = section_half_width(x, u)
    ring.append(Vector((x, -w, z_up)))
  return ring


def build_hull():
  stations = [STERN - 0.35, STERN, -12.6, -11.8, -10.6, -9.2, -7.8, -6.4, -5.0, -3.6,
              -2.2, -0.8, 0.6, 2.0, 3.4, 4.8, 6.2, 7.6, 9.0, 10.0, 10.9, 11.7,
              12.4, 12.9, 13.25]
  rings = [hull_ring(x) for x in stations]
  hull = loft_rings('BeagleHull', rings, MATS['HullBlack'], close_start=True, close_end=True)
  # copper sheathing below the waterline
  me = hull.data
  me.materials.append(MATS['Copper'])
  for poly in me.polygons:
    if poly.center.z < WATERLINE + 0.22:
      poly.material_index = 1
  build_sheer_band()
  return hull


def hull_width_at(x, z_up, port_side):
  """Half-width of the hull surface at station x and height z_up."""
  zk = keel_z(x)
  cz = cap_z(x, port_side)
  if cz <= zk + 0.01:
    return 0.0
  u = clamp((z_up - zk) / (cz - zk), 0.0, 1.0) ** (1.0 / 0.92)
  return section_half_width(x, u)


def build_sheer_band():
  """Crisp white band along the gunport strake, plus closed gunport lids."""
  z_lo, z_hi = 0.82, 1.42
  xs = [x for x in [-12.3 + i * 0.55 for i in range(60)] if x < 11.9]
  for side_port in (False, True):
    gz = 1 if side_port else -1
    rings = []
    for x in xs:
      if half_beam(x) < 0.6:
        continue
      w_lo = hull_width_at(x, z_lo, side_port) + 0.035
      w_hi = hull_width_at(x, z_hi, side_port) + 0.035
      rings.append([
        Vector((x, -gz * w_lo, z_lo)),
        Vector((x, -gz * w_hi, z_hi)),
      ])
    loft_rings(f'SheerBand.{gz}', rings, MATS['BandWhite'], smooth=True)
    # closed gunport lids along the band
    for gx in (-6.6, -3.9, -1.2, 1.6, 4.4, 7.1):
      zc = 1.12
      w = hull_width_at(gx, zc, side_port) + 0.055
      slope = (half_beam(gx + 0.4) - half_beam(gx - 0.4)) / 0.8
      yaw = gz * slope
      add_box(f'GunportLid.{gz}.{gx}', (gx, zc, gz * w), (0.6, 0.52, 0.05), MATS['HullBlack'], yaw=yaw)


def build_bulwark_trim():
  """Inner bulwark wall, cap rail, timberheads, gangway posts."""
  # sample stations along deck where bulwark exists
  xs = [STERN + 0.05 + i * 0.45 for i in range(int((BOW_TIP - 0.6 - STERN) / 0.45))]
  for side in (1, -1):  # game z sign; +1 = port
    wall_rings = []
    cap_rings = []
    segments = []
    current = []
    for x in xs:
      hb = half_beam(x)
      if hb < 0.35:
        continue
      in_gap = side == 1 and GANGWAY_X0 - 0.05 < x < GANGWAY_X1 + 0.05
      if in_gap:
        if current:
          segments.append(current)
          current = []
        continue
      current.append(x)
    if current:
      segments.append(current)
    for si, seg in enumerate(segments):
      wall_rings = []
      cap_rings = []
      for x in seg:
        hb = half_beam(x)
        deck = deck_edge_y(x)
        cz = cap_z(x, port_side=(side == 1))
        yin = (hb - 0.06)
        yc = hb + 0.03
        gz = side  # game z sign
        wall_rings.append([
          Vector((x, -gz * yin, deck - 0.05)),
          Vector((x, -gz * yin, cz - 0.02)),
        ])
        cap_rings.append([
          Vector((x, -gz * (yc - 0.20), cz - 0.01)),
          Vector((x, -gz * (yc + 0.20), cz - 0.01)),
          Vector((x, -gz * (yc + 0.20), cz + 0.06)),
          Vector((x, -gz * (yc - 0.20), cz + 0.06)),
          Vector((x, -gz * (yc - 0.20), cz - 0.01)),
        ])
      if len(wall_rings) >= 2:
        loft_rings(f'BulwarkInner.{side}.{si}', wall_rings, MATS['BulwarkInner'], smooth=False)
        loft_rings(f'CapRail.{side}.{si}', cap_rings, MATS['CapRail'], close_start=True, close_end=True, smooth=False)
    # timberheads
    x = seg_start = -12.4
    while x < BOW_TIP - 1.6:
      hb = half_beam(x)
      if hb > 0.5 and not (side == 1 and GANGWAY_X0 - 0.2 < x < GANGWAY_X1 + 0.2):
        deck = deck_edge_y(x)
        cz = cap_z(x, port_side=(side == 1))
        add_box(f'Timberhead.{side}.{x:.1f}', (x, (deck + cz - 0.02) / 2, side * (hb - 0.11)),
                (0.065, cz - deck - 0.04, 0.065), MATS['CapRail'])
      x += 0.9
  # gangway posts + sill
  for x in (GANGWAY_X0 - 0.12, GANGWAY_X1 + 0.12):
    hb = half_beam(x)
    add_box(f'GangwayPost.{x:.1f}', (x, WAIST_Y + BULWARK_H / 2 + 0.05, hb - 0.02),
            (0.12, BULWARK_H + 0.1, 0.12), MATS['CapRail'])


def build_boarding_steps():
  """Wooden accommodation steps up the port hull side (over the terrain ramp).

  Terrain ramp (hull.js): climbs from just above the waterline at x=4.2 to the
  gangway sill at x=1.4, hugging the hull outside the deck outline on the port
  side. Keep y0 in sync with B_BOARD_Y_FOOT in hull.js.
  """
  x0, x1 = 5.8, 1.35
  y0, y1 = -0.32, WAIST_Y + 0.10
  n = 20
  for i in range(n + 1):
    t = i / n
    x = x0 + (x1 - x0) * t
    y = y0 + (y1 - y0) * t
    hb = half_beam(x)
    add_box(f'BoardStep.{i}', (x, y, hb + 0.38), (0.24, 0.04, 0.62), MATS['DeckTrim'], yaw=0.0)
  # manrope on posts along the outboard side
  add_cylinder('BoardRail', (x0, y0 + 0.58, half_beam(x0) + 0.66), (x1, y1 + 0.58, half_beam(x1) + 0.66),
               0.022, 0.022, MATS['RopeHemp'], sides=6)
  for i in range(0, n + 1, 4):
    t = i / n
    x = x0 + (x1 - x0) * t
    y = y0 + (y1 - y0) * t
    hb = half_beam(x)
    add_cylinder(f'BoardRailPost.{i}', (x, y + 0.02, hb + 0.63), (x, y + 0.6, hb + 0.66),
                 0.02, 0.02, MATS['DeckTrim'], sides=6)


# ---------------------------------------------------------------------------
# Deck structures
# ---------------------------------------------------------------------------

def build_bulkheads():
  # Poop front bulkhead (doors into the poop cabin) between the side ladders.
  ph = POOP_Y - WAIST_Y
  add_box('PoopBulkhead', (POOP_BREAK + 0.09, WAIST_Y + ph / 2, 0), (0.18, ph, RAMP_Z0 * 2 - 0.06), MATS['BulwarkInner'])
  for dz in (-0.5, 0.5):
    add_box(f'PoopDoor.{dz}', (POOP_BREAK - 0.02, WAIST_Y + 0.55, dz), (0.06, 1.06, 0.44), MATS['CapRail'])
    add_box(f'PoopDoorKnob.{dz}', (POOP_BREAK - 0.07, WAIST_Y + 0.55, dz + 0.15), (0.035, 0.035, 0.035), MATS['Brass'])
  # side panels outboard of the ladders
  hbp = half_beam(POOP_BREAK)
  for side in (1, -1):
    zc = side * (RAMP_Z1 + hbp) / 2
    add_box(f'PoopSidePanel.{side}', (POOP_BREAK + 0.09, WAIST_Y + ph / 2, zc), (0.18, ph, hbp - RAMP_Z1 + 0.25),
            MATS['BulwarkInner'])
  # Forecastle front bulkhead
  fh = FOCSLE_Y - WAIST_Y
  add_box('FocsleBulkhead', (FOCSLE_BREAK - 0.09, WAIST_Y + fh / 2, 0), (0.18, fh, RAMP_Z0 * 2 - 0.06),
          MATS['BulwarkInner'])
  add_box('FocsleDoor', (FOCSLE_BREAK - 0.2, WAIST_Y + 0.33, 0.0), (0.06, 0.62, 0.46), MATS['CapRail'])
  hbf = half_beam(FOCSLE_BREAK)
  for side in (1, -1):
    zc = side * (RAMP_Z1 + hbf) / 2
    add_box(f'FocsleSidePanel.{side}', (FOCSLE_BREAK - 0.09, WAIST_Y + fh / 2, zc), (0.18, fh, hbf - RAMP_Z1 + 0.25),
            MATS['BulwarkInner'])


def build_ladders():
  """Side ladder stringers + handrails over the terrain ramps."""
  for brk, r0, up_y, going_fwd in ((FOCSLE_BREAK, FOCSLE_RAMP0, FOCSLE_Y, True),
                                   (POOP_BREAK, POOP_RAMP0, POOP_Y, False)):
    for side in (1, -1):
      zc = side * (RAMP_Z0 + RAMP_Z1) / 2
      x_lo, x_hi = (r0, brk) if going_fwd else (brk, r0)
      y_lo, y_hi = (WAIST_Y, up_y) if going_fwd else (up_y, WAIST_Y)
      for zoff in (-(RAMP_Z1 - RAMP_Z0) / 2, (RAMP_Z1 - RAMP_Z0) / 2):
        rings = []
        for t in (0.0, 1.0):
          x = x_lo + (x_hi - x_lo) * t
          y = y_lo + (y_hi - y_lo) * t
          rings.append([
            Vector((x, -(zc + zoff), y - 0.28)),
            Vector((x, -(zc + zoff), y + 0.05)),
            Vector((x, -(zc + zoff) - 0.05, y + 0.05)),
            Vector((x, -(zc + zoff) - 0.05, y - 0.28)),
            Vector((x, -(zc + zoff), y - 0.28)),
          ])
        loft_rings(f'LadderStringer.{brk}.{side}.{zoff:.2f}', rings, MATS['CapRail'], smooth=False)
      # handrail on the inboard side
      zi = zc - side * ((RAMP_Z1 - RAMP_Z0) / 2 + 0.05)
      add_cylinder(f'LadderRail.{brk}.{side}', (x_lo, y_lo + 0.9, zi), (x_hi, y_hi + 0.9, zi),
                   0.028, 0.028, MATS['CapRail'], sides=6)
      for t in (0.08, 0.92):
        x = x_lo + (x_hi - x_lo) * t
        y = y_lo + (y_hi - y_lo) * t
        add_cylinder(f'LadderRailPost.{brk}.{side}.{t}', (x, y, zi), (x, y + 0.9, zi),
                     0.024, 0.024, MATS['CapRail'], sides=6)


def build_hatches():
  for name, x, w, d in (('MainHatch', -2.8, 2.2, 2.6), ('ForeHatch', 5.2, 1.5, 1.8)):
    add_box(f'{name}Coaming', (x, WAIST_Y + 0.14, 0), (w + 0.24, 0.28, d + 0.24), MATS['DeckTrim'])
    # grating: slats
    n = max(4, int(d / 0.22))
    for i in range(n):
      z = -d / 2 + (i + 0.5) * d / n
      add_box(f'{name}Slat.{i}', (x, WAIST_Y + 0.29, z), (w, 0.05, 0.085), MATS['GratingOak'])
    for i in range(max(4, int(w / 0.3))):
      xx = x - w / 2 + (i + 0.5) * w / max(4, int(w / 0.3))
      add_box(f'{name}Cross.{i}', (xx, WAIST_Y + 0.315, 0), (0.06, 0.03, d), MATS['GratingOak'])


def build_poop_fittings():
  # Skylight over the poop cabin (chart table below).
  x, z = -9.1, 0.55
  add_box('SkylightBase', (x, POOP_Y + 0.18, z), (1.5, 0.36, 1.1), MATS['BulwarkInner'])
  rings = []
  for t in (0, 1):
    hw = 0.72 - t * 0.3
    hd = 0.52 - t * 0.22
    y = POOP_Y + 0.36 + t * 0.34
    rings.append([Vector((x - hw, -(z - hd), y)), Vector((x + hw, -(z - hd), y)),
                  Vector((x + hw, -(z + hd), y)), Vector((x - hw, -(z + hd), y)),
                  Vector((x - hw, -(z - hd), y))])
  loft_rings('SkylightRoof', rings, MATS['Glass'], close_end=True, smooth=False)
  for dx in (-0.7, 0.0, 0.7):
    add_box(f'SkylightBar.{dx}', (x + dx, POOP_Y + 0.53, z), (0.05, 0.4, 1.06), MATS['Brass'])
  # Companion hood (stair down to the gun deck)
  add_box('Companion', (-12.1, POOP_Y + 0.4, -1.1), (1.0, 0.8, 0.9), MATS['CapRail'])
  add_box('CompanionRoof', (-12.1, POOP_Y + 0.84, -1.1), (1.1, 0.1, 1.0), MATS['HullBlack'])
  # Wheel abaft the mizzen (rim circle lies in the x=const plane, facing forward)
  wx, wy = -11.2, POOP_Y
  add_box('WheelPedestal', (wx, wy + 0.5, 0), (0.3, 1.0, 0.5), MATS['CapRail'])
  add_cylinder('WheelDrum', (wx - 0.05, wy + 0.95, -0.2), (wx - 0.05, wy + 0.95, 0.2), 0.16, 0.16, MATS['DeckTrim'], sides=10)
  r = 0.55
  spokes = 8
  cx, cy = wx - 0.28, wy + 0.95
  pts = []
  for i in range(17):
    a = i / 16 * math.tau
    pts.append((cx, cy + math.sin(a) * r, math.cos(a) * r))
  add_rope('WheelRim', pts, 0.045, MATS['CapRail'], sides=6)
  for i in range(spokes):
    a = i / spokes * math.tau
    p0 = (cx, cy + math.sin(a) * 0.12, math.cos(a) * 0.12)
    p1 = (cx, cy + math.sin(a) * (r + 0.13), math.cos(a) * (r + 0.13))
    add_cylinder(f'WheelSpoke.{i}', p0, p1, 0.028, 0.02, MATS['CapRail'], sides=6)
  add_cylinder('WheelHub', (cx - 0.06, cy, 0), (cx + 0.06, cy, 0), 0.09, 0.09, MATS['Brass'], sides=8)
  # Binnacle
  add_box('Binnacle', (wx + 0.9, wy + 0.55, 0), (0.34, 1.1, 0.34), MATS['CapRail'])
  add_cylinder('BinnacleDome', (wx + 0.9, wy + 1.1, 0), (wx + 0.9, wy + 1.24, 0), 0.15, 0.02, MATS['Brass'], sides=10)
  # Stern lantern + ensign staff
  add_cylinder('EnsignStaff', (STERN - 0.15, POOP_Y + 1.0, 0), (STERN - 0.85, POOP_Y + 4.6, 0),
               0.045, 0.028, MATS['SparBuff'], sides=8)
  lx = STERN + 0.35
  add_cylinder('LanternPost', (lx, POOP_Y + 1.05, 1.9), (lx, POOP_Y + 1.75, 1.9), 0.035, 0.03, MATS['IronBlack'], sides=6)
  add_box('LanternBox', (lx, POOP_Y + 1.95, 1.9), (0.26, 0.4, 0.26), MATS['Brass'])
  add_box('LanternGlass', (lx, POOP_Y + 1.93, 1.9), (0.29, 0.28, 0.2), MATS['Glass'])


def build_waist_fittings():
  # Capstan on the quarterdeck approach
  x = -5.9
  add_cylinder('CapstanBarrel', (x, WAIST_Y, 0), (x, WAIST_Y + 1.15, 0), 0.42, 0.3, MATS['CapRail'], sides=12)
  add_cylinder('CapstanHead', (x, WAIST_Y + 1.15, 0), (x, WAIST_Y + 1.38, 0), 0.5, 0.42, MATS['DeckTrim'], sides=12)
  for i in range(6):
    a = i / 6 * math.tau
    add_box(f'CapstanWhelp.{i}', (x + math.cos(a) * 0.4, WAIST_Y + 0.5, math.sin(a) * 0.4),
            (0.1, 1.0, 0.1), MATS['DeckTrim'], yaw=-a)
  # Chain pumps just abaft the mainmast (clear of the main hatch)
  for dz in (-0.75, 0.75):
    add_cylinder(f'Pump.{dz}', (-0.2, WAIST_Y, dz), (-0.2, WAIST_Y + 0.95, dz),
                 0.14, 0.12, MATS['IronBlack'], sides=8)
    add_cylinder(f'PumpHandle.{dz}', (-0.9, WAIST_Y + 1.0, dz), (0.45, WAIST_Y + 0.9, dz),
                 0.03, 0.03, MATS['DeckTrim'], sides=6)
  # Windlass under the forecastle break
  add_cylinder('Windlass', (8.8, WAIST_Y + 0.5, -2.2), (8.8, WAIST_Y + 0.5, 2.2), 0.24, 0.24, MATS['CapRail'], sides=8)
  for dz in (-2.3, 0, 2.3):
    add_box(f'WindlassPost.{dz}', (8.8, WAIST_Y + 0.3, dz), (0.3, 0.65, 0.18), MATS['DeckTrim'])
  # Galley chimney on the forecastle
  add_cylinder('GalleyChimney', (11.0, FOCSLE_Y, -0.7), (11.0, FOCSLE_Y + 1.15, -0.7), 0.14, 0.13, MATS['IronBlack'], sides=8)
  add_cylinder('GalleyChimneyCap', (11.0, FOCSLE_Y + 1.15, -0.7), (11.0, FOCSLE_Y + 1.24, -0.7), 0.2, 0.2, MATS['IronBlack'], sides=8)
  # Ship's bell at the forecastle break
  add_box('BelfryFrameL', (FOCSLE_BREAK + 0.25, FOCSLE_Y + 0.25, -0.35), (0.08, 0.5, 0.08), MATS['CapRail'])
  add_box('BelfryFrameR', (FOCSLE_BREAK + 0.25, FOCSLE_Y + 0.25, 0.35), (0.08, 0.5, 0.08), MATS['CapRail'])
  add_box('BelfryTop', (FOCSLE_BREAK + 0.25, FOCSLE_Y + 0.53, 0), (0.1, 0.08, 0.8), MATS['CapRail'])
  add_cylinder('Bell', (FOCSLE_BREAK + 0.25, FOCSLE_Y + 0.46, 0), (FOCSLE_BREAK + 0.25, FOCSLE_Y + 0.24, 0),
               0.07, 0.13, MATS['Brass'], sides=10)
  # Scuttlebutt stand (the barrel itself is a reused in-game prop)
  # Carronades: two per side on slides in the waist
  for gx in (3.6, -3.2):
    for side in (1, -1):
      z = side * (half_beam(gx) - 0.95)
      add_box(f'GunSlide.{gx}.{side}', (gx, WAIST_Y + 0.22, z), (0.6, 0.44, 1.3), MATS['CapRail'])
      add_cylinder(f'GunBarrel.{gx}.{side}', (gx, WAIST_Y + 0.62, z + side * 0.15),
                   (gx, WAIST_Y + 0.72, z + side * 0.95), 0.16, 0.12, MATS['IronBlack'], sides=10)


def build_boats():
  def boat(name, cx, cy, cz, length, beam, covered, yaw=0.0):
    def half_width_at(t):
      return beam / 2 * math.sqrt(max(0.02, 1 - abs(2 * t - 1) ** 2.4))

    def sheer_at(t):
      return 0.34 + 0.1 * (2 * t - 1) ** 2

    def side_curve(side, height, width_frac, inset=0.0, steps=12):
      pts = []
      for q in range(steps + 1):
        t = q / steps
        x = cx - length / 2 + length * t
        hw = max(0.05, half_width_at(t) - inset)
        pts.append((x, cy + height + 0.025 * (2 * t - 1) ** 2, cz + side * hw * width_frac))
      return pts

    def add_side_line(label, side, height, width_frac, radius, material, steps=12):
      add_rope(f'{name}{label}.{side}', side_curve(side, height, width_frac, steps=steps), radius, material, sides=5)

    def add_oar(label, tx, side, outward=1.0):
      start = (cx + tx * length, cy + 0.38, cz + side * beam * 0.08)
      end = (cx + (tx + 0.20 * outward) * length, cy + 0.39, cz + side * beam * 0.62)
      add_cylinder(f'{name}OarShaft.{label}.{side}', start, end, 0.014, 0.011, MATS['BoatWood'], sides=6)
      blade_yaw = side * 0.18
      add_box(f'{name}OarBlade.{label}.{side}', end, (0.34, 0.018, 0.13), MATS['BoatWood'], yaw=blade_yaw)

    rings = []
    n = 14
    section_steps = 13
    for i in range(n + 1):
      t = i / n
      x = -length / 2 + length * t
      hw = half_width_at(t)
      sheer = sheer_at(t)
      keel = -0.30 * math.sqrt(max(0.05, 1 - (2 * t - 1) ** 2))
      ring = []
      for j in range(section_steps):
        u = j / (section_steps - 1)
        w = hw * math.cos(math.pi * u)          # widest at the gunwales
        zz = sheer - (sheer - keel) * math.sin(math.pi * u) ** 0.9
        ring.append(Vector((cx + x, -(cz - w), cy + zz)))
      rings.append(ring)
    loft_rings(name, rings, MATS['BoatWood'], close_start=True, close_end=True)

    # Ship's boats read mostly from silhouette and strake rhythm at game scale.
    for side in (1, -1):
      add_side_line('Gunwale', side, 0.43, 0.98, 0.026, MATS['BoatWoodDark'])
      add_side_line('RubRail', side, 0.31, 0.91, 0.012, MATS['BoatWoodDark'])
      add_side_line('Lapstrake1', side, 0.20, 0.78, 0.010, MATS['CanvasSeam'])
      add_side_line('Lapstrake2', side, 0.10, 0.60, 0.008, MATS['CanvasSeam'])
    for tx in (-0.46, 0.46):
      add_cylinder(f'{name}StemPost.{tx}', (cx + tx * length, cy - 0.04, cz), (cx + tx * length, cy + 0.50, cz),
                   0.022, 0.018, MATS['BoatWoodDark'], sides=6)

    if covered:
      cover = []
      for i in range(n + 1):
        t = i / n
        x = -length / 2 + length * t
        hw = half_width_at(t) + 0.06
        sheer = sheer_at(t)
        ridge = 0.46 * (0.72 + 0.28 * math.sin(t * math.pi))
        ring = []
        for j in range(section_steps):
          u = j / (section_steps - 1)
          side = -1.0 + 2.0 * u
          w = hw * side
          tent = max(0.0, 1.0 - abs(side)) ** 0.9
          zz = sheer + 0.04 + ridge * tent
          ring.append(Vector((cx + x, -(cz - w), cy + zz)))
        cover.append(ring)
      loft_rings(f'{name}Cover', cover, MATS['BoatCanvas'], close_start=True, close_end=True, smooth=False)
      add_cylinder(f'{name}CoverRidge', (cx - length * 0.42, cy + 0.82, cz),
                   (cx + length * 0.42, cy + 0.82, cz), 0.016, 0.016, MATS['CanvasSeam'], sides=5)
      for side in (1, -1):
        add_side_line('CoverEdge', side, 0.50, 1.05, 0.010, MATS['CanvasSeam'], steps=10)
      for tx in (-0.34, -0.12, 0.12, 0.34):
        x = cx + tx * length
        add_cylinder(f'{name}CoverSeam.{tx}', (x, cy + 0.58, cz - beam * 0.43),
                     (x, cy + 0.58, cz + beam * 0.43), 0.006, 0.006, MATS['CanvasSeam'], sides=4)
      for side in (1, -1):
        for tx in (-0.36, -0.18, 0.0, 0.18, 0.36):
          x = cx + tx * length
          z0 = cz + side * beam * 0.43
          z1 = cz + side * beam * 0.53
          add_cylinder(f'{name}CoverLashing.{side}.{tx}', (x, cy + 0.47, z0), (x, cy + 0.36, z1),
                       0.006, 0.006, MATS['RopeHemp'], sides=4)
    else:
      for tx in (-0.34, -0.12, 0.12, 0.34):
        add_box(f'{name}Thwart{tx}', (cx + tx * length, cy + 0.25, cz), (0.13, 0.04, beam * 0.78), MATS['BoatWood'])
      for dz in (-0.22, 0.0, 0.22):
        add_box(f'{name}Floorboard{dz}', (cx, cy + 0.055, cz + dz), (length * 0.58, 0.03, 0.075), MATS['BoatWood'])
      for tx in (-0.42, -0.28, -0.14, 0.0, 0.14, 0.28, 0.42):
        x = cx + tx * length
        add_cylinder(f'{name}Rib.{tx}', (x, cy + 0.16, cz - beam * 0.34), (x, cy + 0.16, cz + beam * 0.34),
                     0.010, 0.010, MATS['BoatWoodDark'], sides=5)
      add_cylinder(f'{name}Keelson', (cx - length * 0.34, cy + 0.08, cz), (cx + length * 0.34, cy + 0.08, cz),
                   0.018, 0.018, MATS['BoatWoodDark'], sides=5)
      for side in (1, -1):
        add_oar('A', -0.22, side, outward=1)
        add_oar('B', 0.18, side, outward=-1)

  # Midship boats on skid beams over the waist
  for bx in (1.4, 5.6):
    add_box(f'SkidBeam.{bx}', (bx, WAIST_Y + 2.1, 0), (0.22, 0.16, half_beam(bx) * 2 + 0.5), MATS['BoatWoodDark'])
    for side in (1, -1):
      add_cylinder(f'SkidPost.{bx}.{side}', (bx, WAIST_Y + BULWARK_H, side * (half_beam(bx) - 0.25)),
                   (bx, WAIST_Y + 2.1, side * (half_beam(bx) - 0.25)), 0.06, 0.05, MATS['BoatWoodDark'], sides=6)
  boat('BoatYawl', 3.5, WAIST_Y + 2.18, 1.15, 6.0, 1.85, covered=True)
  boat('BoatCutter', 3.5, WAIST_Y + 2.18, -1.15, 5.4, 1.7, covered=True)
  # Quarter davits with whaleboats
  for side in (1, -1):
    dz = side * (half_beam(-11.0) - 0.1)
    tip_z = side * (half_beam(-11.0) + 1.55)
    for dx in (-12.6, -9.9):
      pts = [(dx, POOP_Y + 0.1, dz), (dx, POOP_Y + 1.55, dz + side * 0.45), (dx, POOP_Y + 1.85, tip_z)]
      add_rope(f'Davit.{side}.{dx}', pts, 0.055, MATS['IronBlack'], sides=8)
    boat(f'Whaleboat.{side}', -11.25, POOP_Y + 0.45, side * (half_beam(-11.0) + 1.55), 5.6, 1.6, covered=False)
    for dx in (-12.5, -10.0):
      add_rope(f'DavitFall.{side}.{dx}', [(dx, POOP_Y + 1.83, tip_z), (dx, POOP_Y + 0.6, tip_z)], 0.02,
               MATS['RopeHemp'], sides=4)


def build_anchors():
  for side in (1, -1):
    x = 10.7
    hb = half_beam(x)
    z = side * (hb + 0.55)
    top = WAIST_Y + 0.9
    # cathead beam
    add_box(f'Cathead.{side}', (x, FOCSLE_Y + 0.4, side * (hb - 0.3)), (0.28, 0.24, 1.7), MATS['CapRail'])
    # shank hanging down
    add_cylinder(f'AnchorShank.{side}', (x, top, z), (x, top - 2.1, z), 0.08, 0.07, MATS['IronBlack'], sides=8)
    # stock (wooden crossbar near ring)
    add_box(f'AnchorStock.{side}', (x, top - 0.35, z), (1.5, 0.16, 0.16), MATS['CapRail'])
    # arms
    for dx in (-0.75, 0.75):
      add_cylinder(f'AnchorArm.{side}.{dx}', (x, top - 2.1, z), (x + dx, top - 2.65, z), 0.07, 0.05,
                   MATS['IronBlack'], sides=8)
      add_box(f'AnchorFluke.{side}.{dx}', (x + dx, top - 2.6, z), (0.34, 0.5, 0.06), MATS['IronBlack'])
    add_rope(f'AnchorLash.{side}', [(x, FOCSLE_Y + 0.35, side * (hb + 0.05)), (x, top + 0.06, z)], 0.028,
             MATS['RopeTar'], sides=4)
  # riding cable from the starboard hawse down into the sea
  cable = []
  for i in range(7):
    t = i / 6
    cx = 11.9 + 7.2 * t
    cy = (WAIST_Y - 0.4) + (WATERLINE - 0.35 - (WAIST_Y - 0.4)) * (t ** 1.6)
    cz = -0.9 - 2.4 * t
    cable.append((cx, cy, cz))
  add_rope('RidingCable', cable, 0.06, MATS['RopeTar'], sides=6)


# ---------------------------------------------------------------------------
# Rig
# ---------------------------------------------------------------------------

def furled_sail(name, p0, p1, r):
  """Furled canvas bundle slung under a yard, with gasket bulges."""
  n = 14
  rings = []
  a = Vector((p0[0], -p0[2], p0[1]))
  b = Vector((p1[0], -p1[2], p1[1]))
  axis = (b - a).normalized()
  u = axis.cross(Vector((0, 0, 1))).normalized()
  v = axis.cross(u).normalized()
  L = (b - a).length
  for i in range(n + 1):
    t = i / n
    center = a.lerp(b, t)
    taper = math.sqrt(max(0.06, 1 - (2 * t - 1) ** 4))
    bulge = 1.0 - 0.22 * abs(math.sin(t * math.pi * 5)) ** 0.7
    rr = r * 0.66 * taper * bulge
    sag = math.sin(t * math.pi) * r * 0.85
    ring = []
    for j in range(9):
      ang = j / 8 * math.tau
      p = center + (u * math.cos(ang) + v * math.sin(ang)) * rr + Vector((0, 0, -sag - rr * 0.4))
      ring.append(p)
    rings.append(ring)
  loft_rings(name, rings, MATS['Canvas'], close_start=True, close_end=True)
  # gaskets
  for t in (0.18, 0.38, 0.62, 0.82):
    center = a.lerp(b, t)
    sag = math.sin(t * math.pi) * r * 0.85
    g0 = (center.x, center.z + r * 0.3, -center.y)
    g1 = (center.x, center.z - sag - r * 1.15, -center.y)
    add_rope(f'{name}Gasket{t}', [g0, g1], 0.014, MATS['RopeTar'], sides=4)


def build_mast(prefix, x, deck_y, lower_h, top_h, pole_h, yards, square=True):
  """A mast assembly. Heights are above deck_y. Returns key heights."""
  rake = 0.055  # aft rake: x shifts aft with height
  def mx(h):
    return x - h * rake

  # lower mast (buff)
  add_cylinder(f'{prefix}Lower', (mx(0), deck_y, 0), (mx(lower_h), deck_y + lower_h, 0), 0.30, 0.22,
               MATS['SparBuff'], sides=12)
  # mast hoops
  for h in [lower_h * t for t in (0.25, 0.5, 0.75)]:
    add_cylinder(f'{prefix}Hoop{h:.1f}', (mx(h), deck_y + h - 0.03, 0), (mx(h), deck_y + h + 0.03, 0), 0.315, 0.315,
                 MATS['IronBlack'], sides=12)
  if square:
    # top platform
    add_box(f'{prefix}Top', (mx(lower_h) - 0.15, deck_y + lower_h + 0.06, 0), (1.5, 0.12, 2.2), MATS['SparBlack'])
    add_box(f'{prefix}TopRail', (mx(lower_h) - 0.7, deck_y + lower_h + 0.28, 0), (0.06, 0.35, 2.0), MATS['SparBlack'])
  # doubling + topmast (white heel, buff spar)
  tm_base = lower_h - 0.9
  add_cylinder(f'{prefix}Topmast', (mx(tm_base) + 0.28, deck_y + tm_base, 0), (mx(top_h) + 0.28, deck_y + top_h, 0),
               0.17, 0.12, MATS['SparWhite'], sides=10)
  add_cylinder(f'{prefix}Cap', (mx(lower_h + 0.5), deck_y + lower_h + 0.5, 0), (mx(lower_h + 0.9), deck_y + lower_h + 0.9, 0),
               0.3, 0.3, MATS['SparBlack'], sides=8) if False else None
  # topgallant pole
  add_cylinder(f'{prefix}Pole', (mx(top_h) + 0.28, deck_y + top_h, 0), (mx(pole_h) + 0.28, deck_y + pole_h, 0),
               0.1, 0.05, MATS['SparBuff'], sides=8)
  # truck
  add_cylinder(f'{prefix}Truck', (mx(pole_h) + 0.28, deck_y + pole_h, 0), (mx(pole_h) + 0.28, deck_y + pole_h + 0.1, 0),
               0.09, 0.07, MATS['SparBlack'], sides=8)
  # yards + furled sails
  for i, (h, half_len) in enumerate(yards):
    yx = mx(h) + (0.28 if h > lower_h else 0.0)
    taper = 0.10 - i * 0.02
    add_cylinder(f'{prefix}Yard{i}', (yx, deck_y + h, -half_len), (yx, deck_y + h, half_len),
                 0.045 + taper * 0.3, 0.045 + taper * 0.3, MATS['SparBlack'], sides=8)
    # yard center batten
    add_cylinder(f'{prefix}YardMid{i}', (yx, deck_y + h, -half_len * 0.25), (yx, deck_y + h, half_len * 0.25),
                 0.075 + taper * 0.3, 0.075 + taper * 0.3, MATS['SparBlack'], sides=8)
    furled_sail(f'{prefix}Furl{i}', (yx, deck_y + h - 0.12, -half_len * 0.97), (yx, deck_y + h - 0.12, half_len * 0.97),
                0.16 + (2 - i) * 0.035)
    # lifts (yardarm -> mast)
    for s in (1, -1):
      lift_top = min(pole_h - 0.4, h + 3.2)
      add_rope(f'{prefix}Lift{i}{s}', [(yx, deck_y + h + 0.05, s * half_len * 0.97),
                                       (mx(lift_top) + 0.28, deck_y + lift_top, 0)], 0.016, MATS['RopeTar'], sides=4)
  return mx


def build_shrouds(prefix, mast_x, deck_y, top_h, chan_x_spread, count, ratlines=True, chan_y=None):
  """Lower shrouds from top platform down to channels outside the hull."""
  chan_y = chan_y if chan_y is not None else deck_y - 0.35
  for side in (1, -1):
    hb = half_beam(mast_x) + HULL_OUT
    chz = side * (hb + 0.18)
    # channel board
    add_box(f'{prefix}Channel.{side}', (mast_x - 0.2, chan_y, side * (hb + 0.14)),
            (chan_x_spread * 2 + 0.7, 0.09, 0.34), MATS['HullBlack'])
    anchors = []
    for i in range(count):
      t = -1 + 2 * i / max(1, count - 1)
      ax = mast_x - 0.2 + t * chan_x_spread
      top = (mast_x - top_h * 0.055, deck_y + top_h - 0.15, side * 0.55)
      bot = (ax, chan_y + 0.05, chz)
      add_rope(f'{prefix}Shroud.{side}.{i}', [top, bot], 0.024, MATS['RopeTar'], sides=5)
      # deadeye
      add_cylinder(f'{prefix}Deadeye.{side}.{i}', (ax, chan_y + 0.28, chz), (ax, chan_y + 0.44, chz),
                   0.09, 0.09, MATS['CapRail'], sides=8)
      anchors.append((ax, bot, top))
    if ratlines and count >= 2:
      first = anchors[0]
      last = anchors[-1]
      n_ratlines = 13
      for r in range(1, n_ratlines):
        t = r / n_ratlines
        t_h = t * 0.72  # only lower section
        p0 = tuple(first[1][k] + (first[2][k] - first[1][k]) * t_h for k in range(3))
        p1 = tuple(last[1][k] + (last[2][k] - last[1][k]) * t_h for k in range(3))
        add_rope(f'{prefix}Ratline.{side}.{r}', [p0, p1], 0.011, MATS['RopeTar'], sides=3)


def build_rig():
  # Fore (square)
  fmx = build_mast('Fore', MAST_FORE_X, WAIST_Y, 9.6, 15.8, 21.0,
                   yards=[(8.2, 7.2), (12.6, 5.6), (16.6, 4.0)])
  # Main (square, tallest)
  mmx = build_mast('Main', MAST_MAIN_X, WAIST_Y, 10.6, 17.4, 23.2,
                   yards=[(9.0, 7.6), (13.8, 6.0), (18.2, 4.2)])
  # Mizzen (fore-and-aft only)
  build_mast('Mizzen', MAST_MIZZEN_X, POOP_Y, 7.6, 12.6, 15.4, yards=[], square=False)
  # Spanker gaff + boom with furled spanker
  gz0 = (MAST_MIZZEN_X - 0.4, POOP_Y + 6.4, 0)
  gz1 = (MAST_MIZZEN_X - 4.6, POOP_Y + 8.6, 0)
  add_cylinder('SpankerGaff', gz0, gz1, 0.07, 0.05, MATS['SparBlack'], sides=8)
  furled_sail('SpankerFurl', (gz0[0], gz0[1] - 0.14, 0), (gz1[0], gz1[1] - 0.14, 0), 0.17)
  add_cylinder('SpankerBoom', (MAST_MIZZEN_X - 0.3, POOP_Y + 1.35, 0), (STERN - 1.6, POOP_Y + 1.5, 0),
               0.08, 0.06, MATS['SparBlack'], sides=8)
  # Bowsprit + jibboom
  bs0 = (11.6, WAIST_Y + 0.75, 0)
  bs1 = (19.2, WAIST_Y + 3.1, 0)
  add_cylinder('Bowsprit', bs0, bs1, 0.24, 0.16, MATS['SparBuff'], sides=10)
  jb1 = (23.4, WAIST_Y + 4.35, 0)
  add_cylinder('Jibboom', bs1, jb1, 0.1, 0.05, MATS['SparWhite'], sides=8)
  add_cylinder('DolphinStriker', (bs1[0] - 0.3, bs1[1] - 0.1, 0), (bs1[0] - 0.5, bs1[1] - 1.7, 0),
               0.05, 0.03, MATS['SparBlack'], sides=6)
  # Bobstay + martingale
  add_rope('Bobstay', [(12.15, WATERLINE + 0.5, 0), (bs1[0] - 0.42, bs1[1] - 1.65, 0)], 0.025, MATS['RopeTar'], sides=4)
  add_rope('Martingale', [(bs1[0] - 0.42, bs1[1] - 1.68, 0), jb1], 0.02, MATS['RopeTar'], sides=4)
  # Furled jib lashed along the bowsprit/jibboom
  furled_sail('JibFurl', (13.2, WAIST_Y + 1.75, 0), (21.6, WAIST_Y + 4.05, 0), 0.15)
  # Shrouds + channels
  build_shrouds('Fore', MAST_FORE_X, WAIST_Y, 9.6, 1.5, 4)
  build_shrouds('Main', MAST_MAIN_X, WAIST_Y, 10.6, 1.7, 4)
  build_shrouds('Mizzen', MAST_MIZZEN_X, POOP_Y, 7.6, 1.0, 3, ratlines=True, chan_y=POOP_Y - 0.35)
  # Stays
  add_rope('ForeStay', [(fmx(9.4), WAIST_Y + 9.4, 0), (12.6, WAIST_Y + 1.3, 0)], 0.028, MATS['RopeTar'], sides=5)
  add_rope('ForeTopmastStay', [(fmx(15.6) + 0.28, WAIST_Y + 15.6, 0), (19.0, WAIST_Y + 3.05, 0)], 0.02,
           MATS['RopeTar'], sides=4)
  add_rope('ForeTgStay', [(fmx(20.6) + 0.28, WAIST_Y + 20.6, 0), (23.0, WAIST_Y + 4.28, 0)], 0.016,
           MATS['RopeTar'], sides=4)
  add_rope('MainStay', [(mmx(10.4), WAIST_Y + 10.4, 0), (MAST_FORE_X - 0.6, WAIST_Y + 0.9, 0)], 0.03,
           MATS['RopeTar'], sides=5)
  add_rope('MainTopmastStay', [(mmx(17.2) + 0.28, WAIST_Y + 17.2, 0), (fmx(9.8), WAIST_Y + 9.8, 0)], 0.02,
           MATS['RopeTar'], sides=4)
  add_rope('MizzenStay', [(MAST_MIZZEN_X - 0.42, POOP_Y + 7.4, 0), (mmx(2.2), WAIST_Y + 2.4, 0)], 0.022,
           MATS['RopeTar'], sides=4)
  # Backstays
  for prefix, x, deck_y, th in (('Fore', MAST_FORE_X, WAIST_Y, 15.4), ('Main', MAST_MAIN_X, WAIST_Y, 17.0)):
    for side in (1, -1):
      hb2 = half_beam(x - 3.4) + HULL_OUT
      add_rope(f'{prefix}Backstay.{side}', [(x - th * 0.055 + 0.28, deck_y + th, side * 0.3),
                                            (x - 3.4, deck_y - 0.3, side * (hb2 + 0.16))], 0.02,
               MATS['RopeTar'], sides=4)


def build_stern():
  # Transom windows + name board, proud of the flat transom cap face
  x = STERN - 0.56
  for i, z in enumerate((-1.7, -0.6, 0.6, 1.7)):
    add_box(f'SternWindow.{i}', (x, WAIST_Y + 0.62, z), (0.08, 0.6, 0.7), MATS['BandWhite'])
    add_box(f'SternGlass.{i}', (x - 0.03, WAIST_Y + 0.62, z), (0.08, 0.48, 0.56), MATS['Glass'])
  # name letters
  try:
    curve = bpy.data.curves.new('BeagleName', type='FONT')
    curve.body = 'BEAGLE'
    curve.size = 0.42
    curve.extrude = 0.02
    curve.align_x = 'CENTER'
    ob = bpy.data.objects.new('BeagleName', curve)
    COLLECTION.objects.link(ob)
    ob.location = (STERN - 0.42, 0.0, WAIST_Y - 0.35)
    ob.rotation_euler = (math.radians(90), 0, math.radians(-90))
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob.data.materials.append(MATS['BandWhite'])
    ob.select_set(False)
  except Exception as exc:  # noqa: BLE001
    print('name board skipped:', exc)
  # Billethead scroll at the stem
  add_cylinder('Billethead', (BOW_TIP + 0.02, WAIST_Y + 0.9, 0), (BOW_TIP + 0.45, WAIST_Y + 1.25, 0),
               0.16, 0.05, MATS['BandWhite'], sides=8)


def build_deck_clutter():
  # coiled ropes
  for (x, y, z) in ((-4.6, WAIST_Y, 2.4), (6.4, WAIST_Y, -2.5), (-8.3, POOP_Y, -1.6), (0.4, WAIST_Y, -2.8)):
    for i in range(3):
      rr = 0.3 - i * 0.055
      pts = []
      for j in range(13):
        a = j / 12 * math.tau
        pts.append((x + math.cos(a) * rr, y + 0.035 + i * 0.055, z + math.sin(a) * rr))
      add_rope(f'Coil.{x}.{i}', pts, 0.032, MATS['RopeHemp'], sides=4)
  # spare spars lashed by the boats
  add_cylinder('SpareSpar1', (-1.4, WAIST_Y + 2.24, -2.35), (7.2, WAIST_Y + 2.24, -2.35), 0.09, 0.07,
               MATS['SparBuff'], sides=8)
  add_cylinder('SpareSpar2', (-0.8, WAIST_Y + 2.38, -2.3), (6.4, WAIST_Y + 2.38, -2.3), 0.07, 0.05,
               MATS['SparBuff'], sides=8)
  # pin rails with belaying pins at the masts
  for x in (MAST_FORE_X, MAST_MAIN_X):
    for side in (1, -1):
      hb = half_beam(x)
      add_box(f'PinRail.{x}.{side}', (x, WAIST_Y + 0.95, side * (hb - 0.28)), (1.6, 0.07, 0.16), MATS['CapRail'])
      for i in range(5):
        px = x - 0.7 + i * 0.35
        add_cylinder(f'Pin.{x}.{side}.{i}', (px, WAIST_Y + 0.86, side * (hb - 0.28)),
                     (px, WAIST_Y + 1.06, side * (hb - 0.28)), 0.018, 0.018, MATS['CapRail'], sides=5)
  # fife rails around fore + main mast feet
  for x in (MAST_FORE_X, MAST_MAIN_X):
    for side in (1, -1):
      add_box(f'FifeRail.{x}.{side}', (x - 0.55, WAIST_Y + 0.5, side * 0.75), (0.08, 1.0, 0.08), MATS['CapRail'])
    add_box(f'FifeTop.{x}', (x - 0.55, WAIST_Y + 1.04, 0), (0.09, 0.07, 1.65), MATS['CapRail'])


# ---------------------------------------------------------------------------
# Scene / export
# ---------------------------------------------------------------------------

def clear_scene():
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.object.delete()
  for block_list in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
    for block in list(block_list):
      if block.users == 0:
        block_list.remove(block)


def join_by_material():
  """Join everything into a handful of objects to keep draw calls low."""
  bpy.ops.object.select_all(action='DESELECT')
  groups = {}
  for ob in list(COLLECTION.objects):
    if ob.type != 'MESH' or not ob.data.materials:
      continue
    key = ob.data.materials[0].name if len(ob.data.materials) == 1 else ob.name
    groups.setdefault(key, []).append(ob)
  for key, obs in groups.items():
    if len(obs) < 2:
      continue
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:
      ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    obs[0].name = f'Beagle_{key}'


def setup_render(out_dir):
  scene = bpy.context.scene
  for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
    try:
      scene.render.engine = engine
      break
    except TypeError:
      continue
  scene.render.resolution_x = 1100
  scene.render.resolution_y = 800
  world = bpy.data.worlds.new('Sky') if not bpy.data.worlds else bpy.data.worlds[0]
  scene.world = world
  world.use_nodes = True
  bg = world.node_tree.nodes.get('Background')
  bg.inputs[0].default_value = (0.55, 0.72, 0.85, 1.0)
  bg.inputs[1].default_value = 1.0
  sun = bpy.data.lights.new('Sun', type='SUN')
  sun.energy = 3.4
  sun_ob = bpy.data.objects.new('Sun', sun)
  COLLECTION.objects.link(sun_ob)
  sun_ob.rotation_euler = (math.radians(52), math.radians(12), math.radians(35))
  # water plane + proxy decks for context (the game's terrain paints the real
  # deck surface; these exist only so renders are judgeable)
  helpers = []
  helpers.append(add_box('WaterPlane', (0, WATERLINE - 0.05, 0), (140, 0.1, 140), pmat('SeaBlue', '#2e6474', 0.25)))
  deck_mat = pmat('DeckProxy', '#a3835a', 0.9)
  xx = STERN + 0.3
  while xx < BOW_TIP - 0.8:
    hb = half_beam(xx) - 0.02
    y = WAIST_Y if POOP_BREAK <= xx <= FOCSLE_BREAK else deck_edge_y(xx + (0.4 if xx > 0 else -0.4))
    if POOP_BREAK - 0.6 < xx < POOP_BREAK + 0.6:
      y = POOP_Y if xx < POOP_BREAK else WAIST_Y
    helpers.append(add_box(f'DeckProxy.{xx:.1f}', (xx + 0.3, y - 0.06, 0), (0.62, 0.1, hb * 2), deck_mat))
    xx += 0.6

  views = {
    'bow-quarter': ((34, 10.5, 22), (0, WAIST_Y + 2.5, 0), 42),
    'beam': ((0.5, 4.5, 30), (0, WAIST_Y + 4.5, 0), 45),
    'stern-quarter': ((-30, 9.5, -20), (0, WAIST_Y + 3.0, 0), 42),
    'deck-aft': ((6.5, WAIST_Y + 1.7, 0.4), (-11.5, POOP_Y + 1.0, 0), 58),
    'deck-fwd': ((-5.4, WAIST_Y + 1.7, -0.6), (11.5, FOCSLE_Y + 1.2, 0), 58),
    'top-down': ((2, 34, 6), (0, WAIST_Y, 0), 48),
  }
  out_dir.mkdir(parents=True, exist_ok=True)
  cam_data = bpy.data.cameras.new('Cam')
  cam = bpy.data.objects.new('Cam', cam_data)
  COLLECTION.objects.link(cam)
  scene.camera = cam
  for name, (eye, target, fov) in views.items():
    cam_data.angle = math.radians(fov)
    cam.location = (eye[0], -eye[2], eye[1])
    direction = Vector((target[0], -target[2], target[1])) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(out_dir / f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', scene.render.filepath)
  # remove helpers so they don't export
  for ob in (cam, sun_ob, *helpers):
    bpy.data.objects.remove(ob, do_unlink=True)


def main():
  argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
  out = 'public/assets/models/ships/hms-beagle-deck.glb'
  render_dir = None
  if '--out' in argv:
    out = argv[argv.index('--out') + 1]
  if '--render' in argv:
    render_dir = Path(argv[argv.index('--render') + 1])

  root = Path(__file__).resolve().parents[1]
  global COLLECTION
  clear_scene()
  COLLECTION = bpy.context.scene.collection
  init_materials()

  build_hull()
  build_bulwark_trim()
  build_boarding_steps()
  build_bulkheads()
  build_ladders()
  build_hatches()
  build_poop_fittings()
  build_waist_fittings()
  build_boats()
  build_anchors()
  build_rig()
  build_stern()
  build_deck_clutter()

  if render_dir is not None:
    setup_render(root / render_dir)

  join_by_material()

  out_path = root / out
  out_path.parent.mkdir(parents=True, exist_ok=True)
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.export_scene.gltf(filepath=str(out_path), export_format='GLB', export_apply=True)
  size_kb = out_path.stat().st_size / 1024
  print(f'exported {out_path} ({size_kb:.0f} KB)')


main()
