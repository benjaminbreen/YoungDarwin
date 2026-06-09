import json
import sys

import bpy
from mathutils import Vector


def import_and_measure(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update()

    min_corner = Vector((float('inf'), float('inf'), float('inf')))
    max_corner = Vector((float('-inf'), float('-inf'), float('-inf')))
    mesh_count = 0

    for obj in bpy.context.scene.objects:
      if obj.type != 'MESH':
        continue
      mesh_count += 1
      for corner in obj.bound_box:
        world_corner = obj.matrix_world @ Vector(corner)
        min_corner.x = min(min_corner.x, world_corner.x)
        min_corner.y = min(min_corner.y, world_corner.y)
        min_corner.z = min(min_corner.z, world_corner.z)
        max_corner.x = max(max_corner.x, world_corner.x)
        max_corner.y = max(max_corner.y, world_corner.y)
        max_corner.z = max(max_corner.z, world_corner.z)

    dimensions = max_corner - min_corner
    return {
        "path": path,
        "meshCount": mesh_count,
        "min": [min_corner.x, min_corner.y, min_corner.z],
        "max": [max_corner.x, max_corner.y, max_corner.z],
        "dimensions": [dimensions.x, dimensions.y, dimensions.z],
    }


paths = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
print("BOUNDS_JSON_START")
print(json.dumps([import_and_measure(path) for path in paths], indent=2))
print("BOUNDS_JSON_END")
