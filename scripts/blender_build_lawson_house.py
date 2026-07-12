"""Build Nicholas Lawson's four-room house shell and entrance-room props.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --disable-autoexec --python scripts/blender_build_lawson_house.py

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


def init_materials():
  pbr_material('HouseFloor', TEXTURES, 'wood-planks-diff-1k.jpg', 'wood-planks-rough-1k.jpg', 'wood-planks-normal-1k.jpg', (2.1, 3.8, 1), '#9a785c', 0.48)
  pbr_material('PublicLimewash', TEXTURES, 'limewash-diff-1k.jpg', 'limewash-rough-1k.jpg', 'limewash-normal-1k.jpg', (3.6, 2.2, 1), '#eadfbd', 0.28)
  pbr_material('OfficeLimewash', TEXTURES, 'limewash-diff-1k.jpg', 'limewash-rough-1k.jpg', 'limewash-normal-1k.jpg', (3.6, 2.2, 1), '#aeb7a2', 0.24)
  pbr_material('PrivateLimewash', TEXTURES, 'limewash-diff-1k.jpg', 'limewash-rough-1k.jpg', 'limewash-normal-1k.jpg', (3.6, 2.2, 1), '#c6ac83', 0.22)
  pbr_material('LimewashedBoards', SHARED_TEXTURES, 'painted-planks-diff-1k.jpg', 'painted-planks-rough-1k.jpg', 'painted-planks-normal-1k.jpg', (1.25, 1.25, 1), '#9c957d', 0.2)
  pbr_material('FurnitureWood', SHARED_TEXTURES, 'varnished-oak-diff-1k.jpg', 'varnished-oak-rough-1k.jpg', 'varnished-oak-normal-1k.jpg', (1.3, 1.3, 1), '#87664d', 0.32)
  material('DarkTimber', '#34271e', 0.86)
  material('OldPine', '#725037', 0.88)
  material('Iron', '#302f2b', 0.48, 0.68)
  material('Rust', '#7a351f', 0.94, 0.08)
  material('Brass', '#a57635', 0.3, 0.72)
  material('Pewter', '#7e817c', 0.46, 0.58)
  material('BottleGlass', '#334a38', 0.18, 0.03, 0.42)
  material('WindowGlass', '#abc2ba', 0.12, 0, 0.12)
  material('Canvas', '#a99b76', 0.98)
  material('IndigoCloth', '#31485a', 0.94)
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


def simple_window(name, x, y, z, width, height, orientation='front'):
  if orientation == 'front':
    add_box(f'{name}_Glass', (x, y, z), (width, height, 0.025), MATS['WindowGlass'])
    for bx in (-width / 2, 0, width / 2):
      add_box(f'{name}_MuntinV_{bx}', (x + bx, y, z - 0.035), (0.075 if bx else 0.055, height + 0.18, 0.09), MATS['DarkTimber'], bevel=0.012)
    for by in (-height / 2, 0, height / 2):
      add_box(f'{name}_MuntinH_{by}', (x, y + by, z - 0.035), (width + 0.18, 0.075 if by else 0.055, 0.09), MATS['DarkTimber'], bevel=0.012)
    add_box(f'{name}_Sill', (x, y - height / 2 - 0.09, z - 0.08), (width + 0.32, 0.14, 0.36), MATS['FurnitureWood'], bevel=0.025)
  else:
    add_box(f'{name}_Glass', (x, y, z), (0.025, height, width), MATS['WindowGlass'])
    for bz in (-width / 2, 0, width / 2):
      add_box(f'{name}_MuntinV_{bz}', (x + 0.035, y, z + bz), (0.09, height + 0.18, 0.075 if bz else 0.055), MATS['DarkTimber'], bevel=0.012)
    for by in (-height / 2, 0, height / 2):
      add_box(f'{name}_MuntinH_{by}', (x + 0.035, y + by, z), (0.09, 0.075 if by else 0.055, width + 0.18), MATS['DarkTimber'], bevel=0.012)
    add_box(f'{name}_Sill', (x + 0.08, y - height / 2 - 0.09, z), (0.36, 0.14, width + 0.32), MATS['FurnitureWood'], bevel=0.025)


def table(name, x, z, width, depth, height=0.86):
  add_box(f'{name}_Top', (x, height - 0.09, z), (width, 0.18, depth), MATS['FurnitureWood'], bevel=0.045)
  for sx in (-1, 1):
    for sz in (-1, 1):
      add_cylinder(f'{name}_Leg_{sx}_{sz}', (x + sx * (width / 2 - 0.23), height * 0.45, z + sz * (depth / 2 - 0.2)), 0.09, height - 0.16, MATS['DarkTimber'], 12)
  add_box(f'{name}_Stretcher', (x, 0.34, z), (width - 0.35, 0.1, 0.1), MATS['DarkTimber'], bevel=0.018)


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

  add_box('LawsonHouse_Floor', (0, 0, 0), (width, 0.16, depth), MATS['HouseFloor'])
  add_box('LawsonHouse_Ceiling', (0, ceiling + 0.03, 0), (width, 0.14, depth), MATS['PublicLimewash'])

  window_bottom = 0.9
  window_top = 2.22
  front_openings = [
    {'center': -6.55, 'width': 1.45, 'bottom': window_bottom, 'top': window_top},
    {'center': -3.4, 'width': 1.4, 'bottom': 0, 'top': 2.38},
    {'center': 0.15, 'width': 1.55, 'bottom': window_bottom, 'top': window_top},
    {'center': 3.15, 'width': 1.55, 'bottom': window_bottom, 'top': window_top},
  ]
  front_wall_with_openings('FrontWall', wall_z, -half_w, half_w, front_openings, public, ceiling)
  side_wall_with_openings('WestWall', -wall_x, -half_d, half_d, [
    {'center': 3.05, 'width': 1.5, 'bottom': window_bottom, 'top': window_top},
  ], public, ceiling)
  add_box('EastWall', (wall_x, ceiling / 2, 0), (0.18, ceiling, depth), public, bevel=0.012)
  add_box('RearWall', (0, ceiling / 2, -wall_z), (width, ceiling, 0.18), MATS['PrivateLimewash'], bevel=0.012)

  # Four-room partitions with properly framed, closed doors.
  side_wall_with_openings('OfficePartition', 1.92, 0, half_d, [
    {'center': 4.1, 'width': 1.08, 'bottom': 0, 'top': 2.36},
  ], public, ceiling, 0.16)
  front_wall_with_openings('RearPartition', -0.08, -half_w, half_w, [
    {'center': -3.2, 'width': 1.08, 'bottom': 0, 'top': 2.36},
    {'center': 4.8, 'width': 1.08, 'bottom': 0, 'top': 2.36},
  ], public, ceiling, 0.16)
  add_box('RearRoomsPartition', (0.92, ceiling / 2, -3.54), (0.16, ceiling, 6.92), MATS['PrivateLimewash'], bevel=0.012)
  add_box('OfficeTintPanel', (2.015, ceiling / 2, 3.5), (0.025, ceiling - 0.12, 6.8), MATS['OfficeLimewash'])
  add_box('StoreRawPanel', (1.015, ceiling / 2, -3.5), (0.025, ceiling - 0.12, 6.8), MATS['LimewashedBoards'])

  add_box('OfficeDoor', (1.82, 1.18, 4.1), (0.12, 2.36, 1.04), MATS['OldPine'], bevel=0.025)
  add_box('PrivateDoor', (-3.2, 1.18, -0.01), (1.04, 2.36, 0.12), MATS['OldPine'], bevel=0.025)
  add_box('StoreDoor', (4.8, 1.18, -0.01), (1.04, 2.36, 0.12), MATS['LimewashedBoards'], bevel=0.025)
  for door_name, knob in (
    ('Office', (1.74, 1.17, 3.75)),
    ('Private', (-2.86, 1.17, 0.07)),
    ('Store', (4.46, 1.17, 0.07)),
  ):
    add_sphere(f'{door_name}DoorKnob', knob, 0.052, MATS['Brass'])

  # Open front door, complete frame, and threshold.
  add_box('FrontDoor', (-4.08, 1.19, 6.22), (0.12, 2.38, 1.34), MATS['OldPine'], yaw=-0.08, bevel=0.035)
  add_box('FrontThreshold', (-3.4, 0.09, wall_z), (1.58, 0.18, 0.34), MATS['DarkTimber'], bevel=0.025)
  for x in (-4.16, -2.64):
    add_box(f'FrontDoorJamb_{x}', (x, 1.25, wall_z - 0.03), (0.11, 2.5, 0.28), MATS['DarkTimber'], bevel=0.018)
  add_box('FrontDoorHeader', (-3.4, 2.45, wall_z - 0.03), (1.62, 0.14, 0.28), MATS['DarkTimber'], bevel=0.018)

  simple_window('CallingWindow', -6.55, 1.56, wall_z - 0.11, 1.45, 1.32)
  simple_window('DiningWindowA', 0.15, 1.56, wall_z - 0.11, 1.55, 1.32)
  simple_window('DiningWindowB', 3.15, 1.56, wall_z - 0.11, 1.55, 1.32)
  simple_window('GardenWindow', -wall_x + 0.11, 1.56, 3.05, 1.5, 1.32, 'side')

  # Human-scale framing and a restrained damp line—no ship-cabin wall reuse.
  for index, z in enumerate((-5.6, -2.8, 0, 2.8, 5.6)):
    add_box(f'LawsonHouse_CeilingBeam_{index}', (0, ceiling - 0.12, z), (width - 0.35, 0.2, 0.16), MATS['DarkTimber'], bevel=0.018)
  add_box('FrontChairRail', (-0.1, 0.92, wall_z - 0.12), (17.4, 0.1, 0.1), MATS['FurnitureWood'], bevel=0.018)
  add_box('WestChairRail', (-wall_x + 0.12, 0.92, 0), (0.1, 0.1, 13.4), MATS['FurnitureWood'], bevel=0.018)
  add_box('WestDampBand', (-wall_x + 0.025, 0.17, 1.2), (0.022, 0.24, 4.8), MATS['WetEarth'])
  for x, z in ((-8.75, 4.9), (-5.8, 6.77), (1.1, 6.77)):
    add_box(f'RustBloom_{x}_{z}', (x, 0.38, z), (0.03, 0.14, 0.03), MATS['Rust'])

  build_fixed_furniture()
  build_veranda_diorama()


def build_fixed_furniture():
  table('DiningTable', -3.5, 1.25, 3.25, 1.45)
  table('CallingTable', -7.35, 5.75, 1.55, 0.58, 0.76)

  # Tall dresser, deliberately uneven and repaired.
  add_box('DresserBody', (-8.48, 0.76, 1.2), (0.62, 1.52, 2.45), MATS['OldPine'], bevel=0.035)
  for y in (0.48, 1.02):
    add_box(f'DresserShelf_{y}', (-8.12, y, 1.2), (0.72, 0.08, 2.45), MATS['FurnitureWood'], bevel=0.018)
  for row, y in enumerate((0.72, 1.26)):
    for z in (0.7, 1.7):
      add_box(f'DresserPlate_{row}_{z}', (-8.08, y, z), (0.045, 0.32, 0.32), MATS['CreamCeramic'], bevel=0.02)
  add_box('DresserTop', (-8.44, 1.58, 1.2), (0.78, 0.12, 2.6), MATS['FurnitureWood'], bevel=0.035)

  # Lawson's armchair is fixed and subtly more imposing than the loose chairs.
  add_box('ArmchairSeat', (-7.4, 0.48, -0.7), (0.72, 0.18, 0.72), MATS['FurnitureWood'], bevel=0.035)
  add_box('ArmchairBack', (-7.4, 1.02, -1.01), (0.72, 0.96, 0.14), MATS['DarkTimber'], bevel=0.03)
  for x in (-7.72, -7.08):
    add_cylinder(f'ArmchairLeg_{x}', (x, 0.25, -0.7), 0.055, 0.5, MATS['DarkTimber'], 12)
    add_box(f'ArmchairArm_{x}', (x, 0.76, -0.7), (0.09, 0.1, 0.75), MATS['FurnitureWood'], bevel=0.025)

  # Sea chest, coat pegs, clothing, and repaired domestic traces.
  add_box('SeaChestBody', (-7.35, 0.28, 4.65), (1.25, 0.56, 0.7), MATS['OldPine'], yaw=0.08, bevel=0.05)
  for x in (-7.75, -7.35, -6.95):
    add_box(f'SeaChestStrap_{x}', (x, 0.32, 4.64), (0.055, 0.62, 0.74), MATS['Iron'], yaw=0.08, bevel=0.008)
  add_box('PegRail', (-8.68, 1.88, 4.0), (0.12, 0.16, 2.2), MATS['DarkTimber'], bevel=0.025)
  for z in (3.4, 4.0, 4.6):
    beam_between(f'CoatPeg_{z}', (-8.62, 1.85, z), (-8.36, 1.85, z), 0.035, MATS['DarkTimber'], 10)
  add_box('LawsonCoatBody', (-8.32, 1.35, 4.0), (0.08, 0.82, 0.68), MATS['IndigoCloth'], bevel=0.08)
  add_box('LawsonCoatTail', (-8.32, 0.92, 4.0), (0.07, 0.52, 0.82), MATS['IndigoCloth'], bevel=0.08)

  # Guitar, wall chart, calling cards, clumped salt, wax, and ceiling lamp.
  add_sphere('GuitarBody', (-8.28, 0.58, 2.8), 0.3, MATS['OldPine'], (0.35, 1, 0.72))
  add_box('GuitarNeck', (-8.23, 1.05, 2.8), (0.08, 0.85, 0.11), MATS['DarkTimber'], bevel=0.018)
  add_box('BoundaryMapPaper', (-8.78, 1.76, -0.7), (0.035, 0.92, 1.3), MATS['Paper'], bevel=0.018)
  for z in (-1.1, -0.7, -0.3):
    add_box(f'BoundaryMapInk_{z}', (-8.75, 1.76, z), (0.012, 0.025, 0.62), MATS['Ink'])
  add_box('CallingCards', (-7.35, 0.81, 5.75), (0.55, 0.025, 0.34), MATS['Paper'], yaw=-0.12, bevel=0.008)
  add_cylinder('SaltJar', (-4.75, 0.94, 1.5), 0.11, 0.24, MATS['CreamCeramic'], 16)
  for index, offset in enumerate((-0.045, 0.01, 0.06)):
    add_sphere(f'ClumpedSalt_{index}', (-4.75 + offset, 1.08, 1.5), 0.055, MATS['Paper'], (1, 0.55, 1))
  add_cylinder('HangingLampChain', (-3.5, 2.95, 1.25), 0.018, 0.5, MATS['Iron'], 10)
  add_cylinder('HangingLampReservoir', (-3.5, 2.65, 1.25), 0.14, 0.16, MATS['Brass'], 18)
  add_sphere('HangingLampGlass', (-3.5, 2.75, 1.25), 0.17, MATS['WindowGlass'], (1, 1.3, 1))
  add_sphere('LampFlame_Main', (-3.5, 2.71, 1.25), 0.045, MATS['LampFlame'], (0.68, 1.45, 0.68))


def build_veranda_diorama():
  add_box('ExteriorVeranda', (0, -0.05, 8.1), (18, 0.12, 2.3), MATS['HouseFloor'])
  for x in (-8.35, -5.2, -1.8, 1.8, 5.2, 8.35):
    add_cylinder(f'VerandaPost_{x}', (x, 1.55, 8.75), 0.07, 3.1, MATS['DarkTimber'], 12)
  add_box('ExteriorWetGround', (0, -0.18, 13.2), (26, 0.15, 8), MATS['WetEarth'])
  for index, x in enumerate((-10, -7, -4, 4, 7, 10)):
    add_cylinder(f'ExteriorFencePost_{index}', (x, 0.55, 10.6), 0.07, 1.1, MATS['OldPine'], 10)
  add_box('ExteriorFenceRail', (0, 0.5, 10.6), (21, 0.1, 0.1), MATS['OldPine'])
  for index, (x, z, scale) in enumerate(((-8, 12, 1.1), (-4.5, 12.8, 0.8), (4.6, 12.3, 0.9), (8.5, 13.2, 1.2))):
    add_sphere(f'ExteriorGardenMass_{index}', (x, 0.35 * scale, z), 0.75 * scale, MATS['LeafGreen'], (1.4, 0.7, 1))
  for index, (x, z, scale) in enumerate(((-10.4, 15.1, 1.3), (-6.7, 16.2, 0.9), (6.3, 15.5, 1.2), (10.6, 16.4, 1.5))):
    add_sphere(f'ExteriorBasalt_{index}', (x, 0.4 * scale, z), 0.55 * scale, MATS['Basalt'], (1.3, 0.75, 1))


def join_by_material():
  buckets = {}
  for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH' or not obj.data.materials:
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


def prop_chair():
  add_box('ChairSeat', (0, 0.52, 0), (0.72, 0.14, 0.68), MATS['FurnitureWood'], bevel=0.04)
  for x in (-0.28, 0.28):
    for z in (-0.24, 0.24):
      add_cylinder(f'ChairLeg_{x}_{z}', (x, 0.25, z), 0.048, 0.5, MATS['DarkTimber'], 12)
  for x in (-0.3, 0.3):
    add_cylinder(f'ChairBackPost_{x}', (x, 1.0, -0.28), 0.05, 1.1, MATS['DarkTimber'], 12)
  for y in (0.78, 1.03, 1.28):
    add_box(f'ChairBackSlat_{y}', (0, y, -0.28), (0.58, 0.075, 0.065), MATS['OldPine'], bevel=0.02)
  add_box('ChairRushSeat', (0, 0.605, 0), (0.61, 0.045, 0.57), MATS['Canvas'], bevel=0.018)


def prop_stool():
  add_box('StoolCanvas', (0, 0.55, 0), (0.64, 0.08, 0.48), MATS['Canvas'], bevel=0.04)
  for side in (-1, 1):
    beam_between(f'StoolFrameA_{side}', (side * 0.26, 0.08, -0.23), (side * 0.26, 0.56, 0.23), 0.045, MATS['OldPine'])
    beam_between(f'StoolFrameB_{side}', (side * 0.26, 0.08, 0.23), (side * 0.26, 0.56, -0.23), 0.045, MATS['OldPine'])
    add_sphere(f'StoolPivot_{side}', (side * 0.29, 0.32, 0), 0.06, MATS['Brass'])


def prop_bottle():
  add_cylinder('BottleBody', (0, 0.24, 0), 0.13, 0.46, MATS['BottleGlass'], 24)
  add_sphere('BottleShoulder', (0, 0.48, 0), 0.13, MATS['BottleGlass'], (1, 0.65, 1))
  add_cylinder('BottleNeck', (0, 0.61, 0), 0.055, 0.25, MATS['BottleGlass'], 20)
  add_cylinder('BottleCork', (0, 0.745, 0), 0.048, 0.07, MATS['OldPine'], 16)
  add_box('BottleLabel', (0, 0.29, -0.132), (0.17, 0.17, 0.012), MATS['Paper'], bevel=0.01)


def prop_mug():
  add_cylinder('MugBody', (0, 0.12, 0), 0.105, 0.24, MATS['Pewter'], 24)
  add_cylinder('MugDarkOpening', (0, 0.245, 0), 0.085, 0.012, MATS['Ink'], 24)
  add_torus('MugHandle', (0.11, 0.13, 0), 0.09, 0.025, MATS['Pewter'], rotation=(0, math.pi / 2, 0))


def prop_bowl():
  add_cylinder('ServingBowl', (0, 0.09, 0), 0.28, 0.18, MATS['Earthenware'], 28)
  add_torus('ServingBowlRim', (0, 0.185, 0), 0.28, 0.025, MATS['CreamCeramic'])
  for index, (x, z) in enumerate(((-0.1, -0.03), (0.06, 0.04), (0.12, -0.08), (-0.03, 0.1))):
    add_sphere(f'SweetPotato_{index}', (x, 0.22, z), 0.09, MATS['MaizeBread'], (1.25, 0.72, 0.82))


def prop_chart():
  add_box('FoldedChart', (0, 0.02, 0), (0.62, 0.04, 0.42), MATS['Paper'], bevel=0.012)
  for x in (-0.2, 0, 0.2):
    add_box(f'ChartFold_{x}', (x, 0.044, 0), (0.012, 0.012, 0.4), MATS['Ink'])
  add_box('ChartCoastline', (0.08, 0.047, 0.05), (0.22, 0.01, 0.025), MATS['Ink'], yaw=0.42)


def prop_ledger():
  add_box('LedgerPages', (0, 0.06, 0), (0.56, 0.12, 0.76), MATS['Paper'], bevel=0.025)
  add_box('LedgerCover', (0, 0.13, 0), (0.6, 0.06, 0.8), MATS['Leather'], bevel=0.03)
  add_box('LedgerSpine', (-0.3, 0.1, 0), (0.06, 0.2, 0.8), MATS['DarkTimber'], bevel=0.025)
  add_box('LedgerLabel', (0.06, 0.166, 0), (0.28, 0.008, 0.2), MATS['Paper'], bevel=0.008)


def prop_candlestick():
  add_cylinder('CandlestickFoot', (0, 0.04, 0), 0.15, 0.08, MATS['Brass'], 24)
  add_cylinder('CandlestickStem', (0, 0.19, 0), 0.035, 0.3, MATS['Brass'], 16)
  add_cylinder('CandlestickCup', (0, 0.34, 0), 0.08, 0.07, MATS['Brass'], 20)
  add_cylinder('Candle', (0, 0.52, 0), 0.045, 0.32, MATS['CreamCeramic'], 18)
  add_sphere('LampFlame_Candlestick', (0, 0.71, 0), 0.035, MATS['LampFlame'], (0.68, 1.4, 0.68))


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
    'brass-candlestick.glb': prop_candlestick,
  }
  for filename, builder in prop_builders.items():
    clear_scene()
    init_materials()
    builder()
    export_scene(PROP_OUT / filename)


build_all()
