import argparse
import json
import os
import sys

import bpy
from mathutils import Vector


CLIP_MAP = {
    "Breathing Idle.fbx": "idle",
    "Walking.fbx": "walk",
    "run.fbx": "run",
    "Start Walking.fbx": "startWalking",
    "Run To Stop.fbx": "runToStop",
    "Jog Forward.fbx": "jog",
    "Look Around.fbx": "lookAround",
    "Look Around Short.fbx": "lookAroundShort",
    "Pointing.fbx": "point",
    "Gathering Objects.fbx": "gather",
    "Writing.fbx": "write",
    "Kneeling Inspecting.fbx": "kneelInspect",
    "Crouching Idle.fbx": "crouchIdle",
    "Crouched Walk.fbx": "crouchWalk",
    "Praying.fbx": "pray",
    "Exhausted Idle.fbx": "exhaustedIdle",
}


def parse_args():
    argv = sys.argv
    if "--" in argv:
      argv = argv[argv.index("--") + 1:]
    else:
      argv = []
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-path", required=True)
    parser.add_argument("--animations", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(argv)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_fbx(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    imported = [obj for obj in bpy.context.scene.objects if obj not in before]
    armatures = [obj for obj in imported if obj.type == "ARMATURE"]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    return imported, armatures, meshes


def first_action(armature):
    if armature and armature.animation_data and armature.animation_data.action:
        return armature.animation_data.action
    return None


def copy_action(source_armature, target_armature, clip_name):
    source = first_action(source_armature)
    if not source:
        return None
    action = source.copy()
    action.name = clip_name
    action.use_fake_user = True
    if not target_armature.animation_data:
        target_armature.animation_data_create()
    track = target_armature.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, int(action.frame_range[0]), action)
    strip.name = clip_name
    return action


def remove_objects(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        if obj.name in bpy.data.objects:
            obj.select_set(True)
    bpy.ops.object.delete()


def normalize_materials(meshes):
    for mesh in meshes:
        for material in mesh.data.materials:
            if not material:
                continue
            material.use_nodes = True
            bsdf = material.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                if "Metallic" in bsdf.inputs:
                    bsdf.inputs["Metallic"].default_value = 0
                if "Roughness" in bsdf.inputs:
                    bsdf.inputs["Roughness"].default_value = max(bsdf.inputs["Roughness"].default_value, 0.72)


def normalize_scene_height(target_height=1.78):
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not mesh_objects:
        return
    corners = [obj.matrix_world @ Vector(corner) for obj in mesh_objects for corner in obj.bound_box]
    min_z = min(vertex.z for vertex in corners)
    max_z = max(vertex.z for vertex in corners)
    height = max(max_z - min_z, 0.001)
    scale = target_height / height
    for obj in bpy.context.scene.objects:
        if obj.parent is None:
            obj.scale = (obj.scale.x * scale, obj.scale.y * scale, obj.scale.z * scale)
            obj.location.z = (obj.location.z - min_z) * scale
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def main():
    args = parse_args()
    reset_scene()
    imported, armatures, meshes = import_fbx(args.base_path)
    if not armatures:
        raise RuntimeError("Base FBX has no armature")
    target = armatures[0]
    normalize_materials(meshes)
    if target.animation_data:
        target.animation_data_clear()

    report = {"base": args.base_path, "clips": [], "warnings": []}
    for filename, clip_name in CLIP_MAP.items():
        path = os.path.join(args.animations, filename)
        if not os.path.exists(path):
            report["warnings"].append(f"Missing animation: {filename}")
            continue
        imported_clip, armatures_clip, _ = import_fbx(path)
        if not armatures_clip:
            report["warnings"].append(f"No armature in animation: {filename}")
            remove_objects(imported_clip)
            continue
        action = copy_action(armatures_clip[0], target, clip_name)
        if action:
            report["clips"].append({
                "name": action.name,
                "frameRange": [float(action.frame_range[0]), float(action.frame_range[1])],
            })
        remove_objects(imported_clip)

    wanted_actions = set(CLIP_MAP.values())
    for action in list(bpy.data.actions):
        if action.name not in wanted_actions:
            bpy.data.actions.remove(action)

    normalize_scene_height()

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=args.output,
        export_format="GLB",
        export_apply=True,
        export_animations=True,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    report["output"] = args.output
    report["sizeKB"] = round(os.path.getsize(args.output) / 1024)
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
