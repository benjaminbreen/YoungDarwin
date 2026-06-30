"""Batch-convert animation FBXs to minimal animation-only GLBs.

This intentionally runs many imports inside one Blender process so macOS/Metal
startup instability is not multiplied by launching Blender once per clip.

Usage:
  blender --background --factory-startup --disable-autoexec \
    --python scripts/blender_batch_fbx_anim_to_glb.py -- \
    --jobs /tmp/darwin-animation-jobs.json --report /tmp/darwin-animation-report.json

The jobs file is a JSON array:
  [{ "clip": "holdToolWalk", "input": "path.fbx", "output": "path.glb" }]
"""
import argparse
import json
import os
import sys
import traceback

import bpy


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--skip-existing", action="store_true")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for collection in (
        bpy.data.meshes,
        bpy.data.armatures,
        bpy.data.actions,
        bpy.data.materials,
        bpy.data.images,
    ):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)


def convert_job(job):
    clip = job.get("clip") or os.path.basename(job["input"])
    src = job["input"]
    out = job["output"]
    print(f"FBX_BATCH_START {clip} {src}", flush=True)
    reset_scene()
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=False)
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_animations=True,
        export_materials="NONE",
        export_apply=False,
    )
    print(f"FBX_BATCH_DONE {clip} {out}", flush=True)


def main():
    args = parse_args()
    with open(args.jobs, "r", encoding="utf-8") as f:
        jobs = json.load(f)
    report = []
    for job in jobs:
        clip = job.get("clip") or os.path.basename(job.get("input", "unknown"))
        out = job.get("output")
        if args.skip_existing and out and os.path.exists(out):
            report.append({**job, "ok": True, "skipped": True})
            continue
        try:
            convert_job(job)
            report.append({**job, "ok": True})
        except Exception as exc:
            traceback.print_exc()
            report.append({**job, "ok": False, "error": str(exc)})
            reset_scene()
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    failures = [item for item in report if not item.get("ok")]
    print(f"FBX_BATCH_REPORT {args.report} ok={len(report) - len(failures)} failed={len(failures)}", flush=True)
    if failures:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
