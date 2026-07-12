"""Build the HMS Beagle aft-cabins interior and export a runtime GLB.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --disable-autoexec --python scripts/blender_build_hms_beagle_cabin.py -- \
    [--out public/assets/models/ships/hms-beagle-cabin.glb] \
    [--render test-results/beagle-cabin]

The layout, fixed collider footprints, interaction anchors, and prop anchors all
come from three-game/interiors/blueprints/beagleCabin.json. Game coordinates are
+x starboard, +y up, +z forward. Blender uses (x, -z, y) before glTF export.
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
BLUEPRINT_PATH = ROOT / 'three-game/interiors/blueprints/beagleCabin.json'
BLUEPRINT = json.loads(BLUEPRINT_PATH.read_text())
COLLECTION = None
MATS = {}


def game_to_blender(position):
  x, y, z = position
  return (x, -z, y)


def clear_scene():
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.object.delete()
  for blocks in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
    for block in list(blocks):
      if block.users == 0:
        blocks.remove(block)


def srgb(hexcode):
  value = hexcode.lstrip('#')
  return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))


def linear(color):
  return tuple((value / 12.92) if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in color)


def material(name, color, roughness=0.82, metalness=0.0, alpha=1.0):
  if name in MATS:
    return MATS[name]
  result = bpy.data.materials.new(name)
  result.use_nodes = True
  bsdf = result.node_tree.nodes.get('Principled BSDF')
  bsdf.inputs['Base Color'].default_value = (*linear(srgb(color)), 1.0)
  bsdf.inputs['Roughness'].default_value = roughness
  bsdf.inputs['Metallic'].default_value = metalness
  if alpha < 1:
    bsdf.inputs['Alpha'].default_value = alpha
    result.surface_render_method = 'DITHERED'
    result.diffuse_color = (*linear(srgb(color)), alpha)
  MATS[name] = result
  return result


def emissive_material(name, color, strength=3.0):
  result = material(name, color, 0.35)
  bsdf = result.node_tree.nodes.get('Principled BSDF')
  emission = bsdf.inputs.get('Emission Color') or bsdf.inputs.get('Emission')
  emission_strength = bsdf.inputs.get('Emission Strength')
  if emission:
    emission.default_value = (*linear(srgb(color)), 1.0)
  if emission_strength:
    emission_strength.default_value = strength
  return result


def pbr_texture_material(name, root, files, scale=(1, 1, 1), normal_strength=0.55, roughness=0.62):
  if name in MATS:
    return MATS[name]
  result = bpy.data.materials.new(name)
  result.use_nodes = True
  nodes = result.node_tree.nodes
  links = result.node_tree.links
  bsdf = nodes.get('Principled BSDF')
  tex_coord = nodes.new('ShaderNodeTexCoord')
  mapping = nodes.new('ShaderNodeMapping')
  mapping.inputs['Scale'].default_value = scale
  links.new(tex_coord.outputs['UV'], mapping.inputs['Vector'])
  for filename, input_name, non_color in (
    (files.get('color'), 'Base Color', False),
    (files.get('roughness'), 'Roughness', True),
    (files.get('normal'), None, True),
  ):
    if not filename:
      continue
    path = root / filename
    if not path.exists():
      continue
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(path), check_existing=True)
    if non_color:
      texture.image.colorspace_settings.name = 'Non-Color'
    links.new(mapping.outputs['Vector'], texture.inputs['Vector'])
    if input_name is None:
      normal = nodes.new('ShaderNodeNormalMap')
      normal.inputs['Strength'].default_value = normal_strength
      links.new(texture.outputs['Color'], normal.inputs['Color'])
      links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    else:
      links.new(texture.outputs['Color'], bsdf.inputs[input_name])
  bsdf.inputs['Metallic'].default_value = 0.0
  if not files.get('roughness'):
    bsdf.inputs['Roughness'].default_value = roughness
  MATS[name] = result
  return result


def image_material(name, path, roughness=0.88):
  if name in MATS:
    return MATS[name]
  result = bpy.data.materials.new(name)
  result.use_nodes = True
  nodes = result.node_tree.nodes
  links = result.node_tree.links
  bsdf = nodes.get('Principled BSDF')
  texture = nodes.new('ShaderNodeTexImage')
  texture.image = bpy.data.images.load(str(path), check_existing=True)
  links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
  bsdf.inputs['Roughness'].default_value = roughness
  bsdf.inputs['Metallic'].default_value = 0
  MATS[name] = result
  return result


def textured_floor_material():
  return pbr_texture_material(
    'FloorPlanks',
    ROOT / 'public/assets/textures/world/beagle-deck',
    {
      'color': 'Planks037A_1K-JPG_Color.jpg',
      'roughness': 'Planks037A_1K-JPG_Roughness.jpg',
      'normal': 'Planks037A_1K-JPG_NormalGL.jpg',
    },
    scale=(2.4, 4.8, 1),
    normal_strength=0.72,
  )


def painted_panel_material():
  return pbr_texture_material(
    'PaintedPanel',
    ROOT / 'public/assets/textures/interiors/beagle-cabin',
    {
      'color': 'painted-planks-diff-1k.jpg',
      'roughness': 'painted-planks-rough-1k.jpg',
      'normal': 'painted-planks-normal-1k.jpg',
    },
    scale=(1.25, 1.25, 1),
    normal_strength=0.38,
  )


def varnished_oak_material(name='VarnishedOak', scale=(1.0, 1.0, 1), normal_strength=0.42):
  return pbr_texture_material(
    name,
    ROOT / 'public/assets/textures/interiors/beagle-cabin',
    {
      'color': 'varnished-oak-diff-1k.jpg',
      'roughness': 'varnished-oak-rough-1k.jpg',
      'normal': 'varnished-oak-normal-1k.jpg',
    },
    scale=scale,
    normal_strength=normal_strength,
  )


def init_materials():
  textured_floor_material()
  painted_panel_material()
  MATS['PaintedPanelShadow'] = MATS['PaintedPanel']
  MATS['DarkOak'] = varnished_oak_material('VarnishedOak', (1.0, 1.0, 1))
  MATS['Oak'] = varnished_oak_material('VarnishedOakFine', (1.45, 1.45, 1))
  MATS['OakLight'] = varnished_oak_material('VarnishedOakBroad', (0.72, 0.72, 1))
  material('BookGreen', '#294e47', 0.8)
  material('BookRed', '#6b302c', 0.8)
  material('BookBlue', '#31485f', 0.8)
  material('BookBrown', '#573b28', 0.82)
  material('BookGold', '#ad8a43', 0.48, 0.35)
  material('Brass', '#b27b2c', 0.22, 0.9)
  material('Iron', '#272a28', 0.38, 0.72)
  material('Canvas', '#c1b58f', 0.96)
  material('Rope', '#8d744d', 0.92)
  material('Blanket', '#4c6670', 0.94)
  material('Paper', '#d7ca9f', 0.96)
  material('Ink', '#29251e', 0.9)
  material('Glass', '#7397a0', 0.18, 0.05, 0.38)
  material('PreservingSpirit', '#b6a66f', 0.16, 0.0, 0.34)
  material('SpecimenBrown', '#514432', 0.82)
  material('InkGlass', '#11191a', 0.18, 0.08, 0.72)
  emissive_material('LampFlame', '#ff7f2a', 2.4)
  material('MicroscopeLacquer', '#171817', 0.3, 0.3)
  MATS['CeilingWood'] = varnished_oak_material('CeilingOak', (1.15, 1.8, 1), normal_strength=0.18)
  material('WhiteMetal', '#a8aaa4', 0.26, 0.78)
  maps_root = ROOT / 'public/assets/textures/interiors/beagle-cabin/maps'
  image_material('FitzRoyGalapagosChart', maps_root / 'fitzroy-galapagos-chart.jpg', 0.94)
  image_material('ArrowsmithWorldMap', maps_root / 'arrowsmith-world-map.jpg', 0.9)


def add_box(name, position, size, mat, yaw=0.0, bevel=0.0):
  bpy.ops.mesh.primitive_cube_add(size=1, location=game_to_blender(position))
  obj = bpy.context.object
  obj.name = name
  obj.dimensions = (size[0], size[2], size[1])
  obj.rotation_euler[2] = -yaw
  bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
  obj.data.materials.append(mat)
  if bevel > 0:
    modifier = obj.modifiers.new('SoftEdges', 'BEVEL')
    modifier.width = bevel
    modifier.segments = 2
  return obj


def add_cylinder(name, position, radius, height, mat, sides=16, rotation=(0, 0, 0)):
  bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=height, location=game_to_blender(position))
  obj = bpy.context.object
  obj.name = name
  # Blender cylinder axis is +z, which is game +y after export.
  obj.rotation_euler = (rotation[2], -rotation[0], -rotation[1])
  obj.data.materials.append(mat)
  return obj


def add_cylinder_between(name, start, end, radius, mat, sides=12):
  start_point = Vector(game_to_blender(start))
  end_point = Vector(game_to_blender(end))
  delta = end_point - start_point
  midpoint = (start_point + end_point) * 0.5
  bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=delta.length, location=midpoint)
  obj = bpy.context.object
  obj.name = name
  obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
  obj.data.materials.append(mat)
  return obj


def add_torus(name, position, major_radius, minor_radius, mat, rotation=(0, 0, 0)):
  bpy.ops.mesh.primitive_torus_add(
    major_radius=major_radius,
    minor_radius=minor_radius,
    major_segments=20,
    minor_segments=6,
    location=game_to_blender(position),
  )
  obj = bpy.context.object
  obj.name = name
  obj.rotation_euler = (rotation[2], -rotation[0], -rotation[1])
  obj.data.materials.append(mat)
  return obj


def add_sphere(name, position, radius, mat, scale=(1, 1, 1)):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=radius, location=game_to_blender(position))
  obj = bpy.context.object
  obj.name = name
  obj.scale = (scale[0], scale[2], scale[1])
  bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
  obj.data.materials.append(mat)
  return obj


def add_wall_panel(name, start, end, height, mat, thickness=0.18, u_offset=0):
  x1, z1 = start
  x2, z2 = end
  length = math.hypot(x2 - x1, z2 - z1)
  vertices = [
    (x1, -z1, 0), (x2, -z2, 0),
    (x2, -z2, height), (x1, -z1, height),
  ]
  mesh = bpy.data.meshes.new(name)
  mesh.from_pydata(vertices, [], [[0, 1, 2, 3]])
  mesh.update()
  uv_layer = mesh.uv_layers.new(name='UVMap')
  uv_values = (
    (u_offset, 0),
    (u_offset + length / 2.4, 0),
    (u_offset + length / 2.4, height / 2.4),
    (u_offset, height / 2.4),
  )
  for loop_index, uv in zip(mesh.polygons[0].loop_indices, uv_values):
    uv_layer.data[loop_index].uv = uv
  obj = bpy.data.objects.new(name, mesh)
  COLLECTION.objects.link(obj)
  obj.data.materials.append(mat)
  solidify = obj.modifiers.new('HullPlankingThickness', 'SOLIDIFY')
  solidify.thickness = thickness
  solidify.offset = 0
  bevel = obj.modifiers.new('HullPanelEdge', 'BEVEL')
  bevel.width = 0.018
  bevel.segments = 2
  return obj


def add_textured_chart(name, center, width, depth, mat):
  cx, cy, cz = center
  columns, rows = 8, 6
  vertices = []
  uvs = []
  for row in range(rows + 1):
    v = row / rows
    for column in range(columns + 1):
      u = column / columns
      edge = max(abs(u - 0.5) * 2, abs(v - 0.5) * 2)
      lift = 0.012 + max(0, edge - 0.72) ** 2 * 0.085
      vertices.append(game_to_blender((cx + (u - 0.5) * width, cy + lift, cz + (v - 0.5) * depth)))
      uvs.append((u, v))
  faces = []
  for row in range(rows):
    for column in range(columns):
      first = row * (columns + 1) + column
      faces.append((first, first + 1, first + columns + 2, first + columns + 1))
  mesh = bpy.data.meshes.new(name)
  mesh.from_pydata(vertices, [], faces)
  mesh.update()
  uv_layer = mesh.uv_layers.new(name='UVMap')
  for polygon in mesh.polygons:
    for loop_index in polygon.loop_indices:
      uv_layer.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
  obj = bpy.data.objects.new(name, mesh)
  COLLECTION.objects.link(obj)
  obj.data.materials.append(mat)
  solidify = obj.modifiers.new('PaperThickness', 'SOLIDIFY')
  solidify.thickness = 0.006
  return obj


def add_side_map(name, x, y, z, height, width, mat):
  inside_x = x + (0.018 if x < 0 else -0.018)
  z0, z1 = z - width * 0.5, z + width * 0.5
  y0, y1 = y - height * 0.5, y + height * 0.5
  vertices = [
    game_to_blender((inside_x, y0, z0)),
    game_to_blender((inside_x, y0, z1)),
    game_to_blender((inside_x, y1, z1)),
    game_to_blender((inside_x, y1, z0)),
  ]
  mesh = bpy.data.meshes.new(name)
  mesh.from_pydata(vertices, [], [[0, 1, 2, 3]])
  mesh.update()
  uv_layer = mesh.uv_layers.new(name='UVMap')
  uv_values = ((0, 0), (1, 0), (1, 1), (0, 1)) if x < 0 else ((1, 0), (0, 0), (0, 1), (1, 1))
  for loop_index, uv in zip(mesh.polygons[0].loop_indices, uv_values):
    uv_layer.data[loop_index].uv = uv
  obj = bpy.data.objects.new(name, mesh)
  COLLECTION.objects.link(obj)
  obj.data.materials.append(mat)
  solidify = obj.modifiers.new('MountedPaperThickness', 'SOLIDIFY')
  solidify.thickness = 0.008
  return obj


def add_floor_or_ceiling(name, y, mat, thickness=0.12):
  outline = BLUEPRINT['outline']
  vertices = [(x, -z, y) for x, z in outline]
  mesh = bpy.data.meshes.new(name)
  mesh.from_pydata(vertices, [], [list(range(len(vertices)))])
  mesh.update()
  uv_layer = mesh.uv_layers.new(name='UVMap')
  min_x = min(point[0] for point in vertices)
  max_x = max(point[0] for point in vertices)
  min_y = min(point[1] for point in vertices)
  max_y = max(point[1] for point in vertices)
  for polygon in mesh.polygons:
    for loop_index in polygon.loop_indices:
      vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
      uv_layer.data[loop_index].uv = (
        (vertex.x - min_x) / max(0.001, max_x - min_x),
        (vertex.y - min_y) / max(0.001, max_y - min_y),
      )
  obj = bpy.data.objects.new(name, mesh)
  COLLECTION.objects.link(obj)
  obj.data.materials.append(mat)
  solidify = obj.modifiers.new('Thickness', 'SOLIDIFY')
  solidify.thickness = thickness
  solidify.offset = -1 if y > 1 else 0
  bevel = obj.modifiers.new('EdgeSoftness', 'BEVEL')
  bevel.width = 0.035
  bevel.segments = 2
  return obj


def cut_box_opening(target, name, center, size):
  """Cut a real opening so exterior light and shadows can enter the shell."""
  for modifier in list(target.modifiers):
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
  bpy.ops.mesh.primitive_cube_add(size=1, location=game_to_blender(center))
  cutter = bpy.context.object
  cutter.name = name
  cutter.dimensions = (size[0], size[2], size[1])
  bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
  boolean = target.modifiers.new(f'{name}Boolean', 'BOOLEAN')
  boolean.operation = 'DIFFERENCE'
  boolean.solver = 'EXACT'
  boolean.object = cutter
  bpy.context.view_layer.objects.active = target
  target.select_set(True)
  bpy.ops.object.modifier_apply(modifier=boolean.name)
  bpy.data.objects.remove(cutter, do_unlink=True)
  bevel = target.modifiers.new(f'{name}Edge', 'BEVEL')
  bevel.width = 0.022
  bevel.segments = 2


def add_cambered_deck(name, start_z, length, width, mat):
  columns = 14
  rows = 34
  vertices = []
  uvs = []
  for row in range(rows + 1):
    v = row / rows
    z = start_z + v * length
    sheer = v * 0.055
    for column in range(columns + 1):
      u = column / columns
      x = (u - 0.5) * width
      cross = abs((u - 0.5) * 2)
      camber = (1 - cross * cross) * 0.095
      vertices.append(game_to_blender((x, -0.03 + camber + sheer, z)))
      uvs.append((u * width / 2.4, v * length / 2.4))
  faces = []
  for row in range(rows):
    for column in range(columns):
      first = row * (columns + 1) + column
      faces.append((first, first + 1, first + columns + 2, first + columns + 1))
  mesh = bpy.data.meshes.new(name)
  mesh.from_pydata(vertices, [], faces)
  mesh.update()
  uv_layer = mesh.uv_layers.new(name='UVMap')
  for polygon in mesh.polygons:
    for loop_index in polygon.loop_indices:
      uv_layer.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
  obj = bpy.data.objects.new(name, mesh)
  COLLECTION.objects.link(obj)
  obj.data.materials.append(mat)
  solidify = obj.modifiers.new('DeckThickness', 'SOLIDIFY')
  solidify.thickness = 0.16
  solidify.offset = -1
  bevel = obj.modifiers.new('DeckEdge', 'BEVEL')
  bevel.width = 0.018
  bevel.segments = 2
  return obj


def build_shell():
  ceiling = BLUEPRINT['dimensions']['ceiling']
  add_floor_or_ceiling('Cabin_Floor', 0.02, MATS['FloorPlanks'], 0.16)
  ceiling_shell = add_floor_or_ceiling('Cabin_CeilingShell', ceiling, MATS['CeilingWood'], 0.16)
  cut_box_opening(
    ceiling_shell,
    'CabinSkylightOpening',
    (-0.7, ceiling - 0.04, 5.55),
    (3.7, 0.5, 2.22),
  )

  for item in BLUEPRINT['fixedColliders']:
    if item['kind'] != 'structure' or item['id'] == 'stern-wall':
      continue
    if item['id'].startswith(('port-wall', 'starboard-wall')):
      continue
    position = (item['position'][0], ceiling * 0.5, item['position'][2])
    size = (item['size'][0], ceiling, item['size'][2])
    add_box(f"CabinWall_{item['id']}", position, size, MATS['PaintedPanel'], item.get('yaw', 0), 0.035)

  # The collision blueprint uses overlapping boxes, but the visible hull uses
  # exact shared vertices. This removes daylight seams at every change in the
  # hull's tumblehome while retaining the established movement colliders.
  outline = BLUEPRINT['outline']
  starboard = outline[1:6]
  port = outline[6:] + outline[:1]
  for side_name, points in (('Starboard', starboard), ('Port', port)):
    for index in range(len(points) - 1):
      add_wall_panel(
        f'CabinHull{side_name}_{index}',
        points[index],
        points[index + 1],
        ceiling,
        MATS['PaintedPanel'],
        u_offset=index * 0.67 + (0.31 if side_name == 'Port' else 0),
      )

  # Deep framed stern lights. The collision stays a single strong transom, but
  # the visible shell is built around the glazing so daylight and the exterior
  # view read through actual openings rather than a flat blue wall.
  # Five bays follow a pronounced shallow ellipse in plan. Each bay carries
  # its own lower and upper counter planking so the stern is genuinely curved,
  # not a flat wall with angled trim attached to it.
  window_specs = (
    (-4.5, 1.38, -9.82, -0.36),
    (-2.3, 1.62, -10.62, -0.18),
    (0, 1.76, -10.92, 0),
    (2.3, 1.62, -10.62, 0.18),
    (4.5, 1.38, -9.82, 0.36),
  )
  window_y = 2.12
  window_h = 1.58
  for index, (x, width, window_z, yaw) in enumerate(window_specs):
    frame_width = 0.16
    add_box(f'SternLowerBay_{index}', (x, 0.62, window_z), (width + 0.48, 1.24, 0.46), MATS['PaintedPanel'], yaw, 0.025)
    upper_height = max(0.24, ceiling - (window_y + window_h * 0.5 + 0.12))
    add_box(f'SternUpperBay_{index}', (x, ceiling - upper_height * 0.5, window_z), (width + 0.48, upper_height, 0.46), MATS['PaintedPanel'], yaw, 0.025)
    add_box(f'SternWindowLeft_{index}', (x - width * 0.5 - frame_width * 0.5, window_y, window_z + 0.03), (frame_width, window_h + 0.34, 0.46), MATS['DarkOak'], yaw, 0.025)
    add_box(f'SternWindowRight_{index}', (x + width * 0.5 + frame_width * 0.5, window_y, window_z + 0.03), (frame_width, window_h + 0.34, 0.46), MATS['DarkOak'], yaw, 0.025)
    add_box(f'SternWindowSill_{index}', (x, window_y - window_h * 0.5 - 0.09, window_z + 0.09), (width + 0.32, 0.18, 0.56), MATS['DarkOak'], yaw, 0.035)
    add_box(f'SternWindowHead_{index}', (x, window_y + window_h * 0.5 + 0.09, window_z + 0.02), (width + 0.32, 0.18, 0.46), MATS['DarkOak'], yaw, 0.035)
    # Nine separate crown-glass lights give the glazing a hand-made surface
    # and let the muntins cast real shadows instead of lying over one flat pane.
    pane_width = width / 3 - 0.035
    pane_height = window_h / 3 - 0.035
    for column in (-1, 0, 1):
      for row in (-1, 0, 1):
        pane_index = (column + 1) * 3 + row + 1
        pane_yaw = yaw + (pane_index % 3 - 1) * 0.0035
        add_box(
          f'SternGlass_{index}_{column}_{row}',
          (x + column * width / 3, window_y + row * window_h / 3, window_z - 0.04 + (pane_index % 2) * 0.004),
          (pane_width, pane_height, 0.018),
          MATS['Glass'],
          pane_yaw,
        )
    for bar_index, x_offset in enumerate((-width / 6, width / 6)):
      add_box(f'SternWindowBarV_{index}_{bar_index}', (x + x_offset, window_y, window_z + 0.16), (0.042, window_h, 0.055), MATS['DarkOak'], yaw)
    for bar_index, y_offset in enumerate((-window_h / 6, window_h / 6)):
      add_box(f'SternWindowBarH_{index}_{bar_index}', (x, window_y + y_offset, window_z + 0.16), (width, 0.042, 0.055), MATS['DarkOak'], yaw)
    add_box(f'SternWindowInnerSill_{index}', (x, window_y - window_h * 0.5 - 0.05, window_z + 0.34), (width + 0.3, 0.12, 0.82), MATS['Oak'], yaw, 0.025)
    # A small brass sash lift and the outer-casement hinges read at close range.
    add_box(f'SternWindowLatch_{index}', (x, window_y - 0.02, window_z + 0.205), (0.16, 0.035, 0.035), MATS['Brass'], yaw, 0.008)
    if index in (0, 4):
      hinge_x = x - width * 0.5 + 0.055 if index == 0 else x + width * 0.5 - 0.055
      for hinge_index, hinge_y in enumerate((window_y - 0.43, window_y + 0.43)):
        add_box(f'SternWindowHinge_{index}_{hinge_index}', (hinge_x, hinge_y, window_z + 0.205), (0.075, 0.15, 0.028), MATS['Iron'], yaw, 0.006)

  # Counter timbers close the spaces between the angled window bays and make
  # the shallow elliptical stern legible from inside the cabin.
  for index in range(len(window_specs) - 1):
    left_x, left_width, left_z, left_yaw = window_specs[index]
    right_x, right_width, right_z, right_yaw = window_specs[index + 1]
    left_edge = left_x + left_width * 0.5 + 0.16
    right_edge = right_x - right_width * 0.5 - 0.16
    gap_width = max(0.16, right_edge - left_edge)
    add_box(
      f'SternCounterTimber_{index}',
      ((left_edge + right_edge) * 0.5, ceiling * 0.5, (left_z + right_z) * 0.5 + 0.03),
      (gap_width + 0.1, ceiling, 0.48),
      MATS['DarkOak'],
      (left_yaw + right_yaw) * 0.5,
      0.025,
    )

  # Quarter returns close the curved counter into the tapering hull sides.
  # These remove the open vertical seams that previously exposed the ocean.
  for side in (-1, 1):
    add_box(
      f'SternQuarterReturn_{side}',
      (side * 5.7, ceiling * 0.5, -9.25),
      (1.48, ceiling, 0.52),
      MATS['PaintedPanel'],
      side * 0.56,
      0.035,
    )
    add_box(
      f'SternQuarterPost_{side}',
      (side * 5.22, ceiling * 0.5, -9.72),
      (0.28, ceiling - 0.16, 0.58),
      MATS['DarkOak'],
      side * 0.44,
      0.025,
    )

  # Open paired doors toward the weather deck.
  for side in (-1, 1):
    x = side * 0.96
    add_box(f'EntranceDoor_{side}', (x + side * 0.42, 1.45, 10.35), (1.55, 2.9, 0.16), MATS['DarkOak'], side * 0.62, 0.04)
    add_box(f'EntranceDoorPanel_{side}', (x + side * 0.45, 1.46, 10.29), (1.18, 2.42, 0.05), MATS['PaintedPanelShadow'], side * 0.62)
    add_sphere(f'EntranceDoorKnob_{side}', (x + side * 0.12, 1.45, 10.03), 0.09, MATS['Brass'])
    for hinge_index, hinge_y in enumerate((0.48, 1.45, 2.42)):
      add_box(f'EntranceStrapHinge_{side}_{hinge_index}', (x + side * 1.01, hinge_y, 10.23), (0.34, 0.07, 0.035), MATS['Iron'], side * 0.62, 0.008)
  add_box('EntranceHeader', (0, 3.14, 10.88), (3.0, 0.32, 0.3), MATS['PaintedPanel'])
  add_box('EntranceCoaming', (0, 0.12, 10.88), (3.25, 0.24, 0.38), MATS['DarkOak'], 0, 0.035)

  # The doorway looks along a substantial run of weather deck. Camber, side
  # bulwarks, masts, rigging, hatches, and diminishing fittings carry the eye
  # into the ship before the ocean begins; this remains a non-playable vista.
  deck_start = 10.82
  deck_length = 32.5
  deck_width = 11.2
  deck_center = deck_start + deck_length * 0.5
  add_cambered_deck('ExteriorWeatherDeck', deck_start, deck_length, deck_width, MATS['FloorPlanks'])
  for side in (-1, 1):
    x = side * deck_width * 0.5
    add_box(f'ExteriorBulwark_{side}', (x, 0.62, deck_center), (0.2, 1.2, deck_length), MATS['PaintedPanel'], 0, 0.025)
    add_box(f'ExteriorBulwarkInnerRail_{side}', (x - side * 0.12, 0.36, deck_center), (0.16, 0.18, deck_length), MATS['DarkOak'], 0, 0.02)
    add_box(f'ExteriorCapRail_{side}', (x, 1.25, deck_center), (0.36, 0.16, deck_length + 0.15), MATS['DarkOak'], 0, 0.035)
    for post_index, post_z in enumerate((11.4, 14.0, 16.6, 19.2, 21.8, 24.4, 27.0, 29.6, 32.2, 34.8, 37.4, 40.0, 42.5)):
      add_box(f'ExteriorRailPost_{side}_{post_index}', (x - side * 0.02, 0.72, post_z), (0.3, 1.34, 0.22), MATS['DarkOak'], 0, 0.025)
    for scupper_index, post_z in enumerate((13.0, 18.0, 23.0, 28.0, 33.0, 38.0)):
      add_box(f'ExteriorScupper_{side}_{scupper_index}', (x - side * 0.125, 0.24, post_z), (0.028, 0.16, 0.42), MATS['Iron'], 0, 0.012)

  # A low glazed companion and grating establish a readable foreground plane.
  add_box('ExteriorCompanionCoaming', (-1.45, 0.3, 14.1), (2.25, 0.5, 1.45), MATS['DarkOak'], 0, 0.04)
  add_box('ExteriorCompanionGlass', (-1.45, 0.58, 14.1), (1.92, 0.055, 1.08), MATS['Glass'])
  for x in (-2.08, -1.45, -0.82):
    add_box(f'ExteriorCompanionBar_{x}', (x, 0.62, 14.1), (0.07, 0.08, 1.12), MATS['Brass'], 0, 0.012)
  add_box('ExteriorMainHatchFrame', (1.35, 0.15, 16.0), (2.1, 0.24, 2.75), MATS['DarkOak'], 0, 0.035)
  for index in range(8):
    add_box(f'ExteriorMainHatchSlat_{index}', (1.35, 0.29, 14.87 + index * 0.32), (1.78, 0.07, 0.12), MATS['Oak'], 0, 0.015)

  # Main and fore masts make the exterior unmistakably a working barque deck.
  mast_specs = ((0.35, 21.3, 10.8, 0.27), (-0.25, 36.2, 12.6, 0.3))
  for mast_index, (mast_x, mast_z, mast_height, radius) in enumerate(mast_specs):
    add_cylinder(f'ExteriorMast_{mast_index}', (mast_x, mast_height * 0.5, mast_z), radius, mast_height, MATS['DarkOak'], 28)
    yard_y = mast_height * 0.63
    add_cylinder_between(f'ExteriorYard_{mast_index}', (-4.25, yard_y, mast_z), (4.25, yard_y, mast_z), 0.1, MATS['DarkOak'], 18)
    add_cylinder_between(f'ExteriorFurledCanvas_{mast_index}', (-3.5, yard_y - 0.08, mast_z), (3.5, yard_y - 0.08, mast_z), 0.14, MATS['Canvas'], 18)
    for side in (-1, 1):
      add_cylinder_between(
        f'ExteriorShroud_{mast_index}_{side}',
        (mast_x, mast_height * 0.82, mast_z),
        (side * 5.25, 1.24, mast_z - 2.2),
        0.022,
        MATS['Rope'],
        8,
      )
  add_cylinder_between('ExteriorForestay', (0.35, 9.2, 21.3), (-0.25, 11.1, 36.2), 0.025, MATS['Rope'], 8)
  add_cylinder_between('ExteriorBackstayPort', (0.35, 9.2, 21.3), (-5.25, 1.24, 12.4), 0.024, MATS['Rope'], 8)
  add_cylinder_between('ExteriorBackstayStarboard', (0.35, 9.2, 21.3), (5.25, 1.24, 12.4), 0.024, MATS['Rope'], 8)

  # Small deck fittings reward a close look without turning the threshold into
  # clutter or confusing it with the playable physics props indoors.
  for side in (-1, 1):
    add_cylinder(f'ExteriorBitt_{side}', (side * 1.45, 0.46, 18.2), 0.12, 0.88, MATS['DarkOak'], 16)
    add_box(f'ExteriorBittCrosshead_{side}', (side * 1.45, 0.88, 18.2), (0.48, 0.13, 0.13), MATS['DarkOak'], 0, 0.025)
  for ring_index, radius in enumerate((0.46, 0.34, 0.23)):
    add_torus(f'ExteriorRopeCoil_{ring_index}', (3.55, 0.19 + ring_index * 0.012, 13.15), radius, 0.035, MATS['Rope'])

  # Broad deck beams, knees, and vertical framing make the room read as ship.
  for index, zpos in enumerate(range(-9, 11, 2)):
    width = 12.4 + (zpos + 10) * 0.17
    add_box(f'Cabin_CeilingBeam_{index}', (0, ceiling - 0.2, zpos), (width, 0.28, 0.28), MATS['DarkOak'], 0, 0.025)
    for side in (-1, 1):
      x = side * (width * 0.5 - 0.18)
      add_box(f'FramePost_{index}_{side}', (x, ceiling * 0.5, zpos), (0.18, ceiling - 0.16, 0.22), MATS['DarkOak'])
  # Longitudinal chair rails follow the hull sides. The first version placed
  # these across the beam of the room, bisecting doors and furniture.
  for item in BLUEPRINT['fixedColliders']:
    item_id = item['id']
    if not (item_id.startswith('port-wall') or item_id.startswith('starboard-wall')):
      continue
    x, _, zpos = item['position']
    inward = 0.14 if item_id.startswith('port-wall') else -0.14
    add_box(
      f'HullChairRail_{item_id}',
      (x + inward, 1.03, zpos),
      (0.16, 0.14, item['size'][2] * 0.96),
      MATS['Oak'],
      item.get('yaw', 0),
      0.025,
    )

  # The glazed skylight occupies a real ceiling opening. Four frame rails cover
  # the cut edge while clear panes let the directional sun cast onto the room.
  for x in (-2.66, 1.26):
    add_box(f'Cabin_CeilingSkylightFrameX_{x}', (x, ceiling - 0.07, 5.55), (0.18, 0.14, 2.65), MATS['DarkOak'], 0, 0.018)
  for z in (4.32, 6.78):
    add_box(f'Cabin_CeilingSkylightFrameZ_{z}', (-0.7, ceiling - 0.07, z), (4.1, 0.14, 0.18), MATS['DarkOak'], 0, 0.018)
  add_box('Cabin_CeilingSkylightGlass', (-0.7, ceiling - 0.13, 5.55), (3.72, 0.05, 2.25), MATS['Glass'])
  for x in (-1.85, -0.7, 0.45):
    add_box(f'Cabin_CeilingSkylightBar_{x}', (x, ceiling - 0.17, 5.55), (0.08, 0.08, 2.25), MATS['Brass'])


def table(name, center, size, material_name='Oak'):
  x, y, z = center
  width, height, depth = size
  add_box(f'{name}_Top', (x, height - 0.12, z), (width, 0.24, depth), MATS[material_name], 0, 0.05)
  for sx in (-1, 1):
    for sz in (-1, 1):
      add_box(
        f'{name}_Leg_{sx}_{sz}',
        (x + sx * (width * 0.42), height * 0.46, z + sz * (depth * 0.38)),
        (0.18, height * 0.92, 0.18),
        MATS['DarkOak'],
        0,
        0.025,
      )
  add_box(f'{name}_Stretcher', (x, height * 0.42, z), (width * 0.78, 0.12, 0.15), MATS['DarkOak'])


def build_bookcases():
  # Fitted carcass with generous open display shelves. The Beagle carried a
  # working library, but it did not resemble a modern wall of identical folios.
  add_box('LibraryBookcaseBack', (-7.0, 1.38, 6.05), (0.4, 2.76, 6.4), MATS['DarkOak'])
  for z in (3.05, 9.05):
    add_box(f'LibraryBookcaseEnd_{z}', (-6.67, 1.38, z), (0.42, 2.76, 0.18), MATS['DarkOak'])
  for y in (0.22, 0.82, 1.42, 2.02, 2.68):
    add_box(f'LibraryShelf_{y}', (-6.62, y, 6.05), (0.72, 0.12, 6.2), MATS['Oak'])
  colors = ('BookGreen', 'BookRed', 'BookBlue', 'BookBrown')
  index = 0
  groups = (
    (0.29, 3.4, 3), (0.29, 7.25, 2),
    (0.89, 4.2, 2),
    (1.49, 3.65, 3),
    (2.09, 7.45, 2),
  )
  for shelf_top, start_z, count in groups:
    z = start_z
    for local_index in range(count):
      width = 0.055 + ((index * 7) % 4) * 0.01
      height = 0.22 + ((index * 11) % 5) * 0.026
      depth = 0.18 + ((index * 3) % 4) * 0.016
      book = add_box(
        f'LibraryBook_{index}',
        (-6.31, shelf_top + height * 0.5, z),
        (depth, height, width),
        MATS[colors[index % len(colors)]],
        0,
        0.012,
      )
      # One end volume in some groups leans naturally against its neighbour.
      if local_index == count - 1 and index % 2 == 0:
        book.rotation_euler[1] = -0.12
      if index % 3 == 0:
        add_box(
          f'LibraryBookLabel_{index}',
          (-6.205, shelf_top + height * 0.48, z),
          (0.012, 0.045, min(0.034, width * 0.58)),
          MATS['BookGold'],
          0,
          0.006,
        )
      z += width + 0.014
      index += 1

  # A few restrained shelf objects establish scale while leaving most bays
  # available for a later specimen-display system.
  add_box('LibraryPortfolio', (-6.3, 0.36, 8.15), (0.2, 0.08, 0.5), MATS['BookBrown'], 0, 0.014)
  add_cylinder('LibrarySampleJar', (-6.29, 1.67, 8.72), 0.085, 0.3, MATS['Glass'], 18)
  add_cylinder('LibrarySampleJarStopper', (-6.29, 1.84, 8.72), 0.06, 0.045, MATS['Brass'], 16)


def build_furniture():
  table('LibraryWorktable', (-0.7, 0, 5.55), (5.4, 0.92, 2.2), 'OakLight')
  table('CaptainTable', (-0.25, 0, -3.5), (5.0, 0.92, 2.5), 'Oak')
  table('CaptainChartDesk', (-4.9, 0, -6.7), (2.1, 0.98, 4.2), 'DarkOak')
  build_bookcases()

  # Darwin's drawers and wash stand.
  add_box('DarwinDrawers', (-5.95, 0.7, 9.65), (2.35, 1.4, 0.78), MATS['Oak'], 0, 0.05)
  for y in (0.35, 0.72, 1.08):
    add_box(f'DarwinDrawerFace_{y}', (-5.94, y, 9.23), (2.02, 0.3, 0.05), MATS['DarkOak'], 0, 0.02)
    for x in (-6.45, -5.45):
      add_sphere(f'DarwinDrawerPull_{x}_{y}', (x, y, 9.18), 0.045, MATS['Brass'])
  add_box('WashstandTop', (4.6, 0.95, 9.5), (2.0, 0.12, 0.9), MATS['OakLight'])
  for x in (3.75, 5.45):
    add_box(f'WashstandLeg_{x}', (x, 0.45, 9.5), (0.12, 0.9, 0.12), MATS['DarkOak'])
  add_cylinder('WashBasin', (4.6, 1.04, 9.5), 0.42, 0.12, MATS['WhiteMetal'], 18)

  # Captain's fitted berth, privacy rail, mattress, blanket, and pillows.
  add_box('CaptainBerthBase', (4.85, 0.48, -6.7), (2.25, 0.96, 6.2), MATS['DarkOak'], 0, 0.06)
  add_box('CaptainBerthMattress', (4.85, 1.02, -6.7), (1.94, 0.22, 5.78), MATS['Canvas'], 0, 0.08)
  add_box('CaptainBerthBlanket', (4.85, 1.15, -7.1), (1.86, 0.08, 3.65), MATS['Blanket'], 0, 0.08)
  add_box('CaptainBerthPillow', (4.85, 1.2, -4.45), (1.42, 0.24, 0.72), MATS['Canvas'], 0, 0.12)
  add_box('CaptainBerthRail', (3.7, 1.45, -6.7), (0.13, 1.4, 6.2), MATS['Oak'])

  # Darwin's suspended canvas hammock above a fixed gameplay rest surface.
  add_box('DarwinHammockCanvas', (5.55, 1.38, 6.25), (1.56, 0.16, 5.0), MATS['Canvas'], 0, 0.16)
  add_box('DarwinHammockBlanket', (5.55, 1.49, 6.4), (1.35, 0.08, 3.2), MATS['Blanket'], 0, 0.12)
  for z in (3.7, 8.8):
    add_box(f'HammockRail_{z}', (5.55, 1.52, z), (1.8, 0.12, 0.12), MATS['DarkOak'])
    for x in (4.72, 6.38):
      upper_x = x - 0.28 if x < 5 else x + 0.28
      add_cylinder_between(
        f'HammockRope_{x}_{z}',
        (x, 1.58, z),
        (upper_x, 3.18, z),
        0.026,
        MATS['Oak'],
        8,
      )

  # Stern bench and chronometer bank.
  add_box('SternBenchSeat', (0.1, 0.55, -10.05), (4.6, 0.3, 1.05), MATS['Oak'], 0, 0.06)
  add_box('SternBenchBack', (0.1, 1.05, -10.48), (4.6, 0.9, 0.16), MATS['DarkOak'], 0, 0.04)
  add_box('ChronometerCase', (-4.55, 0.54, -9.45), (2.15, 1.08, 0.72), MATS['DarkOak'], -0.28, 0.055)
  add_box('ChronometerCaseTop', (-4.55, 1.11, -9.45), (2.28, 0.12, 0.84), MATS['Oak'], -0.28, 0.035)
  for row in range(2):
    for column in range(2):
      x = -5.02 + column * 0.94
      y = 0.31 + row * 0.48
      add_box(f'ChronometerBox_{row}_{column}', (x, y, -9.03), (0.76, 0.38, 0.18), MATS['Oak'], -0.28, 0.028)
      add_cylinder(f'ChronometerFace_{row}_{column}', (x, y, -8.92), 0.12, 0.025, MATS['Brass'], 24, (math.pi / 2, 0, 0))
      add_cylinder(f'ChronometerDial_{row}_{column}', (x, y, -8.9), 0.092, 0.018, MATS['Paper'], 24, (math.pi / 2, 0, 0))

  # Charts on the captain's table and desk.
  add_textured_chart('CaptainGalapagosSurveyChart', (-0.25, 0.925, -3.5), 3.35, 2.32, MATS['FitzRoyGalapagosChart'])
  add_box('ChartDeskPaper', (-4.9, 0.995, -6.7), (1.65, 0.025, 3.15), MATS['Paper'])


def build_scientific_details():
  ceiling = BLUEPRINT['dimensions']['ceiling']
  # A compact early compound microscope: forked brass foot, articulated limb,
  # lacquered body tube, focus knobs, stage, objective, and substage mirror.
  base_x, base_z = -2.15, 5.6
  add_box('MicroscopeFootL', (base_x - 0.085, 0.955, base_z), (0.055, 0.035, 0.22), MATS['Brass'], 0.08, 0.014)
  add_box('MicroscopeFootR', (base_x + 0.085, 0.955, base_z), (0.055, 0.035, 0.22), MATS['Brass'], -0.08, 0.014)
  add_box('MicroscopeFootBridge', (base_x, 0.955, base_z + 0.085), (0.19, 0.035, 0.055), MATS['Brass'], 0, 0.012)
  add_cylinder_between('MicroscopeInclinedLimb', (base_x, 0.97, base_z + 0.04), (base_x + 0.025, 1.2, base_z - 0.015), 0.026, MATS['Brass'], 18)
  add_box('MicroscopeStage', (base_x + 0.01, 1.09, base_z - 0.03), (0.22, 0.024, 0.19), MATS['MicroscopeLacquer'], 0, 0.01)
  for side in (-1, 1):
    add_box(f'MicroscopeStageClip_{side}', (base_x + side * 0.062, 1.104, base_z - 0.03), (0.048, 0.007, 0.014), MATS['Brass'], 0, 0.003)
    add_sphere(f'MicroscopeFocusKnob_{side}', (base_x + side * 0.052, 1.19, base_z - 0.015), 0.026, MATS['Brass'], (1, 0.48, 1))
  add_cylinder_between('MicroscopeBodyTube', (base_x + 0.02, 1.15, base_z - 0.01), (base_x + 0.075, 1.35, base_z - 0.07), 0.039, MATS['MicroscopeLacquer'], 24)
  add_cylinder_between('MicroscopeBrassCollar', (base_x + 0.065, 1.31, base_z - 0.06), (base_x + 0.09, 1.39, base_z - 0.085), 0.045, MATS['Brass'], 24)
  add_cylinder_between('MicroscopeEyepiece', (base_x + 0.09, 1.385, base_z - 0.085), (base_x + 0.11, 1.44, base_z - 0.105), 0.026, MATS['MicroscopeLacquer'], 20)
  add_cylinder_between('MicroscopeObjective', (base_x + 0.02, 1.15, base_z - 0.01), (base_x + 0.005, 1.095, base_z + 0.008), 0.019, MATS['Brass'], 18)
  add_cylinder('MicroscopeMirror', (base_x + 0.01, 1.025, base_z + 0.01), 0.058, 0.016, MATS['WhiteMetal'], 24, (math.pi / 2, 0, 0))
  add_torus('MicroscopeMirrorRim', (base_x + 0.01, 1.025, base_z), 0.058, 0.007, MATS['Brass'], (math.pi / 2, 0, 0))

  # Specimen jars and instrument case.
  for index, x in enumerate((-0.25, 0.12, 0.48)):
    height = 0.27 + index * 0.035
    add_cylinder(f'SpecimenJar_{index}', (x, 0.93 + height * 0.5, 5.05), 0.085 + index * 0.008, height, MATS['Glass'], 18)
    add_cylinder(f'SpecimenJarLid_{index}', (x, 0.94 + height, 5.05), 0.09 + index * 0.008, 0.035, MATS['Brass'], 16)
    add_cylinder(f'SpecimenJarSpirit_{index}', (x, 0.94 + height * 0.38, 5.05), 0.063 + index * 0.006, height * 0.67, MATS['PreservingSpirit'], 16)
    if index == 0:
      add_cylinder_between('SpecimenJarTwig', (x - 0.018, 0.98, 5.05), (x + 0.024, 1.11, 5.05), 0.009, MATS['SpecimenBrown'], 8)
    elif index == 1:
      add_sphere('SpecimenJarShell', (x, 1.04, 5.05), 0.035, MATS['SpecimenBrown'], (1.0, 0.46, 0.78))
    else:
      add_sphere('SpecimenJarSeed', (x, 1.07, 5.05), 0.029, MATS['SpecimenBrown'], (0.72, 1.35, 0.72))
  add_box('InstrumentCase', (1.35, 1.04, 6.0), (0.86, 0.22, 0.48), MATS['DarkOak'], 0, 0.035)
  add_sphere('InstrumentCaseLatch', (1.35, 1.045, 5.75), 0.034, MATS['Brass'])

  # A compact inkwell and laid quill turn the library table into a working
  # naturalist's surface rather than a display plinth.
  add_cylinder('LibraryInkwell', (-1.08, 1.015, 6.02), 0.075, 0.13, MATS['InkGlass'], 18)
  add_cylinder('LibraryInkwellLip', (-1.08, 1.09, 6.02), 0.052, 0.035, MATS['Brass'], 18)
  add_cylinder_between('LibraryQuillShaft', (-1.32, 1.02, 5.82), (-1.68, 1.08, 5.46), 0.008, MATS['Paper'], 8)
  add_sphere('LibraryQuillFeather', (-1.72, 1.085, 5.42), 0.085, MATS['Paper'], (0.32, 0.18, 1.35))

  # Telescope and dividers on the chart desk.
  add_cylinder('TelescopeTube', (-4.9, 1.08, -7.1), 0.07, 0.86, MATS['Brass'], 18, (0, 0, math.pi / 2))
  add_cylinder('TelescopeGrip', (-4.9, 1.08, -7.1), 0.085, 0.36, MATS['DarkOak'], 16, (0, 0, math.pi / 2))
  for side in (-1, 1):
    add_cylinder(f'ChartDivider_{side}', (-4.4 + side * 0.06, 1.06, -5.8), 0.012, 0.5, MATS['Brass'], 10, (0, 0, side * 0.18))

  # Four gimballed oil lamps provide visible practical sources in both rooms.
  lamp_positions = ((-3.8, -5.8), (3.25, -3.6), (-3.4, 6.2), (2.2, 5.4))
  for index, (x, z) in enumerate(lamp_positions):
    add_torus(f'LampCeilingRose_{index}', (x, ceiling - 0.1, z), 0.1, 0.02, MATS['Brass'])
    add_cylinder(f'LampChain_{index}', (x, ceiling - 0.38, z), 0.014, 0.5, MATS['Iron'], 10)
    add_cylinder(f'LampCap_{index}', (x, ceiling - 0.66, z), 0.12, 0.09, MATS['Brass'], 20)
    add_sphere(f'LampGlass_{index}', (x, ceiling - 0.86, z), 0.15, MATS['Glass'], (1, 1.22, 1))
    add_sphere(f'LampFlame_{index}', (x, ceiling - 0.9, z), 0.04, MATS['LampFlame'], (0.66, 1.55, 0.66))
    add_cylinder(f'LampReservoir_{index}', (x, ceiling - 1.03, z), 0.13, 0.12, MATS['Brass'], 20)
    add_torus(f'LampGimbal_{index}', (x, ceiling - 0.87, z), 0.18, 0.016, MATS['Brass'])

  # Framed survey sheets sit flat on the side bulkheads with four discrete
  # frame members. No crossed or room-spanning geometry.
  framed_sheets = (
    (-6.55, -1.8, 1.9, 'ArrowsmithWorldMap'),
    (6.5, -1.2, 1.72, 'FitzRoyGalapagosChart'),
    (6.95, 9.0, 1.35, 'Paper'),
  )
  for index, (x, z, width, sheet_material) in enumerate(framed_sheets):
    height = 1.38
    inside_x = x + (0.055 if x < 0 else -0.055)
    for side in (-1, 1):
      add_box(f'WallFrameV_{index}_{side}', (inside_x, 2.2, z + side * width * 0.5), (0.055, height, 0.075), MATS['DarkOak'])
      add_box(f'WallFrameH_{index}_{side}', (inside_x, 2.2 + side * height * 0.5, z), (0.055, 0.075, width), MATS['DarkOak'])
    add_side_map(
      f'WallPaper_{index}',
      inside_x + (0.02 if x < 0 else -0.02),
      2.2,
      z,
      height - 0.14,
      width - 0.14,
      MATS[sheet_material],
    )


def join_by_material():
  groups = {}
  for obj in list(COLLECTION.objects):
    if obj.type != 'MESH' or not obj.data.materials:
      continue
    # Keep ceiling-named objects independently toggleable in top view.
    if 'Ceiling' in obj.name:
      continue
    key = obj.data.materials[0].name if len(obj.data.materials) == 1 else obj.name
    groups.setdefault(key, []).append(obj)
  for key, objects in groups.items():
    if len(objects) < 2:
      continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
      obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = f'Cabin_{key}'


def setup_render(output_dir):
  scene = bpy.context.scene
  for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
    try:
      scene.render.engine = engine
      break
    except TypeError:
      continue
  scene.render.resolution_x = 1200
  scene.render.resolution_y = 820
  scene.render.resolution_percentage = 100
  world = bpy.data.worlds.new('CabinWorld') if not bpy.data.worlds else bpy.data.worlds[0]
  scene.world = world
  world.use_nodes = True
  background = world.node_tree.nodes.get('Background')
  background.inputs[0].default_value = (0.035, 0.055, 0.065, 1)
  background.inputs[1].default_value = 0.35

  helpers = []
  sun = bpy.data.lights.new('WindowSun', type='AREA')
  sun.energy = 1400
  sun.color = (0.72, 0.88, 1.0)
  sun.shape = 'RECTANGLE'
  sun.size = 8
  sun_obj = bpy.data.objects.new('WindowSun', sun)
  COLLECTION.objects.link(sun_obj)
  sun_obj.location = (0, 13, 5)
  sun_obj.rotation_euler = (math.radians(45), 0, 0)
  helpers.append(sun_obj)
  for index, (x, z) in enumerate(((-3.8, -5.8), (1.6, 5.4))):
    lamp = bpy.data.lights.new(f'LampLight_{index}', type='POINT')
    lamp.energy = 520
    lamp.color = (1.0, 0.56, 0.24)
    lamp_obj = bpy.data.objects.new(f'LampLight_{index}', lamp)
    COLLECTION.objects.link(lamp_obj)
    lamp_obj.location = game_to_blender((x, BLUEPRINT['dimensions']['ceiling'] - 0.9, z))
    helpers.append(lamp_obj)

  views = {
    'entrance': ((0, 2.0, 9.1), (0, 1.25, 2.2), 66),
    'weather-deck': ((0, 1.7, 7.6), (0, 1.25, 14.6), 64),
    'library': ((5.8, 2.4, 8.1), (-1.3, 1.25, 5.3), 64),
    'captain-cabin': ((4.8, 2.3, 0.4), (-1.0, 1.35, -5.2), 66),
    'stern': ((0, 2.2, -2.0), (0, 1.8, -10.2), 62),
    'cutaway': ((0, 18, 1), (0, 0, 0), 48),
  }
  output_dir.mkdir(parents=True, exist_ok=True)
  camera_data = bpy.data.cameras.new('CabinCamera')
  camera = bpy.data.objects.new('CabinCamera', camera_data)
  COLLECTION.objects.link(camera)
  scene.camera = camera
  ceiling_objects = [obj for obj in COLLECTION.objects if 'Ceiling' in obj.name]
  for name, (eye, target, fov) in views.items():
    for obj in ceiling_objects:
      obj.hide_render = name == 'cutaway'
    camera_data.angle = math.radians(fov)
    camera.location = game_to_blender(eye)
    target_blender = Vector(game_to_blender(target))
    camera.rotation_euler = (target_blender - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(output_dir / f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', scene.render.filepath)
  for obj in ceiling_objects:
    obj.hide_render = False
  for obj in [camera, *helpers]:
    bpy.data.objects.remove(obj, do_unlink=True)


def main():
  argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
  output = 'public/assets/models/ships/hms-beagle-cabin.glb'
  render_dir = None
  if '--out' in argv:
    output = argv[argv.index('--out') + 1]
  if '--render' in argv:
    render_dir = Path(argv[argv.index('--render') + 1])

  global COLLECTION
  clear_scene()
  COLLECTION = bpy.context.scene.collection
  init_materials()
  build_shell()
  build_furniture()
  build_scientific_details()
  if render_dir is not None:
    setup_render(ROOT / render_dir)
  join_by_material()
  output_path = ROOT / output
  output_path.parent.mkdir(parents=True, exist_ok=True)
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.export_scene.gltf(filepath=str(output_path), export_format='GLB', export_apply=True)
  print(f'exported {output_path} ({output_path.stat().st_size / 1024:.0f} KB)')


main()
