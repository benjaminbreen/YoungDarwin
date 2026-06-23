# Report the loose-part (connected-component) structure of a GLB mesh, so we can
# tell whether small details (buttons, strap) are separate geometry that can be
# auto-assigned a material — or one welded mesh that needs manual face selection.
#   blender --background --python scripts/blender_inspect_darwin_parts.py -- <in.glb>
import bpy, sys, json
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
inp = argv[0]

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=inp)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
out = {"input": inp, "meshObjects": len(meshes), "meshes": []}

for o in meshes:
    me = o.data
    out["meshes"].append({"name": o.name, "verts": len(me.vertices),
                          "polys": len(me.polygons), "materials": [m.name for m in me.materials]})

# Separate the largest mesh by loose parts and summarise the resulting islands.
target = max(meshes, key=lambda o: len(o.data.vertices))
bpy.ops.object.select_all(action="DESELECT")
target.select_set(True)
bpy.context.view_layer.objects.active = target
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

parts = [o for o in bpy.context.scene.objects if o.type == "MESH"]
sizes = []
for o in parts:
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    xs = [v.x for v in bb]; ys = [v.y for v in bb]; zs = [v.z for v in bb]
    dim = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    cy = (max(ys) + min(ys)) / 2.0
    sizes.append({"verts": len(o.data.vertices), "maxDim": round(dim, 4), "centerY": round(cy, 3)})

sizes.sort(key=lambda s: s["maxDim"])
out["looseParts"] = len(parts)
# Histogram of part sizes to spot a cluster of small, button-like islands.
buckets = {}
for s in sizes:
    key = round(s["maxDim"], 2)
    buckets[key] = buckets.get(key, 0) + 1
out["sizeHistogram"] = dict(sorted(buckets.items()))
out["smallestParts"] = sizes[:25]
out["largestParts"] = sizes[-5:]

print("PARTS_REPORT_JSON " + json.dumps(out))
