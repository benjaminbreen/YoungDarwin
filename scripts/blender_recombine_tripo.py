"""Fuse a Mixamo-rigged FBX (mesh + mixamorig skeleton + skin, no texture) with
the base-color texture salvaged from the Tripo GLB, and export a clean GLB
(rig + skinned mesh + texture, no animations — clips come from animationSource).

Usage:
  blender --background --python scripts/blender_recombine_tripo.py -- \
    --fbx "asset-backups/Breathing Idle.fbx" \
    --texture asset-backups/darwin-tripo-basecolor.png \
    --out asset-backups/darwin-tripo-recombined.glb
"""
import bpy
import sys


def arg(flag, default=None):
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return a[a.index(flag) + 1] if flag in a else default


fbx = arg("--fbx")
texture = arg("--texture")
out = arg("--out")
target_h = float(arg("--height", "1.75"))


def import_fbx(scale):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx, global_scale=scale)


def mesh_height():
    m = next(o for o in bpy.data.objects if o.type == "MESH")
    mw = m.matrix_world
    zs = [(mw @ v.co).z for v in m.data.vertices]
    return max(zs) - min(zs)


# Pass 1: measure native height. Mixamo/Tripo land this ~1cm; we re-import at a
# scale that makes the character ~1.75m so the GLB is self-consistent at real
# scale (modelAssets scale ~= 1, and animationSource position-scaling stays sane).
def bake_scale():
    """Bake every object's scale into mesh + bone data so all node scales are 1
    (the FBX importer leaves the rescale on the Armature node, which would
    propagate to the joints and corrupt ported animation)."""
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
print("Imported meshes:", len(meshes), "armatures:", len(arms))

# The OBJ -> Mixamo -> FBX -> glTF round-trip flips the UV V-axis, which on a
# packed atlas reads as fully scrambled texture. Flip it back.
for m in meshes:
    uvl = m.data.uv_layers.active
    if uvl:
        for d in uvl.data:
            d.uv[1] = 1.0 - d.uv[1]
print("Flipped UV V to undo Mixamo round-trip")

# Build a textured material and assign it to every imported mesh (same UVs).
mat = bpy.data.materials.new("DarwinTripo")
mat.use_nodes = True
nt = mat.node_tree
bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
bsdf.inputs["Metallic"].default_value = 0.0
bsdf.inputs["Roughness"].default_value = 0.8
tex_node = nt.nodes.new("ShaderNodeTexImage")
img = bpy.data.images.load(texture)
img.colorspace_settings.name = "sRGB"
tex_node.image = img
nt.links.new(bsdf.inputs["Base Color"], tex_node.outputs["Color"])

for m in meshes:
    m.data.materials.clear()
    m.data.materials.append(mat)

# Drop animation: rest pose + clear all actions so the GLB exports the bind
# pose and no clips (the runtime borrows clips via animationSource).
for a in arms:
    a.data.pose_position = "REST"
for o in bpy.data.objects:
    if o.animation_data:
        o.animation_data_clear()
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    export_animations=False,
    export_skins=True,
    export_yup=True,
    use_selection=False,
)
print("WROTE", out)
