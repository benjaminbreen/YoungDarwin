"""Turn a Mixamo-rigged FBX (mesh + mixamorig skeleton + skin, optionally with an
embedded texture) into a game-ready GLB: scale-normalize to real height, decimate
to a triangle target, optionally re-texture / flip UVs, strip animations.

Usage:
  blender --background --python scripts/blender_rigged_fbx_to_glb.py -- \
    --fbx "Darwin 4 rig Breathing Idle.fbx" --out asset-backups/darwin4.glb \
    --decimate 60000 [--texture base.png] [--flipuv] [--height 1.75]
"""
import bpy
import sys


def arg(flag, default=None):
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return a[a.index(flag) + 1] if flag in a else default


def has(flag):
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return flag in a


fbx = arg("--fbx")
out = arg("--out")
texture = arg("--texture")
decimate = int(arg("--decimate", "0"))
target_h = float(arg("--height", "1.75"))
flipuv = has("--flipuv")


def import_fbx(scale):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx, global_scale=scale)


def mesh_height():
    m = next(o for o in bpy.data.objects if o.type == "MESH")
    zs = [(m.matrix_world @ v.co).z for v in m.data.vertices]
    return max(zs) - min(zs)


def bake_scale():
    objs = list(bpy.data.objects)
    arm = next((o for o in objs if o.type == "ARMATURE"), objs[0])
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    with bpy.context.temp_override(active_object=arm, object=arm,
                                   selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


import_fbx(1.0)
h0 = mesh_height()
factor = target_h / h0 if h0 > 0 else 1.0
print("Native height:", round(h0, 4), "-> rescale factor:", round(factor, 2))
import_fbx(factor)
bake_scale()
print("Rescaled height:", round(mesh_height(), 3))

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]

# Decimate (collapse) to the triangle target; preserves vertex groups (skin).
if decimate:
    for m in meshes:
        tris = sum(1 for _ in m.data.polygons)  # quad-less Mixamo mesh ~= polys
        ratio = min(1.0, decimate / max(1, len(m.data.polygons)))
        mod = m.modifiers.new("Decimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = m
        with bpy.context.temp_override(active_object=m, object=m):
            bpy.ops.object.modifier_apply(modifier="Decimate")
        print("Decimated", m.name, "->", len(m.data.polygons), "polys (ratio", round(ratio, 4), ")")

# Optional explicit texture (else keep the FBX's embedded material).
if texture:
    mat = bpy.data.materials.new("DarwinTex")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.8
    tn = mat.node_tree.nodes.new("ShaderNodeTexImage")
    img = bpy.data.images.load(texture)
    img.colorspace_settings.name = "sRGB"
    tn.image = img
    mat.node_tree.links.new(bsdf.inputs["Base Color"], tn.outputs["Color"])
    for m in meshes:
        m.data.materials.clear()
        m.data.materials.append(mat)

if flipuv:
    for m in meshes:
        uvl = m.data.uv_layers.active
        if uvl:
            for d in uvl.data:
                d.uv[1] = 1.0 - d.uv[1]
    print("Flipped UV V")

for a in arms:
    a.data.pose_position = "REST"
for o in bpy.data.objects:
    if o.animation_data:
        o.animation_data_clear()
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)

bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animations=False,
                          export_skins=True, export_yup=True, use_selection=False)
print("WROTE", out)
