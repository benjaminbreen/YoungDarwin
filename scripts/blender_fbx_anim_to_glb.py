"""Convert a single Mixamo animation FBX to a minimal GLB (armature + clip only).

Usage:
  Blender -b -P scripts/blender_fbx_anim_to_glb.py -- --input <file.fbx> --output <file.glb>
"""
import argparse
import sys
import bpy


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def main():
    args = parse_args()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=args.input, automatic_bone_orientation=False)
    # Drop meshes; only the armature + action are needed.
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.export_scene.gltf(
        filepath=args.output,
        export_format="GLB",
        export_animations=True,
        export_materials="NONE",
        export_apply=False,
    )


if __name__ == "__main__":
    main()
