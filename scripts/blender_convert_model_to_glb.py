import argparse
import json
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(argv)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_model(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in [".gltf", ".glb"]:
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        try:
            bpy.ops.wm.obj_import(filepath=path)
        except Exception:
            bpy.ops.import_scene.obj(filepath=path)
    elif ext == ".dae":
        bpy.ops.wm.collada_import(filepath=path)
    else:
        raise RuntimeError(f"Unsupported input extension: {ext}")


def normalize_materials():
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for material in obj.data.materials:
            if not material:
                continue
            material.use_nodes = True
            bsdf = material.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                if "Metallic" in bsdf.inputs:
                    bsdf.inputs["Metallic"].default_value = 0
                if "Roughness" in bsdf.inputs:
                    bsdf.inputs["Roughness"].default_value = max(bsdf.inputs["Roughness"].default_value, 0.74)


def scene_bounds():
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        return None
    mins = Vector((float("inf"), float("inf"), float("inf")))
    maxs = Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    size = maxs - mins
    return {
        "min": [round(v, 4) for v in mins],
        "max": [round(v, 4) for v in maxs],
        "size": [round(v, 4) for v in size],
    }


def main():
    args = parse_args()
    reset_scene()
    import_model(args.input)
    normalize_materials()
    bounds = scene_bounds()
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=args.output,
        export_format="GLB",
        export_apply=True,
        export_animations=True,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    report = {
        "input": args.input,
        "output": args.output,
        "sizeKB": round(os.path.getsize(args.output) / 1024),
        "bounds": bounds,
        "meshes": [
            {"name": obj.name, "vertices": len(obj.data.vertices)}
            for obj in bpy.context.scene.objects
            if obj.type == "MESH"
        ],
        "armatures": [
            {"name": obj.name, "bones": len(obj.data.bones)}
            for obj in bpy.context.scene.objects
            if obj.type == "ARMATURE"
        ],
    }
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
