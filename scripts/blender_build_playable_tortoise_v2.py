import math
import os
import random
from pathlib import Path

import bpy
from mathutils import Euler, Vector


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/models/animals/runtime/playable-tortoise-v2.glb'
SRC_DIR = ROOT / 'assets-src/animals/playable-tortoise-v2'
random.seed(1835)


def srgb(value):
  if value <= 0.04045:
    return value / 12.92
  return ((value + 0.055) / 1.055) ** 2.4


def rgba(hex_color, alpha=1):
  hex_color = hex_color.lstrip('#')
  r = int(hex_color[0:2], 16) / 255
  g = int(hex_color[2:4], 16) / 255
  b = int(hex_color[4:6], 16) / 255
  return (srgb(r), srgb(g), srgb(b), alpha)


def clear_scene():
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.object.delete()


def make_image(name, size, kind):
  image = bpy.data.images.new(name, size, size, alpha=True)
  pixels = [0.0] * (size * size * 4)
  for y in range(size):
    v = y / (size - 1)
    for x in range(size):
      u = x / (size - 1)
      n1 = random.random()
      stripe = math.sin((u * 8.0 + v * 5.0) * math.pi + math.sin(v * 9.0) * 0.8)
      speck = 0.5 + 0.5 * math.sin((u * 37.0 + v * 19.0) * math.pi)
      if kind == 'shell':
        center = max(0, 1 - ((u - 0.5) ** 2 * 2.8 + (v - 0.48) ** 2 * 2.2))
        line = 1 if abs((u - 0.5) + math.sin(v * 5.5) * 0.025) < 0.008 else 0
        warm = 0.16 + center * 0.23 + stripe * 0.025 + speck * 0.035 + n1 * 0.035
        r = 0.25 + warm
        g = 0.21 + warm * 0.75
        b = 0.14 + warm * 0.42
        if line:
          r *= 0.34
          g *= 0.34
          b *= 0.34
      else:
        wrinkle = 0.08 * math.sin((u * 20.0 + math.sin(v * 7.0)) * math.pi)
        mottling = 0.05 * math.sin((u * 28.0 - v * 12.0) * math.pi) + n1 * 0.04
        base = 0.39 + wrinkle + mottling
        r = base * 0.86
        g = base * 0.78
        b = base * 0.58
      idx = (y * size + x) * 4
      pixels[idx:idx + 4] = [max(0, min(1, r)), max(0, min(1, g)), max(0, min(1, b)), 1.0]
  image.pixels = pixels
  image.pack()
  return image


def material(name, color, roughness=0.8, image=None, metallic=0):
  mat = bpy.data.materials.new(name)
  mat.use_nodes = True
  bsdf = mat.node_tree.nodes.get('Principled BSDF')
  if bsdf:
    if image:
      tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
      tex.image = image
      mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    else:
      bsdf.inputs['Base Color'].default_value = rgba(color)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
  return mat


def shade(obj):
  bpy.context.view_layer.objects.active = obj
  obj.select_set(True)
  try:
    bpy.ops.object.shade_smooth()
  except Exception:
    pass
  obj.select_set(False)
  return obj


def empty(name, loc=(0, 0, 0), parent=None):
  obj = bpy.data.objects.new(name, None)
  obj.empty_display_type = 'PLAIN_AXES'
  obj.empty_display_size = 0.08
  obj.location = loc
  if parent:
    obj.parent = parent
  bpy.context.collection.objects.link(obj)
  return obj


def mesh_obj(name, verts, faces, mat, parent=None):
  mesh = bpy.data.meshes.new(name + 'Mesh')
  mesh.from_pydata(verts, [], faces)
  mesh.update(calc_edges=True)
  obj = bpy.data.objects.new(name, mesh)
  if mat:
    mesh.materials.append(mat)
  if parent:
    obj.parent = parent
  bpy.context.collection.objects.link(obj)
  return shade(obj)


def add_uv_sphere(name, loc, scale, mat, parent=None, segments=48, rings=24):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=loc)
  obj = bpy.context.object
  obj.name = name
  obj.scale = scale
  if mat:
    obj.data.materials.append(mat)
  if parent:
    obj.parent = parent
  return shade(obj)


def add_cone(name, loc, radius1, depth, mat, parent=None, rotation=(0, 0, 0), vertices=18):
  bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=0.0, depth=depth, location=loc, rotation=rotation)
  obj = bpy.context.object
  obj.name = name
  if mat:
    obj.data.materials.append(mat)
  if parent:
    obj.parent = parent
  return shade(obj)


def add_curve(name, points, mat, bevel=0.007, parent=None):
  curve = bpy.data.curves.new(name, 'CURVE')
  curve.dimensions = '3D'
  curve.resolution_u = 2
  curve.bevel_depth = bevel
  curve.bevel_resolution = 3
  poly = curve.splines.new('POLY')
  poly.points.add(len(points) - 1)
  for p, co in zip(poly.points, points):
    p.co = (co[0], co[1], co[2], 1)
  obj = bpy.data.objects.new(name, curve)
  if mat:
    curve.materials.append(mat)
  if parent:
    obj.parent = parent
  bpy.context.collection.objects.link(obj)
  return obj


def shell_surface(x, z, lift=0.0):
  rx = 0.7
  rz = 0.98
  r = math.sqrt((x / rx) ** 2 + (z / rz) ** 2)
  r = min(1, r)
  front = max(0, z / rz)
  dome = max(0, 1 - r ** 2.05) ** 0.52 * 0.68
  shoulder = math.exp(-((r - 0.38) ** 2) / 0.13) * 0.06
  saddle_lip = max(0, front) ** 1.6 * (0.055 + (1 - min(1, abs(x) / rx)) * 0.06)
  return 0.31 + dome + shoulder + saddle_lip - max(0, -z / rz) * 0.025 * r - max(0, r - 0.84) * 0.12 + lift


def create_shell(root, shell_mat, rim_mat):
  rings = 64
  segs = 160
  verts = []
  faces = []
  for ri in range(rings + 1):
    r = ri / rings
    for si in range(segs + 1):
      theta = si / segs * math.tau
      sin_t = math.sin(theta)
      cos_t = math.cos(theta)
      front = max(0, sin_t)
      rear = max(0, -sin_t)
      side_pinch = 1 - abs(cos_t) * front * 0.1
      x = cos_t * r * 0.72 * side_pinch * (1 + rear * 0.035)
      z = sin_t * r * 0.98 * (1 - front * 0.05 + rear * 0.02)
      y = shell_surface(x, z)
      verts.append((x, y, z))
  row = segs + 1
  for ri in range(rings):
    for si in range(segs):
      a = ri * row + si
      b = a + 1
      c = (ri + 1) * row + si
      d = c + 1
      faces.append((a, c, b))
      faces.append((b, c, d))
  shell = mesh_obj('tortoise_v2_carapace', verts, faces, shell_mat, root)

  rim_points = []
  for si in range(segs + 1):
    theta = si / segs * math.tau
    sin_t = math.sin(theta)
    cos_t = math.cos(theta)
    front = max(0, sin_t)
    side_pinch = 1 - abs(cos_t) * front * 0.1
    x = cos_t * 0.72 * side_pinch
    z = sin_t * 0.98 * (1 - front * 0.05)
    rim_points.append((x, shell_surface(x, z, -0.035), z))
  add_curve('tortoise_v2_shell_rim', rim_points, rim_mat, 0.026, root)

  scute_lines = [
    [(0.0, z) for z in [-0.76, -0.48, -0.2, 0.08, 0.38, 0.68, 0.84]],
    [(-0.34 + math.sin(t * math.pi) * 0.05, -0.74 + t * 1.52) for t in [i / 18 for i in range(19)]],
    [(0.34 - math.sin(t * math.pi) * 0.05, -0.74 + t * 1.52) for t in [i / 18 for i in range(19)]],
    [(-0.55 + t * 1.1, 0.28 + math.sin(t * math.pi) * 0.06) for t in [i / 18 for i in range(19)]],
    [(-0.5 + t * 1.0, -0.26 + math.sin(t * math.pi) * -0.04) for t in [i / 18 for i in range(19)]],
  ]
  for i, line in enumerate(scute_lines):
    pts = [(x, shell_surface(x, z, 0.012), z) for x, z in line if (x / 0.72) ** 2 + (z / 0.98) ** 2 <= 0.98]
    if len(pts) > 1:
      add_curve(f'tortoise_v2_scute_line_{i}', pts, rim_mat, 0.0065 if i < 3 else 0.005, root)
  for i in range(34):
    z = random.uniform(-0.68, 0.7)
    max_x = 0.62 * math.sqrt(max(0, 1 - (z / 0.94) ** 2))
    x = random.uniform(-max_x, max_x)
    length = random.uniform(0.035, 0.12)
    angle = random.uniform(-0.9, 0.9)
    pts = []
    for step in range(5):
      t = (step / 4 - 0.5) * length
      px = x + math.cos(angle) * t
      pz = z + math.sin(angle) * t
      pts.append((px, shell_surface(px, pz, 0.014), pz))
    add_curve(f'tortoise_v2_shell_fine_crack_{i}', pts, rim_mat, 0.0022, root)
  return shell


def create_foot(name, fore, mat, parent):
  direction = 1 if fore else -1
  rings = 22
  segs = 64
  half_w = 0.19 if fore else 0.158
  half_l = 0.275 if fore else 0.225
  height = 0.132 if fore else 0.112
  verts = []
  faces = []
  for ri in range(rings + 1):
    r = ri / rings
    for si in range(segs + 1):
      theta = si / segs * math.tau
      sin_t = math.sin(theta)
      cos_t = math.cos(theta)
      forward = direction * sin_t
      toe = max(0, min(1, (forward - 0.05) / 0.9))
      heel = max(0, min(1, (-forward - 0.05) / 0.9))
      side = abs(cos_t)
      x = cos_t * r * half_w * (1 + toe * 0.18 - heel * 0.08)
      z = direction * (forward * r * half_l + toe * r * 0.036 - heel * r * 0.014)
      dome = max(0, 1 - r ** 1.7) ** 0.56 * height
      toe_knuckle = toe * math.exp(-((r - 0.76) ** 2) / 0.02) * (0.028 if fore else 0.018)
      side_drop = max(0, r - 0.78) * 0.17
      y = -0.068 + dome + toe_knuckle - side_drop + math.sin(theta * 5.0) * r * 0.004
      verts.append((x, y, z))
  row = segs + 1
  for ri in range(rings):
    for si in range(segs):
      a = ri * row + si
      b = a + 1
      c = (ri + 1) * row + si
      d = c + 1
      faces.append((a, c, b))
      faces.append((b, c, d))
  obj = mesh_obj(name, verts, faces, mat, parent)
  return obj


def create_lower_leg(name, fore, mat, parent):
  rings = 22
  segs = 48
  height = 0.42 if fore else 0.37
  verts = []
  faces = []
  for yi in range(rings + 1):
    v = yi / rings
    y = 0.19 - v * height
    foot_widen = max(0, (v - 0.35) / 0.65)
    knee = math.sin(v * math.pi)
    for si in range(segs + 1):
      theta = si / segs * math.tau
      sin_t = math.sin(theta)
      cos_t = math.cos(theta)
      rx = (0.09 if fore else 0.08) + foot_widen * (0.045 if fore else 0.033) + knee * 0.014
      rz = (0.108 if fore else 0.093) + foot_widen * (0.032 if fore else 0.024)
      wrinkle = math.sin(theta * 6 + v * 7) * knee * 0.005
      verts.append((cos_t * (rx + wrinkle), y, sin_t * (rz + wrinkle * 0.6)))
  row = segs + 1
  for yi in range(rings):
    for si in range(segs):
      a = yi * row + si
      b = a + 1
      c = (yi + 1) * row + si
      d = c + 1
      faces.append((a, c, b))
      faces.append((b, c, d))
  return mesh_obj(name, verts, faces, mat, parent)


def add_scale_pebbles(prefix, parent, mat, fore, direction):
  rows = [(-0.08, 0.09, 3), (0.0, 0.12, 4), (0.075, 0.10, 3)] if fore else [(-0.045, 0.075, 2), (0.035, 0.09, 3)]
  for row_i, (y, width, count) in enumerate(rows):
    for i in range(count):
      t = 0.5 if count == 1 else i / (count - 1)
      x = -width * 0.5 + width * t + (row_i % 2 - 0.5) * 0.012
      z = direction * (0.09 + row_i * 0.035)
      obj = add_uv_sphere(f'{prefix}_scale_{row_i}_{i}', (x, y, z), (0.021, 0.012, 0.017), mat, parent, 12, 6)
      obj.rotation_euler = Euler((0.1, 0.25 * direction, 0.1), 'XYZ')


def create_leg(prefix, x, z, side, fore, root, skin, skin_dark, claw):
  direction = 1 if fore else -1
  leg = empty(prefix + '_legRig', (x, 0.31, z), root)
  add_uv_sphere(prefix + '_shoulder', (0, 0.04, -direction * 0.03), (0.18 if fore else 0.16, 0.13, 0.2 if fore else 0.17), skin_dark, leg, 32, 16)
  upper = empty(prefix + '_upperRig', (0, -0.08, 0.0), leg)
  add_uv_sphere(prefix + '_upper', (0, 0, 0), (0.12 if fore else 0.105, 0.2, 0.14 if fore else 0.12), skin, upper, 32, 16)
  lower = empty(prefix + '_lowerRig', (side * 0.015, -0.23, direction * 0.04), leg)
  create_lower_leg(prefix + '_lower', fore, skin, lower)
  add_scale_pebbles(prefix, lower, skin_dark, fore, direction)
  foot = empty(prefix + '_footRig', (side * 0.005, -0.43, direction * (0.13 if fore else 0.1)), leg)
  create_foot(prefix + '_foot', fore, skin_dark, foot)
  toe_offsets = [-0.116, -0.058, 0, 0.058, 0.116] if fore else [-0.076, -0.026, 0.026, 0.076]
  for i, tx in enumerate(toe_offsets):
    outer = abs(tx) / max(abs(toe_offsets[0]), abs(toe_offsets[-1]))
    toe_z = direction * ((0.2 if fore else 0.158) - outer * 0.012)
    add_uv_sphere(f'{prefix}_toe_{i}', (tx, 0.03 - outer * 0.004, toe_z), (0.032, 0.02, 0.043), skin_dark, foot, 20, 8)
    add_cone(
      f'{prefix}_claw_{i}',
      (tx, -0.02, toe_z + direction * (0.052 if fore else 0.044)),
      0.012 if fore else 0.01,
      0.048 if fore else 0.038,
      claw,
      foot,
      (math.pi / 2 if direction > 0 else -math.pi / 2, 0, 0),
      12,
    )
  return {'leg': leg, 'upper': upper, 'lower': lower, 'foot': foot, 'fore': fore, 'side': side}


def create_tortoise():
  clear_scene()
  OUT.parent.mkdir(parents=True, exist_ok=True)
  SRC_DIR.mkdir(parents=True, exist_ok=True)

  shell_img = make_image('playable_tortoise_v2_shell_albedo', 768, 'shell')
  skin_img = make_image('playable_tortoise_v2_skin_albedo', 512, 'skin')
  shell_mat = material('aged_brown_olive_shell', '#6b6042', 0.78, shell_img)
  rim_mat = material('dark_shell_grooves', '#1f2119', 0.86)
  skin_mat = material('wrinkled_tortoise_skin', '#796d52', 0.9, skin_img)
  skin_dark = material('dark_elephantine_scales', '#4b402d', 0.94)
  skin_light = material('dry_neck_highlight', '#948669', 0.88, skin_img)
  claw_mat = material('blunt_dark_claws', '#191713', 0.64)
  eye_mat = material('wet_black_eye', '#030303', 0.22)
  beak_mat = material('dark_horn_beak', '#282119', 0.72)
  plastron_mat = material('matte_plastron', '#9d8b62', 0.8)

  root = empty('playable_tortoise_v2_root')
  shell = create_shell(root, shell_mat, rim_mat)
  add_uv_sphere('tortoise_v2_body', (0, 0.31, 0.03), (0.52, 0.18, 0.72), skin_mat, root, 48, 20)
  add_uv_sphere('tortoise_v2_plastron', (0, 0.225, 0.03), (0.43, 0.055, 0.59), plastron_mat, root, 36, 12)

  legs = [
    create_leg('front_left', -0.46, 0.49, -1, True, root, skin_mat, skin_dark, claw_mat),
    create_leg('front_right', 0.46, 0.49, 1, True, root, skin_mat, skin_dark, claw_mat),
    create_leg('rear_left', -0.47, -0.43, -1, False, root, skin_mat, skin_dark, claw_mat),
    create_leg('rear_right', 0.47, -0.43, 1, False, root, skin_mat, skin_dark, claw_mat),
  ]

  neck = empty('neckRig', (0, 0.43, 0.59), root)
  for i in range(5):
    z = 0.07 + i * 0.086
    scale = 1 - i * 0.035
    add_uv_sphere(f'neck_segment_{i}', (0, -0.002 - i * 0.002, z), (0.077 * scale, 0.065 * scale, 0.09), skin_mat, neck, 28, 12)
    add_curve(
      f'neck_wrinkle_{i}',
      [(math.cos(a) * 0.077 * scale, -0.005 - i * 0.002 + math.sin(a) * 0.052 * scale, z + 0.004 * math.sin(a * 2)) for a in [j / 48 * math.tau for j in range(49)]],
      skin_dark,
      0.0035,
      neck,
    )
  head = empty('headRig', (0, 0.005, 0.49), neck)
  add_uv_sphere('head_cranium', (0, 0.012, 0.0), (0.145, 0.1, 0.165), skin_mat, head, 42, 20)
  add_uv_sphere('head_jowl_left', (-0.055, -0.025, 0.06), (0.055, 0.044, 0.068), skin_light, head, 24, 10)
  add_uv_sphere('head_jowl_right', (0.055, -0.025, 0.06), (0.055, 0.044, 0.068), skin_light, head, 24, 10)
  add_uv_sphere('upper_beak_pad', (0, -0.012, 0.13), (0.085, 0.04, 0.066), skin_light, head, 28, 10)
  beak = add_uv_sphere('hooked_beak', (0, -0.035, 0.175), (0.064, 0.026, 0.04), beak_mat, head, 18, 8)
  jaw = add_uv_sphere('lower_jaw', (0, -0.073, 0.095), (0.09, 0.027, 0.067), skin_dark, head, 20, 8)
  throat = add_uv_sphere('throat_pouch', (0, -0.09, 0.0), (0.085, 0.058, 0.07), skin_light, head, 20, 10)
  for side in [-1, 1]:
    add_uv_sphere(f'eye_{side}', (side * 0.09, 0.03, 0.052), (0.017, 0.019, 0.013), eye_mat, head, 18, 10)
    add_uv_sphere(f'nostril_{side}', (side * 0.032, -0.014, 0.174), (0.006, 0.004, 0.004), claw_mat, head, 8, 4)

  tail = empty('tailRig', (0, 0.27, -0.72), root)
  add_cone('tail', (0, 0, -0.11), 0.055, 0.19, skin_dark, tail, (-math.pi / 2, 0, 0), 20)

  # Keep cameras/lights out of the runtime asset.
  for obj in list(bpy.context.scene.objects):
    if obj.type in {'CAMERA', 'LIGHT'}:
      bpy.data.objects.remove(obj, do_unlink=True)

  return {
    'root': root,
    'shell': shell,
    'neck': neck,
    'head': head,
    'jaw': jaw,
    'throat': throat,
    'tail': tail,
    'legs': legs,
  }


def remember_base(objects):
  base = {}
  for obj in objects:
    base[obj.name] = {
      'loc': obj.location.copy(),
      'rot': obj.rotation_euler.copy(),
      'scale': obj.scale.copy(),
    }
  return base


def restore(obj, base):
  b = base[obj.name]
  obj.location = b['loc'].copy()
  obj.rotation_euler = b['rot'].copy()
  obj.scale = b['scale'].copy()


def key_all(obj, frame):
  obj.keyframe_insert('location', frame=frame)
  obj.keyframe_insert('rotation_euler', frame=frame)
  obj.keyframe_insert('scale', frame=frame)


def add_clip(name, duration, objects, base, pose):
  frames = sorted(set([1, duration] + [round(1 + (duration - 1) * i / 8) for i in range(9)]))
  for obj in objects:
    obj.animation_data_create()
    action = bpy.data.actions.new(f'{obj.name}_{name}')
    action.frame_start = 1
    action.frame_end = duration
    obj.animation_data.action = action
    for frame in frames:
      restore(obj, base)
      t = (frame - 1) / max(1, duration - 1)
      pose(obj, t)
      key_all(obj, frame)
    track = obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.frame_end = duration
    obj.animation_data.action = None


def make_animations(parts):
  objects = [parts['root'], parts['shell'], parts['neck'], parts['head'], parts['jaw'], parts['throat'], parts['tail']]
  for leg in parts['legs']:
    objects.extend([leg['leg'], leg['upper'], leg['lower'], leg['foot']])
  for obj in objects:
    obj.animation_data_clear()
  base = remember_base(objects)

  leg_phase = {
    'front_left': 0.0,
    'rear_right': 0.0,
    'front_right': math.pi,
    'rear_left': math.pi,
  }

  def leg_key(obj_name):
    for key in leg_phase:
      if obj_name.startswith(key):
        return key
    return None

  def idle(obj, t):
    wave = math.sin(t * math.tau)
    if obj.name == 'tortoise_v2_carapace':
      obj.scale.y *= 1 + wave * 0.006
    elif obj.name == 'neckRig':
      obj.rotation_euler.x += wave * 0.025
      obj.rotation_euler.y += math.sin(t * math.tau * 0.5) * 0.08
    elif obj.name == 'headRig':
      obj.rotation_euler.x += math.sin(t * math.tau + 0.8) * 0.018

  def walk(obj, t):
    phase = t * math.tau
    wave = math.sin(phase)
    if obj.name == 'playable_tortoise_v2_root':
      obj.location.y += abs(wave) * 0.018
    elif obj.name == 'tortoise_v2_carapace':
      obj.rotation_euler.z += wave * 0.028
      obj.rotation_euler.x += math.sin(phase * 2) * 0.012
    elif obj.name == 'neckRig':
      obj.rotation_euler.x += math.sin(phase + 0.4) * 0.025
    key = leg_key(obj.name)
    if not key:
      return
    p = phase + leg_phase[key]
    sin_p = math.sin(p)
    cos_p = math.cos(p)
    lift = max(0, sin_p)
    fore = key.startswith('front')
    side = -1 if key.endswith('left') else 1
    if obj.name.endswith('_legRig'):
      obj.rotation_euler.x += sin_p * (0.18 if fore else 0.14)
      obj.rotation_euler.z += side * (0.08 + max(0, -sin_p) * 0.04)
      obj.location.y += lift * 0.024
    elif obj.name.endswith('_upperRig'):
      obj.rotation_euler.x += (0.08 if fore else -0.06) + cos_p * 0.08
    elif obj.name.endswith('_lowerRig'):
      obj.rotation_euler.x += (-0.1 if fore else 0.08) - lift * 0.23
    elif obj.name.endswith('_footRig'):
      obj.location.y += lift * 0.06
      obj.location.z += cos_p * 0.055 * (1 if fore else -1)
      obj.rotation_euler.x += -lift * 0.16 + max(0, -sin_p) * 0.04

  def eat(obj, t):
    down = math.sin(min(1, t * 1.35) * math.pi * 0.5)
    chew = math.sin(t * math.tau * 4)
    if obj.name == 'neckRig':
      obj.location.z += down * 0.14
      obj.location.y -= down * 0.06
      obj.rotation_euler.x += down * 0.62
    elif obj.name == 'headRig':
      obj.rotation_euler.x += down * 0.15 + chew * 0.025
      obj.location.z += down * 0.03
    elif obj.name == 'lower_jaw':
      obj.rotation_euler.x += max(0, chew) * 0.35
    elif obj.name == 'throat_pouch':
      pulse = 1 + max(0, chew) * 0.045
      obj.scale *= pulse

  def sleep(obj, t):
    settle = min(1, t * 1.4)
    if obj.name == 'playable_tortoise_v2_root':
      obj.location.y -= settle * 0.045
      obj.scale.y *= 1 - settle * 0.04
    elif obj.name == 'neckRig':
      obj.location.z -= settle * 0.16
      obj.location.y -= settle * 0.09
      obj.rotation_euler.x -= settle * 0.2
    elif obj.name == 'headRig':
      obj.location.z -= settle * 0.1
      obj.location.y -= settle * 0.03
      obj.rotation_euler.x += settle * 0.08
    key = leg_key(obj.name)
    if key and obj.name.endswith('_legRig'):
      fore = key.startswith('front')
      obj.rotation_euler.x += settle * (0.34 if fore else -0.24)
      obj.location.x *= 1 - settle * 0.12

  def defecate(obj, t):
    pulse = math.sin(t * math.pi)
    if obj.name == 'playable_tortoise_v2_root':
      obj.rotation_euler.x -= pulse * 0.035
      obj.location.y -= pulse * 0.025
    elif obj.name == 'tailRig':
      obj.rotation_euler.x += pulse * 0.95
      obj.location.y += pulse * 0.04
    key = leg_key(obj.name)
    if key and obj.name.endswith('_legRig') and key.startswith('rear'):
      obj.rotation_euler.x += pulse * 0.14

  add_clip('idle', 96, objects, base, idle)
  add_clip('walk', 56, objects, base, walk)
  add_clip('eat', 84, objects, base, eat)
  add_clip('sleep', 110, objects, base, sleep)
  add_clip('defecate', 78, objects, base, defecate)


def write_report():
  report = SRC_DIR / 'README.md'
  report.write_text(
    '# Playable tortoise v2\n\n'
    'Generated by `scripts/blender_build_playable_tortoise_v2.py`.\n\n'
    '- Runtime asset: `public/assets/models/animals/runtime/playable-tortoise-v2.glb`\n'
    '- Rig style: Blender transform hierarchy exported as glTF animation clips.\n'
    '- Clips: `idle`, `walk`, `eat`, `sleep`, `defecate`.\n'
    '- Texture source: generated procedural albedo packed into the GLB; no external licensed texture dependency.\n'
    '- Art target: Floreana/Galapagos saddleback tortoise silhouette with high carapace, smaller head, wrinkled neck, columnar legs, and broad toe-knuckled feet.\n',
    encoding='utf-8',
  )


def main():
  parts = create_tortoise()
  make_animations(parts)
  write_report()
  bpy.ops.wm.save_as_mainfile(filepath=str(SRC_DIR / 'playable-tortoise-v2.blend'))
  bpy.ops.export_scene.gltf(
    filepath=str(OUT),
    export_format='GLB',
    use_selection=False,
    export_animations=True,
    export_animation_mode='NLA_TRACKS',
    export_merge_animation='NLA_TRACK',
    export_nla_strips=True,
    export_nla_strips_merged_animation_name='tortoiseAction',
    export_anim_single_armature=False,
    export_apply=True,
  )


if __name__ == '__main__':
  main()
