"""Add local locomotion and task gestures to a fitted NPC armature.

Blender: -b <rig.blend> --python scripts/blender_animate_island_npcs.py --
  <output.glb> [skirt|well-boy|stokes]
The fitted armature uses Pelvis, Chest, Head and paired limb bones.
"""
import math
import sys

import bpy
from mathutils import Quaternion, Vector


def key_pose(rig, frame):
    for bone in rig.pose.bones:
        bone.keyframe_insert('rotation_quaternion', frame=frame, group=bone.name)
        if bone.name in ('Bucket', 'Stick', 'Board', 'Pencil'):
            bone.keyframe_insert('scale', frame=frame, group=bone.name)
    rig.pose.bones['Pelvis'].keyframe_insert('location', frame=frame, group='Pelvis')


def rotate(rig, name, axis, angle):
    pose = rig.pose.bones[name]
    rest = pose.bone.matrix_local.to_quaternion()
    local_rotation = rest.inverted() @ Quaternion(axis, math.radians(angle)) @ rest
    pose.rotation_quaternion = local_rotation @ pose.rotation_quaternion


def settle_feet(rig, pelvis, lift=0):
    bpy.context.view_layer.update()
    feet = [rig.pose.bones[f'Foot.{side}'].tail.z for side in ('L', 'R')]
    floor = min(rig.data.bones[f'Foot.{side}'].tail_local.z for side in ('L', 'R'))
    pelvis.location = pelvis.bone.matrix_local.to_quaternion().inverted() @ Vector((0, 0, floor - min(feet) + lift))


def props_for_clip(rig, name):
    for bone, visible in (
        ('Bucket', name in ('carry', 'fill', 'hold_pail')),
        ('Stick', name in ('wait', 'wave')),
        ('Board', True),
        ('Pencil', name == 'sketch'),
    ):
        if bone in rig.pose.bones:
            rig.pose.bones[bone].scale = (1 if visible else .001,) * 3


def turn_joint(bone, current_direction, target_direction):
    pose_rotation = bone.matrix.to_quaternion()
    turn = current_direction.rotation_difference(target_direction)
    bone.rotation_quaternion = bone.rotation_quaternion @ (pose_rotation.inverted() @ turn @ pose_rotation)
    bpy.context.view_layer.update()


def place_sketch_hand(rig, phase):
    # Trace two short strokes over the board. Solve the elbow on the outside
    # of the body so the wrist can cross inward without twisting the shoulder.
    bpy.context.view_layer.update()
    page = bpy.data.objects['Survey paper']
    mark = page.matrix_world @ Vector((-.23 + .15 * math.sin(phase * 2), -.11 + .11 * math.sin(phase), .55))
    upper = rig.pose.bones['UpperArm.R']
    forearm = rig.pose.bones['Forearm.R']
    hand = rig.pose.bones['Hand.R']
    shoulder = upper.head.copy()
    wrist_goal = mark + Vector((-.063, .069, .047))
    reach = wrist_goal - shoulder
    arm_length, forearm_length = (upper.tail - upper.head).length, (forearm.tail - forearm.head).length
    direction = reach.normalized()
    extension = min(reach.length, arm_length + forearm_length - .004)
    along = (arm_length ** 2 - forearm_length ** 2 + extension ** 2) / (2 * extension)
    pole = Vector((-1, .15, -.35))
    pole = (pole - direction * pole.dot(direction)).normalized()
    elbow = shoulder + direction * along + pole * math.sqrt(max(0, arm_length ** 2 - along ** 2))
    turn_joint(upper, upper.tail - upper.head, elbow - shoulder)
    turn_joint(forearm, forearm.tail - forearm.head, wrist_goal - forearm.head)
    pencil = bpy.data.objects['Survey pencil']
    tip = pencil.matrix_world @ Vector((0, 0, .06))
    turn_joint(hand, tip - hand.head, mark - hand.head)


def build_clip(rig, name, frames, profile, rest):
    action = bpy.data.actions.new(name)
    rig.animation_data.action = action
    skirt = profile == 'skirt'
    boy = profile == 'well-boy'
    props_for_clip(rig, name)
    for frame in range(1, frames + 1):
        for bone in rig.pose.bones:
            bone.rotation_quaternion = rest[bone.name]
        phase = (frame - 1) / (frames - 1) * math.tau
        pelvis = rig.pose.bones['Pelvis']
        pelvis.location = (0, 0, 0)
        if name in ('walk', 'run', 'carry'):
            running = name == 'run'
            # Shorter steps keep the boots under the skirt and apron.
            stride = (23 if running else 14) if skirt else (35 if running else 24)
            rotate(rig, 'Chest', (1, 0, 0), -9 if running else -2)
            rotate(rig, 'Chest', (0, 0, 1), math.sin(phase) * (8 if running else 4))
            for side, offset in [('L', 0), ('R', math.pi)]:
                cycle = phase + offset
                swing = math.sin(cycle)
                rotate(rig, f'Thigh.{side}', (1, 0, 0), -swing * stride)
                rotate(rig, f'Shin.{side}', (1, 0, 0), max(0, math.cos(cycle)) * (42 if running else 22))
                rotate(rig, f'Foot.{side}', (1, 0, 0), swing * 7)
                holding = side == 'L' and (name == 'carry' or profile == 'stokes')
                if not holding:
                    rotate(rig, f'UpperArm.{side}', (1, 0, 0), swing * (26 if running else 15))
                    rotate(rig, f'Forearm.{side}', (1, 0, 0), -65 if running else -10)
            bob = (1 - math.cos(phase * 2)) * (0.022 if running else 0.007)
            settle_feet(rig, pelvis, bob)
        elif name in ('wait', 'wave'):
            for side in ('L', 'R'):
                rotate(rig, f'Thigh.{side}', (1, 0, 0), -77 if side == 'L' else -65)
                rotate(rig, f'Shin.{side}', (1, 0, 0), 108 if side == 'L' else 96)
                rotate(rig, f'Foot.{side}', (1, 0, 0), -30)
            rotate(rig, 'Chest', (1, 0, 0), 11)
            rotate(rig, 'Head', (0, 0, 1), math.sin(phase) * (3 if name == 'wave' else 14))
            rotate(rig, 'UpperArm.R', (1, 0, 0), -24)
            rotate(rig, 'Forearm.R', (1, 0, 0), -43)
            rotate(rig, 'UpperArm.L', (1, 0, 0), -14)
            rotate(rig, 'Forearm.L', (1, 0, 0), -80 if name == 'wave' else -36)
            if name == 'wave':
                rotate(rig, 'Hand.L', (0, 0, 1), math.sin(phase * 2) * 19)
                rotate(rig, 'UpperArm.L', (0, 1, 0), -9 - 7 * math.sin(phase * 2))
            settle_feet(rig, pelvis)
        elif name == 'sketch':
            rotate(rig, 'Head', (1, 0, 0), 20 + math.sin(phase) * 8)
            place_sketch_hand(rig, phase)
        elif name == 'fill' and boy:
            sweep = (1 - math.cos(phase)) * .5
            rotate(rig, 'Chest', (1, 0, 0), 8 + 25 * sweep)
            rotate(rig, 'Head', (1, 0, 0), 7 + 11 * sweep)
            rotate(rig, 'Forearm.L', (1, 0, 0), -6 - 15 * sweep)
        elif name == 'work':
            sweep = (1 - math.cos(phase)) * 0.5
            rotate(rig, 'Chest', (1, 0, 0), -5 - 6 * sweep)
            rotate(rig, 'Head', (1, 0, 0), 9 + 7 * sweep)
            rotate(rig, 'UpperArm.R', (1, 0, 0), -12 - 10 * sweep)
            rotate(rig, 'Forearm.R', (1, 0, 0), -35 - 18 * sweep)
            rotate(rig, 'Forearm.L', (1, 0, 0), -12)
        else:
            rotate(rig, 'Head', (0, 0, 1), math.sin(phase) * 24)
            rotate(rig, 'Chest', (0, 0, 1), math.sin(phase) * 6)
        key_pose(rig, frame)
    return action


def main():
    output, *options = sys.argv[sys.argv.index('--') + 1:]
    rig = next(obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE')
    scene = bpy.context.scene
    scene.frame_set(1)
    idle = rig.animation_data.action
    profile = options[0] if options else None
    bpy.context.view_layer.update()
    rest = {bone.name: bone.rotation_quaternion.copy() for bone in rig.pose.bones}
    for frame in (1, 121):
        props_for_clip(rig, 'idle')
        for bone in rig.pose.bones:
            if bone.name in ('Bucket', 'Stick', 'Board', 'Pencil'):
                bone.keyframe_insert('scale', frame=frame, group=bone.name)
    actions = [idle]
    clips = [('walk', 33), ('run', 24), ('look', 121)]
    if profile == 'well-boy':
        clips += [('carry', 34), ('hold_pail', 121), ('fill', 77), ('wait', 126), ('wave', 66)]
    elif profile == 'stokes':
        clips += [('sketch', 96)]
    else:
        clips += [('work', 91)]
    for name, frames in clips:
        rig.animation_data.action = idle
        scene.frame_set(1)
        bpy.context.view_layer.update()
        actions.append(build_clip(rig, name, frames, profile, rest))
    rig.animation_data.action = None
    for action in actions:
        track = rig.animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, 1, action)
    bpy.ops.export_scene.gltf(filepath=output, export_format='GLB',
                              export_animation_mode='NLA_TRACKS',
                              export_animations=True, export_skins=True)


if __name__ == '__main__':
    main()
