import argparse
import json
import os
import sys
import bpy


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--report", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def main():
    args = parse_args()
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=args.input)
    report = {
        "input": args.input,
        "armatures": [
            {
                "name": obj.name,
                "bones": len(obj.data.bones),
                "action": obj.animation_data.action.name if obj.animation_data and obj.animation_data.action else None,
                "nlaTracks": [track.name for track in obj.animation_data.nla_tracks] if obj.animation_data else [],
            }
            for obj in bpy.context.scene.objects
            if obj.type == "ARMATURE"
        ],
        "actions": [
            {
                "name": action.name,
                "frameRange": [float(action.frame_range[0]), float(action.frame_range[1])],
            }
            for action in bpy.data.actions
        ],
        "meshes": [
            {
                "name": obj.name,
                "vertices": len(obj.data.vertices),
                "materials": len(obj.material_slots),
            }
            for obj in bpy.context.scene.objects
            if obj.type == "MESH"
        ],
    }
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)


if __name__ == "__main__":
    main()
