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
    bpy.ops.import_scene.fbx(filepath=args.input, automatic_bone_orientation=False)
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    report = {
        "input": args.input,
        "armatures": [
            {
                "name": arm.name,
                "bones": len(arm.data.bones),
                "sampleBones": [bone.name for bone in arm.data.bones][:40],
                "action": arm.animation_data.action.name if arm.animation_data and arm.animation_data.action else None,
                "frameRange": list(arm.animation_data.action.frame_range) if arm.animation_data and arm.animation_data.action else None,
            }
            for arm in armatures
        ],
        "meshes": [
            {
                "name": mesh.name,
                "vertices": len(mesh.data.vertices),
                "materials": len(mesh.material_slots),
            }
            for mesh in meshes
        ],
        "actions": [
            {
                "name": action.name,
                "frameRange": list(action.frame_range),
                "fcurves": len(getattr(action, "fcurves", [])),
            }
            for action in bpy.data.actions
        ],
    }
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)


if __name__ == "__main__":
    main()
