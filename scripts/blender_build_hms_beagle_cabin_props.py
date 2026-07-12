"""Build textured runtime GLBs for the movable HMS Beagle cabin props."""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
TEXTURES = ROOT / 'public/assets/textures/interiors/beagle-cabin'
OUTPUT = ROOT / 'public/assets/models/props/beagle-cabin'
MATS = {}


def linear_channel(value):
  return (value / 12.92) if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def hex_color(value):
  raw = value.lstrip('#')
  return tuple(linear_channel(int(raw[index:index + 2], 16) / 255) for index in (0, 2, 4))


def simple_material(name, color, roughness=0.7, metalness=0.0):
  if name in MATS:
    return MATS[name]
  result = bpy.data.materials.new(name)
  result.use_nodes = True
  bsdf = result.node_tree.nodes.get('Principled BSDF')
  bsdf.inputs['Base Color'].default_value = (*hex_color(color), 1)
  bsdf.inputs['Roughness'].default_value = roughness
  bsdf.inputs['Metallic'].default_value = metalness
  MATS[name] = result
  return result


def oak_material():
  if 'CabinVarnishedOak' in MATS:
    return MATS['CabinVarnishedOak']
  result = bpy.data.materials.new('CabinVarnishedOak')
  result.use_nodes = True
  nodes = result.node_tree.nodes
  links = result.node_tree.links
  bsdf = nodes.get('Principled BSDF')
  coord = nodes.new('ShaderNodeTexCoord')
  mapping = nodes.new('ShaderNodeMapping')
  mapping.inputs['Scale'].default_value = (1.35, 1.35, 1)
  links.new(coord.outputs['UV'], mapping.inputs['Vector'])
  for filename, target, non_color in (
    ('varnished-oak-diff-1k.jpg', 'Base Color', False),
    ('varnished-oak-rough-1k.jpg', 'Roughness', True),
    ('varnished-oak-normal-1k.jpg', None, True),
  ):
    image = nodes.new('ShaderNodeTexImage')
    image.image = bpy.data.images.load(str(TEXTURES / filename), check_existing=True)
    if non_color:
      image.image.colorspace_settings.name = 'Non-Color'
    links.new(mapping.outputs['Vector'], image.inputs['Vector'])
    if target:
      links.new(image.outputs['Color'], bsdf.inputs[target])
    else:
      normal = nodes.new('ShaderNodeNormalMap')
      normal.inputs['Strength'].default_value = 0.42
      links.new(image.outputs['Color'], normal.inputs['Color'])
      links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
  MATS['CabinVarnishedOak'] = result
  return result


def game_point(position):
  return (position[0], -position[2], position[1])


def add_box(name, position, size, material, bevel=0.02, rotation=(0, 0, 0)):
  bpy.ops.mesh.primitive_cube_add(size=1, location=game_point(position))
  obj = bpy.context.object
  obj.name = name
  obj.dimensions = (size[0], size[2], size[1])
  obj.rotation_euler = (rotation[2], -rotation[0], -rotation[1])
  bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
  obj.data.materials.append(material)
  if bevel:
    modifier = obj.modifiers.new('SoftEdges', 'BEVEL')
    modifier.width = bevel
    modifier.segments = 2
  return obj


def add_cylinder(name, position, radius, height, material, sides=20, rotation=(0, 0, 0), top_radius=None):
  bpy.ops.mesh.primitive_cone_add(
    vertices=sides,
    radius1=radius,
    radius2=top_radius if top_radius is not None else radius,
    depth=height,
    location=game_point(position),
  )
  obj = bpy.context.object
  obj.name = name
  obj.rotation_euler = (rotation[2], -rotation[0], -rotation[1])
  obj.data.materials.append(material)
  bevel = obj.modifiers.new('TurnedEdges', 'BEVEL')
  bevel.width = min(0.012, radius * 0.14)
  bevel.segments = 2
  return obj


def add_torus(name, position, major_radius, minor_radius, material, rotation=(0, 0, 0), arc=math.tau):
  bpy.ops.mesh.primitive_torus_add(
    major_radius=major_radius,
    minor_radius=minor_radius,
    major_segments=28,
    minor_segments=8,
    abso_major_rad=major_radius + minor_radius,
    abso_minor_rad=minor_radius,
    location=game_point(position),
  )
  obj = bpy.context.object
  obj.name = name
  obj.rotation_euler = (rotation[2], -rotation[0], -rotation[1])
  obj.data.materials.append(material)
  return obj


def add_rod(name, start, end, radius, material, sides=12):
  start_point = Vector(game_point(start))
  end_point = Vector(game_point(end))
  delta = end_point - start_point
  bpy.ops.mesh.primitive_cylinder_add(
    vertices=sides,
    radius=radius,
    depth=delta.length,
    location=(start_point + end_point) * 0.5,
  )
  obj = bpy.context.object
  obj.name = name
  obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
  obj.data.materials.append(material)
  return obj


def add_curved_rod(name, points, radius, material):
  curve = bpy.data.curves.new(name, type='CURVE')
  curve.dimensions = '3D'
  curve.resolution_u = 2
  curve.bevel_depth = radius
  curve.bevel_resolution = 2
  spline = curve.splines.new('POLY')
  spline.points.add(len(points) - 1)
  for point, position in zip(spline.points, points):
    converted = game_point(position)
    point.co = (*converted, 1)
  obj = bpy.data.objects.new(name, curve)
  bpy.context.scene.collection.objects.link(obj)
  obj.data.materials.append(material)
  return obj


def materials():
  return {
    'oak': oak_material(),
    'iron': simple_material('CabinBlackenedIron', '#252521', 0.32, 0.72),
    'brass': simple_material('CabinPolishedBrass', '#b47b26', 0.18, 0.92),
    'canvas': simple_material('CabinCanvas', '#9f9270', 0.94, 0),
    'paper': simple_material('CabinChartPaper', '#cdbf92', 0.9, 0),
    'cord': simple_material('CabinCord', '#5d3f25', 0.9, 0),
    'tin': simple_material('CabinPewter', '#8d9290', 0.26, 0.82),
    'wax': simple_material('CabinCandleWax', '#d9cda7', 0.9, 0),
    'wick': simple_material('CabinWick', '#1f1a14', 0.9, 0),
    'inside': simple_material('CabinPropInterior', '#17130f', 0.95, 0),
  }


def build_chair(m):
  add_box('ChairSeat', (0, -0.14, 0), (0.72, 0.11, 0.64), m['oak'], 0.045)
  for side in (-1, 1):
    for front in (-1, 1):
      x = side * 0.29
      z = front * 0.24
      add_rod(f'ChairLeg_{side}_{front}', (x, -0.18, z), (x + side * 0.055, -0.62, z + front * 0.035), 0.045, m['oak'])
  for side in (-1, 1):
    add_rod(f'ChairBackPost_{side}', (side * 0.3, -0.11, 0.25), (side * 0.33, 0.61, 0.29), 0.045, m['oak'])
  for index, y in enumerate((0.06, 0.28, 0.5)):
    add_box(f'ChairBackSlat_{index}', (0, y, 0.285), (0.6, 0.075, 0.045), m['oak'], 0.025)
  add_rod('ChairFrontStretcher', (-0.3, -0.4, -0.25), (0.3, -0.4, -0.25), 0.026, m['oak'])
  add_rod('ChairSideStretcherL', (-0.32, -0.39, -0.23), (-0.32, -0.39, 0.25), 0.024, m['oak'])
  add_rod('ChairSideStretcherR', (0.32, -0.39, -0.23), (0.32, -0.39, 0.25), 0.024, m['oak'])


def build_stool(m):
  add_box('StoolCanvasSeat', (0, 0.32, 0), (0.64, 0.08, 0.52), m['canvas'], 0.035)
  for z in (-0.21, 0.21):
    add_rod(f'StoolLegA_{z}', (-0.25, -0.38, z), (0.22, 0.3, z), 0.037, m['oak'])
    add_rod(f'StoolLegB_{z}', (0.25, -0.38, z), (-0.22, 0.3, z), 0.037, m['oak'])
    add_cylinder(f'StoolPivot_{z}', (0, -0.03, z), 0.055, 0.05, m['brass'], 18, (math.pi / 2, 0, 0))
  add_rod('StoolCrossbar', (0, -0.22, -0.24), (0, -0.22, 0.24), 0.03, m['oak'])


def build_chest(m):
  add_box('SeaChestBody', (0, -0.08, 0), (1.34, 0.65, 0.82), m['oak'], 0.055)
  add_box('SeaChestLid', (0, 0.31, 0), (1.4, 0.18, 0.88), m['oak'], 0.08)
  for x in (-0.48, 0, 0.48):
    add_box(f'SeaChestIronStrap_{x}', (x, 0.02, -0.421), (0.07, 0.76, 0.025), m['iron'], 0.012)
    add_box(f'SeaChestLidStrap_{x}', (x, 0.34, 0), (0.07, 0.035, 0.91), m['iron'], 0.01)
  add_box('SeaChestLock', (0, 0.02, -0.44), (0.18, 0.21, 0.035), m['brass'], 0.025)
  for side in (-1, 1):
    outward = side * 0.025
    add_curved_rod(f'SeaChestHandle_{side}', [
      (side * 0.7, 0.04, -0.15),
      (side * 0.7 + outward, -0.07, -0.18),
      (side * 0.7 + outward, -0.15, 0),
      (side * 0.7 + outward, -0.07, 0.18),
      (side * 0.7, 0.04, 0.15),
    ], 0.018, m['iron'])
    for z in (-0.14, 0.14):
      add_cylinder(f'SeaChestHandlePin_{side}_{z}', (side * 0.705, -0.02, z), 0.034, 0.03, m['brass'], 14, (0, 0, math.pi / 2))


def build_bucket(m):
  bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.235, radius2=0.3, depth=0.5, end_fill_type='NOTHING', location=game_point((0, 0, 0)))
  body = bpy.context.object
  body.name = 'BucketStaves'
  body.data.materials.append(m['oak'])
  add_cylinder('BucketBottom', (0, -0.25, 0), 0.235, 0.035, m['oak'], 20)
  add_cylinder('BucketDarkInterior', (0, 0.245, 0), 0.275, 0.012, m['inside'], 20)
  for y, radius in ((-0.18, 0.25), (0.12, 0.285)):
    add_torus(f'BucketHoop_{y}', (0, y, 0), radius, 0.015, m['iron'], (math.pi / 2, 0, 0))
  add_curved_rod('BucketHandle', [
    (math.cos(theta) * 0.29, 0.12 + math.sin(theta) * 0.42, 0)
    for theta in [index * math.pi / 16 for index in range(17)]
  ], 0.016, m['iron'])
  for side in (-1, 1):
    add_cylinder(f'BucketHandlePin_{side}', (side * 0.29, 0.12, 0), 0.035, 0.035, m['brass'], 14, (0, 0, math.pi / 2))


def build_chart(m):
  add_cylinder('ChartRoll', (0, 0, 0), 0.066, 0.72, m['paper'], 24)
  for y in (-0.34, 0.34):
    add_torus(f'ChartRolledEdge_{y}', (0, y, 0), 0.056, 0.012, m['paper'], (math.pi / 2, 0, 0))
  for y in (-0.12, 0.12):
    add_cylinder(f'ChartTie_{y}', (0, y, 0), 0.074, 0.035, m['cord'], 18)


def build_weight(m):
  add_cylinder('ChartWeightBase', (0, -0.02, 0), 0.135, 0.09, m['brass'], 24, top_radius=0.115)
  add_torus('ChartWeightFoot', (0, -0.065, 0), 0.115, 0.018, m['brass'], (math.pi / 2, 0, 0))
  add_cylinder('ChartWeightNeck', (0, 0.055, 0), 0.044, 0.08, m['brass'], 20, top_radius=0.032)
  bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=0.058, location=game_point((0, 0.12, 0)))
  bpy.context.object.name = 'ChartWeightKnob'
  bpy.context.object.data.materials.append(m['brass'])


def build_mug(m):
  bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.085, radius2=0.105, depth=0.21, end_fill_type='NOTHING', location=game_point((0, 0, 0)))
  cup = bpy.context.object
  cup.name = 'TinMugBody'
  cup.data.materials.append(m['tin'])
  add_cylinder('TinMugBase', (0, -0.108, 0), 0.086, 0.018, m['tin'], 24)
  add_torus('TinMugLip', (0, 0.105, 0), 0.1, 0.008, m['tin'], (math.pi / 2, 0, 0))
  add_curved_rod('TinMugHandle', [
    (0.1 + math.cos(theta) * 0.075, math.sin(theta) * 0.078, 0)
    for theta in [-math.pi / 2 + index * math.pi / 12 for index in range(13)]
  ], 0.013, m['tin'])


def build_candlestick(m):
  add_cylinder('CandlestickFoot', (0, -0.215, 0), 0.14, 0.05, m['brass'], 28, top_radius=0.115)
  add_torus('CandlestickFootRing', (0, -0.235, 0), 0.12, 0.015, m['brass'], (math.pi / 2, 0, 0))
  add_cylinder('CandlestickStemLower', (0, -0.12, 0), 0.045, 0.16, m['brass'], 22, top_radius=0.027)
  add_torus('CandlestickStemRing', (0, -0.04, 0), 0.045, 0.012, m['brass'], (math.pi / 2, 0, 0))
  add_cylinder('CandlestickSocket', (0, 0.015, 0), 0.063, 0.09, m['brass'], 22, top_radius=0.052)
  add_cylinder('Candle', (0, 0.14, 0), 0.033, 0.18, m['wax'], 20, top_radius=0.03)
  add_cylinder('CandleWick', (0, 0.238, 0), 0.006, 0.025, m['wick'], 10)


BUILDERS = {
  'cabin-chair': build_chair,
  'folding-stool': build_stool,
  'sea-chest': build_chest,
  'stave-bucket': build_bucket,
  'rolled-chart': build_chart,
  'chart-weight': build_weight,
  'tin-mug': build_mug,
  'brass-candlestick': build_candlestick,
}


def clear_objects():
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.object.delete()


def export_prop(name, builder, mats):
  clear_objects()
  builder(mats)
  output = OUTPUT / f'{name}.glb'
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_apply=True, use_selection=True)
  print(f'exported {output.name}: {output.stat().st_size / 1024:.0f} KB')


def render_gallery(output_path):
  clear_objects()
  heights = {
    'cabin-chair': 0.62,
    'folding-stool': 0.38,
    'sea-chest': 0.42,
    'stave-bucket': 0.28,
    'rolled-chart': 0.38,
    'chart-weight': 0.075,
    'tin-mug': 0.12,
    'brass-candlestick': 0.24,
  }
  for index, name in enumerate(BUILDERS):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(OUTPUT / f'{name}.glb'))
    imported = [obj for obj in bpy.context.scene.objects if obj not in before]
    column = index % 4
    row = index // 4
    offset = Vector(((column - 1.5) * 2.05, row * 2.1, heights[name]))
    for obj in imported:
      if obj.parent is None:
        obj.location += offset

  bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 1.0, -0.012))
  floor = bpy.context.object
  floor.name = 'GalleryFloor'
  floor.data.materials.append(simple_material('GalleryFloorMaterial', '#29231c', 0.82, 0))

  world = bpy.data.worlds.new('PropGalleryWorld') if not bpy.data.worlds else bpy.data.worlds[0]
  bpy.context.scene.world = world
  world.use_nodes = True
  world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.025, 0.035, 0.045, 1)
  world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35

  area = bpy.data.lights.new('GalleryKey', 'AREA')
  area.energy = 1350
  area.shape = 'RECTANGLE'
  area.size = 7
  area_obj = bpy.data.objects.new('GalleryKey', area)
  bpy.context.scene.collection.objects.link(area_obj)
  area_obj.location = (-4, -4, 7)

  camera_data = bpy.data.cameras.new('GalleryCamera')
  camera = bpy.data.objects.new('GalleryCamera', camera_data)
  bpy.context.scene.collection.objects.link(camera)
  camera.location = (5.8, -10.5, 5.6)
  target = Vector((0, 1.0, 0.5))
  camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
  camera_data.angle = math.radians(50)
  scene = bpy.context.scene
  scene.camera = camera
  scene.render.engine = 'BLENDER_EEVEE'
  scene.render.resolution_x = 1500
  scene.render.resolution_y = 820
  scene.render.resolution_percentage = 100
  scene.render.filepath = str(output_path)
  output_path.parent.mkdir(parents=True, exist_ok=True)
  bpy.ops.render.render(write_still=True)


def main():
  OUTPUT.mkdir(parents=True, exist_ok=True)
  clear_objects()
  mats = materials()
  for name, builder in BUILDERS.items():
    export_prop(name, builder, mats)
  argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
  if '--render' in argv:
    render_gallery(ROOT / argv[argv.index('--render') + 1])


main()
