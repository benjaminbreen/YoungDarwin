import argparse
import json
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-fbx", required=True)
    parser.add_argument("--output-glb", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--target-height", type=float, default=1.78)
    return parser.parse_args(argv)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    return list(set(bpy.data.objects) - before)


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def scene_bounds(objects=None):
    meshes = [obj for obj in (objects or mesh_objects()) if obj.type == "MESH"]
    if not meshes:
        return None
    mins = Vector((float("inf"), float("inf"), float("inf")))
    maxs = Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in meshes:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, point.x)
            mins.y = min(mins.y, point.y)
            mins.z = min(mins.z, point.z)
            maxs.x = max(maxs.x, point.x)
            maxs.y = max(maxs.y, point.y)
            maxs.z = max(maxs.z, point.z)
    size = maxs - mins
    return {
        "min": [round(value, 5) for value in mins],
        "max": [round(value, 5) for value in maxs],
        "size": [round(value, 5) for value in size],
    }


def normalize_height(target_height):
    meshes = mesh_objects()
    bounds = scene_bounds(meshes)
    if not bounds:
        return 1.0
    min_z = bounds["min"][2]
    height = max(bounds["size"][2], 0.001)
    scale = target_height / height
    for obj in bpy.context.scene.objects:
        if obj.parent is None:
            obj.location.z = (obj.location.z - min_z) * scale
            obj.scale = (obj.scale.x * scale, obj.scale.y * scale, obj.scale.z * scale)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return scale


def cleanup_mesh(obj):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # Apply transforms before welding so Mixamo sees a straightforward mesh.
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.mesh.delete_loose()
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    obj.data.validate(clean_customdata=False)
    obj.data.update()

    for polygon in obj.data.polygons:
        polygon.use_smooth = True

    weighted = obj.modifiers.new("Weighted character normals", "WEIGHTED_NORMAL")
    weighted.keep_sharp = True
    weighted.weight = 50
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.modifier_apply(modifier=weighted.name)
    except Exception:
        obj.modifiers.remove(weighted)


def normalize_materials():
    for material in bpy.data.materials:
        material.name = material.name or "darwin_candidate_material"
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if not bsdf:
            continue
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = max(bsdf.inputs["Roughness"].default_value, 0.72)
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = 1
        material.blend_method = "OPAQUE"
        material.use_screen_refraction = False


def rename_objects():
    meshes = mesh_objects()
    for index, obj in enumerate(meshes):
        suffix = "" if index == 0 else f"_{index + 1}"
        obj.name = f"Darwin_New_Candidate{suffix}"
        obj.data.name = f"Darwin_New_Candidate_Mesh{suffix}"


def cleanup_scene():
    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def export_outputs(output_fbx, output_glb):
    os.makedirs(os.path.dirname(output_fbx), exist_ok=True)
    os.makedirs(os.path.dirname(output_glb), exist_ok=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        obj.select_set(True)

    bpy.ops.export_scene.fbx(
        filepath=output_fbx,
        use_selection=False,
        object_types={"MESH", "ARMATURE", "EMPTY"},
        bake_anim=False,
        add_leaf_bones=False,
        path_mode="COPY",
        embed_textures=True,
    )
    bpy.ops.export_scene.gltf(
        filepath=output_glb,
        export_format="GLB",
        export_apply=True,
        export_animations=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )


def main():
    args = parse_args()
    reset_scene()
    imported = import_fbx(args.input)

    before_bounds = scene_bounds()
    before_meshes = [
        {
            "name": obj.name,
            "vertices": len(obj.data.vertices),
            "polygons": len(obj.data.polygons),
            "materials": len(obj.material_slots),
        }
        for obj in mesh_objects()
    ]

    rename_objects()
    for obj in mesh_objects():
        cleanup_mesh(obj)
    normalize_materials()
    scale = normalize_height(args.target_height)
    cleanup_scene()
    export_outputs(args.output_fbx, args.output_glb)

    report = {
        "input": args.input,
        "outputFbx": args.output_fbx,
        "outputGlb": args.output_glb,
        "targetHeight": args.target_height,
        "heightScaleApplied": round(scale, 6),
        "importedObjects": [{"name": obj.name, "type": obj.type} for obj in imported if obj.name in bpy.data.objects],
        "before": {"bounds": before_bounds, "meshes": before_meshes},
        "after": {
            "bounds": scene_bounds(),
            "meshes": [
                {
                    "name": obj.name,
                    "vertices": len(obj.data.vertices),
                    "polygons": len(obj.data.polygons),
                    "materials": len(obj.material_slots),
                }
                for obj in mesh_objects()
            ],
        },
        "notes": [
            "Original FBX was left untouched.",
            "This pass normalizes scale, welds tiny duplicate vertices, deletes loose mesh fragments, fixes normals, smooths shading, and normalizes material roughness/metalness.",
            "The source has no armature, actions, blendshapes, or separate eye meshes; blinking will need Mixamo/head-bone driven eyelid geometry or blendshapes added later.",
        ],
    }
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
