import json
import math
import shutil
import struct
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tortoise+3d+model-skeleton imperfect.glb'
ASSET_SRC = ROOT / 'assets-src/animals/tripo-tortoise-rigged'
TEXTURE_DIR = ASSET_SRC / 'source-textures'
RUNTIME = ROOT / 'public/assets/models/animals/runtime/tripo-tortoise-rigged.glb'
BLEND = ASSET_SRC / 'tripo-tortoise-rigged.blend'
REPORT = ASSET_SRC / 'README.md'


def clear_scene():
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.object.delete()


def parse_glb(path):
  data = path.read_bytes()
  if data[:4] != b'glTF':
    raise ValueError(f'{path} is not a GLB')
  offset = 12
  gltf_json = None
  binary = None
  while offset < len(data):
    chunk_len, chunk_type = struct.unpack_from('<I4s', data, offset)
    chunk = data[offset + 8:offset + 8 + chunk_len]
    if chunk_type == b'JSON':
      gltf_json = json.loads(chunk.decode('utf-8'))
    elif chunk_type == b'BIN\x00':
      binary = chunk
    offset += 8 + chunk_len
  if gltf_json is None or binary is None:
    raise ValueError('GLB missing JSON or BIN chunk')
  return gltf_json, binary


COMPONENTS = {
  'SCALAR': 1,
  'VEC2': 2,
  'VEC3': 3,
  'VEC4': 4,
  'MAT4': 16,
}

COMPONENT_FORMATS = {
  5120: ('b', 1),
  5121: ('B', 1),
  5122: ('h', 2),
  5123: ('H', 2),
  5125: ('I', 4),
  5126: ('f', 4),
}


def accessor_data(gltf, binary, index):
  accessor = gltf['accessors'][index]
  view = gltf['bufferViews'][accessor['bufferView']]
  fmt, byte_size = COMPONENT_FORMATS[accessor['componentType']]
  component_count = COMPONENTS[accessor['type']]
  stride = view.get('byteStride', byte_size * component_count)
  start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
  normalized = accessor.get('normalized', False)
  result = []
  for row in range(accessor['count']):
    values = []
    row_start = start + row * stride
    for component in range(component_count):
      value = struct.unpack_from('<' + fmt, binary, row_start + component * byte_size)[0]
      if normalized:
        if accessor['componentType'] == 5121:
          value = value / 255
        elif accessor['componentType'] == 5123:
          value = value / 65535
      values.append(value)
    result.append(values[0] if component_count == 1 else values)
  return result


def source_to_blender(point):
  # Source GLB is Y-up and head-forward on -Z. Blender is Z-up; use +Y forward.
  x, y, z = point
  return (x, -z, y)


def normal_to_blender(normal):
  x, y, z = normal
  return (x, -z, y)


def extract_image(gltf, binary, image_index, name):
  image = gltf['images'][image_index]
  view = gltf['bufferViews'][image['bufferView']]
  start = view.get('byteOffset', 0)
  end = start + view['byteLength']
  suffix = '.jpg' if image.get('mimeType') == 'image/jpeg' else '.png'
  path = TEXTURE_DIR / f'{name}{suffix}'
  path.write_bytes(binary[start:end])
  return path


def make_material(gltf, binary):
  TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
  src_mat = gltf['materials'][0]
  pbr = src_mat.get('pbrMetallicRoughness', {})
  mat = bpy.data.materials.new('tripo_tortoise_pbr')
  mat.use_nodes = True
  bsdf = mat.node_tree.nodes.get('Principled BSDF')
  if not bsdf:
    return mat
  bsdf.inputs['Roughness'].default_value = 0.78
  bsdf.inputs['Metallic'].default_value = 0.0

  base_info = pbr.get('baseColorTexture')
  if base_info:
    tex = gltf['textures'][base_info['index']]
    image_path = extract_image(gltf, binary, tex['source'], 'tripo_tortoise_basecolor')
    image = bpy.data.images.load(str(image_path))
    image.pack()
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    node.label = 'Tripo base color'
    mat.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])

  normal_info = src_mat.get('normalTexture')
  if normal_info:
    tex = gltf['textures'][normal_info['index']]
    image_path = extract_image(gltf, binary, tex['source'], 'tripo_tortoise_normal')
    image = bpy.data.images.load(str(image_path))
    image.colorspace_settings.name = 'Non-Color'
    image.pack()
    tex_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex_node.image = image
    tex_node.label = 'Tripo normal'
    normal_node = mat.node_tree.nodes.new('ShaderNodeNormalMap')
    normal_node.inputs['Strength'].default_value = 0.62
    mat.node_tree.links.new(tex_node.outputs['Color'], normal_node.inputs['Color'])
    mat.node_tree.links.new(normal_node.outputs['Normal'], bsdf.inputs['Normal'])

  rough_info = pbr.get('metallicRoughnessTexture')
  if rough_info:
    tex = gltf['textures'][rough_info['index']]
    extract_image(gltf, binary, tex['source'], 'tripo_tortoise_metallic_roughness')

  return mat


def create_mesh(gltf, binary, material):
  primitive = gltf['meshes'][0]['primitives'][0]
  positions = accessor_data(gltf, binary, primitive['attributes']['POSITION'])
  normals = accessor_data(gltf, binary, primitive['attributes']['NORMAL'])
  uvs = accessor_data(gltf, binary, primitive['attributes']['TEXCOORD_0'])
  indices = accessor_data(gltf, binary, primitive['indices'])

  vertices = [source_to_blender(p) for p in positions]
  faces = [tuple(indices[i:i + 3]) for i in range(0, len(indices), 3)]

  mesh = bpy.data.meshes.new('tripo_tortoise_clean_mesh')
  mesh.from_pydata(vertices, [], faces)
  mesh.update(calc_edges=True)
  uv_layer = mesh.uv_layers.new(name='UVMap')
  for poly in mesh.polygons:
    for loop_index in poly.loop_indices:
      vertex_index = mesh.loops[loop_index].vertex_index
      u, v = uvs[vertex_index]
      uv_layer.data[loop_index].uv = (u, 1 - v)
  try:
    mesh.normals_split_custom_set_from_vertices([normal_to_blender(n) for n in normals])
  except Exception:
    pass

  obj = bpy.data.objects.new('tripo_tortoise_mesh', mesh)
  mesh.materials.append(material)
  bpy.context.collection.objects.link(obj)
  bpy.context.view_layer.objects.active = obj
  obj.select_set(True)
  bpy.ops.object.shade_smooth()
  obj.select_set(False)
  return obj, positions


def create_armature():
  armature_data = bpy.data.armatures.new('tripo_tortoise_clean_armature_data')
  armature = bpy.data.objects.new('tripo_tortoise_clean_armature', armature_data)
  bpy.context.collection.objects.link(armature)
  bpy.context.view_layer.objects.active = armature
  armature.select_set(True)
  bpy.ops.object.mode_set(mode='EDIT')

  def bone(name, head, tail, parent=None):
    b = armature_data.edit_bones.new(name)
    b.head = head
    b.tail = tail
    b.roll = 0
    if parent:
      b.parent = armature_data.edit_bones[parent]
    return b

  bone('root', (0, 0, 0.08), (0, 0, 0.36))
  bone('shell', (0, 0, 0.2), (0, 0, 0.72), 'root')
  bone('neck_1', (0, 0.24, 0.24), (0, 0.37, 0.3), 'shell')
  bone('neck_2', (0, 0.37, 0.3), (0, 0.48, 0.32), 'neck_1')
  bone('head', (0, 0.48, 0.32), (0, 0.61, 0.32), 'neck_2')
  bone('jaw', (0, 0.54, 0.285), (0, 0.62, 0.27), 'head')
  bone('tail', (0, -0.43, 0.16), (0, -0.56, 0.08), 'shell')

  leg_specs = {
    'front_left': (-0.205, 0.24, 1),
    'front_right': (0.206, 0.24, 1),
    'rear_left': (-0.147, -0.38, -1),
    'rear_right': (0.281, -0.27, -1),
  }
  for name, (x, y, forward_sign) in leg_specs.items():
    side = -1 if 'left' in name else 1
    shoulder = (x * 0.92, y - 0.025 * forward_sign, 0.24)
    knee = (x, y + 0.018 * forward_sign, 0.14)
    ankle = (x + side * 0.012, y + 0.035 * forward_sign, 0.055)
    toe = (x + side * 0.018, y + 0.12 * forward_sign, 0.04)
    bone(f'{name}_upper', shoulder, knee, 'shell')
    bone(f'{name}_lower', knee, ankle, f'{name}_upper')
    bone(f'{name}_foot', ankle, toe, f'{name}_lower')

  bpy.ops.object.mode_set(mode='OBJECT')
  armature.select_set(False)
  return armature, leg_specs


def add_weight(group, vertex_index, weight):
  if weight <= 0:
    return
  group.add([vertex_index], max(0, min(1, weight)), 'ADD')


def assign_weights(mesh_obj, source_positions, armature, leg_specs):
  mesh_obj.parent = armature
  modifier = mesh_obj.modifiers.new('clean_tortoise_armature', 'ARMATURE')
  modifier.object = armature

  groups = {bone.name: mesh_obj.vertex_groups.new(name=bone.name) for bone in armature.data.bones}
  leg_centers = {
    'front_left': (-0.205, -0.232),
    'front_right': (0.206, -0.238),
    'rear_left': (-0.147, 0.413),
    'rear_right': (0.281, 0.257),
  }

  for index, source in enumerate(source_positions):
    x, height, z = source
    abs_x = abs(x)
    # Head/neck protrudes as a narrow high region on source -Z.
    if z < -0.41 and height > 0.19 and abs_x < 0.16:
      add_weight(groups['head'], index, 0.88)
      add_weight(groups['neck_2'], index, 0.12)
      continue
    if z < -0.31 and height > 0.17 and abs_x < 0.18:
      blend = min(1, max(0, (-z - 0.31) / 0.12))
      add_weight(groups['neck_2'], index, 0.35 + blend * 0.45)
      add_weight(groups['neck_1'], index, 0.5 - blend * 0.25)
      add_weight(groups['head'], index, blend * 0.2)
      continue
    if z < -0.18 and height > 0.15 and abs_x < 0.2:
      add_weight(groups['neck_1'], index, 0.82)
      add_weight(groups['shell'], index, 0.18)
      continue

    if z > 0.42 and height < 0.18 and abs_x < 0.12:
      add_weight(groups['tail'], index, 0.75)
      add_weight(groups['shell'], index, 0.25)
      continue

    if height < 0.235:
      nearest = None
      nearest_dist = 999
      for name, (cx, cz) in leg_centers.items():
        dist = (x - cx) ** 2 + (z - cz) ** 2
        if dist < nearest_dist:
          nearest = name
          nearest_dist = dist
      if nearest is not None and nearest_dist < 0.09:
        foot_t = max(0, min(1, (0.105 - height) / 0.105))
        lower_t = max(0, min(1, 1 - abs(height - 0.125) / 0.11))
        upper_t = max(0, min(1, (height - 0.13) / 0.11))
        total = foot_t + lower_t + upper_t + 0.001
        add_weight(groups[f'{nearest}_foot'], index, foot_t / total)
        add_weight(groups[f'{nearest}_lower'], index, lower_t / total)
        add_weight(groups[f'{nearest}_upper'], index, upper_t / total)
        if height > 0.185:
          add_weight(groups['shell'], index, min(0.18, (height - 0.185) * 2.0))
        continue

    add_weight(groups['shell'], index, 1.0)


def set_pose_defaults(armature):
  bpy.context.view_layer.objects.active = armature
  bpy.ops.object.mode_set(mode='POSE')
  for pb in armature.pose.bones:
    pb.rotation_mode = 'XYZ'
    pb.location = (0, 0, 0)
    pb.rotation_euler = (0, 0, 0)
    pb.scale = (1, 1, 1)
  bpy.ops.object.mode_set(mode='OBJECT')


def key_pose_bone(pb, frame):
  pb.keyframe_insert('location', frame=frame)
  pb.keyframe_insert('rotation_euler', frame=frame)
  pb.keyframe_insert('scale', frame=frame)


def reset_pose(armature):
  for pb in armature.pose.bones:
    pb.location = (0, 0, 0)
    pb.rotation_euler = (0, 0, 0)
    pb.scale = (1, 1, 1)


def smoothstep(value):
  x = max(0, min(1, value))
  return x * x * (3 - 2 * x)


def add_clip(armature, name, duration, pose):
  action = bpy.data.actions.new(name)
  action.frame_start = 1
  action.frame_end = duration
  armature.animation_data.action = action
  frames = sorted(set([1, duration] + [round(1 + (duration - 1) * i / 10) for i in range(11)]))
  bpy.context.view_layer.objects.active = armature
  bpy.ops.object.mode_set(mode='POSE')
  for frame in frames:
    t = (frame - 1) / max(1, duration - 1)
    reset_pose(armature)
    pose(armature.pose.bones, t)
    for pb in armature.pose.bones:
      key_pose_bone(pb, frame)
  bpy.ops.object.mode_set(mode='OBJECT')
  track = armature.animation_data.nla_tracks.new()
  track.name = name
  strip = track.strips.new(name, 1, action)
  strip.frame_end = duration
  armature.animation_data.action = None


def make_animations(armature):
  armature.animation_data_clear()
  armature.animation_data_create()
  set_pose_defaults(armature)

  phases = {
    'front_left': 0,
    'rear_right': 0,
    'front_right': math.pi,
    'rear_left': math.pi,
  }

  def idle(bones, t):
    wave = math.sin(t * math.tau)
    bones['shell'].scale = (1, 1 + wave * 0.004, 1 + wave * 0.006)
    bones['neck_1'].rotation_euler.x = wave * 0.025
    bones['neck_2'].rotation_euler.z = math.sin(t * math.tau * 0.5) * 0.04
    bones['head'].rotation_euler.x = math.sin(t * math.tau + 0.8) * 0.025

  def walk(bones, t):
    phase = t * math.tau
    step = abs(math.sin(phase))
    bones['root'].location.x = math.sin(phase + 0.35) * 0.008
    bones['root'].location.z = step * 0.024
    bones['shell'].rotation_euler.x = math.sin(phase * 2.0 + 0.4) * 0.018
    bones['shell'].rotation_euler.y = math.sin(phase) * 0.048
    bones['neck_1'].rotation_euler.x = math.sin(phase + 0.6) * 0.075
    bones['neck_2'].rotation_euler.x = math.sin(phase + 1.2) * -0.045
    bones['head'].rotation_euler.x = math.sin(phase + 1.7) * 0.035
    bones['tail'].rotation_euler.x = math.sin(phase + 2.1) * 0.08
    for name, phase_offset in phases.items():
      p = phase + phase_offset
      s = math.sin(p)
      c = math.cos(p)
      lift = max(0, s)
      planted = max(0, -s)
      fore = name.startswith('front')
      side = -1 if name.endswith('left') else 1
      lift_eased = lift ** 1.25
      planted_eased = planted ** 0.85
      stride = 0.078 if fore else 0.064
      bones[f'{name}_upper'].rotation_euler.x = (0.36 if fore else -0.3) * s + (0.035 if fore else -0.03) * planted_eased
      bones[f'{name}_upper'].rotation_euler.z = side * (0.055 + planted_eased * 0.055 - lift_eased * 0.025)
      bones[f'{name}_lower'].rotation_euler.x = (-0.52 if fore else 0.47) * lift_eased + (0.15 if fore else -0.13) * planted_eased
      bones[f'{name}_foot'].rotation_euler.x = (-0.38 if fore else 0.28) * lift_eased + (0.12 if fore else -0.09) * planted_eased
      bones[f'{name}_foot'].rotation_euler.z = side * (0.045 * lift_eased)
      bones[f'{name}_foot'].location.y = c * stride
      bones[f'{name}_foot'].location.z = lift_eased * (0.052 if fore else 0.044)

  def eat(bones, t):
    down = smoothstep(t * 2.25)
    chew = max(0, math.sin(t * math.tau * 5.0))
    browse = math.sin(t * math.tau * 1.2)
    bones['root'].location.z = -down * 0.014 + chew * 0.003
    bones['shell'].rotation_euler.x = -down * 0.045
    bones['neck_1'].location.y = down * 0.055
    bones['neck_1'].location.z = -down * 0.032
    bones['neck_1'].rotation_euler.x = -down * 0.22 + browse * 0.03
    bones['neck_2'].location.y = down * 0.055
    bones['neck_2'].location.z = -down * 0.03
    bones['neck_2'].rotation_euler.x = -down * 0.18 + browse * 0.025
    bones['head'].location.y = down * 0.13
    bones['head'].location.z = -down * 0.09
    bones['head'].rotation_euler.x = -down * 0.1 - chew * 0.055
    bones['jaw'].rotation_euler.x = down * 0.08 + chew * 0.48
    for name in ['front_left', 'front_right']:
      side = -1 if name.endswith('left') else 1
      bones[f'{name}_upper'].rotation_euler.x = down * 0.2
      bones[f'{name}_upper'].rotation_euler.z = side * down * 0.1
      bones[f'{name}_lower'].rotation_euler.x = -down * 0.16
      bones[f'{name}_foot'].rotation_euler.x = down * 0.08

  def sleep(bones, t):
    settle = smoothstep(t * 1.65)
    breath = math.sin(t * math.tau * 1.1) * 0.5 + 0.5
    bones['root'].location.z = -settle * 0.048 + breath * settle * 0.004
    bones['shell'].rotation_euler.x = settle * 0.032
    bones['shell'].scale = (1, 1 + breath * settle * 0.004, 1 - settle * 0.06 + breath * settle * 0.004)
    bones['neck_1'].rotation_euler.x = -settle * 0.36
    bones['neck_2'].rotation_euler.x = -settle * 0.42
    bones['head'].location.y = -settle * 0.11
    bones['head'].location.z = -settle * 0.065
    bones['head'].rotation_euler.x = settle * 0.2
    bones['jaw'].rotation_euler.x = settle * 0.08
    bones['tail'].rotation_euler.x = -settle * 0.28
    for name in phases:
      fore = name.startswith('front')
      side = -1 if name.endswith('left') else 1
      bones[f'{name}_upper'].rotation_euler.x = settle * (0.48 if fore else -0.4)
      bones[f'{name}_upper'].rotation_euler.z = side * settle * (0.12 if fore else 0.09)
      bones[f'{name}_lower'].rotation_euler.x = settle * (-0.38 if fore else 0.34)
      bones[f'{name}_foot'].rotation_euler.x = settle * (-0.16 if fore else 0.12)
      bones[f'{name}_foot'].location.y = settle * (-0.035 if fore else 0.025)
      bones[f'{name}_foot'].location.z = -settle * 0.012

  def defecate(bones, t):
    brace = smoothstep(t * 5.0) * (1 - smoothstep((t - 0.88) * 8.0))
    pulse = math.sin(t * math.pi) * brace
    bones['root'].location.z = -pulse * 0.058
    bones['shell'].rotation_euler.x = -pulse * 0.12
    bones['shell'].rotation_euler.y = math.sin(t * math.tau * 1.4) * pulse * 0.035
    bones['neck_1'].rotation_euler.x = -pulse * 0.12
    bones['neck_2'].rotation_euler.x = -pulse * 0.06
    bones['tail'].location.y = -pulse * 0.1
    bones['tail'].location.z = pulse * 0.08
    bones['tail'].rotation_euler.x = -pulse * 1.12
    bones['tail'].rotation_euler.z = math.sin(t * math.tau * 2.0) * pulse * 0.08
    bones['tail'].scale = (1, 1 + pulse * 0.22, 1 + pulse * 0.12)
    for name in ['rear_left', 'rear_right']:
      side = -1 if name.endswith('left') else 1
      bones[f'{name}_upper'].rotation_euler.x = pulse * -0.48
      bones[f'{name}_upper'].rotation_euler.z = side * pulse * 0.24
      bones[f'{name}_lower'].rotation_euler.x = pulse * 0.48
      bones[f'{name}_foot'].rotation_euler.x = pulse * 0.24
      bones[f'{name}_foot'].location.y = pulse * -0.045
      bones[f'{name}_foot'].location.z = -pulse * 0.015
    for name in ['front_left', 'front_right']:
      side = -1 if name.endswith('left') else 1
      bones[f'{name}_upper'].rotation_euler.x = pulse * 0.18
      bones[f'{name}_upper'].rotation_euler.z = side * pulse * 0.08
      bones[f'{name}_lower'].rotation_euler.x = pulse * -0.16
      bones[f'{name}_foot'].rotation_euler.x = pulse * -0.1

  def hide(bones, t):
    tuck = smoothstep(t * 4.2)
    breath = (math.sin(t * math.tau * 1.7) * 0.5 + 0.5) * tuck
    startle = math.sin(min(1, t * 4.0) * math.pi) * (1 - smoothstep((t - 0.18) * 5.0))
    bones['root'].location.z = -tuck * 0.062 - startle * 0.012 + breath * 0.004
    bones['shell'].rotation_euler.x = tuck * 0.045 - startle * 0.025
    bones['shell'].rotation_euler.y = math.sin(t * math.tau * 2.2) * tuck * 0.012
    bones['shell'].scale = (
      1 + tuck * 0.018,
      1 + tuck * 0.026 + breath * 0.004,
      1 - tuck * 0.03 + breath * 0.003,
    )
    bones['neck_1'].location.y = -tuck * 0.075
    bones['neck_1'].location.z = -tuck * 0.038
    bones['neck_1'].rotation_euler.x = -tuck * 0.72 - startle * 0.12
    bones['neck_2'].location.y = -tuck * 0.11
    bones['neck_2'].location.z = -tuck * 0.044
    bones['neck_2'].rotation_euler.x = -tuck * 0.86 - startle * 0.08
    bones['head'].location.y = -tuck * 0.24
    bones['head'].location.z = -tuck * 0.082
    bones['head'].rotation_euler.x = tuck * 0.46
    bones['jaw'].rotation_euler.x = tuck * 0.08
    bones['tail'].location.y = tuck * 0.055
    bones['tail'].location.z = tuck * 0.026
    bones['tail'].rotation_euler.x = -tuck * 0.5
    for name in phases:
      fore = name.startswith('front')
      side = -1 if name.endswith('left') else 1
      bones[f'{name}_upper'].rotation_euler.x = tuck * (0.7 if fore else -0.58)
      bones[f'{name}_upper'].rotation_euler.z = side * tuck * (0.18 if fore else 0.14)
      bones[f'{name}_lower'].rotation_euler.x = tuck * (-0.56 if fore else 0.46)
      bones[f'{name}_foot'].rotation_euler.x = tuck * (-0.26 if fore else 0.18)
      bones[f'{name}_foot'].location.y = tuck * (-0.055 if fore else 0.04)
      bones[f'{name}_foot'].location.z = -tuck * (0.026 if fore else 0.018)

  add_clip(armature, 'idle', 96, idle)
  add_clip(armature, 'walk', 64, walk)
  add_clip(armature, 'eat', 86, eat)
  add_clip(armature, 'sleep', 110, sleep)
  add_clip(armature, 'defecate', 76, defecate)
  add_clip(armature, 'hide', 72, hide)


def write_report():
  REPORT.write_text(
    '# Tripo tortoise rerig\n\n'
    'Generated by `scripts/blender_rebuild_tripo_tortoise_rig.py` from the user-provided Tripo GLB.\n\n'
    '- Source visual asset copied to `assets-src/animals/tripo-tortoise-rigged/original-tripo-skeleton-imperfect.glb`.\n'
    '- Runtime asset: `public/assets/models/animals/runtime/tripo-tortoise-rigged.glb`.\n'
    '- The Tripo mesh and PBR textures are preserved; the Tripo autorig is discarded.\n'
    '- Clean armature: shell/root, neck/head/jaw, tail, and four independent upper/lower/foot leg chains.\n'
    '- Clips: `idle`, `walk`, `eat`, `sleep`, `defecate`, `hide`.\n'
    '- The rebuild bypasses Blender glTF import because the original Tripo file crashes the Blender 5.1 importer in this environment.\n',
    encoding='utf-8',
  )


def main():
  if not SOURCE.exists():
    raise FileNotFoundError(SOURCE)
  ASSET_SRC.mkdir(parents=True, exist_ok=True)
  RUNTIME.parent.mkdir(parents=True, exist_ok=True)
  shutil.copy2(SOURCE, ASSET_SRC / 'original-tripo-skeleton-imperfect.glb')

  gltf, binary = parse_glb(SOURCE)
  clear_scene()
  material = make_material(gltf, binary)
  mesh_obj, source_positions = create_mesh(gltf, binary, material)
  armature, leg_specs = create_armature()
  assign_weights(mesh_obj, source_positions, armature, leg_specs)
  make_animations(armature)
  write_report()

  for obj in list(bpy.context.scene.objects):
    if obj.type in {'CAMERA', 'LIGHT'}:
      bpy.data.objects.remove(obj, do_unlink=True)

  bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
  bpy.ops.export_scene.gltf(
    filepath=str(RUNTIME),
    export_format='GLB',
    use_selection=False,
    export_animations=True,
    export_animation_mode='NLA_TRACKS',
    export_merge_animation='NLA_TRACK',
    export_nla_strips=True,
    export_anim_single_armature=True,
    export_apply=False,
  )


if __name__ == '__main__':
  main()
