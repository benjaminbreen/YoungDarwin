import argparse
import os
import sys
import bpy


def parse_args():
    parser = argparse.ArgumentParser(description="Normalize a GLB for Young Darwin 3D.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--scale", type=float, default=1.0)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    args, _ = parser.parse_known_args(argv)
    return args


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_model(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in [".glb", ".gltf"]:
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    else:
        raise ValueError(f"Unsupported input extension: {ext}")


def normalize(scale):
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not mesh_objects:
        raise ValueError("No mesh objects found.")

    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objects[0]

    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    min_x = min((obj.bound_box[i][0] * obj.scale.x + obj.location.x) for obj in mesh_objects for i in range(8))
    max_x = max((obj.bound_box[i][0] * obj.scale.x + obj.location.x) for obj in mesh_objects for i in range(8))
    min_y = min((obj.bound_box[i][1] * obj.scale.y + obj.location.y) for obj in mesh_objects for i in range(8))
    max_y = max((obj.bound_box[i][1] * obj.scale.y + obj.location.y) for obj in mesh_objects for i in range(8))
    min_z = min((obj.bound_box[i][2] * obj.scale.z + obj.location.z) for obj in mesh_objects for i in range(8))
    max_z = max((obj.bound_box[i][2] * obj.scale.z + obj.location.z) for obj in mesh_objects for i in range(8))

    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    height = max(max_z - min_z, 0.001)
    factor = scale / height

    for obj in mesh_objects:
        obj.location.x = (obj.location.x - center_x) * factor
        obj.location.y = (obj.location.y - center_y) * factor
        obj.location.z = (obj.location.z - min_z) * factor
        obj.scale = (obj.scale.x * factor, obj.scale.y * factor, obj.scale.z * factor)

    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_materials="EXPORT",
    )


def main():
    args = parse_args()
    clear_scene()
    import_model(args.input)
    normalize(args.scale)
    export_glb(args.output)


if __name__ == "__main__":
    main()
