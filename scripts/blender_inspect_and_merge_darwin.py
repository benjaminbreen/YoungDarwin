import argparse
import json
import os
import re
import shutil
import sys
import bpy


CLIP_MAP = {
    "Breathing Idle.fbx": "idle",
    "Walking.fbx": "walk",
    "run.fbx": "run",
    "Jump.fbx": "jump",
    "Jumping Down.fbx": "land",
    "Gathering Objects.fbx": "gather",
    "Rifle Aiming Idle.fbx": "aim",
    "Tripping.fbx": "trip",
    "walking-injured.fbx": "injuredWalk",
    "walking-with-object.fbx": "walkCarry",
    "running-jump.fbx": "runJump",
    "jump-running-object.fbx": "jumpCarry",
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--animations", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    return args


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_glb(path):
    bpy.ops.import_scene.gltf(filepath=path)


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    after = set(bpy.data.objects)
    return list(after - before)


def scene_armatures():
    return [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]


def scene_meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def clear_animation_data(objects):
    for obj in objects:
        obj.animation_data_clear()
    for action in bpy.data.actions:
        action.use_fake_user = True


def normalize_action_name(name):
    name = re.sub(r"[^A-Za-z0-9_]+", "_", name.strip())
    return name.strip("_")


def copy_action_to_target(source_armature, target_armature, clip_name):
    if not source_armature.animation_data or not source_armature.animation_data.action:
        return None
    action = source_armature.animation_data.action.copy()
    action.name = clip_name
    action.use_fake_user = True

    if not target_armature.animation_data:
        target_armature.animation_data_create()
    if not target_armature.animation_data.nla_tracks:
        pass
    track = target_armature.animation_data.nla_tracks.new()
    track.name = clip_name
    start = int(action.frame_range[0])
    strip = track.strips.new(clip_name, start, action)
    strip.name = clip_name
    return action


def remove_objects(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        if obj.name in bpy.data.objects:
            obj.select_set(True)
    bpy.ops.object.delete()


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_animations=True,
        export_nla_strips=True,
        export_materials="EXPORT",
        export_apply=False,
    )


def inspect_bones(armature):
    if not armature:
        return []
    return [bone.name for bone in armature.data.bones]


def main():
    args = parse_args()
    report = {
        "model": args.model,
        "animationsDir": args.animations,
        "output": args.output,
        "modelArmatures": [],
        "modelMeshes": [],
        "animationFiles": [],
        "mergedClips": [],
        "warnings": [],
    }

    clear_scene()
    import_glb(args.model)
    model_armatures = scene_armatures()
    model_meshes = scene_meshes()
    report["modelArmatures"] = [
        {"name": arm.name, "bones": len(arm.data.bones), "sampleBones": inspect_bones(arm)[:24]}
        for arm in model_armatures
    ]
    report["modelMeshes"] = [
        {"name": mesh.name, "vertices": len(mesh.data.vertices), "materials": len(mesh.material_slots)}
        for mesh in model_meshes
    ]

    if not model_armatures:
        report["warnings"].append("Darwin GLB has no armature. Animation clips cannot be merged directly.")
        shutil.copyfile(args.model, args.output)
    else:
        target = model_armatures[0]
        clear_animation_data([target])
        for filename, clip_name in CLIP_MAP.items():
            fbx_path = os.path.join(args.animations, filename)
            if not os.path.exists(fbx_path):
                report["warnings"].append(f"Missing animation file: {filename}")
                continue
            imported = import_fbx(fbx_path)
            imported_armatures = [obj for obj in imported if obj.type == "ARMATURE"]
            report["animationFiles"].append({
                "file": filename,
                "clip": clip_name,
                "armatures": [
                    {"name": arm.name, "bones": len(arm.data.bones), "sampleBones": inspect_bones(arm)[:12]}
                    for arm in imported_armatures
                ],
            })
            if not imported_armatures:
                report["warnings"].append(f"No armature found in {filename}")
                remove_objects(imported)
                continue
            source = imported_armatures[0]
            action = copy_action_to_target(source, target, normalize_action_name(clip_name))
            if action:
                report["mergedClips"].append({
                    "clip": action.name,
                    "frames": [float(action.frame_range[0]), float(action.frame_range[1])],
                    "fcurves": len(action.fcurves),
                })
            remove_objects(imported)
        export_glb(args.output)

    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)


if __name__ == "__main__":
    main()
