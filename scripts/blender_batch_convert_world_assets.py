import argparse
import json
import os
import sys

import bpy


ASSETS = [
    ("nature/Bush_Common.gltf", "assets-src/nature/glTF/Bush_Common.gltf"),
    ("nature/Bush_Common_Flowers.gltf", "assets-src/nature/glTF/Bush_Common_Flowers.gltf"),
    ("nature/Grass_Common_Short.gltf", "assets-src/nature/glTF/Grass_Common_Short.gltf"),
    ("nature/Grass_Wispy_Tall.gltf", "assets-src/nature/glTF/Grass_Wispy_Tall.gltf"),
    ("nature/Plant_1.gltf", "assets-src/nature/glTF/Plant_1.gltf"),
    ("nature/Plant_7_Big.gltf", "assets-src/nature/glTF/Plant_7_Big.gltf"),
    ("nature/Rock_Medium_1.gltf", "assets-src/nature/glTF/Rock_Medium_1.gltf"),
    ("nature/Rock_Medium_2.gltf", "assets-src/nature/glTF/Rock_Medium_2.gltf"),
    ("nature/Rock_Medium_3.gltf", "assets-src/nature/glTF/Rock_Medium_3.gltf"),
    ("nature/Pebble_Round_1.gltf", "assets-src/nature/glTF/Pebble_Round_1.gltf"),
    ("nature/Pebble_Round_3.gltf", "assets-src/nature/glTF/Pebble_Round_3.gltf"),
    ("nature/Pebble_Square_2.gltf", "assets-src/nature/glTF/Pebble_Square_2.gltf"),
    ("nature/TwistedTree_2.gltf", "assets-src/nature/glTF/TwistedTree_2.gltf"),
    ("nature/TwistedTree_4.gltf", "assets-src/nature/glTF/TwistedTree_4.gltf"),
    ("nature/DeadTree_3.gltf", "assets-src/nature/glTF/DeadTree_3.gltf"),
    ("livestock/Cow.fbx", "assets-src/animals/Cow.fbx"),
    ("livestock/Donkey.fbx", "assets-src/animals/Donkey.fbx"),
]


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_asset(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".gltf" or ext == ".glb":
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    else:
        raise ValueError(f"Unsupported asset extension: {path}")


def normalize_scene():
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    for obj in meshes:
        obj.select_set(True)
        obj.rotation_euler[0] = obj.rotation_euler[0]
        obj.location[0] = 0
        obj.location[2] = 0
        obj.data.update()
        for material in obj.data.materials:
            if not material:
                continue
            material.use_nodes = True
            bsdf = material.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                if "Roughness" in bsdf.inputs:
                    bsdf.inputs["Roughness"].default_value = 0.82
                if "Metallic" in bsdf.inputs:
                    bsdf.inputs["Metallic"].default_value = 0
    if meshes:
        bpy.ops.object.select_all(action="DESELECT")
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR", center="MEDIAN")


def convert_one(root, out_root, rel_out, rel_in):
    reset_scene()
    source = os.path.join(root, rel_in)
    output = os.path.join(out_root, rel_out).replace(".gltf", ".glb").replace(".fbx", ".glb")
    os.makedirs(os.path.dirname(output), exist_ok=True)
    import_asset(source)
    normalize_scene()
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        export_apply=True,
        export_animations=True,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    return {
        "source": rel_in,
        "output": os.path.relpath(output, root),
        "sizeKB": round(os.path.getsize(output) / 1024),
    }


def main():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--out-root", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args(argv)
    root = os.path.abspath(args.root)
    out_root = os.path.abspath(args.out_root)
    converted = []
    warnings = []
    for rel_out, rel_in in ASSETS:
        source = os.path.join(root, rel_in)
        if not os.path.exists(source):
            warnings.append(f"Missing source: {rel_in}")
            continue
        converted.append(convert_one(root, out_root, rel_out, rel_in))
    report = {"converted": converted, "warnings": warnings}
    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
