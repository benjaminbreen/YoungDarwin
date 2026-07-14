"""Build Nicholas Lawson's four-room house shell and entrance-room props.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --disable-autoexec --python scripts/blender_build_lawson_house.py

Then optimize the authored shell for runtime delivery while preserving its
named ceiling and flame nodes:
  npx @gltf-transform/cli optimize public/assets/models/structures/lawson-house-interior.glb \
    /tmp/lawson-house-interior-optimized.glb --compress meshopt --flatten false \
    --join false --instance false --palette false --simplify false \
    --texture-compress webp --texture-size 1024

The shared JSON blueprint owns runtime dimensions, colliders, spawns, and room
labels. This builder supplies the visual shell and authored entrance/dining
details. Game coordinates are +x east, +y up, +z toward the front door.
"""

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
BLUEPRINT = json.loads((ROOT / 'three-game/interiors/blueprints/lawsonHouse.json').read_text())
TEXTURES = ROOT / 'public/assets/textures/interiors/lawson-house'
SHARED_TEXTURES = ROOT / 'public/assets/textures/interiors/beagle-cabin'
SHELL_OUT = ROOT / 'public/assets/models/structures/lawson-house-interior.glb'
PROP_OUT = ROOT / 'public/assets/models/props/lawson-house'
CHAIR_SOURCE = ROOT / 'assets-src/interiors/lawson-house/poly-haven/painted-wooden-chair-02/painted_wooden_chair_02_1k.gltf'
MATS = {}


def game_to_blender(position):
  x, y, z = position
  return (x, -z, y)


def clear_scene():
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.object.delete()
  for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
    for block in list(blocks):
      if block.users == 0:
        blocks.remove(block)
  MATS.clear()


def srgb(hexcode):
  value = hexcode.lstrip('#')
  return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))


def linear(color):
  return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in color)


def material(name, color, roughness=0.82, metalness=0, alpha=1, emission=None):
  if name in MATS:
    return MATS[name]
  mat = bpy.data.materials.new(name)
  mat.use_nodes = True
  bsdf = mat.node_tree.nodes.get('Principled BSDF')
  bsdf.inputs['Base Color'].default_value = (*linear(srgb(color)), 1)
  bsdf.inputs['Roughness'].default_value = roughness
  bsdf.inputs['Metallic'].default_value = metalness
  if alpha < 1:
    bsdf.inputs['Alpha'].default_value = alpha
    mat.surface_render_method = 'DITHERED'
  if emission:
    emission_input = bsdf.inputs.get('Emission Color') or bsdf.inputs.get('Emission')
    if emission_input:
      emission_input.default_value = (*linear(srgb(emission[0])), 1)
    if bsdf.inputs.get('Emission Strength'):
      bsdf.inputs['Emission Strength'].default_value = emission[1]
  MATS[name] = mat
  return mat


def pbr_material(name, root, color_file, rough_file, normal_file, scale=(1, 1, 1), tint='#ffffff', normal_strength=0.35):
  mat = bpy.data.materials.new(name)
  mat.use_nodes = True
  nodes = mat.node_tree.nodes
  links = mat.node_tree.links
  bsdf = nodes.get('Principled BSDF')
  tex = nodes.new('ShaderNodeTexCoord')
  mapping = nodes.new('ShaderNodeMapping')
  mapping.inputs['Scale'].default_value = scale
  links.new(tex.outputs['UV'], mapping.inputs['Vector'])
  diffuse = nodes.new('ShaderNodeTexImage')
  diffuse.image = bpy.data.images.load(str(root / color_file), check_existing=True)
  links.new(mapping.outputs['Vector'], diffuse.inputs['Vector'])
  tint_node = nodes.new('ShaderNodeRGB')
  tint_node.outputs[0].default_value = (*linear(srgb(tint)), 1)
  mix = nodes.new('ShaderNodeMixRGB')
  mix.blend_type = 'MULTIPLY'
  mix.inputs[0].default_value = 1
  links.new(diffuse.outputs['Color'], mix.inputs[1])
  links.new(tint_node.outputs[0], mix.inputs[2])
  links.new(mix.outputs['Color'], bsdf.inputs['Base Color'])
  rough = nodes.new('ShaderNodeTexImage')
  rough.image = bpy.data.images.load(str(root / rough_file), check_existing=True)
  rough.image.colorspace_settings.name = 'Non-Color'
  links.new(mapping.outputs['Vector'], rough.inputs['Vector'])
  links.new(rough.outputs['Color'], bsdf.inputs['Roughness'])
  normal_tex = nodes.new('ShaderNodeTexImage')
  normal_tex.image = bpy.data.images.load(str(root / normal_file), check_existing=True)
  normal_tex.image.colorspace_settings.name = 'Non-Color'
  normal = nodes.new('ShaderNodeNormalMap')
  normal.inputs['Strength'].default_value = normal_strength
  links.new(mapping.outputs['Vector'], normal_tex.inputs['Vector'])
  links.new(normal_tex.outputs['Color'], normal.inputs['Color'])
  links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
  bsdf.inputs['Metallic'].default_value = 0
  MATS[name] = mat
  return mat


def detail_pbr_material(name, root, rough_file, normal_file, color, scale=(1, 1, 1), normal_strength=0.35, roughness_floor=0.72):
  """Use scanned microsurface detail without importing a conspicuous color pattern."""
  mat = bpy.data.materials.new(name)
  mat.use_nodes = True
  nodes = mat.node_tree.nodes
  links = mat.node_tree.links
  bsdf = nodes.get('Principled BSDF')
  bsdf.inputs['Base Color'].default_value = (*linear(srgb(color)), 1)
  tex = nodes.new('ShaderNodeTexCoord')
  mapping = nodes.new('ShaderNodeMapping')
  mapping.inputs['Scale'].default_value = scale
  links.new(tex.outputs['UV'], mapping.inputs['Vector'])
  rough = nodes.new('ShaderNodeTexImage')
  rough.image = bpy.data.images.load(str(root / rough_file), check_existing=True)
  rough.image.colorspace_settings.name = 'Non-Color'
  links.new(mapping.outputs['Vector'], rough.inputs['Vector'])
  ramp = nodes.new('ShaderNodeValToRGB')
  ramp.color_ramp.elements[0].position = 0.08
  ramp.color_ramp.elements[0].color = (roughness_floor, roughness_floor, roughness_floor, 1)
  ramp.color_ramp.elements[1].position = 0.92
  ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
  links.new(rough.outputs['Color'], ramp.inputs['Fac'])
  links.new(ramp.outputs['Color'], bsdf.inputs['Roughness'])
  normal_tex = nodes.new('ShaderNodeTexImage')
  normal_tex.image = bpy.data.images.load(str(root / normal_file), check_existing=True)
  normal_tex.image.colorspace_settings.name = 'Non-Color'
  normal = nodes.new('ShaderNodeNormalMap')
  normal.inputs['Strength'].default_value = normal_strength
  links.new(mapping.outputs['Vector'], normal_tex.inputs['Vector'])
  links.new(normal_tex.outputs['Color'], normal.inputs['Color'])
  links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
  MATS[name] = mat
  return mat


def glass_material(name, color, roughness=0.1, transmission=0.9, ior=1.52):
  """Principled transmission exports as KHR_materials_transmission/ior."""
  mat = bpy.data.materials.new(name)
  mat.use_nodes = True
  bsdf = mat.node_tree.nodes.get('Principled BSDF')
  bsdf.inputs['Base Color'].default_value = (*linear(srgb(color)), 1)
  bsdf.inputs['Roughness'].default_value = roughness
  transmission_input = bsdf.inputs.get('Transmission Weight') or bsdf.inputs.get('Transmission')
  if transmission_input:
    transmission_input.default_value = transmission
  if bsdf.inputs.get('IOR'):
    bsdf.inputs['IOR'].default_value = ior
  coat = bsdf.inputs.get('Coat Weight') or bsdf.inputs.get('Clearcoat')
  if coat:
    coat.default_value = 0.08
  MATS[name] = mat
  return mat


def image_material(name, image_path, roughness=0.9):
  mat = bpy.data.materials.new(name)
  mat.use_nodes = True
  nodes = mat.node_tree.nodes
  links = mat.node_tree.links
  bsdf = nodes.get('Principled BSDF')
  image_node = nodes.new('ShaderNodeTexImage')
  image_node.image = bpy.data.images.load(str(image_path), check_existing=True)
  links.new(image_node.outputs['Color'], bsdf.inputs['Base Color'])
  bsdf.inputs['Roughness'].default_value = roughness
  MATS[name] = mat
  return mat


def init_materials():
  pbr_material('HouseFloor', TEXTURES, 'wood-planks-diff-2k.jpg', 'wood-planks-rough-2k.jpg', 'wood-planks-normal-2k.jpg', (1, 1, 1), '#b08b70', 0.62)
  pbr_material('PublicLimewash', TEXTURES, 'limewash-diff-2k.jpg', 'limewash-rough-2k.jpg', 'limewash-normal-2k.jpg', (1.8, 1.4, 1), '#f0e4c8', 0.42)
  pbr_material('OfficeLimewash', TEXTURES, 'limewash-diff-2k.jpg', 'limewash-rough-2k.jpg', 'limewash-normal-2k.jpg', (1.8, 1.4, 1), '#b6c0aa', 0.38)
  pbr_material('PrivateLimewash', TEXTURES, 'limewash-diff-2k.jpg', 'limewash-rough-2k.jpg', 'limewash-normal-2k.jpg', (1.8, 1.4, 1), '#d0b891', 0.36)
  pbr_material('CeilingLimewash', TEXTURES, 'limewash-diff-2k.jpg', 'limewash-rough-2k.jpg', 'limewash-normal-2k.jpg', (2.2, 1.7, 1), '#c7bda6', 0.22)
  pbr_material('LimewashedBoards', SHARED_TEXTURES, 'painted-planks-diff-1k.jpg', 'painted-planks-rough-1k.jpg', 'painted-planks-normal-1k.jpg', (1.25, 1.25, 1), '#aaa38c', 0.28)
  pbr_material('FurnitureWood', TEXTURES, 'fine-wood-diff-2k.jpg', 'fine-wood-rough-2k.jpg', 'fine-wood-normal-2k.jpg', (1.35, 1.35, 1), '#a77e5f', 0.48)
  pbr_material('OldPine', TEXTURES, 'fine-wood-diff-2k.jpg', 'fine-wood-rough-2k.jpg', 'fine-wood-normal-2k.jpg', (1.8, 1.8, 1), '#8f6849', 0.36)
  detail_pbr_material('Canvas', TEXTURES, 'woven-fabric-rough-2k.jpg', 'woven-fabric-normal-2k.jpg', '#a99b78', (2.8, 2.8, 1), 0.72, 0.8)
  # Preserve the readable blue-and-cream check that gave the earlier Lawson
  # textiles a distinct identity. The scan supplies color, weave, roughness,
  # and normal detail instead of reducing every soft prop to a flat blue slab.
  pbr_material('IndigoCloth', TEXTURES, 'woven-fabric-diff-2k.jpg', 'woven-fabric-rough-2k.jpg', 'woven-fabric-normal-2k.jpg', (1.7, 1.7, 1), '#d6ded7', 0.72)
  detail_pbr_material('PaintedChair', TEXTURES, 'fine-wood-rough-2k.jpg', 'fine-wood-normal-2k.jpg', '#5f685c', (1.6, 1.6, 1), 0.42, 0.58)
  image_material('ArrowsmithMap', SHARED_TEXTURES / 'maps/arrowsmith-world-map.jpg', 0.94)
  image_material('OfficialAppointmentNotice', TEXTURES / 'official-appointment-notice.png', 0.88)
  material('DarkTimber', '#433329', 0.84)
  material('CeilingTimber', '#76583f', 0.76)
  material('TrimPaint', '#8b927d', 0.88)
  material('DadoPaint', '#66705f', 0.9)
  material('HighlandMistNear', '#aab8b0', 1, alpha=0.16, emission=('#aebbb4', 0.08))
  material('WetGrass', '#455b42', 1)
  material('LeafNear', '#405943', 0.94)
  material('LeafMiddle', '#607263', 0.98)
  material('LeafFar', '#7d897c', 1)
  material('Iron', '#302f2b', 0.48, 0.68)
  material('Rust', '#7a351f', 0.94, 0.08)
  material('Brass', '#b0792f', 0.26, 0.94)
  material('Pewter', '#7e817c', 0.46, 0.58)
  glass_material('BottleGlass', '#274532', 0.18, 0.78, 1.51)
  glass_material('WindowGlass', '#d4dfda', 0.16, 0.88, 1.52)
  material('Paper', '#cdbf91', 0.96)
  material('Ink', '#24211d', 0.9)
  material('Leather', '#4d2e22', 0.78)
  material('Earthenware', '#9a6848', 0.92)
  material('CreamCeramic', '#c4b997', 0.82)
  material('MaizeBread', '#b9843f', 1)
  material('Plantain', '#76743b', 0.96)
  material('LeafGreen', '#354d36', 0.98)
  material('WetEarth', '#29251f', 1)
  material('Basalt', '#303530', 0.98)
  material('LampFlame', '#ff8b32', 0.3, emission=('#ff7623', 3.2))


def add_box(name, position, size, mat, yaw=0, bevel=0):
  bpy.ops.mesh.primitive_cube_add(size=1, location=game_to_blender(position))
  obj = bpy.context.object
  obj.name = name
  obj.dimensions = (size[0], size[2], size[1])
  obj.rotation_euler[2] = -yaw
  bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
  obj.data.materials.append(mat)
  if bevel:
    mod = obj.modifiers.new('HandSoftenedEdges', 'BEVEL')
    mod.width = bevel
    mod.segments = 2
  return obj


def add_cylinder(name, position, radius, height, mat, sides=16, rotation=(0, 0, 0)):
  bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=height, location=game_to_blender(position))
  obj = bpy.context.object
  obj.name = name
  obj.data.materials.append(mat)
  obj.rotation_euler = (rotation[2], rotation[0], -rotation[1])
  return obj


def add_tapered_leg(name, position, top_radius, bottom_radius, height, mat, sides=16):
  bpy.ops.mesh.primitive_cone_add(
    vertices=sides,
    radius1=bottom_radius,
    radius2=top_radius,
    depth=height,
    location=game_to_blender(position),
  )
  obj = bpy.context.object
  obj.name = name
  obj.data.materials.append(mat)
  bevel = obj.modifiers.new('TurnedLegEdges', 'BEVEL')
  bevel.width = min(0.012, bottom_radius * 0.16)
  bevel.segments = 2
  return obj


def add_lathe(name, position, profile, mat, segments=24):
  """Create a hand-turned profile in game-space, suitable for furniture and lamps."""
  vertices = []
  for radius, y in profile:
    for segment in range(segments):
      angle = segment / segments * math.tau
      vertices.append(game_to_blender((
        position[0] + math.cos(angle) * radius,
        position[1] + y,
        position[2] + math.sin(angle) * radius,
      )))
  faces = []
  for ring in range(len(profile) - 1):
    for segment in range(segments):
      next_segment = (segment + 1) % segments
      a = ring * segments + segment
      b = ring * segments + next_segment
      c = (ring + 1) * segments + next_segment
      d = (ring + 1) * segments + segment
      faces.append((a, b, c, d))
  mesh = bpy.data.meshes.new(name)
  mesh.from_pydata(vertices, [], faces)
  mesh.update()
  uv_layer = mesh.uv_layers.new(name='UVMap')
  ring_count = max(1, len(profile) - 1)
  for face_index, polygon in enumerate(mesh.polygons):
    ring = face_index // segments
    segment = face_index % segments
    next_u = (segment + 1) / segments
    values = (
      (segment / segments, ring / ring_count),
      (next_u, ring / ring_count),
      (next_u, (ring + 1) / ring_count),
      (segment / segments, (ring + 1) / ring_count),
    )
    for loop_index, uv in zip(polygon.loop_indices, values):
      uv_layer.data[loop_index].uv = uv
  obj = bpy.data.objects.new(name, mesh)
  bpy.context.scene.collection.objects.link(obj)
  obj.data.materials.append(mat)
  bevel = obj.modifiers.new('TurnedProfileSoftness', 'BEVEL')
  bevel.width = 0.006
  bevel.segments = 2
  return obj


def add_sagged_panel(name, position, width, depth, mat, sag=0.025, yaw=0, x_segments=10, z_segments=8, thickness=0.016):
  """Create a subtly irregular woven surface rather than a rigid toy-like slab."""
  vertices = []
  for zi in range(z_segments + 1):
    v = zi / z_segments
    local_z = (v - 0.5) * depth
    for xi in range(x_segments + 1):
      u = xi / x_segments
      local_x = (u - 0.5) * width
      edge_shape = math.sin(math.pi * u) * math.sin(math.pi * v)
      ripple = math.sin(u * math.tau * 2.0 + v * 1.7) * 0.003
      local_y = -sag * edge_shape + ripple
      rotated_x = local_x * math.cos(yaw) + local_z * math.sin(yaw)
      rotated_z = -local_x * math.sin(yaw) + local_z * math.cos(yaw)
      vertices.append(game_to_blender((position[0] + rotated_x, position[1] + local_y, position[2] + rotated_z)))
  faces = []
  for zi in range(z_segments):
    for xi in range(x_segments):
      a = zi * (x_segments + 1) + xi
      b = a + 1
      d = (zi + 1) * (x_segments + 1) + xi
      c = d + 1
      faces.append((a, b, c, d))
  mesh = bpy.data.meshes.new(name)
  mesh.from_pydata(vertices, [], faces)
  mesh.update()
  uv_layer = mesh.uv_layers.new(name='UVMap')
  for face_index, polygon in enumerate(mesh.polygons):
    zi = face_index // x_segments
    xi = face_index % x_segments
    values = (
      (xi / x_segments, zi / z_segments),
      ((xi + 1) / x_segments, zi / z_segments),
      ((xi + 1) / x_segments, (zi + 1) / z_segments),
      (xi / x_segments, (zi + 1) / z_segments),
    )
    for loop_index, uv in zip(polygon.loop_indices, values):
      uv_layer.data[loop_index].uv = uv
  obj = bpy.data.objects.new(name, mesh)
  bpy.context.scene.collection.objects.link(obj)
  obj.data.materials.append(mat)
  solidify = obj.modifiers.new('WovenThickness', 'SOLIDIFY')
  solidify.thickness = thickness
  solidify.offset = 0
  bevel = obj.modifiers.new('WornWovenEdge', 'BEVEL')
  bevel.width = min(0.008, thickness * 0.45)
  bevel.segments = 2
  return obj


def add_sphere(name, position, radius, mat, scale=(1, 1, 1)):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=radius, location=game_to_blender(position))
  obj = bpy.context.object
  obj.name = name
  obj.scale = (scale[0], scale[2], scale[1])
  obj.data.materials.append(mat)
  return obj


def add_torus(name, position, major, minor, mat, rotation=(0, 0, 0)):
  bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=20, minor_segments=8, location=game_to_blender(position))
  obj = bpy.context.object
  obj.name = name
  obj.data.materials.append(mat)
  obj.rotation_euler = (rotation[2], rotation[0], -rotation[1])
  return obj


def beam_between(name, start, end, radius, mat, sides=12):
  a = Vector(game_to_blender(start))
  b = Vector(game_to_blender(end))
  delta = b - a
  bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=delta.length, location=(a + b) / 2)
  obj = bpy.context.object
  obj.name = name
  obj.data.materials.append(mat)
  obj.rotation_mode = 'QUATERNION'
  obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
  return obj


def board_between(name, start, end, width, depth, mat, bevel=0.008):
  """Create a rectangular furniture rail aligned between two game-space points."""
  a = Vector(game_to_blender(start))
  b = Vector(game_to_blender(end))
  delta = b - a
  bpy.ops.mesh.primitive_cube_add(size=1, location=(a + b) * 0.5)
  obj = bpy.context.object
  obj.name = name
  obj.dimensions = (width, depth, delta.length)
  bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
  obj.rotation_mode = 'QUATERNION'
  obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
  obj.data.materials.append(mat)
  if bevel:
    modifier = obj.modifiers.new('RailEdgeWear', 'BEVEL')
    modifier.width = bevel
    modifier.segments = 2
  return obj


def simple_window(name, x, y, z, width, height, orientation='front'):
  """Build a deep painted sash with four separate, slightly irregular panes."""
  if orientation == 'front':
    for column in (-1, 1):
      for row in (-1, 1):
        pane_index = (column + 1) + (row + 1) // 2
        add_box(
          f'{name}_Glass_{column}_{row}',
          (x + column * width * 0.25, y + row * height * 0.25, z + (pane_index % 2) * 0.003),
          (width * 0.5 - 0.045, height * 0.5 - 0.045, 0.018),
          MATS['WindowGlass'],
          yaw=(pane_index - 1.5) * 0.0025,
        )
    reveal_z = z - 0.14
    for side in (-1, 1):
      add_box(f'{name}_CasingV_{side}', (x + side * (width * 0.5 + 0.07), y, reveal_z), (0.14, height + 0.32, 0.4), MATS['TrimPaint'], bevel=0.02)
    add_box(f'{name}_CasingHead', (x, y + height * 0.5 + 0.08, reveal_z), (width + 0.42, 0.16, 0.4), MATS['TrimPaint'], bevel=0.02)
    add_box(f'{name}_Sill', (x, y - height * 0.5 - 0.09, z - 0.16), (width + 0.42, 0.16, 0.5), MATS['FurnitureWood'], bevel=0.028)
    add_box(f'{name}_MuntinV', (x, y, z - 0.055), (0.052, height, 0.13), MATS['TrimPaint'], bevel=0.009)
    add_box(f'{name}_MuntinH', (x, y, z - 0.055), (width, 0.052, 0.13), MATS['TrimPaint'], bevel=0.009)
    add_box(f'{name}_Catch', (x, y - 0.025, z - 0.135), (0.15, 0.035, 0.035), MATS['Brass'], bevel=0.007)
    for side in (-1, 1):
      add_box(f'{name}_Hinge_{side}', (x + side * (width * 0.5 - 0.06), y + 0.28, z - 0.13), (0.07, 0.15, 0.028), MATS['Iron'], bevel=0.005)
  else:
    for column in (-1, 1):
      for row in (-1, 1):
        pane_index = (column + 1) + (row + 1) // 2
        add_box(
          f'{name}_Glass_{column}_{row}',
          (x + (pane_index % 2) * 0.003, y + row * height * 0.25, z + column * width * 0.25),
          (0.018, height * 0.5 - 0.045, width * 0.5 - 0.045),
          MATS['WindowGlass'],
          yaw=(pane_index - 1.5) * 0.0025,
        )
    reveal_x = x + 0.14
    for side in (-1, 1):
      add_box(f'{name}_CasingV_{side}', (reveal_x, y, z + side * (width * 0.5 + 0.07)), (0.4, height + 0.32, 0.14), MATS['TrimPaint'], bevel=0.02)
    add_box(f'{name}_CasingHead', (reveal_x, y + height * 0.5 + 0.08, z), (0.4, 0.16, width + 0.42), MATS['TrimPaint'], bevel=0.02)
    add_box(f'{name}_Sill', (x + 0.16, y - height * 0.5 - 0.09, z), (0.5, 0.16, width + 0.42), MATS['FurnitureWood'], bevel=0.028)
    add_box(f'{name}_MuntinV', (x + 0.055, y, z), (0.13, height, 0.052), MATS['TrimPaint'], bevel=0.009)
    add_box(f'{name}_MuntinH', (x + 0.055, y, z), (0.13, 0.052, width), MATS['TrimPaint'], bevel=0.009)
    add_box(f'{name}_Catch', (x + 0.135, y - 0.025, z), (0.035, 0.035, 0.15), MATS['Brass'], bevel=0.007)


def table(name, x, z, width, depth, height=0.86):
  # Separate boards, breadboard ends, pegged joinery, and turned legs create
  # readable highlights at gameplay distance without bloating the collider.
  board_count = 4
  board_depth = depth / board_count
  for index in range(board_count):
    board_z = z - depth * 0.5 + board_depth * (index + 0.5)
    add_box(
      f'{name}_TopBoard_{index}',
      (x, height - 0.07, board_z),
      (width - 0.16, 0.14, board_depth - 0.012),
      MATS['FurnitureWood'],
      bevel=0.028,
    )
  for side in (-1, 1):
    add_box(
      f'{name}_Breadboard_{side}',
      (x + side * (width * 0.5 - 0.065), height - 0.07, z),
      (0.13, 0.145, depth),
      MATS['OldPine'],
      bevel=0.026,
    )
  apron_y = height - 0.22
  add_box(f'{name}_ApronFront', (x, apron_y, z - depth * 0.5 + 0.08), (width - 0.3, 0.24, 0.09), MATS['OldPine'], bevel=0.014)
  add_box(f'{name}_ApronBack', (x, apron_y, z + depth * 0.5 - 0.08), (width - 0.3, 0.24, 0.09), MATS['OldPine'], bevel=0.014)
  add_box(f'{name}_ApronLeft', (x - width * 0.5 + 0.08, apron_y, z), (0.09, 0.24, depth - 0.3), MATS['OldPine'], bevel=0.014)
  add_box(f'{name}_ApronRight', (x + width * 0.5 - 0.08, apron_y, z), (0.09, 0.24, depth - 0.3), MATS['OldPine'], bevel=0.014)
  for sx in (-1, 1):
    for sz in (-1, 1):
      add_lathe(
        f'{name}_Leg_{sx}_{sz}',
        (x + sx * (width / 2 - 0.2), 0, z + sz * (depth / 2 - 0.18)),
        (
          (0.052, 0.02), (0.06, 0.08), (0.055, 0.18),
          (0.075, 0.27), (0.052, 0.36), (0.09, 0.48),
          (0.078, height - 0.18),
        ),
        MATS['CeilingTimber'],
        20,
      )
      add_sphere(
        f'{name}_Peg_{sx}_{sz}',
        (x + sx * (width / 2 - 0.2), height - 0.125, z + sz * (depth / 2 - 0.18)),
        0.024,
        MATS['DarkTimber'],
        (1, 0.35, 1),
      )
  add_box(f'{name}_StretcherLong', (x, 0.31, z), (width - 0.48, 0.068, 0.068), MATS['CeilingTimber'], bevel=0.014)
  add_box(f'{name}_StretcherCross', (x, 0.31, z), (0.068, 0.068, depth - 0.36), MATS['CeilingTimber'], bevel=0.014)


def panelled_door(name, position, width, height, depth, mat, orientation='front', yaw=0):
  """Build a framed four-panel timber door in either wall orientation."""
  x, y, z = position
  if orientation == 'front':
    add_box(f'{name}_Slab', position, (width, height, depth), mat, yaw=yaw, bevel=0.024)
    face_z = z + depth * 0.55
    for side in (-1, 1):
      add_box(f'{name}_Stile_{side}', (x + side * (width * 0.5 - 0.095), y, face_z), (0.15, height - 0.08, 0.045), MATS['FurnitureWood'], yaw=yaw, bevel=0.014)
    for index, rail_y in enumerate((y - height * 0.5 + 0.13, y - 0.23, y + 0.31, y + height * 0.5 - 0.13)):
      add_box(f'{name}_Rail_{index}', (x, rail_y, face_z), (width - 0.12, 0.14, 0.045), MATS['FurnitureWood'], yaw=yaw, bevel=0.014)
    for index, panel_y in enumerate((y - 0.62, y + 0.18, y + 0.69)):
      panel_h = 0.56 if index == 0 else 0.42
      add_box(f'{name}_InsetPanel_{index}', (x, panel_y, face_z + 0.012), (width - 0.34, panel_h, 0.028), MATS['OldPine'], yaw=yaw, bevel=0.025)
  else:
    add_box(f'{name}_Slab', position, (depth, height, width), mat, yaw=yaw, bevel=0.024)
    face_x = x + depth * 0.55
    for side in (-1, 1):
      add_box(f'{name}_Stile_{side}', (face_x, y, z + side * (width * 0.5 - 0.095)), (0.045, height - 0.08, 0.15), MATS['FurnitureWood'], yaw=yaw, bevel=0.014)
    for index, rail_y in enumerate((y - height * 0.5 + 0.13, y - 0.23, y + 0.31, y + height * 0.5 - 0.13)):
      add_box(f'{name}_Rail_{index}', (face_x, rail_y, z), (0.045, 0.14, width - 0.12), MATS['FurnitureWood'], yaw=yaw, bevel=0.014)
    for index, panel_y in enumerate((y - 0.62, y + 0.18, y + 0.69)):
      panel_h = 0.56 if index == 0 else 0.42
      add_box(f'{name}_InsetPanel_{index}', (face_x + 0.012, panel_y, z), (0.028, panel_h, width - 0.34), MATS['OldPine'], yaw=yaw, bevel=0.025)


def add_floor_surface(name, width, depth, mat):
  vertices = [
    game_to_blender((-width * 0.5, 0.025, -depth * 0.5)),
    game_to_blender((-width * 0.5, 0.025, depth * 0.5)),
    game_to_blender((width * 0.5, 0.025, depth * 0.5)),
    game_to_blender((width * 0.5, 0.025, -depth * 0.5)),
  ]
  mesh = bpy.data.meshes.new(name)
  mesh.from_pydata(vertices, [], [[0, 1, 2, 3]])
  mesh.update()
  uv_layer = mesh.uv_layers.new(name='UVMap')
  uv_values = ((0, 0), (0, depth / 2.35), (width / 2.35, depth / 2.35), (width / 2.35, 0))
  for loop_index, uv in zip(mesh.polygons[0].loop_indices, uv_values):
    uv_layer.data[loop_index].uv = uv
  obj = bpy.data.objects.new(name, mesh)
  bpy.context.scene.collection.objects.link(obj)
  obj.data.materials.append(mat)
  solidify = obj.modifiers.new('FloorThickness', 'SOLIDIFY')
  solidify.thickness = 0.12
  solidify.offset = -1
  bevel = obj.modifiers.new('FloorEdgeSoftness', 'BEVEL')
  bevel.width = 0.008
  bevel.segments = 2
  return obj


def add_front_image_plane(name, position, width, height, mat, thickness=0.012):
  """Create a front-facing wall image with one deliberate 0..1 UV island."""
  x, y, z = position
  vertices = [
    game_to_blender((x - width * 0.5, y - height * 0.5, z)),
    game_to_blender((x + width * 0.5, y - height * 0.5, z)),
    game_to_blender((x + width * 0.5, y + height * 0.5, z)),
    game_to_blender((x - width * 0.5, y + height * 0.5, z)),
  ]
  mesh = bpy.data.meshes.new(name)
  mesh.from_pydata(vertices, [], [[0, 1, 2, 3]])
  mesh.update()
  uv_layer = mesh.uv_layers.new(name='UVMap')
  for loop_index, uv in zip(mesh.polygons[0].loop_indices, ((0, 0), (1, 0), (1, 1), (0, 1))):
    uv_layer.data[loop_index].uv = uv
  obj = bpy.data.objects.new(name, mesh)
  bpy.context.scene.collection.objects.link(obj)
  obj.data.materials.append(mat)
  solidify = obj.modifiers.new('DampPaperThickness', 'SOLIDIFY')
  solidify.thickness = thickness
  solidify.offset = -0.5
  bevel = obj.modifiers.new('SoftPaperEdge', 'BEVEL')
  bevel.width = 0.004
  bevel.segments = 2
  return obj


def front_wall_with_openings(name, z, x_min, x_max, openings, mat, height, thickness=0.18):
  """Build a complete wall around explicit door/window apertures."""
  cursor = x_min
  for opening in sorted(openings, key=lambda item: item['center']):
    left = opening['center'] - opening['width'] / 2
    right = opening['center'] + opening['width'] / 2
    if left > cursor:
      add_box(f'{name}_Pier_{cursor:.2f}', ((cursor + left) / 2, height / 2, z), (left - cursor, height, thickness), mat, bevel=0.012)
    bottom = opening.get('bottom', 0)
    top = opening['top']
    if bottom > 0:
      add_box(f'{name}_SillPanel_{opening["center"]:.2f}', (opening['center'], bottom / 2, z), (opening['width'], bottom, thickness), mat)
    if top < height:
      add_box(f'{name}_Lintel_{opening["center"]:.2f}', (opening['center'], (top + height) / 2, z), (opening['width'], height - top, thickness), mat)
    cursor = right
  if cursor < x_max:
    add_box(f'{name}_Pier_{cursor:.2f}', ((cursor + x_max) / 2, height / 2, z), (x_max - cursor, height, thickness), mat, bevel=0.012)


def side_wall_with_openings(name, x, z_min, z_max, openings, mat, height, thickness=0.18):
  cursor = z_min
  for opening in sorted(openings, key=lambda item: item['center']):
    near = opening['center'] - opening['width'] / 2
    far = opening['center'] + opening['width'] / 2
    if near > cursor:
      add_box(f'{name}_Pier_{cursor:.2f}', (x, height / 2, (cursor + near) / 2), (thickness, height, near - cursor), mat, bevel=0.012)
    bottom = opening.get('bottom', 0)
    top = opening['top']
    if bottom > 0:
      add_box(f'{name}_SillPanel_{opening["center"]:.2f}', (x, bottom / 2, opening['center']), (thickness, bottom, opening['width']), mat)
    if top < height:
      add_box(f'{name}_Lintel_{opening["center"]:.2f}', (x, (top + height) / 2, opening['center']), (thickness, height - top, opening['width']), mat)
    cursor = far
  if cursor < z_max:
    add_box(f'{name}_Pier_{cursor:.2f}', (x, height / 2, (cursor + z_max) / 2), (thickness, height, z_max - cursor), mat, bevel=0.012)


def build_shell():
  width = BLUEPRINT['dimensions']['width']
  depth = BLUEPRINT['dimensions']['depth']
  ceiling = BLUEPRINT['dimensions']['ceiling']
  half_w = width / 2
  half_d = depth / 2
  wall_z = half_d - 0.1
  wall_x = half_w - 0.1
  public = MATS['PublicLimewash']

  # One continuous UV-authored floor keeps the scanned planks coherent across
  # the room. Individual beveled boxes previously produced black railway-track
  # gaps and restarted the same texture on every board.
  add_floor_surface('LawsonHouse_Floor', width, depth, MATS['HouseFloor'])
  # Low-frequency limewash prevents the painted-plank moire visible in the
  # earlier morning captures; modeled ties provide the ceiling rhythm.
  add_box('LawsonHouse_Ceiling', (0, ceiling + 0.03, 0), (width, 0.14, depth), MATS['CeilingLimewash'])

  window_bottom = 0.9
  window_top = 2.22
  front_openings = [
    {'center': -8.35, 'width': 1.5, 'bottom': window_bottom, 'top': window_top},
    {'center': -5.3, 'width': 1.4, 'bottom': 0, 'top': 2.42},
    {'center': -0.65, 'width': 1.6, 'bottom': window_bottom, 'top': window_top},
    {'center': 2.0, 'width': 1.5, 'bottom': window_bottom, 'top': window_top},
  ]
  front_wall_with_openings('FrontWall', wall_z, -half_w, half_w, front_openings, public, ceiling)
  side_wall_with_openings('WestWall', -wall_x, -half_d, half_d, [
    {'center': 3.0, 'width': 1.5, 'bottom': window_bottom, 'top': window_top},
    {'center': 6.2, 'width': 1.5, 'bottom': window_bottom, 'top': window_top},
  ], public, ceiling)
  add_box('EastWall', (wall_x, ceiling / 2, 0), (0.18, ceiling, depth), public, bevel=0.012)
  add_box('RearWall', (0, ceiling / 2, -wall_z), (width, ceiling, 0.18), MATS['PrivateLimewash'], bevel=0.012)

  # Four-room partitions with properly framed, closed doors.
  side_wall_with_openings('OfficePartition', 2.92, 0, half_d, [
    {'center': 5.1, 'width': 1.08, 'bottom': 0, 'top': 2.4},
  ], public, ceiling, 0.16)
  front_wall_with_openings('RearPartition', -0.08, -half_w, half_w, [
    {'center': -4.1, 'width': 1.08, 'bottom': 0, 'top': 2.4},
    {'center': 5.1, 'width': 1.08, 'bottom': 0, 'top': 2.4},
  ], public, ceiling, 0.16)
  add_box('RearRoomsPartition', (-0.08, ceiling / 2, -4.29), (0.16, ceiling, 8.42), MATS['PrivateLimewash'], bevel=0.012)
  add_box('OfficeTintPanel', (3.015, ceiling / 2, 4.25), (0.025, ceiling - 0.12, 8.3), MATS['OfficeLimewash'])
  add_box('StoreRawPanel', (0.015, ceiling / 2, -4.25), (0.025, ceiling - 0.12, 8.3), MATS['LimewashedBoards'])

  panelled_door('OfficeDoor', (2.82, 1.2, 5.1), 1.04, 2.4, 0.12, MATS['OldPine'], 'side')
  panelled_door('PrivateDoor', (-4.1, 1.2, -0.01), 1.04, 2.4, 0.12, MATS['OldPine'])
  panelled_door('StoreDoor', (5.1, 1.2, -0.01), 1.04, 2.4, 0.12, MATS['LimewashedBoards'])
  for door_name, knob in (
    ('Office', (2.74, 1.18, 4.75)),
    ('Private', (-3.76, 1.18, 0.07)),
    ('Store', (4.76, 1.18, 0.07)),
  ):
    add_sphere(f'{door_name}DoorKnob', knob, 0.052, MATS['Brass'])

  # Open front door, complete frame, and threshold.
  panelled_door('FrontDoor', (-5.98, 1.21, wall_z - 0.68), 1.34, 2.42, 0.12, MATS['OldPine'], 'side', -0.08)
  add_sphere('FrontDoorLatch', (-5.89, 1.14, wall_z - 1.08), 0.055, MATS['Brass'])
  add_box('FrontThreshold', (-5.3, 0.09, wall_z), (1.58, 0.18, 0.34), MATS['DarkTimber'], bevel=0.025)
  for x in (-6.06, -4.54):
    add_box(f'FrontDoorJamb_{x}', (x, 1.25, wall_z - 0.03), (0.11, 2.5, 0.28), MATS['DarkTimber'], bevel=0.018)
  add_box('FrontDoorHeader', (-5.3, 2.49, wall_z - 0.03), (1.62, 0.14, 0.28), MATS['DarkTimber'], bevel=0.018)

  simple_window('CallingWindow', -8.35, 1.56, wall_z - 0.11, 1.5, 1.32)
  simple_window('DiningWindowA', -0.65, 1.56, wall_z - 0.11, 1.6, 1.32)
  simple_window('DiningWindowB', 2.0, 1.56, wall_z - 0.11, 1.5, 1.32)
  simple_window('GardenWindowA', -wall_x + 0.11, 1.56, 3.0, 1.5, 1.32, 'side')
  simple_window('GardenWindowB', -wall_x + 0.11, 1.56, 6.2, 1.5, 1.32, 'side')
  for x in (-8.35, -0.65, 2.0):
    add_box(f'FrontShutterLeft_{x}', (x - 1.02, 1.56, wall_z - 0.14), (0.42, 1.42, 0.07), MATS['DadoPaint'], bevel=0.018)
    add_box(f'FrontShutterRight_{x}', (x + 1.02, 1.56, wall_z - 0.14), (0.42, 1.42, 0.07), MATS['DadoPaint'], bevel=0.018)

  # Human-scale framing and a restrained damp line—no ship-cabin wall reuse.
  # Split each tie across the public suite and office instead of spanning the
  # full 21 m shell as a thin black rod.
  for index, z in enumerate((-7.0, -3.5, 0, 3.5, 7.0)):
    add_box(f'LawsonHouse_CeilingBeam_Public_{index}', (-3.75, ceiling - 0.13, z), (13.1, 0.22, 0.24), MATS['CeilingTimber'], bevel=0.025)
    add_box(f'LawsonHouse_CeilingBeam_Office_{index}', (6.75, ceiling - 0.13, z), (7.1, 0.2, 0.22), MATS['CeilingTimber'], bevel=0.022)
  add_box('LawsonHouse_CeilingWallPlate_Front', (-3.75, ceiling - 0.24, 8.22), (13.2, 0.28, 0.18), MATS['CeilingTimber'], bevel=0.02)
  add_box('LawsonHouse_CeilingWallPlate_Rear', (-3.75, ceiling - 0.24, 0.16), (13.2, 0.28, 0.18), MATS['CeilingTimber'], bevel=0.02)
  for z in (0.18, 2.9, 5.6, 8.18):
    add_box(f'LawsonHouse_PartitionPost_{z}', (2.76, ceiling * 0.5, z), (0.2, ceiling - 0.12, 0.2), MATS['CeilingTimber'], bevel=0.02)
  # A plain grey-green painted dado gives the public suite a domestic identity
  # without implying imported wallpaper in the damp highland settlement.
  for index, (left, right) in enumerate((
    (-10.5, -9.1), (-7.6, -6.0), (-4.6, -1.45), (0.15, 1.25), (2.75, 10.5),
  )):
    add_box(f'FrontDado_{index}', ((left + right) / 2, 0.44, wall_z - 0.105), (right - left, 0.86, 0.035), MATS['DadoPaint'])
  for index, (near, far) in enumerate(((0, 2.25), (3.75, 5.45), (6.95, 8.5))):
    add_box(f'WestDado_{index}', (-wall_x + 0.105, 0.44, (near + far) / 2), (0.035, 0.86, far - near), MATS['DadoPaint'])
  add_box('OfficeDado', (2.805, 0.44, 2.25), (0.035, 0.86, 4.3), MATS['DadoPaint'])
  for index, (left, right) in enumerate(((-10.5, -4.64), (-3.56, 2.92), (2.92, 4.56), (5.64, 10.5))):
    add_box(f'RearDado_{index}', ((left + right) / 2, 0.44, 0.025), (right - left, 0.86, 0.035), MATS['DadoPaint'])

  for index, (left, right) in enumerate((
    (-10.3, -9.1), (-7.6, -6.0), (-4.6, -1.45), (0.15, 1.25), (2.75, 10.3),
  )):
    add_box(f'FrontChairRail_{index}', ((left + right) / 2, 0.92, wall_z - 0.13), (right - left, 0.1, 0.1), MATS['FurnitureWood'], bevel=0.018)
  for index, (near, far) in enumerate(((0, 2.25), (3.75, 5.45), (6.95, 8.3))):
    add_box(f'WestChairRail_{index}', (-wall_x + 0.13, 0.92, (near + far) / 2), (0.1, 0.1, far - near), MATS['FurnitureWood'], bevel=0.018)
  for index, (left, right) in enumerate(((-10.3, -4.64), (-3.56, 2.8))):
    add_box(f'RearChairRail_{index}', ((left + right) / 2, 0.92, 0.04), (right - left, 0.1, 0.1), MATS['FurnitureWood'], bevel=0.018)
  for index, (left, right) in enumerate(((-10.3, -6.0), (-4.6, 10.3))):
    add_box(f'FrontBaseboard_{index}', ((left + right) / 2, 0.12, wall_z - 0.14), (right - left, 0.22, 0.12), MATS['DarkTimber'], bevel=0.012)
  add_box('WestBaseboard', (-wall_x + 0.14, 0.12, 4.15), (0.12, 0.22, 8.3), MATS['DarkTimber'], bevel=0.012)
  for index, (left, right) in enumerate(((-10.3, -4.64), (-3.56, 4.56), (5.64, 10.3))):
    add_box(f'RearBaseboard_{index}', ((left + right) / 2, 0.12, 0.05), (right - left, 0.22, 0.12), MATS['DarkTimber'], bevel=0.012)
  add_box('WestDampBand', (-wall_x + 0.025, 0.17, 1.2), (0.022, 0.24, 4.8), MATS['WetEarth'])
  for x, z in ((-8.75, 4.9), (-5.8, 6.77), (1.1, 6.77)):
    add_box(f'RustBloom_{x}_{z}', (x, 0.38, z), (0.03, 0.14, 0.03), MATS['Rust'])

  build_fixed_furniture()
  build_veranda_diorama()


def build_fixed_furniture():
  table('DiningTable', -2.35, 2.05, 2.8, 1.2, 0.84)
  table('CallingTable', -9.05, 6.35, 1.55, 0.58, 0.76)
  add_sagged_panel('DiningTableRunner', (-2.35, 0.858, 2.05), 0.72, 1.1, MATS['IndigoCloth'], sag=0.008, x_segments=8, z_segments=12, thickness=0.012)

  # Three restrained place settings give the dining group believable scale and
  # surface complexity. Thin lathed plates, pewter cutlery, and folded linen
  # replace the earlier handful of oversized blockout objects.
  place_settings = (
    ('West', -3.28, 2.04, 0),
    ('East', -1.42, 2.04, math.pi),
    ('North', -2.35, 2.48, -math.pi / 2),
  )
  for label, x, z, yaw in place_settings:
    add_lathe(
      f'DiningPlate_{label}',
      (x, 0.858, z),
      ((0.09, 0), (0.18, 0.008), (0.235, 0.022), (0.25, 0.038)),
      MATS['CreamCeramic'],
      36,
    )
    add_torus(f'DiningPlateRim_{label}', (x, 0.896, z), 0.235, 0.01, MATS['Earthenware'])
    add_sagged_panel(
      f'DiningNapkin_{label}',
      (x + math.cos(yaw) * 0.02, 0.904, z + math.sin(yaw) * 0.02),
      0.24,
      0.18,
      MATS['Canvas'],
      sag=0.006,
      yaw=yaw + 0.08,
      x_segments=5,
      z_segments=4,
      thickness=0.008,
    )
    # Knife and spoon are deliberately thin but broad enough to catch the
    # rectangular window highlights at the normal third-person distance.
    utensil_x = x + math.cos(yaw) * 0.34
    utensil_z = z + math.sin(yaw) * 0.34
    beam_between(
      f'DiningKnife_{label}',
      (utensil_x - math.sin(yaw) * 0.13, 0.91, utensil_z + math.cos(yaw) * 0.13),
      (utensil_x + math.sin(yaw) * 0.13, 0.91, utensil_z - math.cos(yaw) * 0.13),
      0.009,
      MATS['Pewter'],
      10,
    )
    spoon_x = x - math.cos(yaw) * 0.34
    spoon_z = z - math.sin(yaw) * 0.34
    beam_between(
      f'DiningSpoonStem_{label}',
      (spoon_x - math.sin(yaw) * 0.1, 0.91, spoon_z + math.cos(yaw) * 0.1),
      (spoon_x + math.sin(yaw) * 0.1, 0.91, spoon_z - math.cos(yaw) * 0.1),
      0.008,
      MATS['Pewter'],
      10,
    )
    add_sphere(
      f'DiningSpoonBowl_{label}',
      (spoon_x + math.sin(yaw) * 0.13, 0.912, spoon_z - math.cos(yaw) * 0.13),
      0.025,
      MATS['Pewter'],
      (0.55, 0.18, 1.15),
    )

  # Open Welsh-dresser construction replaces the monolithic cupboard block.
  add_box('DresserBack', (-10.13, 0.94, 1.65), (0.12, 1.88, 2.36), MATS['OldPine'], bevel=0.022)
  add_box('DresserLowerCarcass', (-9.91, 0.42, 1.65), (0.55, 0.78, 2.3), MATS['FurnitureWood'], bevel=0.032)
  for z in (0.55, 2.75):
    add_lathe('DresserColumn_' + str(z), (-9.58, 0.78, z), ((0.045, 0), (0.06, 0.08), (0.04, 0.34), (0.065, 0.68), (0.05, 1.02)), MATS['CeilingTimber'], 18)
  for y in (0.82, 1.18, 1.54):
    add_box(f'DresserShelf_{y}', (-9.76, y, 1.65), (0.66, 0.07, 2.34), MATS['FurnitureWood'], bevel=0.018)
  for row, y in enumerate((0.72, 1.26)):
    for z in (1.18, 2.12):
      add_sphere(f'DresserPlate_{row}_{z}', (-9.49, y + 0.24, z), 0.18, MATS['CreamCeramic'], (0.1, 1, 1))
      add_sphere(f'DresserPlateWell_{row}_{z}', (-9.47, y + 0.24, z), 0.11, MATS['Earthenware'], (0.07, 1, 1))
  add_box('DresserCrown', (-9.91, 1.9, 1.65), (0.78, 0.12, 2.52), MATS['FurnitureWood'], bevel=0.035)
  for z in (1.12, 2.18):
    add_box(f'DresserLowerDoor_{z}', (-9.59, 0.39, z), (0.055, 0.58, 0.9), MATS['OldPine'], bevel=0.026)
    for offset in (-0.32, 0.32):
      add_box(f'DresserDoorStile_{z}_{offset}', (-9.55, 0.39, z + offset), (0.035, 0.5, 0.08), MATS['FurnitureWood'], bevel=0.01)
    add_sphere(f'DresserDoorPull_{z}', (-9.51, 0.42, z), 0.035, MATS['Brass'])
  for x in (-10.08, -9.72):
    for z in (0.72, 2.58):
      add_lathe(f'DresserFoot_{x}_{z}', (x, 0, z), ((0.04, 0.02), (0.055, 0.08), (0.042, 0.19), (0.065, 0.27)), MATS['CeilingTimber'], 16)

  # Lawson's fixed armchair now reads as assembled furniture: turned legs,
  # splayed rear posts, curved arm rails, spindles, and a lightly sagged seat.
  add_box('ArmchairSeatFrame', (-8.25, 0.48, 4.6), (0.76, 0.12, 0.72), MATS['FurnitureWood'], yaw=0.25, bevel=0.032)
  add_sagged_panel('ArmchairCushion', (-8.25, 0.585, 4.6), 0.66, 0.6, MATS['IndigoCloth'], sag=0.025, yaw=0.25, x_segments=8, z_segments=8, thickness=0.06)
  for x in (-8.55, -7.95):
    for z in (4.34, 4.86):
      add_lathe(f'ArmchairLeg_{x}_{z}', (x, 0, z), ((0.038, 0.02), (0.052, 0.09), (0.042, 0.24), (0.06, 0.46)), MATS['CeilingTimber'], 18)
  for x in (-8.57, -7.93):
    beam_between(f'ArmchairBackPost_{x}', (x, 0.44, 4.34), (x + (-0.04 if x < -8.2 else 0.04), 1.28, 4.25), 0.045, MATS['CeilingTimber'], 16)
    beam_between(f'ArmchairArmFront_{x}', (x, 0.69, 4.88), (x, 0.78, 4.62), 0.038, MATS['FurnitureWood'], 16)
    beam_between(f'ArmchairArmRear_{x}', (x, 0.78, 4.62), (x, 0.88, 4.31), 0.038, MATS['FurnitureWood'], 16)
  add_box('ArmchairCrest', (-8.25, 1.27, 4.24), (0.78, 0.11, 0.11), MATS['FurnitureWood'], yaw=0.25, bevel=0.045)
  for index, x in enumerate((-8.47, -8.36, -8.25, -8.14, -8.03)):
    beam_between(f'ArmchairBackSpindle_{index}', (x, 0.58, 4.31), (x, 1.2 + (0.03 if index == 2 else 0), 4.25), 0.018, MATS['OldPine'], 12)

  # Sea chest and restrained coat pegs keep the receiving area legible. The
  # earlier slab-like coat and guitar crowded the west windows and read as a
  # pile of intersecting blockout meshes, so they are deliberately omitted.
  add_box('SeaChestBody', (-7.65, 0.28, 7.3), (1.25, 0.56, 0.7), MATS['OldPine'], yaw=0.08, bevel=0.05)
  for x in (-8.05, -7.65, -7.25):
    add_box(f'SeaChestStrap_{x}', (x, 0.32, 7.3), (0.055, 0.62, 0.74), MATS['Iron'], yaw=0.08, bevel=0.008)
  add_box('PegRail', (-10.31, 1.88, 3.9), (0.12, 0.16, 1.65), MATS['DarkTimber'], bevel=0.025)
  for z in (3.4, 3.9, 4.4):
    beam_between(f'CoatPeg_{z}', (-10.25, 1.85, z), (-9.99, 1.85, z), 0.035, MATS['DarkTimber'], 10)
  # Wall chart, calling cards, and clumped salt.
  add_box('BoundaryMapPaper', (-10.34, 1.78, 0.1), (0.035, 0.92, 1.3), MATS['ArrowsmithMap'], bevel=0.018)
  # A real document face replaces the blocky geometric lines used in the
  # blockout. The portrait ratio, restrained frame, and damp paper edge read at
  # gameplay distance without becoming an oversized UI icon on the wall.
  notice_width = 0.72
  notice_height = 1.08
  add_front_image_plane('OfficialNoticePaper', (-1.25, 1.72, 0.075), notice_width, notice_height, MATS['OfficialAppointmentNotice'])
  add_box('OfficialNoticeFrameTop', (-1.25, 2.3, 0.095), (0.86, 0.07, 0.07), MATS['DarkTimber'], bevel=0.012)
  add_box('OfficialNoticeFrameBottom', (-1.25, 1.14, 0.095), (0.86, 0.07, 0.07), MATS['DarkTimber'], bevel=0.012)
  for x in (-1.68, -0.82):
    add_box(f'OfficialNoticeFrameSide_{x}', (x, 1.72, 0.095), (0.07, 1.22, 0.07), MATS['DarkTimber'], bevel=0.012)
  add_box('CallingCards', (-9.05, 0.81, 6.35), (0.55, 0.025, 0.34), MATS['Paper'], yaw=-0.12, bevel=0.008)
  add_cylinder('SaltJar', (-3.25, 0.92, 1.85), 0.11, 0.24, MATS['CreamCeramic'], 16)
  for index, offset in enumerate((-0.045, 0.01, 0.06)):
    add_sphere(f'ClumpedSalt_{index}', (-3.25 + offset, 1.06, 1.85), 0.055, MATS['Paper'], (1, 0.55, 1))
  # Shared oil-lamp GLBs are placed by the interior blueprint. Keeping them out
  # of this monolithic shell lets Lawson and the Beagle share the same improved
  # brass, glass, burner, wick, and chimney construction.

  # A small woven mat makes the threshold legible and leaves a generous,
  # uninterrupted route from the door to all three internal doors.
  add_sagged_panel('EntryCoirMat', (-5.3, 0.035, 7.15), 1.5, 0.82, MATS['Canvas'], sag=0.008, x_segments=14, z_segments=8, thickness=0.018)
  for index in range(11):
    beam_between(f'EntryMatFringeN_{index}', (-5.96 + index * 0.132, 0.035, 6.7), (-5.96 + index * 0.132, 0.035, 6.61), 0.008, MATS['Canvas'], 6)
    beam_between(f'EntryMatFringeS_{index}', (-5.96 + index * 0.132, 0.035, 7.6), (-5.96 + index * 0.132, 0.035, 7.69), 0.008, MATS['Canvas'], 6)

  # A quiet woven mat visually binds the receiving furniture without spilling
  # into the clear circulation line from the front door to the inner doors.
  add_sagged_panel('ReceivingMat', (-8.25, 0.03, 5.1), 2.35, 2.15, MATS['IndigoCloth'], sag=0.01, x_segments=16, z_segments=14, thickness=0.018)


def build_veranda_diorama():
  add_box('ExteriorVeranda', (0, -0.05, 9.65), (21, 0.12, 2.25), MATS['HouseFloor'])
  add_box('ExteriorVerandaRoof', (0, 3.25, 9.75), (21.4, 0.16, 2.7), MATS['LimewashedBoards'], bevel=0.025)
  add_box('ExteriorVerandaFascia', (0, 3.08, 10.92), (21.4, 0.28, 0.16), MATS['CeilingTimber'], bevel=0.02)
  for x in (-10.1, -6.7, -3.3, 0.1, 3.5, 6.9, 10.1):
    add_cylinder(f'VerandaPost_{x}', (x, 1.55, 10.28), 0.07, 3.1, MATS['DarkTimber'], 12)
  add_box('ExteriorWetGround', (0, -0.18, 14.6), (29, 0.15, 9.5), MATS['WetEarth'])
  # One restrained near-haze veil leaves the shared sky and cloud atmosphere
  # visible beyond it. The old second emissive card clipped the entire opening
  # to white and reduced every tree to a black cardboard silhouette.
  add_box('ExteriorFrontMistNear', (0, 1.8, 18.7), (29, 3.7, 0.035), MATS['HighlandMistNear'])
  for index, x in enumerate((-10, -7, -4, 4, 7, 10)):
    add_cylinder(f'ExteriorFencePost_{index}', (x, 0.55, 12.1), 0.07, 1.1, MATS['OldPine'], 10)
  add_box('ExteriorFenceRail', (0, 0.5, 12.1), (21, 0.1, 0.1), MATS['OldPine'])
  for index, (x, z, scale) in enumerate(((-8, 13.5, 1.1), (-4.5, 14.3, 0.8), (4.6, 13.8, 0.9), (8.5, 14.7, 1.2))):
    add_sphere(f'ExteriorGardenMass_{index}', (x, 0.35 * scale, z), 0.75 * scale, MATS['LeafNear'], (1.4, 0.7, 1))
    for leaf_index, angle in enumerate((-0.75, -0.2, 0.35, 0.9)):
      leaf_x = x + math.sin(angle) * 0.5 * scale
      leaf_z = z + math.cos(angle) * 0.35 * scale
      leaf = add_box(f'ExteriorGardenLeaf_{index}_{leaf_index}', (leaf_x, 0.58 * scale, leaf_z), (0.16 * scale, 0.68 * scale, 0.34 * scale), MATS['LeafNear'], yaw=angle, bevel=0.06)
      leaf.rotation_euler[0] = angle * 0.22
  for index, (x, z, scale) in enumerate(((-8.8, 16.2, 1.0), (-2.8, 17.0, 1.25), (3.4, 16.4, 0.92), (9.2, 17.1, 1.18))):
    add_cylinder(f'ExteriorScalesiaTrunk_{index}', (x, 1.05 * scale, z), 0.09 * scale, 2.1 * scale, MATS['DarkTimber'], 12)
    for crown, offset in enumerate(((-0.42, 0.06), (0.12, 0.0), (0.52, -0.08))):
      add_sphere(f'ExteriorScalesiaCrown_{index}_{crown}', (x + crown * 0.26, 2.1 * scale + offset[1], z + offset[0]), 0.62 * scale, MATS['LeafMiddle'], (1.2, 0.72, 1))
  for index, (x, z, scale) in enumerate(((-10.4, 16.6, 1.3), (-6.7, 17.7, 0.9), (6.3, 17, 1.2), (10.6, 17.9, 1.5))):
    add_sphere(f'ExteriorBasalt_{index}', (x, 0.4 * scale, z), 0.55 * scale, MATS['Basalt'], (1.3, 0.75, 1))

  # Side-window diorama: close enough to register as vegetation and wet soil,
  # but clear of the playable shell and never mistaken for an interior wall.
  add_box('ExteriorWestGround', (-13.4, -0.16, 3.9), (5.7, 0.13, 17.5), MATS['WetGrass'])
  add_box('ExteriorWestMistNear', (-17.0, 1.95, 3.9), (0.035, 3.9, 17.5), MATS['HighlandMistNear'])
  for index, (x, z, scale) in enumerate(((-12.1, 1.5, 0.65), (-13.4, 2.8, 0.9), (-12.6, 4.6, 0.72), (-14.1, 6.1, 1.0), (-12.3, 7.3, 0.6))):
    add_sphere(f'ExteriorWestFern_{index}', (x, 0.32 * scale, z), 0.7 * scale, MATS['LeafNear' if x > -13 else 'LeafMiddle'], (1.35, 0.65, 1))


def join_by_material():
  buckets = {}
  for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH' or not obj.data.materials:
      continue
    # Top view hides ceiling-named nodes. Keep them out of material joins so
    # the ceiling cutaway never takes walls or furnishings with it.
    if 'Ceiling' in obj.name:
      continue
    key = obj.data.materials[0].name if len(obj.data.materials) == 1 else obj.name
    buckets.setdefault(key, []).append(obj)
  for objects in buckets.values():
    if len(objects) < 2:
      continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
      obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()


def export_scene(path):
  path.parent.mkdir(parents=True, exist_ok=True)
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', export_apply=True)
  print(f'exported {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB)')


def procedural_chair_fallback():
  add_box('ChairSeatFrame', (0, 0.48, 0), (0.62, 0.11, 0.54), MATS['FurnitureWood'], bevel=0.035)
  for x in (-0.25, 0.25):
    for z in (-0.21, 0.21):
      beam_between(
        f'ChairLeg_{x}_{z}',
        (x * 1.12, 0.03, z * 1.12),
        (x, 0.45, z),
        0.038,
        MATS['CeilingTimber'],
        12,
      )
  for x in (-0.26, 0.26):
    beam_between(f'ChairBackPost_{x}', (x, 0.45, 0.22), (x * 1.1, 1.08, 0.25), 0.04, MATS['CeilingTimber'], 12)
  for index, y in enumerate((0.68, 0.86, 1.03)):
    beam_between(f'ChairBackRail_{index}', (-0.265, y, 0.245), (0.265, y + (0.01 if index == 1 else 0), 0.245), 0.026, MATS['OldPine'], 12)
  add_box('ChairRushSeat', (0, 0.555, 0), (0.53, 0.045, 0.45), MATS['Canvas'], bevel=0.018)
  for index in range(7):
    add_box(f'ChairRushStrand_{index}', (-0.225 + index * 0.075, 0.58, 0), (0.018, 0.008, 0.43), MATS['Paper'])
  add_box('ChairFrontStretcher', (0, 0.23, -0.23), (0.5, 0.052, 0.052), MATS['OldPine'], bevel=0.012)


def prop_chair():
  """Normalize the CC0 scanned chair while retaining its authored UVs/maps."""
  if not CHAIR_SOURCE.exists():
    procedural_chair_fallback()
    return
  before = set(bpy.context.scene.objects)
  bpy.ops.import_scene.gltf(filepath=str(CHAIR_SOURCE))
  imported = [obj for obj in bpy.context.scene.objects if obj not in before]
  meshes = [obj for obj in imported if obj.type == 'MESH']
  if not meshes:
    procedural_chair_fallback()
    return
  for index, obj in enumerate(meshes):
    obj.name = f'LawsonPaintedDiningChair_{index}'
    for material_slot in obj.material_slots:
      if material_slot.material:
        material_slot.material = MATS['PaintedChair']
  root = bpy.data.objects.new('LawsonPaintedDiningChairRoot', None)
  bpy.context.scene.collection.objects.link(root)
  imported_set = set(imported)
  for obj in imported:
    if obj.parent not in imported_set:
      obj.parent = root
  bpy.context.view_layer.update()

  def bounds():
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    return (
      Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points))),
      Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points))),
    )

  minimum, maximum = bounds()
  root.scale = (1.06 / max(0.001, maximum.z - minimum.z),) * 3
  bpy.context.view_layer.update()
  minimum, maximum = bounds()
  root.location.x -= (minimum.x + maximum.x) * 0.5
  root.location.y -= (minimum.y + maximum.y) * 0.5
  root.location.z -= minimum.z
  bpy.context.view_layer.update()


def prop_stool():
  add_sagged_panel('StoolCanvas', (0, 0.59, 0), 0.68, 0.5, MATS['IndigoCloth'], sag=0.055, x_segments=10, z_segments=8, thickness=0.026)
  for edge in (-1, 1):
    add_box(f'StoolLeatherEdge_{edge}', (edge * 0.315, 0.57, 0), (0.04, 0.045, 0.49), MATS['Leather'], bevel=0.012)
  for side in (-1, 1):
    board_between(f'StoolFrameA_{side}', (side * 0.26, 0.035, -0.25), (side * 0.26, 0.57, 0.23), 0.065, 0.047, MATS['OldPine'])
    board_between(f'StoolFrameB_{side}', (side * 0.26, 0.035, 0.25), (side * 0.26, 0.57, -0.23), 0.065, 0.047, MATS['OldPine'])
    add_cylinder(f'StoolPivot_{side}', (side * 0.292, 0.32, 0), 0.052, 0.032, MATS['Brass'], 24, rotation=(0, 0, math.pi / 2))
    add_sphere(f'StoolPivotCap_{side}', (side * 0.312, 0.32, 0), 0.027, MATS['Brass'], (0.34, 1, 1))
    for z in (-0.25, 0.25):
      add_box(f'StoolFoot_{side}_{z}', (side * 0.26, 0.025, z), (0.09, 0.045, 0.08), MATS['Iron'], bevel=0.012)
  beam_between('StoolCrossBrace', (-0.26, 0.31, 0), (0.26, 0.31, 0), 0.024, MATS['Iron'], 12)


def prop_bottle():
  add_lathe('BottleHandBlownBody', (0, 0, 0), (
    (0.09, 0.02), (0.125, 0.045), (0.135, 0.12), (0.13, 0.38),
    (0.12, 0.48), (0.07, 0.56), (0.052, 0.64), (0.052, 0.72),
  ), MATS['BottleGlass'], 32)
  add_torus('BottleLip', (0, 0.72, 0), 0.055, 0.012, MATS['BottleGlass'])
  add_torus('BottlePunt', (0, 0.026, 0), 0.065, 0.012, MATS['BottleGlass'])
  add_cylinder('BottleCork', (0, 0.745, 0), 0.048, 0.07, MATS['OldPine'], 16)
  add_box('BottleLabel', (0, 0.31, -0.134), (0.19, 0.18, 0.009), MATS['Paper'], yaw=0.025, bevel=0.012)
  for index, y in enumerate((0.35, 0.31, 0.27)):
    add_box(f'BottleLabelInk_{index}', (0, y, -0.14), (0.1 - index * 0.018, 0.008, 0.004), MATS['Ink'], bevel=0.003)


def prop_mug():
  add_lathe('MugBody', (0, 0, 0), ((0.082, 0.01), (0.102, 0.035), (0.108, 0.2), (0.116, 0.24)), MATS['Pewter'], 28)
  add_torus('MugRolledRim', (0, 0.24, 0), 0.112, 0.012, MATS['Pewter'])
  add_cylinder('MugDarkOpening', (0, 0.239, 0), 0.092, 0.008, MATS['Ink'], 28)
  add_torus('MugHandle', (0.11, 0.13, 0), 0.09, 0.025, MATS['Pewter'], rotation=(0, math.pi / 2, 0))
  add_box('MugHandleJoinTop', (0.102, 0.19, 0), (0.06, 0.028, 0.04), MATS['Pewter'], bevel=0.01)
  add_box('MugHandleJoinBottom', (0.102, 0.07, 0), (0.06, 0.028, 0.04), MATS['Pewter'], bevel=0.01)


def prop_bowl():
  add_lathe('ServingBowl', (0, 0, 0), ((0.12, 0.01), (0.2, 0.035), (0.27, 0.11), (0.3, 0.19)), MATS['Earthenware'], 34)
  add_torus('ServingBowlRim', (0, 0.19, 0), 0.3, 0.022, MATS['CreamCeramic'])
  add_cylinder('ServingBowlInterior', (0, 0.17, 0), 0.255, 0.012, MATS['DarkTimber'], 34)
  for index, (x, z) in enumerate(((-0.1, -0.03), (0.06, 0.04), (0.12, -0.08), (-0.03, 0.1))):
    add_sphere(f'SweetPotato_{index}', (x, 0.22, z), 0.09, MATS['MaizeBread'], (1.25, 0.72, 0.82))


def prop_chart():
  add_sagged_panel('FoldedChart', (0, 0.035, 0), 0.62, 0.42, MATS['ArrowsmithMap'], sag=0.012, yaw=0.03, x_segments=12, z_segments=9, thickness=0.012)
  for x in (-0.2, 0, 0.2):
    add_box(f'ChartFold_{x}', (x, 0.045, 0), (0.009, 0.008, 0.39), MATS['Paper'], bevel=0.002)


def prop_ledger():
  add_box('LedgerPages', (0, 0.065, 0), (0.56, 0.13, 0.76), MATS['Paper'], bevel=0.018)
  for index in range(7):
    add_box(f'LedgerPageLayer_{index}', (0.03, 0.018 + index * 0.016, 0.388), (0.5, 0.006, 0.008), MATS['Paper'], bevel=0.002)
  add_box('LedgerLowerCover', (0, -0.005, 0), (0.62, 0.045, 0.82), MATS['Leather'], bevel=0.025)
  add_box('LedgerUpperCover', (0.01, 0.145, -0.01), (0.62, 0.045, 0.82), MATS['Leather'], yaw=-0.018, bevel=0.025)
  add_lathe('LedgerSpine', (-0.3, -0.005, 0), ((0.035, 0), (0.05, 0.05), (0.052, 0.14), (0.035, 0.2)), MATS['DarkTimber'], 16)
  add_box('LedgerLabel', (0.06, 0.171, -0.04), (0.3, 0.008, 0.21), MATS['Paper'], yaw=-0.018, bevel=0.008)
  add_box('LedgerLabelInk', (0.06, 0.179, -0.04), (0.18, 0.004, 0.016), MATS['Ink'], yaw=-0.018, bevel=0.002)


def build_all():
  clear_scene()
  init_materials()
  build_shell()
  join_by_material()
  export_scene(SHELL_OUT)

  prop_builders = {
    'dining-chair.glb': prop_chair,
    'campaign-stool.glb': prop_stool,
    'rum-bottle.glb': prop_bottle,
    'tin-mug.glb': prop_mug,
    'serving-bowl.glb': prop_bowl,
    'folded-chart.glb': prop_chart,
    'supply-ledger.glb': prop_ledger,
  }
  for filename, builder in prop_builders.items():
    clear_scene()
    init_materials()
    builder()
    export_scene(PROP_OUT / filename)


build_all()
