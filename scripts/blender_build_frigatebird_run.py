import argparse
import math
import os
import sys

import bpy


def parse_args():
    parser = argparse.ArgumentParser(description="Add simple walk/run clips to the Tripo frigatebird rig.")
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
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    else:
        raise ValueError(f"Unsupported input format: {ext}")


def find_armature():
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if not armatures:
        raise RuntimeError("No armature found.")
    return armatures[0]


def remove_auxiliary_meshes():
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj.name.startswith("Icosphere"):
            bpy.data.objects.remove(obj, do_unlink=True)


def pose_bone(armature, name):
    bone = armature.pose.bones.get(name)
    if bone:
        bone.rotation_mode = "XYZ"
    return bone


def set_delta_rot(bone, base_rotations, xyz):
    if bone:
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


def make_clip(armature, name, frames, stride, body_pitch, wing_sway, head_bob, base_rotations, base_location):
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")

    if not armature.animation_data:
        armature.animation_data_create()

    action = bpy.data.actions.new(name)
    armature.animation_data.action = action

    root = pose_bone(armature, "tripo::Root")
    spine0 = pose_bone(armature, "tripo::Spine_0")
    spine1 = pose_bone(armature, "tripo::Spine_1")
    head0 = pose_bone(armature, "tripo::Head_0")
    head1 = pose_bone(armature, "tripo::Head_1")
    head2 = pose_bone(armature, "tripo::Head_2")

    # Tripo generated this bird with two leg chains under bone_24 and bone_35.
    left_leg = [pose_bone(armature, bone) for bone in ("bone_24", "bone_25", "bone_26", "bone_27")]
    right_leg = [pose_bone(armature, bone) for bone in ("bone_35", "bone_36", "bone_37", "bone_38")]
    left_toes = [pose_bone(armature, bone) for bone in ("bone_28", "bone_29", "bone_31", "bone_33")]
    right_toes = [pose_bone(armature, bone) for bone in ("bone_39", "bone_40", "bone_42", "bone_44")]
    tail = [pose_bone(armature, bone) for bone in ("tripo::0_Left_Limb_0", "bone_22", "bone_23")]
    left_wing = [pose_bone(armature, bone) for bone in ("bone_6", "bone_7", "bone_8", "bone_9", "bone_10", "bone_11", "bone_12", "bone_13")]
    right_wing = [pose_bone(armature, bone) for bone in ("tripo::Spine_2", "bone_15", "bone_16", "bone_17", "bone_18", "bone_19", "bone_20")]

    keyed_bones = [
        root, spine0, spine1, head0, head1, head2,
        *left_leg, *right_leg, *left_toes, *right_toes, *tail, *left_wing, *right_wing,
    ]

    for frame in [1, frames * 0.25, frames * 0.5, frames * 0.75, frames + 1]:
        frame = int(round(frame))
        phase = ((frame - 1) / frames) * math.tau
        left = math.sin(phase)
        right = math.sin(phase + math.pi)
        bob = max(0.0, math.sin(phase * 2.0)) * 0.028 * (stride / 22.0)

        armature.location = base_location.copy()
        armature.location.z = base_location.z + bob
        armature.keyframe_insert(data_path="location", frame=frame)

        set_delta_rot(root, base_rotations, (0, 0, math.sin(phase) * 2.2))
        set_delta_rot(spine0, base_rotations, (body_pitch + math.sin(phase * 2.0) * 1.8, 0, math.sin(phase) * 2.6))
        set_delta_rot(spine1, base_rotations, (-body_pitch * 0.45 + math.sin(phase * 2.0 + 0.45) * 1.2, 0, math.sin(phase) * -1.6))
        set_delta_rot(head0, base_rotations, (math.sin(phase * 2.0 + 0.8) * -head_bob, 0, math.sin(phase) * -2.2))
        set_delta_rot(head1, base_rotations, (math.sin(phase * 2.0 + 1.2) * -head_bob * 0.65, 0, math.sin(phase) * 1.2))
        set_delta_rot(head2, base_rotations, (math.sin(phase * 2.0 + 1.7) * -head_bob * 0.35, 0, 0))

        for sign, value, chain, toes in [(-1, left, left_leg, left_toes), (1, right, right_leg, right_toes)]:
            set_delta_rot(chain[0], base_rotations, (value * stride, 0, sign * 2.0))
            set_delta_rot(chain[1], base_rotations, (-7.0 + max(0.0, -value) * stride * 0.78, 0, 0))
            set_delta_rot(chain[2], base_rotations, (5.0 + max(0.0, value) * stride * 0.42, 0, 0))
            set_delta_rot(chain[3], base_rotations, (-3.0 + max(0.0, value) * stride * 0.22, 0, 0))
            for toe_index, toe in enumerate(toes):
                set_delta_rot(toe, base_rotations, (max(0.0, value) * (8.0 + toe_index * 1.5), 0, sign * 1.5))

        for i, bone in enumerate(left_wing):
            set_delta_rot(bone, base_rotations, (math.sin(phase + i * 0.18) * wing_sway, 0, -2.0 - abs(math.sin(phase)) * 2.0))
        for i, bone in enumerate(right_wing):
            set_delta_rot(bone, base_rotations, (math.sin(phase + math.pi + i * 0.18) * wing_sway, 0, 2.0 + abs(math.sin(phase)) * 2.0))
        for i, bone in enumerate(tail):
            set_delta_rot(bone, base_rotations, (math.sin(phase + i * 0.22) * 2.0, 0, math.sin(phase) * -3.0))

        for bone in keyed_bones:
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
    bpy.context.scene.frame_end = 33
    make_clip(armature, "walk", 36, 18.0, -3.0, 2.5, 2.8, base_rotations, base_location)
    make_clip(armature, "run", 24, 34.0, -7.0, 6.0, 5.5, base_rotations, base_location)
    export_glb(args.output)


if __name__ == "__main__":
    main()
