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
import json
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
    parser.add_argument("--view", choices=["front", "side", "back", "threeQuarter", "top"], default="threeQuarter")
    parser.add_argument("--ground", action="store_true")
    parser.add_argument("--motion-trail", action="store_true")
    parser.add_argument("--follow-camera", action="store_true")
    parser.add_argument("--incline", type=float, default=0.0)
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(args)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def is_contact_helper(obj):
    return obj.name.startswith("CONTACT_")


def scene_extents():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mins = Vector((math.inf, math.inf, math.inf))
    maxs = Vector((-math.inf, -math.inf, -math.inf))
    found = False
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or is_contact_helper(obj):
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
        return Vector((0, 0, 0)), Vector((0, 0, 2))
    return mins, maxs


def bounds_center_radius(mins, maxs):
    center = (mins + maxs) * 0.5
    radius = max((maxs - mins).length * 0.55, 1.0)
    return center, radius


def union_extents(extents):
    mins = Vector((math.inf, math.inf, math.inf))
    maxs = Vector((-math.inf, -math.inf, -math.inf))
    for sample_mins, sample_maxs in extents:
        mins.x = min(mins.x, sample_mins.x)
        mins.y = min(mins.y, sample_mins.y)
        mins.z = min(mins.z, sample_mins.z)
        maxs.x = max(maxs.x, sample_maxs.x)
        maxs.y = max(maxs.y, sample_maxs.y)
        maxs.z = max(maxs.z, sample_maxs.z)
    if math.isinf(mins.x):
        return Vector((0, 0, 0)), Vector((0, 0, 2))
    return mins, maxs


def make_material(name, color):
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    return material


def make_grid_line(name, start, end, material, bevel_depth=0.004):
    curve = bpy.data.curves.new(name, type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 0
    spline = curve.splines.new("POLY")
    spline.points.add(1)
    spline.points[0].co = (start[0], start[1], start[2], 1)
    spline.points[1].co = (end[0], end[1], end[2], 1)
    obj = bpy.data.objects.new(name, curve)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    return obj


def create_ground(center, radius, floor_z, incline_degrees=0.0):
    grid_material = make_material("CONTACT_grid_material", (0.28, 0.28, 0.28, 1))
    axis_material = make_material("CONTACT_axis_material", (0.7, 0.55, 0.28, 1))
    extent = max(radius * 1.45, 1.4)
    step = max(radius / 4.0, 0.25)
    base_z = floor_z - 0.012
    incline = math.tan(math.radians(incline_degrees))

    def z_at(y):
        return base_z + (y - center.y) * incline

    line_count = int(math.ceil(extent / step))
    for index in range(-line_count, line_count + 1):
        offset = index * step
        material = axis_material if index == 0 else grid_material
        depth = 0.008 if index == 0 else 0.003
        y = center.y + offset
        make_grid_line(
            f"CONTACT_grid_x_{index}",
            (center.x - extent, y, z_at(y)),
            (center.x + extent, y, z_at(y)),
            material,
            depth,
        )
        y0 = center.y - extent
        y1 = center.y + extent
        make_grid_line(
            f"CONTACT_grid_y_{index}",
            (center.x + offset, y0, z_at(y0)),
            (center.x + offset, y1, z_at(y1)),
            material,
            depth,
        )


def create_motion_trail(samples, floor_z):
    if len(samples) < 2:
        return
    material = make_material("CONTACT_motion_trail_material", (0.95, 0.32, 0.16, 1))
    z = floor_z + 0.012
    points = [(sample["center"].x, sample["center"].y, z) for sample in samples]
    for index in range(len(points) - 1):
        make_grid_line(f"CONTACT_motion_trail_{index}", points[index], points[index + 1], material, 0.01)
    for index, point in enumerate(points):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=0.025, location=point)
        marker = bpy.context.object
        marker.name = f"CONTACT_motion_marker_{index}"
        marker.data.materials.append(material)


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
    if view == "back":
        return Vector((0, 1, 0.38))
    if view == "top":
        return Vector((0.02, -0.02, 1))
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
    extents = []
    for index in range(count):
        t = index / max(1, count - 1)
        frame = start + (end - start) * t
        bpy.context.scene.frame_set(round(frame))
        mins, maxs = scene_extents()
        center, radius = bounds_center_radius(mins, maxs)
        extents.append((mins, maxs))
        samples.append({
            "index": index,
            "t": t,
            "frame": frame,
            "center": center,
            "radius": radius,
        })

    global_mins, global_maxs = union_extents(extents)
    global_center, global_radius = bounds_center_radius(global_mins, global_maxs)
    floor_z = global_mins.z
    if args.ground:
        create_ground(global_center, global_radius, floor_z, args.incline)
    if args.motion_trail:
        create_motion_trail(samples, floor_z)

    print(f'CONTACT_SHEET_TEST clip="{args.clip}" frames={count} range={start:.3f}-{end:.3f}')
    for sample in samples:
        index = sample["index"]
        t = sample["t"]
        frame = sample["frame"]
        center = sample["center"] if args.follow_camera else global_center
        radius = sample["radius"] if args.follow_camera else global_radius
        bpy.context.scene.frame_set(round(frame))
        camera.location = center + view * (radius * (3.0 if args.view == "top" else 2.7))
        camera.location.z = max(camera.location.z, center.z + radius * (2.1 if args.view == "top" else 0.55))
        look_at(camera, center + Vector((0, 0, radius * (0.0 if args.view == "top" else 0.08))))
        bpy.context.scene.render.filepath = os.path.join(
            args.out,
            f"{index + 1:02d}_{args.clip}_{t:0.2f}.png",
        )
        bpy.ops.render.render(write_still=True)
        print(f"rendered {index + 1}/{count}: frame={frame:.3f}")

    metadata = {
        "clip": args.clip,
        "view": args.view,
        "frames": count,
        "frameRange": [start, end],
        "camera": "follow" if args.follow_camera else "fixed",
        "ground": bool(args.ground),
        "motionTrail": bool(args.motion_trail),
        "incline": args.incline,
        "bounds": {
            "min": [global_mins.x, global_mins.y, global_mins.z],
            "max": [global_maxs.x, global_maxs.y, global_maxs.z],
            "center": [global_center.x, global_center.y, global_center.z],
            "radius": global_radius,
        },
        "samples": [
            {
                "index": sample["index"] + 1,
                "t": sample["t"],
                "frame": sample["frame"],
                "center": [sample["center"].x, sample["center"].y, sample["center"].z],
                "radius": sample["radius"],
            }
            for sample in samples
        ],
    }
    with open(os.path.join(args.out, "frames.json"), "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
