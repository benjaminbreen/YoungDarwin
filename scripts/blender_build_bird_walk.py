import argparse
import math
import os
import sys

import bpy


def parse_args():
    parser = argparse.ArgumentParser(
        description="Create a simple in-place bird walk animation on a Tripo-style rig."
    )
    parser.add_argument("--input", required=True, help="Input FBX/GLB/GLTF path")
    parser.add_argument("--output", required=True, help="Output animated GLB path")
    parser.add_argument("--clip-name", default="walk")
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--frames", type=int, default=32)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_model(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    elif ext in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise ValueError(f"Unsupported input format: {ext}")


def find_armature():
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if not armatures:
        raise RuntimeError("No armature found. The model must be rigged before this script can animate it.")
    return armatures[0]


def pose_bone(armature, name):
    bone = armature.pose.bones.get(name)
    if bone:
        bone.rotation_mode = "XYZ"
    return bone


def set_rot(bone, xyz):
    if bone:
        bone.rotation_euler = tuple(math.radians(value) for value in xyz)


def insert_rot(bone, frame):
    if bone:
        bone.keyframe_insert(data_path="rotation_euler", frame=frame)


def insert_loc(obj, frame):
    obj.keyframe_insert(data_path="location", frame=frame)


def make_walk_action(armature, clip_name, frames):
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")

    if not armature.animation_data:
        armature.animation_data_create()
    action = bpy.data.actions.new(clip_name)
    armature.animation_data.action = action

    root = pose_bone(armature, "tripo::Root")
    spine_0 = pose_bone(armature, "tripo::Spine_0")
    spine_1 = pose_bone(armature, "tripo::Spine_1")
    spine_2 = pose_bone(armature, "tripo::Spine_2")
    head_0 = pose_bone(armature, "tripo::Head_0")
    head_1 = pose_bone(armature, "tripo::Head_1")
    left_thigh = pose_bone(armature, "tripo::0_Left_Limb_0")
    left_shin = pose_bone(armature, "tripo::0_Left_Limb_1")
    left_toe = pose_bone(armature, "tripo::0_Left_Limb_2")
    left_toe_tip = pose_bone(armature, "tripo::0_Left_Limb_3")
    right_thigh = pose_bone(armature, "tripo::0_Right_Limb_0")
    right_shin = pose_bone(armature, "tripo::0_Right_Limb_1")
    right_toe = pose_bone(armature, "tripo::0_Right_Limb_2")
    right_toe_tip = pose_bone(armature, "tripo::0_Right_Limb_3")

    # Tripo's bird rig has unnamed wing chains. These are enough for a small balancing sway.
    left_wing = [pose_bone(armature, name) for name in ("bone_17", "bone_18", "bone_22", "bone_23")]
    right_wing = [pose_bone(armature, name) for name in ("bone_11", "bone_12", "bone_15", "bone_16")]

    keyframes = [1, frames * 0.25, frames * 0.5, frames * 0.75, frames + 1]
    for raw_frame in keyframes:
        frame = int(round(raw_frame))
        phase = ((frame - 1) / frames) * math.tau
        left = math.sin(phase)
        right = math.sin(phase + math.pi)
        bob = max(0.0, math.sin(phase * 2.0)) * 0.018

        armature.location.z = bob
        insert_loc(armature, frame)

        set_rot(root, (0, 0, math.sin(phase) * 1.5))
        set_rot(spine_0, (math.sin(phase * 2.0) * 1.5, 0, math.sin(phase) * 2.0))
        set_rot(spine_1, (math.sin(phase * 2.0 + 0.4) * 1.2, 0, math.sin(phase) * -1.5))
        set_rot(spine_2, (math.sin(phase * 2.0 + 0.8) * 1.0, 0, math.sin(phase) * -1.0))
        set_rot(head_0, (math.sin(phase * 2.0 + 1.2) * -3.0, 0, math.sin(phase) * -2.5))
        set_rot(head_1, (math.sin(phase * 2.0 + 1.8) * -2.0, 0, math.sin(phase) * 1.5))

        set_rot(left_thigh, (left * 24.0, 0, 2.0))
        set_rot(left_shin, (-8.0 + max(0.0, -left) * 18.0, 0, 0))
        set_rot(left_toe, (-5.0 + max(0.0, left) * 14.0, 0, 0))
        set_rot(left_toe_tip, (max(0.0, left) * 8.0, 0, 0))

        set_rot(right_thigh, (right * 24.0, 0, -2.0))
        set_rot(right_shin, (-8.0 + max(0.0, -right) * 18.0, 0, 0))
        set_rot(right_toe, (-5.0 + max(0.0, right) * 14.0, 0, 0))
        set_rot(right_toe_tip, (max(0.0, right) * 8.0, 0, 0))

        for i, bone in enumerate(left_wing):
            set_rot(bone, (math.sin(phase + i * 0.25) * 3.0, 0, -2.0))
        for i, bone in enumerate(right_wing):
            set_rot(bone, (math.sin(phase + math.pi + i * 0.25) * 3.0, 0, 2.0))

        for bone in [
            root,
            spine_0,
            spine_1,
            spine_2,
            head_0,
            head_1,
            left_thigh,
            left_shin,
            left_toe,
            left_toe_tip,
            right_thigh,
            right_shin,
            right_toe,
            right_toe_tip,
            *left_wing,
            *right_wing,
        ]:
            insert_rot(bone, frame)

    bpy.ops.object.mode_set(mode="OBJECT")
    action.frame_start = 1
    action.frame_end = frames + 1
    action.use_frame_range = True

    track = armature.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, 1, action)
    strip.frame_end = frames + 1
    return action


def export_glb(path, fps, frames):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = frames + 1
    bpy.context.scene.render.fps = fps
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_animations=True,
        export_apply=False,
    )


def main():
    args = parse_args()
    clear_scene()
    import_model(args.input)
    armature = find_armature()
    make_walk_action(armature, args.clip_name, args.frames)
    export_glb(args.output, args.fps, args.frames)


if __name__ == "__main__":
    main()
