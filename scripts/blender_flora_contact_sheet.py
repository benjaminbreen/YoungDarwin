#!/usr/bin/env python3
"""Render the repository's static flora GLBs as labeled review tiles.

Run through scripts/render-flora-contact-sheet.mjs rather than invoking this
file directly. Models are normalized per tile so this sheet compares form and
material integrity, not authored world scale.
"""

import argparse
import json
import math
import os
import re
import sys

import bpy
from mathutils import Vector


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--size", type=int, default=480)
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(raw)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def scene_extents():
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
        raise RuntimeError("Imported asset contains no renderable meshes")
    return mins, maxs


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_scene(size):
    scene = bpy.context.scene
    # The bundled macOS build exposes Eevee under its compatibility enum even
    # though the application version is newer than Blender 4.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.025, 0.035, 0.045, 1)
    background.inputs["Strength"].default_value = 0.45

    key_data = bpy.data.lights.new("flora-review-key", type="AREA")
    key_data.energy = 900
    key_data.shape = "DISK"
    key_data.size = 5
    key = bpy.data.objects.new("flora-review-key", key_data)
    key.location = (4, -5, 7)
    bpy.context.collection.objects.link(key)

    fill_data = bpy.data.lights.new("flora-review-fill", type="AREA")
    fill_data.energy = 450
    fill_data.color = (0.62, 0.76, 1.0)
    fill_data.size = 4
    fill = bpy.data.objects.new("flora-review-fill", fill_data)
    fill.location = (-4, -1, 4)
    bpy.context.collection.objects.link(fill)

    camera_data = bpy.data.cameras.new("flora-review-camera")
    camera = bpy.data.objects.new("flora-review-camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    return camera


def safe_stem(index, label):
    normalized = re.sub(r"[^A-Za-z0-9]+", "-", label).strip("-")
    return f"{index + 1:02d}__{normalized[:70]}"


def render_asset(entry, index, out_dir, size):
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=entry["path"])
    mins, maxs = scene_extents()
    center = (mins + maxs) * 0.5
    dimensions = maxs - mins
    camera = setup_scene(size)

    view = Vector((0.82, -1.0, 0.5)).normalized()
    radius = max(dimensions.length * 0.52, 0.01)
    camera.location = center + view * max(radius * 3.2, 1.0)
    look_at(camera, center + Vector((0, 0, dimensions.z * 0.035)))
    camera.data.ortho_scale = max(dimensions.x, dimensions.z, dimensions.y * 0.72, 0.1) * 1.3

    stem = safe_stem(index, entry["label"])
    output = os.path.join(out_dir, f"{stem}.png")
    bpy.context.scene.render.filepath = output
    bpy.ops.render.render(write_still=True)
    return {
        **entry,
        "tile": output,
        "boundsMin": list(mins),
        "boundsMax": list(maxs),
        "dimensions": list(dimensions),
    }


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)
    with open(args.manifest, "r", encoding="utf-8") as handle:
        manifest = json.load(handle)

    results = []
    for index, entry in enumerate(manifest):
        print(f"FLORA_CONTACT {index + 1}/{len(manifest)} {entry['label']}")
        try:
            results.append(render_asset(entry, index, args.out, args.size))
        except Exception as error:
            print(f"FLORA_CONTACT_ERROR {entry['path']}: {error}", file=sys.stderr)
            results.append({**entry, "error": str(error)})

    with open(os.path.join(args.out, "render-results.json"), "w", encoding="utf-8") as handle:
        json.dump(results, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
