import argparse
import math
import os
import sys

import bpy


def parse_args():
    parser = argparse.ArgumentParser(description="Add simple idle/walk/run clips to the Tripo blue-footed booby rig.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_model(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise ValueError(f"Unsupported input format: {ext}")


def remove_auxiliary_meshes():
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj.name.startswith("Icosphere"):
            bpy.data.objects.remove(obj, do_unlink=True)


def find_armature():
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if not armatures:
        raise RuntimeError("No armature found.")
    return armatures[0]


def pose_bone(armature, name):
    bone = armature.pose.bones.get(name)
    if bone:
        bone.rotation_mode = "XYZ"
    return bone


def set_delta_rot(bone, base_rotations, xyz):
    if not bone:
        return
    base = base_rotations.get(bone.name)
    if base is None:
        bone.rotation_euler = tuple(math.radians(value) for value in xyz)
        return
    bone.rotation_euler = (
        base.x + math.radians(xyz[0]),
        base.y + math.radians(xyz[1]),
        base.z + math.radians(xyz[2]),
    )


def key_rot(bone, frame):
    if bone:
        bone.keyframe_insert(data_path="rotation_euler", frame=frame)


def collect_bones(armature):
    return {
        "root": pose_bone(armature, "tripo::Root"),
        "spine0": pose_bone(armature, "tripo::Spine_0"),
        "spine1": pose_bone(armature, "tripo::Spine_1"),
        "spine2": pose_bone(armature, "tripo::Spine_2"),
        "spine3": pose_bone(armature, "tripo::Spine_3"),
        "tail": pose_bone(armature, "tripo::Tail_0"),
        "left_leg": [pose_bone(armature, name) for name in ("tripo::0_Left_Limb_0", "tripo::0_Left_Limb_1", "tripo::0_Left_Limb_2")],
        "right_leg": [pose_bone(armature, name) for name in ("tripo::0_Right_Limb_0", "tripo::0_Right_Limb_1", "tripo::0_Right_Limb_2")],
        "left_wing": [pose_bone(armature, name) for name in ("bone_13", "bone_14", "bone_15", "bone_16", "bone_17", "bone_18", "bone_19")],
        "right_wing": [pose_bone(armature, name) for name in ("bone_20", "bone_21", "bone_22", "bone_23", "bone_24", "bone_25", "bone_26")],
        "neck": [pose_bone(armature, name) for name in ("bone_27", "bone_28", "tripo::Head_0", "tripo::Head_1")],
        "head": pose_bone(armature, "tripo::Head_2"),
        "beak": pose_bone(armature, "bone_32"),
    }


def keyed_bones(bones):
    result = [
        bones["root"], bones["spine0"], bones["spine1"], bones["spine2"], bones["spine3"], bones["tail"],
        bones["head"], bones["beak"],
        *bones["left_leg"], *bones["right_leg"], *bones["left_wing"], *bones["right_wing"], *bones["neck"],
    ]
    return [bone for bone in result if bone]


def make_clip(armature, name, frames, base_rotations, base_location, mode):
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")

    if not armature.animation_data:
        armature.animation_data_create()

    action = bpy.data.actions.new(name)
    armature.animation_data.action = action
    bones = collect_bones(armature)

    samples = [1, frames * 0.25, frames * 0.5, frames * 0.75, frames + 1]
    if mode == "idle":
        samples = [1, frames * 0.2, frames * 0.4, frames * 0.6, frames * 0.8, frames + 1]

    for frame in samples:
        frame = int(round(frame))
        phase = ((frame - 1) / frames) * math.tau
        left = math.sin(phase)
        right = math.sin(phase + math.pi)
        flap = math.sin(phase * (2.0 if mode == "run" else 1.0))
        breath = math.sin(phase)

        if mode == "idle":
            stride = 0.0
            body_pitch = -1.2 + breath * 0.8
            wing_drop = 2.5 + abs(breath) * 1.3
            wing_pitch = breath * 1.8
            head_bob = breath * 2.0
            bob = abs(math.sin(phase * 2.0)) * 0.008
        elif mode == "walk":
            stride = 18.0
            body_pitch = -3.0 + math.sin(phase * 2.0) * 1.4
            wing_drop = 4.0 + abs(left) * 2.8
            wing_pitch = flap * 3.0
            head_bob = math.sin(phase * 2.0 + 0.6) * 3.2
            bob = max(0.0, math.sin(phase * 2.0)) * 0.022
        else:
            stride = 31.0
            body_pitch = -6.5 + math.sin(phase * 2.0) * 2.1
            wing_drop = 9.0 + abs(flap) * 9.0
            wing_pitch = flap * 14.0
            head_bob = math.sin(phase * 2.0 + 0.6) * 5.0
            bob = max(0.0, math.sin(phase * 2.0)) * 0.042

        armature.location = base_location.copy()
        armature.location.z = base_location.z + bob
        armature.keyframe_insert(data_path="location", frame=frame)

        set_delta_rot(bones["root"], base_rotations, (0, 0, math.sin(phase) * (1.2 if mode == "idle" else 2.2)))
        set_delta_rot(bones["spine0"], base_rotations, (body_pitch, 0, math.sin(phase) * 1.8))
        set_delta_rot(bones["spine1"], base_rotations, (-body_pitch * 0.35, 0, math.sin(phase) * -1.2))
        set_delta_rot(bones["spine2"], base_rotations, (math.sin(phase + 0.4) * 1.4, 0, 0))
        set_delta_rot(bones["spine3"], base_rotations, (math.sin(phase + 0.7) * 1.2, 0, 0))
        set_delta_rot(bones["tail"], base_rotations, (math.sin(phase + 0.3) * 2.2, 0, math.sin(phase) * -2.0))

        for index, bone in enumerate(bones["neck"]):
            set_delta_rot(bone, base_rotations, (head_bob * (0.55 - index * 0.08), 0, math.sin(phase + index * 0.2) * -1.2))
        set_delta_rot(bones["head"], base_rotations, (-head_bob * 0.28, 0, math.sin(phase) * 1.2))
        set_delta_rot(bones["beak"], base_rotations, (-head_bob * 0.08, 0, 0))

        for sign, value, chain in [(-1, left, bones["left_leg"]), (1, right, bones["right_leg"])]:
            set_delta_rot(chain[0], base_rotations, (value * stride, 0, sign * 1.5))
            set_delta_rot(chain[1], base_rotations, (-5.0 + max(0.0, -value) * stride * 0.55, 0, 0))
            set_delta_rot(chain[2], base_rotations, (5.0 + max(0.0, value) * stride * 0.32, 0, sign * 2.0))

        for index, bone in enumerate(bones["left_wing"]):
            set_delta_rot(bone, base_rotations, (wing_pitch * (1.0 - index * 0.08), 0, -wing_drop * (1.0 - index * 0.05)))
        for index, bone in enumerate(bones["right_wing"]):
            set_delta_rot(bone, base_rotations, (-wing_pitch * (1.0 - index * 0.08), 0, wing_drop * (1.0 - index * 0.05)))

        for bone in keyed_bones(bones):
            key_rot(bone, frame)

    bpy.ops.object.mode_set(mode="OBJECT")
    action.frame_start = 1
    action.frame_end = frames + 1
    action.use_frame_range = True
    track = armature.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.frame_end = frames + 1


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
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
    remove_auxiliary_meshes()
    armature = find_armature()
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
    base_rotations = {bone.name: bone.rotation_euler.copy() for bone in armature.pose.bones}
    base_location = armature.location.copy()
    bpy.context.scene.render.fps = 24
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 49
    make_clip(armature, "idle", 48, base_rotations, base_location, "idle")
    make_clip(armature, "walk", 36, base_rotations, base_location, "walk")
    make_clip(armature, "run", 24, base_rotations, base_location, "run")
    export_glb(args.output)


if __name__ == "__main__":
    main()
