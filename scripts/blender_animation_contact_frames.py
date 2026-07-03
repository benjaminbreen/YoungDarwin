#!/usr/bin/env python3
"""
Render evenly sampled frames from one GLB animation clip.

Usage:
  Blender --background --factory-startup --disable-autoexec \
    --python scripts/blender_animation_contact_frames.py -- \
    --asset public/assets/models/darwin5.glb \
    --clip dive \
    --out /tmp/darwin-contact-test \
    --frames 12
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", required=True)
    parser.add_argument("--clip", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--frames", type=int, default=12)
    parser.add_argument("--size", type=int, default=360)
    parser.add_argument("--view", choices=["front", "side", "threeQuarter"], default="threeQuarter")
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(args)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def scene_bounds():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mins = Vector((math.inf, math.inf, math.inf))
    maxs = Vector((-math.inf, -math.inf, -math.inf))
    found = False
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        for corner in evaluated.bound_box:
            point = evaluated.matrix_world @ Vector(corner)
            mins.x = min(mins.x, point.x)
            mins.y = min(mins.y, point.y)
            mins.z = min(mins.z, point.z)
            maxs.x = max(maxs.x, point.x)
            maxs.y = max(maxs.y, point.y)
            maxs.z = max(maxs.z, point.z)
            found = True
    if not found:
        return Vector((0, 0, 1)), 2.0
    center = (mins + maxs) * 0.5
    radius = max((maxs - mins).length * 0.55, 1.0)
    return center, radius


def setup_world(size):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = False
    scene.frame_set(0)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"

    light_data = bpy.data.lights.new("contact-key", type="AREA")
    light = bpy.data.objects.new("contact-key", light_data)
    bpy.context.collection.objects.link(light)
    light.location = (2.8, -4.2, 5.0)
    light_data.energy = 520
    light_data.size = 5

    camera_data = bpy.data.cameras.new("contact-camera")
    camera = bpy.data.objects.new("contact-camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera_data.lens = 70
    return camera


def camera_vector(view):
    if view == "front":
        return Vector((0, -1, 0.38))
    if view == "side":
        return Vector((1, 0, 0.38))
    return Vector((0.78, -1, 0.42))


def assign_action(action):
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if not armatures:
        raise RuntimeError("No armature found after importing asset.")
    for armature in armatures:
        armature.animation_data_create()
        armature.animation_data.action = action


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=args.asset)

    action = bpy.data.actions.get(args.clip)
    if action is None:
        available = ", ".join(sorted(action.name for action in bpy.data.actions))
        raise RuntimeError(f'Clip "{args.clip}" not found. Available clips: {available}')
    assign_action(action)

    camera = setup_world(args.size)
    view = camera_vector(args.view).normalized()

    start, end = action.frame_range
    count = max(1, args.frames)
    samples = []
    max_radius = 1.0
    for index in range(count):
        t = index / max(1, count - 1)
        frame = start + (end - start) * t
        bpy.context.scene.frame_set(round(frame))
        center, radius = scene_bounds()
        samples.append((index, t, frame, center, radius))
        max_radius = max(max_radius, radius)

    print(f'CONTACT_SHEET_TEST clip="{args.clip}" frames={count} range={start:.3f}-{end:.3f}')
    for index, t, frame, center, _radius in samples:
        bpy.context.scene.frame_set(round(frame))
        camera.location = center + view * (max_radius * 2.7)
        camera.location.z = max(camera.location.z, center.z + max_radius * 0.55)
        look_at(camera, center + Vector((0, 0, max_radius * 0.08)))
        bpy.context.scene.render.filepath = os.path.join(
            args.out,
            f"{index + 1:02d}_{args.clip}_{t:0.2f}.png",
        )
        bpy.ops.render.render(write_still=True)
        print(f"rendered {index + 1}/{count}: frame={frame:.3f}")


if __name__ == "__main__":
    main()
