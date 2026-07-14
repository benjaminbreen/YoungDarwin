"""Build shared 1830s brass lighting props for the Beagle and Lawson house.

Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background \
    --disable-autoexec --python scripts/blender_build_period_lighting_props.py

The assets use glTF physical transmission for lamp glass and a small authored
roughness map for aged brass. Visible flames are named ``PeriodLampFlame`` so
the shared interior lighting rig can extinguish them during bright daylight.
"""

from pathlib import Path
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
TEXTURES = ROOT / 'public/assets/textures/interiors/shared-period-lighting'
OUTPUT = ROOT / 'public/assets/models/props/interiors'
MATS = {}


def srgb(hexcode):
  value = hexcode.lstrip('#')
  return tuple(int(value[index:index + 2], 16) / 255 for index in (0, 2, 4))


def linear(color):
  return tuple((value / 12.92) if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in color)


def game_point(position):
  return (position[0], -position[2], position[1])


def clear_scene():
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.object.delete()
  for blocks in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.images):
    for block in list(blocks):
      if block.users == 0:
        blocks.remove(block)
  MATS.clear()


def standard_material(name, color, roughness, metallic=0, emission=None):
  material = bpy.data.materials.new(name)
  material.use_nodes = True
  bsdf = material.node_tree.nodes.get('Principled BSDF')
  bsdf.inputs['Base Color'].default_value = (*linear(srgb(color)), 1)
  bsdf.inputs['Roughness'].default_value = roughness
  bsdf.inputs['Metallic'].default_value = metallic
  if emission:
    emission_color = bsdf.inputs.get('Emission Color') or bsdf.inputs.get('Emission')
    if emission_color:
      emission_color.default_value = (*linear(srgb(emission[0])), 1)
    if bsdf.inputs.get('Emission Strength'):
      bsdf.inputs['Emission Strength'].default_value = emission[1]
  MATS[name] = material
  return material


def brass_material():
  material = bpy.data.materials.new('PeriodBrassPolished')
  material.use_nodes = True
  nodes = material.node_tree.nodes
  links = material.node_tree.links
  bsdf = nodes.get('Principled BSDF')
  bsdf.inputs['Base Color'].default_value = (*linear(srgb('#b27628')), 1)
  bsdf.inputs['Metallic'].default_value = 0.96
  roughness = nodes.new('ShaderNodeTexImage')
  roughness.image = bpy.data.images.load(str(TEXTURES / 'aged-brass-roughness.png'), check_existing=True)
  roughness.image.colorspace_settings.name = 'Non-Color'
  links.new(roughness.outputs['Color'], bsdf.inputs['Roughness'])
  MATS['PeriodBrassPolished'] = material
  return material


def glass_material(name, color, roughness=0.08, transmission=0.96, ior=1.52):
  material = bpy.data.materials.new(name)
  material.use_nodes = True
  bsdf = material.node_tree.nodes.get('Principled BSDF')
  bsdf.inputs['Base Color'].default_value = (*linear(srgb(color)), 1)
  bsdf.inputs['Roughness'].default_value = roughness
  transmission_input = bsdf.inputs.get('Transmission Weight') or bsdf.inputs.get('Transmission')
  if transmission_input:
    transmission_input.default_value = transmission
  if bsdf.inputs.get('IOR'):
    bsdf.inputs['IOR'].default_value = ior
  coat = bsdf.inputs.get('Coat Weight') or bsdf.inputs.get('Clearcoat')
  if coat:
    coat.default_value = 0.12
  material.diffuse_color = (*linear(srgb(color)), 0.36)
  MATS[name] = material
  return material


def init_materials():
  brass_material()
  standard_material('PeriodBrassAged', '#71542f', 0.46, 0.88)
  standard_material('PeriodIronBlackened', '#20201e', 0.52, 0.82)
  standard_material('PeriodCandleWax', '#d9cda8', 0.72)
  standard_material('PeriodWick', '#16120e', 0.94)
  standard_material('PeriodLampFlame', '#ffbf65', 0.18, emission=('#ff6f23', 5.2))
  glass_material('PeriodLampGlass', '#d7e1d8', 0.085, 0.94)
  glass_material('PeriodLampGlassSooted', '#9d9f8c', 0.18, 0.78)


def smooth(obj):
  if obj.type == 'MESH':
    for polygon in obj.data.polygons:
      polygon.use_smooth = True
  return obj


def add_cylinder(name, position, radius, height, material, sides=32, top_radius=None):
  bpy.ops.mesh.primitive_cone_add(
    vertices=sides,
    radius1=radius,
    radius2=radius if top_radius is None else top_radius,
    depth=height,
    location=game_point(position),
  )
  obj = smooth(bpy.context.object)
  obj.name = name
  obj.data.materials.append(material)
  bevel = obj.modifiers.new('HandFinishedEdge', 'BEVEL')
  bevel.width = min(0.008, radius * 0.1)
  bevel.segments = 2
  return obj


def add_sphere(name, position, radius, material, scale=(1, 1, 1)):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=game_point(position))
  obj = smooth(bpy.context.object)
  obj.name = name
  obj.scale = (scale[0], scale[2], scale[1])
  obj.data.materials.append(material)
  return obj


def add_torus(name, position, major, minor, material, rotation=(0, 0, 0)):
  bpy.ops.mesh.primitive_torus_add(
    major_radius=major,
    minor_radius=minor,
    major_segments=36,
    minor_segments=10,
    location=game_point(position),
  )
  obj = smooth(bpy.context.object)
  obj.name = name
  obj.rotation_euler = (rotation[2], rotation[0], -rotation[1])
  obj.data.materials.append(material)
  return obj


def add_rod(name, start, end, radius, material, sides=16):
  a = Vector(game_point(start))
  b = Vector(game_point(end))
  delta = b - a
  bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=delta.length, location=(a + b) * 0.5)
  obj = smooth(bpy.context.object)
  obj.name = name
  obj.rotation_mode = 'QUATERNION'
  obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
  obj.data.materials.append(material)
  return obj


def add_lathe(name, position, profile, material, segments=40, cap_start=True, cap_end=True):
  vertices = []
  for radius, y in profile:
    for segment in range(segments):
      angle = segment / segments * math.tau
      vertices.append(game_point((
        position[0] + math.cos(angle) * radius,
        position[1] + y,
        position[2] + math.sin(angle) * radius,
      )))
  faces = []
  for ring in range(len(profile) - 1):
    for segment in range(segments):
      next_segment = (segment + 1) % segments
      faces.append((
        ring * segments + segment,
        ring * segments + next_segment,
        (ring + 1) * segments + next_segment,
        (ring + 1) * segments + segment,
      ))
  if cap_start:
    faces.append(tuple(reversed(range(segments))))
  if cap_end:
    start = (len(profile) - 1) * segments
    faces.append(tuple(start + segment for segment in range(segments)))
  mesh = bpy.data.meshes.new(name)
  mesh.from_pydata(vertices, [], faces)
  mesh.update()
  obj = smooth(bpy.data.objects.new(name, mesh))
  bpy.context.scene.collection.objects.link(obj)
  obj.data.materials.append(material)
  bevel = obj.modifiers.new('TurnedEdgeHighlights', 'BEVEL')
  bevel.width = 0.004
  bevel.segments = 2
  return obj


def add_chain(origin_y, count=5, spacing=0.082):
  for index in range(count):
    add_torus(
      f'LampChainLink_{index}',
      (0, origin_y - index * spacing, 0),
      0.043,
      0.008,
      MATS['PeriodIronBlackened'],
      rotation=(math.pi / 2, 0, math.pi / 2 if index % 2 else 0),
    )


def build_hanging_oil_lamp():
  brass = MATS['PeriodBrassPolished']
  aged = MATS['PeriodBrassAged']
  iron = MATS['PeriodIronBlackened']
  glass = MATS['PeriodLampGlass']
  add_lathe('LampCeilingRose', (0, -0.055, 0), ((0.12, 0), (0.13, 0.02), (0.095, 0.06)), aged, 40)
  add_torus('LampCeilingHook', (0, -0.12, 0), 0.055, 0.012, iron, rotation=(math.pi / 2, 0, 0))
  add_chain(-0.2, 5)
  add_torus('LampSuspensionRing', (0, -0.62, 0), 0.082, 0.012, brass)
  add_lathe('LampUpperCap', (0, -0.71, 0), ((0.075, 0), (0.13, 0.045), (0.1, 0.1), (0.075, 0.135)), brass, 40)
  # A recognisable chimney with a narrow waist, flared crown, and open ends.
  add_lathe('LampGlassChimney', (0, -1.03, 0), (
    (0.105, 0), (0.13, 0.045), (0.145, 0.16), (0.12, 0.28),
    (0.1, 0.39), (0.11, 0.53), (0.14, 0.6),
  ), glass, 48, cap_start=False, cap_end=False)
  add_torus('LampChimneyLip', (0, -0.43, 0), 0.14, 0.008, glass)
  add_torus('LampBurnerGallery', (0, -1.0, 0), 0.155, 0.018, aged)
  for index in range(12):
    angle = index / 12 * math.tau
    add_rod(
      f'LampGalleryVent_{index}',
      (math.cos(angle) * 0.115, -1.02, math.sin(angle) * 0.115),
      (math.cos(angle) * 0.115, -0.93, math.sin(angle) * 0.115),
      0.008,
      brass,
      10,
    )
  add_sphere('PeriodLampFlame_Main', (0, -0.91, 0), 0.045, MATS['PeriodLampFlame'], (0.66, 1.7, 0.66))
  add_lathe('LampReservoir', (0, -1.26, 0), (
    (0.08, 0), (0.16, 0.035), (0.205, 0.11), (0.22, 0.2),
    (0.18, 0.285), (0.11, 0.335), (0.085, 0.37),
  ), brass, 48)
  add_lathe('LampReservoirLowerBand', (0, -1.255, 0), ((0.12, 0), (0.19, 0.035), (0.13, 0.07)), aged, 40)
  # One clean vertical safety hoop is enough at gameplay scale. The previous
  # second torus crossed the chimney on the wrong axis and read as broken
  # geometry rather than a working gimbal.
  add_torus('LampGimbalOuter', (0, -1.02, 0), 0.27, 0.014, brass, rotation=(math.pi / 2, 0, 0))
  for side in (-1, 1):
    add_rod(
      f'LampGimbalPivot_{side}',
      (side * 0.27, -1.02, 0),
      (side * 0.19, -1.02, 0),
      0.021,
      aged,
      20,
    )


def build_table_oil_lamp():
  brass = MATS['PeriodBrassPolished']
  aged = MATS['PeriodBrassAged']
  glass = MATS['PeriodLampGlassSooted']
  add_lathe('TableLampFoot', (0, 0, 0), ((0.11, 0.01), (0.18, 0.035), (0.2, 0.07), (0.15, 0.105), (0.11, 0.13)), aged, 44)
  add_lathe('TableLampReservoir', (0, 0.1, 0), (
    (0.1, 0), (0.16, 0.04), (0.19, 0.11), (0.18, 0.2), (0.12, 0.27), (0.08, 0.3),
  ), brass, 44)
  add_torus('TableLampReservoirBand', (0, 0.24, 0), 0.17, 0.011, aged)
  add_torus('TableLampBurnerGallery', (0, 0.42, 0), 0.105, 0.016, brass)
  for index in range(10):
    angle = index / 10 * math.tau
    add_rod(
      f'TableLampGalleryVent_{index}',
      (math.cos(angle) * 0.078, 0.38, math.sin(angle) * 0.078),
      (math.cos(angle) * 0.078, 0.45, math.sin(angle) * 0.078),
      0.006,
      aged,
      8,
    )
  add_sphere('PeriodLampFlame_Table', (0, 0.49, 0), 0.034, MATS['PeriodLampFlame'], (0.66, 1.65, 0.66))
  add_lathe('TableLampGlassChimney', (0, 0.4, 0), (
    (0.085, 0), (0.105, 0.04), (0.115, 0.16), (0.09, 0.28), (0.08, 0.42), (0.105, 0.5),
  ), glass, 44, cap_start=False, cap_end=False)
  add_torus('TableLampChimneyLip', (0, 0.9, 0), 0.105, 0.007, glass)
  add_rod('TableLampThumbWheelStem', (0.1, 0.4, 0), (0.17, 0.4, 0), 0.012, aged, 12)
  add_torus('TableLampThumbWheel', (0.19, 0.4, 0), 0.03, 0.008, aged, rotation=(math.pi / 2, 0, 0))


def build_candlestick():
  brass = MATS['PeriodBrassPolished']
  aged = MATS['PeriodBrassAged']
  wax = MATS['PeriodCandleWax']
  wick = MATS['PeriodWick']
  add_lathe('CandlestickTurnedBody', (0, 0, 0), (
    (0.13, 0.005), (0.155, 0.025), (0.15, 0.055), (0.1, 0.085),
    (0.048, 0.12), (0.032, 0.23), (0.055, 0.29), (0.07, 0.325),
  ), brass, 48)
  add_torus('CandlestickFootRing', (0, 0.05, 0), 0.12, 0.012, aged)
  add_lathe('CandlestickSocket', (0, 0.315, 0), ((0.052, 0), (0.073, 0.035), (0.068, 0.105)), aged, 40)
  add_torus('CandlestickDripPan', (0, 0.34, 0), 0.1, 0.012, brass)
  add_cylinder('CandlestickTallowCandle', (0, 0.49, 0), 0.042, 0.28, wax, 32, top_radius=0.038)
  add_sphere('CandlestickMeltedCrown', (0, 0.632, 0), 0.041, wax, (1, 0.18, 1))
  for index, (angle, length) in enumerate(((0.3, 0.07), (2.2, 0.045), (4.5, 0.06))):
    add_sphere(
      f'CandlestickWaxDrip_{index}',
      (math.cos(angle) * 0.039, 0.61 - length * 0.45, math.sin(angle) * 0.039),
      0.012,
      wax,
      (0.72, length / 0.02, 0.72),
    )
  add_cylinder('CandlestickBlackenedWick', (0, 0.655, 0), 0.0045, 0.045, wick, 12)


def export_asset(filename, builder):
  clear_scene()
  init_materials()
  builder()
  OUTPUT.mkdir(parents=True, exist_ok=True)
  output = OUTPUT / filename
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.export_scene.gltf(
    filepath=str(output),
    export_format='GLB',
    export_apply=True,
    export_materials='EXPORT',
    use_selection=True,
  )
  print(f'exported {output.relative_to(ROOT)} ({output.stat().st_size / 1024:.0f} KB)')


export_asset('period-hanging-oil-lamp.glb', build_hanging_oil_lamp)
export_asset('period-table-oil-lamp.glb', build_table_oil_lamp)
export_asset('period-brass-candlestick.glb', build_candlestick)
