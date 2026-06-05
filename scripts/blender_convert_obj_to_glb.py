import argparse
import json
import os
import sys
import bpy


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--height", type=float, default=1.85)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_obj(path):
    bpy.ops.wm.obj_import(filepath=path)


def normalize_height(height):
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        return
    corners = []
    for obj in meshes:
        for corner in obj.bound_box:
            corners.append(obj.matrix_world @ __import__("mathutils").Vector(corner))
    min_x = min(v.x for v in corners)
    max_x = max(v.x for v in corners)
    min_y = min(v.y for v in corners)
    max_y = max(v.y for v in corners)
    min_z = min(v.z for v in corners)
    max_z = max(v.z for v in corners)
    current_height = max(max_z - min_z, 0.001)
    scale = height / current_height
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2

    for obj in bpy.context.scene.objects:
        if obj.parent is None:
            obj.location.x = (obj.location.x - center_x) * scale
            obj.location.y = (obj.location.y - center_y) * scale
            obj.location.z = (obj.location.z - min_z) * scale
            obj.scale = (obj.scale.x * scale, obj.scale.y * scale, obj.scale.z * scale)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_materials="EXPORT",
        export_apply=False,
    )


def main():
    args = parse_args()
    clear_scene()
    import_obj(args.input)
    normalize_height(args.height)
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    report = {
        "input": args.input,
        "output": args.output,
        "meshes": [
            {
                "name": obj.name,
                "vertices": len(obj.data.vertices),
                "polygons": len(obj.data.polygons),
                "materials": len(obj.material_slots),
            }
            for obj in mesh_objects
        ],
        "materials": [
            {
                "name": material.name,
                "useNodes": material.use_nodes,
            }
            for material in bpy.data.materials
        ],
    }
    export_glb(args.output)
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)


if __name__ == "__main__":
    main()
