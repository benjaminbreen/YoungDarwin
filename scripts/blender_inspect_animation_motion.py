import argparse
import json
import os
import sys
import bpy
from mathutils import Vector


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--report", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def find_hips(armature):
    for pose_bone in armature.pose.bones:
        if pose_bone.name.endswith("Hips") or pose_bone.name == "mixamorig:Hips":
            return pose_bone
    return None


def sample_bone_world(armature, pose_bone):
    return armature.matrix_world @ pose_bone.matrix.translation


def main():
    args = parse_args()
    clear_scene()
    bpy.ops.import_scene.fbx(filepath=args.input, automatic_bone_orientation=False)
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if not armatures:
        raise RuntimeError(f"No armature in {args.input}")
    armature = armatures[0]
    action = armature.animation_data.action if armature.animation_data else None
    hips = find_hips(armature)
    if not action or not hips:
        raise RuntimeError(f"Missing action or hips in {args.input}")

    start = int(action.frame_range[0])
    end = int(action.frame_range[1])
    frames = sorted(set([
        start,
        round(start + (end - start) * 0.25),
        round(start + (end - start) * 0.5),
        round(start + (end - start) * 0.75),
        end,
    ]))
    scene = bpy.context.scene
    samples = []
    first = None
    min_z = 999
    max_z = -999
    max_horizontal = 0
    for frame in frames:
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        pos = sample_bone_world(armature, hips)
        if first is None:
            first = pos.copy()
        delta = pos - first
        min_z = min(min_z, pos.z)
        max_z = max(max_z, pos.z)
        max_horizontal = max(max_horizontal, Vector((delta.x, delta.y, 0)).length)
        samples.append({
            "frame": frame,
            "hipsWorld": [pos.x, pos.y, pos.z],
            "deltaFromStart": [delta.x, delta.y, delta.z],
        })

    scene.frame_set(end)
    bpy.context.view_layer.update()
    last = sample_bone_world(armature, hips)
    total = last - first

    report = {
        "input": args.input,
        "bones": len(armature.data.bones),
        "frameRange": [float(action.frame_range[0]), float(action.frame_range[1])],
        "frameCount": end - start + 1,
        "samples": samples,
        "totalHipsDelta": [total.x, total.y, total.z],
        "totalHorizontalDelta": Vector((total.x, total.y, 0)).length,
        "maxSampleHorizontalDelta": max_horizontal,
        "hipsZRange": [min_z, max_z],
    }
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)


if __name__ == "__main__":
    main()
