import argparse
import json
import os
import re
import sys
import bpy
from mathutils import Vector


CLIP_SOURCES = [
    ("states/Breathing Idle.fbx", "idle"),
    ("states/crouch/crouched-to-standing.fbx", "crouchToStand"),
    ("states/crouch/crouching-idle.fbx", "crouchIdle"),
    ("states/Crouching Rifle.fbx", "crouchRifle"),
    ("states/Exhausted Idle.fbx", "exhaustedIdle"),
    ("states/Falling Down.fbx", "fall"),
    ("states/Falling Forward Death.fbx", "fallingForwardDeath"),
    ("actions/impacts/getting-up.fbx", "gettingUp"),
    ("states/crouch/standing-to-crouched.fbx", "standToCrouch"),
    ("states/action-adventure-pack/stand-to-cover.fbx", "standToCover"),
    ("states/action-adventure-pack/cover-to-stand.fbx", "coverToStand"),
    ("states/Teeter.fbx", "teeter"),
    ("locomotion/male-locomotion-pack/walking.fbx", "walk"),
    ("locomotion/Stop Walking.fbx", "stopWalking"),
    ("locomotion/Start Walking.fbx", "startWalking"),
    ("locomotion/Jog Forward.fbx", "jog"),
    ("locomotion/male-locomotion-pack/standard-run.fbx", "run"),
    ("locomotion/male-locomotion-pack/run-to-stop.fbx", "runToStop"),
    ("states/crouch/crouched-walking.fbx", "crouchWalk"),
    ("locomotion/action-adventure-pack/crouched-sneaking-left.fbx", "crouchSneakLeft"),
    ("locomotion/action-adventure-pack/crouched-sneaking-right.fbx", "crouchSneakRight"),
    ("locomotion/male-locomotion-pack/left-strafe.fbx", "runStrafeLeft"),
    ("locomotion/male-locomotion-pack/right-strafe.fbx", "runStrafeRight"),
    ("locomotion/male-locomotion-pack/left-strafe-walking.fbx", "walkStrafeLeft"),
    ("locomotion/male-locomotion-pack/right-strafe-walking.fbx", "walkStrafeRight"),
    ("locomotion/Walk With Rifle.fbx", "walkRifle"),
    ("locomotion/walking-with-object.fbx", "walkCarry"),
    ("jumps-climbs/action-adventure-pack/male-locomotion-jump.fbx", "jump"),
    ("jumps-climbs/new-pack/jumping-full-standing.fbx", "standingJump"),
    ("jumps-climbs/new-pack/jumping-up.fbx", "jumpTakeoff"),
    ("jumps-climbs/new-pack/jumping-up-forward.fbx", "runJump"),
    ("jumps-climbs/new-pack/jumping-up-forward.fbx", "runningJump"),
    ("jumps-climbs/new-pack/jump-loop.fbx", "jumpLoop"),
    ("jumps-climbs/Climb Jump.fbx", "climbJump"),
    ("jumps-climbs/Climbing.fbx", "climb"),
    ("jumps-climbs/climbs/sprint-to-wall-climb.fbx", "sprintToWallClimb"),
    ("jumps-climbs/climbs/climbing-up-wall.fbx", "climbingUpWall"),
    ("jumps-climbs/High Jumping.fbx", "highJump"),
    ("jumps-climbs/action-adventure-pack/falling-idle.fbx", "fallingIdle"),
    ("jumps-climbs/action-adventure-pack/falling-to-roll.fbx", "fallingToRoll"),
    ("jumps-climbs/new-pack/falling-to-landing.fbx", "fallingToLanding"),
    ("jumps-climbs/new-pack/jump-down.fbx", "land"),
    ("jumps-climbs/new-pack/jump-down.fbx", "jumpDown"),
    ("jumps-climbs/new-pack/big-jump-down.fbx", "bigJumpDown"),
    ("jumps-climbs/new-pack/jump-down-handhold.fbx", "jumpDownHandhold"),
    ("jumps-climbs/new-pack/landing-soft.fbx", "landing"),
    ("jumps-climbs/new-pack/landing-soft.fbx", "runningLanding"),
    ("jumps-climbs/action-adventure-pack/hard-landing.fbx", "hardLanding"),
    ("actions/Big Hit and Fall.fbx", "bigHitFall"),
    ("actions/impacts/shoulder-hit-and-fall.fbx", "shoulderHitAndFall"),
    ("actions/Firing Rifle.fbx", "fireRifle"),
    ("actions/new-pack/gathering-objects.fbx", "gather"),
    ("actions/Hit Reaction.fbx", "hitReaction"),
    ("actions/new-pack/kneeling-inspecting.fbx", "kneelInspect"),
    ("actions/Left Turn.fbx", "turnLeft"),
    ("actions/action-adventure-pack/left-turn-90.fbx", "turnLeft90"),
    ("actions/new-pack/look-around.fbx", "lookAround"),
    ("actions/Look Around Short.fbx", "lookAroundShort"),
    ("actions/new-pack/picking-up.fbx", "pickUp"),
    ("actions/new-pack/pointing.fbx", "point"),
    ("actions/new-pack/standing-inspect-downward.fbx", "standingInspectDownward"),
    ("actions/Praying.fbx", "pray"),
    ("actions/Rifle Aiming Idle.fbx", "aim"),
    ("actions/Right Turn.fbx", "turnRight"),
    ("actions/action-adventure-pack/right-turn-90.fbx", "turnRight90"),
    ("actions/Swinging Butterfly Net.fbx", "swingNet"),
    ("actions/Swinging Hammer.fbx", "swingHammer"),
    ("actions/Tripping.fbx", "trip"),
    ("actions/Writing.fbx", "write"),
    ("actions/change item.fbx", "changeItem"),
    ("states/injured/injured-idle.fbx", "injuredIdle"),
    ("states/injured/injured-hurting-idle.fbx", "injuredHurtingIdle"),
    ("states/injured/injured-stumble-idle.fbx", "injuredStumbleIdle"),
    ("states/injured/injured-wave-idle.fbx", "injuredWaveIdle"),
    ("states/injured/injured-walk.fbx", "injuredWalk"),
    ("states/injured/injured-run.fbx", "injuredRun"),
    ("states/injured/injured-walk-backwards.fbx", "injuredWalkBackwards"),
    ("states/injured/injured-run-backwards.fbx", "injuredRunBackwards"),
    ("states/injured/injured-standing-jump.fbx", "injuredStandingJump"),
    ("states/injured/injured-run-jump.fbx", "injuredRunJump"),
    ("states/injured/injured-turn-left.fbx", "injuredTurnLeft"),
    ("states/injured/injured-turn-right.fbx", "injuredTurnRight"),
    ("states/injured/injured-walk-left-turn.fbx", "injuredWalkLeftTurn"),
    ("states/injured/injured-walk-right-turn.fbx", "injuredWalkRightTurn"),
    ("states/injured/injured-run-left-turn.fbx", "injuredRunLeftTurn"),
    ("states/injured/injured-run-right-turn.fbx", "injuredRunRightTurn"),
]

RETARGETED_CLIPS = {
    "walk",
    "run",
    "jog",
    "startWalking",
    "stopWalking",
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--animations", required=True)
    parser.add_argument("--base", default="states/Breathing Idle.fbx")
    parser.add_argument("--base-path")
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    after = set(bpy.data.objects)
    return list(after - before)


def import_model(path):
    before = set(bpy.data.objects)
    ext = os.path.splitext(path)[1].lower()
    if ext in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    after = set(bpy.data.objects)
    return list(after - before)


def armatures(objects=None):
    source = objects if objects is not None else bpy.context.scene.objects
    return [obj for obj in source if obj.type == "ARMATURE"]


def meshes(objects=None):
    source = objects if objects is not None else bpy.context.scene.objects
    return [obj for obj in source if obj.type == "MESH"]


def normalize_name(name):
    return re.sub(r"[^A-Za-z0-9_]+", "_", name).strip("_")


def remove_target_action(target_armature, clip_name):
    action_name = normalize_name(clip_name)
    if target_armature.animation_data:
        for track in list(target_armature.animation_data.nla_tracks):
            if track.name == action_name:
                target_armature.animation_data.nla_tracks.remove(track)
    action = bpy.data.actions.get(action_name)
    if action:
        bpy.data.actions.remove(action)


def action_from_armature(armature):
    if armature.animation_data and armature.animation_data.action:
        return armature.animation_data.action
    return None


def add_action_to_target(source_armature, target_armature, clip_name):
    source_action = action_from_armature(source_armature)
    if not source_action:
        return None
    remove_target_action(target_armature, clip_name)
    action = source_action.copy()
    action.name = normalize_name(clip_name)
    action.use_fake_user = True
    if not target_armature.animation_data:
        target_armature.animation_data_create()
    track = target_armature.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, int(action.frame_range[0]), action)
    strip.name = action.name
    return action


def add_existing_action_to_target(target_armature, action):
    if not target_armature.animation_data:
        target_armature.animation_data_create()
    for track in target_armature.animation_data.nla_tracks:
        if track.name == action.name:
            return
    track = target_armature.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, int(action.frame_range[0]), action)
    strip.name = action.name


def clear_pose_constraints(armature):
    for pose_bone in armature.pose.bones:
        for constraint in list(pose_bone.constraints):
            pose_bone.constraints.remove(constraint)


def add_retargeted_action_to_target(source_armature, target_armature, clip_name):
    source_action = action_from_armature(source_armature)
    if not source_action:
        return None

    remove_target_action(target_armature, clip_name)
    clear_pose_constraints(target_armature)
    if not target_armature.animation_data:
        target_armature.animation_data_create()
    target_armature.animation_data.action = None

    source_armature.animation_data.action = source_action
    start = int(source_action.frame_range[0])
    end = int(source_action.frame_range[1])
    scene = bpy.context.scene
    scene.frame_start = start
    scene.frame_end = end

    matched = 0
    for pose_bone in target_armature.pose.bones:
        if pose_bone.name not in source_armature.pose.bones:
            continue
        if pose_bone.name == "mixamorig:Hips":
            location = pose_bone.constraints.new(type="COPY_LOCATION")
            location.name = "retarget_location"
            location.target = source_armature
            location.subtarget = pose_bone.name
            location.target_space = "WORLD"
            location.owner_space = "WORLD"
        rotation = pose_bone.constraints.new(type="COPY_ROTATION")
        rotation.name = "retarget_rotation"
        rotation.target = source_armature
        rotation.subtarget = pose_bone.name
        rotation.target_space = "WORLD"
        rotation.owner_space = "WORLD"
        matched += 1

    bpy.ops.object.mode_set(mode="OBJECT") if bpy.ops.object.mode_set.poll() else None
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = target_armature
    target_armature.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.nla.bake(
        frame_start=start,
        frame_end=end,
        step=1,
        only_selected=True,
        visual_keying=True,
        clear_constraints=True,
        clear_parents=False,
        use_current_action=False,
        bake_types={"POSE"},
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    action = target_armature.animation_data.action if target_armature.animation_data else None
    if not action:
        return None
    action.name = normalize_name(clip_name)
    action.use_fake_user = True
    track = target_armature.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, start, action)
    strip.name = action.name
    action["retargetedBoneMatches"] = matched
    return action


def delete_objects(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        if obj.name in bpy.data.objects:
            obj.select_set(True)
    bpy.ops.object.delete()


def normalize_scene_height(target_height=1.85):
    mesh_objects = meshes()
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


def ground_armature_root(target_armature):
    # Runtime movement owns Darwin's world position. Keep the exported GLB root
    # at the origin so animation clips cannot lift the whole character.
    target_armature.location.x = 0
    target_armature.location.y = 0
    target_armature.location.z = 0


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


def main():
    args = parse_args()
    base_path = args.base_path or os.path.join(args.animations, args.base)
    report = {
        "base": base_path,
        "output": args.output,
        "baseArmature": None,
        "baseMeshes": [],
        "clips": [],
        "warnings": [],
    }

    clear_scene()
    base_objects = import_model(base_path)
    base_armatures = armatures(base_objects)
    if not base_armatures:
        raise RuntimeError(f"No base armature found in {base_path}")
    target = base_armatures[0]
    report["baseArmature"] = {
        "name": target.name,
        "bones": len(target.data.bones),
        "sampleBones": [bone.name for bone in target.data.bones][:40],
    }
    report["baseMeshes"] = [
        {"name": mesh.name, "vertices": len(mesh.data.vertices), "materials": len(mesh.material_slots)}
        for mesh in meshes(base_objects)
    ]

    existing_actions = {action.name: action for action in bpy.data.actions}
    if target.animation_data:
        target.animation_data_clear()
    for action in existing_actions.values():
        action.use_fake_user = True
        add_existing_action_to_target(target, action)

    for filename, clip_name in CLIP_SOURCES:
        path = os.path.join(args.animations, filename)
        if not os.path.exists(path):
            preserved = bpy.data.actions.get(normalize_name(clip_name))
            if preserved:
                report["clips"].append({
                    "file": filename,
                    "name": preserved.name,
                    "frameRange": [float(preserved.frame_range[0]), float(preserved.frame_range[1])],
                    "preservedFromBase": True,
                })
            else:
                report["warnings"].append(f"Missing {filename}")
            continue
        if filename == args.base:
            source_armature = target
            if not source_armature.animation_data:
                imported = import_fbx(path)
                source_armature = armatures(imported)[0]
                action = add_action_to_target(source_armature, target, clip_name)
                delete_objects(imported)
            else:
                action = add_action_to_target(source_armature, target, clip_name)
        else:
            imported = import_fbx(path)
            imported_armatures = armatures(imported)
            if not imported_armatures:
                report["warnings"].append(f"No armature in {filename}")
                delete_objects(imported)
                continue
            if clip_name in RETARGETED_CLIPS:
                action = add_retargeted_action_to_target(imported_armatures[0], target, clip_name)
            else:
                action = add_action_to_target(imported_armatures[0], target, clip_name)
            delete_objects(imported)
        if action:
            report["clips"].append({
                "file": filename,
                "name": action.name,
                "frameRange": [float(action.frame_range[0]), float(action.frame_range[1])],
            })

    wanted_actions = {normalize_name(name) for _, name in CLIP_SOURCES}
    for action in list(bpy.data.actions):
        if action.name not in wanted_actions:
            bpy.data.actions.remove(action)
    if target.animation_data:
        target.animation_data.action = None

    normalize_scene_height()
    ground_armature_root(target)
    export_glb(args.output)

    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)


if __name__ == "__main__":
    main()
