import argparse
import json
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--target-triangles", type=int, default=70000)
    parser.add_argument("--target-length", type=float, default=14.0)
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_model(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".obj":
        try:
            bpy.ops.wm.obj_import(filepath=path)
        except Exception:
            bpy.ops.import_scene.obj(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext in [".gltf", ".glb"]:
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".dae":
        bpy.ops.wm.collada_import(filepath=path)
    else:
        raise RuntimeError(f"Unsupported input extension: {ext}")


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def triangle_count():
    count = 0
    for obj in mesh_objects():
        count += sum(max(1, len(poly.vertices) - 2) for poly in obj.data.polygons)
    return count


def bounds():
    meshes = mesh_objects()
    if not meshes:
        return None
    mins = Vector((float("inf"), float("inf"), float("inf")))
    maxs = Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    return mins, maxs


def normalize_ship(target_length):
    current = bounds()
    if not current:
      return
    mins, maxs = current
    size = maxs - mins
    longest = max(size.x, size.y, size.z, 0.001)
    scale = target_length / longest
    center = (mins + maxs) * 0.5
    for obj in bpy.context.scene.objects:
        if obj.parent is None:
            obj.location.x = (obj.location.x - center.x) * scale
            obj.location.y = (obj.location.y - center.y) * scale
            obj.location.z = (obj.location.z - mins.z) * scale
            obj.scale = (obj.scale.x * scale, obj.scale.y * scale, obj.scale.z * scale)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)


def decimate_to_target(target_triangles):
    before = triangle_count()
    if before <= target_triangles:
        return before, before, 1.0
    ratio = max(0.04, min(0.95, target_triangles / before))
    for obj in mesh_objects():
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        modifier = obj.modifiers.new("Scenic ship decimation", "DECIMATE")
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except Exception:
            obj.modifiers.remove(modifier)
        obj.select_set(False)
    return before, triangle_count(), ratio


def tune_materials():
    for material in bpy.data.materials:
        material.use_nodes = True
        nodes = material.node_tree.nodes
        bsdf = nodes.get("Principled BSDF")
        if not bsdf:
            continue
        if "Normal" in bsdf.inputs:
            for link in list(bsdf.inputs["Normal"].links):
                material.node_tree.links.remove(link)
        for node in list(nodes):
            if node.type in {"NORMAL_MAP", "BUMP"}:
                nodes.remove(node)
        for node in nodes:
            if node.type == "TEX_IMAGE" and node.image and "normal" in node.image.name.lower():
                nodes.remove(node)
        name = material.name.lower()
        if "sail" in name or "fabric" in name:
            bsdf.inputs["Base Color"].default_value = (0.92, 0.84, 0.66, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.86
        elif "metal" in name:
            bsdf.inputs["Metallic"].default_value = 0.1
            bsdf.inputs["Roughness"].default_value = 0.7
        else:
            bsdf.inputs["Roughness"].default_value = max(bsdf.inputs["Roughness"].default_value, 0.78)


def shade_and_cleanup():
    for obj in mesh_objects():
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.shade_smooth()
        except Exception:
            pass
        obj.select_set(False)


def bounds_report():
    current = bounds()
    if not current:
        return None
    mins, maxs = current
    size = maxs - mins
    return {
        "min": [round(v, 4) for v in mins],
        "max": [round(v, 4) for v in maxs],
        "size": [round(v, 4) for v in size],
    }


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )


def main():
    args = parse_args()
    clear_scene()
    import_model(args.input)
    raw_triangles = triangle_count()
    normalize_ship(args.target_length)
    before_decimate, after_decimate, ratio = decimate_to_target(args.target_triangles)
    tune_materials()
    shade_and_cleanup()
    export_glb(args.output)
    report = {
        "input": args.input,
        "output": args.output,
        "targetTriangles": args.target_triangles,
        "rawTriangles": raw_triangles,
        "beforeDecimateTriangles": before_decimate,
        "afterDecimateTriangles": after_decimate,
        "decimateRatio": round(ratio, 4),
        "sizeKB": round(os.path.getsize(args.output) / 1024),
        "bounds": bounds_report(),
        "meshes": [
            {
                "name": obj.name,
                "vertices": len(obj.data.vertices),
                "polygons": len(obj.data.polygons),
                "materials": len(obj.material_slots),
            }
            for obj in mesh_objects()
        ],
    }
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
