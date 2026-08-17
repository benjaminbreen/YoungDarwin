"""Build the Nicolás Lawson runtime GLB from his Tripo mesh + Mixamo idle FBX.

Unlike blender_rigged_fbx_to_glb.py this KEEPS the animation: Lawson stands
still, so the idle clip is the whole performance. The clip is renamed to `idle`
because ModelAsset resolves clips by normalized name, and "Armature|mixamo.com|
Layer0" normalizes to nothing a selector can ask for.

Usage:
  blender --background --python scripts/blender_build_lawson_npc.py -- \
    --fbx "assets-src/darwin/characters/lawson-skinned-idle.fbx" \
    --out public/assets/models/npc-nicolas-lawson.glb \
    --decimate 15000 --report <path>
"""
import json
import sys

import bpy


def arg(flag, default=None):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return argv[argv.index(flag) + 1] if flag in argv else default


fbx = arg("--fbx")
out = arg("--out")
report_path = arg("--report")
decimate_target = int(arg("--decimate", "0"))


def import_fbx(scale):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx, global_scale=scale, automatic_bone_orientation=False, ignore_leaf_bones=False)


def meshes():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def armatures():
    return [o for o in bpy.data.objects if o.type == "ARMATURE"]


def static_mesh_bounds():
    points = [m.matrix_world @ v.co for m in meshes() for v in m.data.vertices]
    if not points:
        return {"min": [0.0, 0.0, 0.0], "max": [0.0, 0.0, 0.0], "size": [0.0, 0.0, 0.0]}
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    return {
        "min": [round(value, 5) for value in low],
        "max": [round(value, 5) for value in high],
        "size": [round(high[axis] - low[axis], 5) for axis in range(3)],
    }


def triangle_count():
    total = 0
    for m in meshes():
        total += sum(max(1, len(p.vertices) - 2) for p in m.data.polygons)
    return total


# Preserve the FBX's armature, object transforms, and root animation as one
# coherent transform chain. The root translation and quaternion must be judged
# together; rotating either channel after export turns the valid Y-up idle onto
# its side. Runtime scale and grounding belong in modelAssets, and the final
# posed skin is checked with Three.js after export and texture optimization.
import_fbx(1.0)
source_static_bounds = static_mesh_bounds()

tris_before = triangle_count()

# Collapse-decimate preserves vertex groups, so the skin survives. Applied to
# the mesh only; the armature is untouched.
if decimate_target:
    for arm in armatures():
        arm.data.pose_position = "REST"
    for m in meshes():
        polys = len(m.data.polygons)
        if polys <= decimate_target:
            continue
        modifier = m.modifiers.new("Decimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = decimate_target / polys
        modifier.use_collapse_triangulate = True
        # Decimate the rest mesh before skinning. Leaving the Armature modifier
        # ahead of Decimate makes Blender apply evaluated pose geometry and
        # emits "modifier was not first", weakening reproducibility.
        m.modifiers.move(m.modifiers.find(modifier.name), 0)
        bpy.context.view_layer.objects.active = m
        with bpy.context.temp_override(active_object=m, object=m):
            bpy.ops.object.modifier_apply(modifier="Decimate")

# Grounding is corrected by the manifest's yOffset, measured against the posed
# skin in-scene — not here. See the note above: moving the armature is one of
# the transforms that desynchronises the action.

# One clip, named so a selector can ask for it.
actions = list(bpy.data.actions)
for action in actions:
    action.name = "idle"
for arm in armatures():
    arm.data.pose_position = "POSE"

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    export_animations=True,
    export_skins=True,
    export_yup=True,
    export_apply=False,
    use_selection=False,
)

report = {
    "fbx": fbx,
    "out": out,
    "sourceStaticBounds": source_static_bounds,
    "exportStaticBounds": static_mesh_bounds(),
    "trianglesBefore": tris_before,
    "trianglesAfter": triangle_count(),
    "bones": len(armatures()[0].data.bones) if armatures() else 0,
    "animations": [a.name for a in bpy.data.actions],
    "materials": sorted({m.name for mesh in meshes() for m in mesh.data.materials if m}),
}
if report_path:
    with open(report_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
print("LAWSON_BUILD_REPORT", json.dumps(report))
