import argparse
import json
import os
import sys

import bpy


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
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
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    elif ext in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise RuntimeError(f"Unsupported input extension: {ext}")


def export_obj(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        bpy.ops.wm.obj_export(
            filepath=path,
            export_selected_objects=False,
            export_materials=True,
            path_mode="COPY",
        )
    except Exception:
        bpy.ops.export_scene.obj(
            filepath=path,
            use_selection=False,
            use_materials=True,
            path_mode="COPY",
        )


def main():
    args = parse_args()
    reset_scene()
    import_model(args.input)
    export_obj(args.output)

    out_dir = os.path.dirname(args.output)
    report = {
        "input": args.input,
        "output": args.output,
        "files": sorted(os.listdir(out_dir)),
        "meshes": [
            {
                "name": obj.name,
                "vertices": len(obj.data.vertices),
                "polygons": len(obj.data.polygons),
                "materials": len(obj.material_slots),
            }
            for obj in bpy.context.scene.objects
            if obj.type == "MESH"
        ],
    }
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
