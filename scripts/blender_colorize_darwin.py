import argparse
import json
import os
import sys
import bpy


MATERIALS = {
    "skin": ("Skin warm", (0.70, 0.48, 0.32, 1.0), 0.62, 0.48),
    "hair": ("Hair brown", (0.16, 0.10, 0.055, 1.0), 0.82, 0.44),
    "coat": ("Olive frock coat", (0.22, 0.25, 0.16, 1.0), 0.78, 0.52),
    "waistcoat": ("Charcoal waistcoat", (0.055, 0.065, 0.07, 1.0), 0.86, 0.45),
    "shirt": ("Linen shirt", (0.78, 0.70, 0.56, 1.0), 0.7, 0.36),
    "trousers": ("Stone trousers", (0.48, 0.44, 0.34, 1.0), 0.76, 0.48),
    "boots": ("Dark leather boots", (0.06, 0.045, 0.035, 1.0), 0.88, 0.5),
    "satchel": ("Brown leather satchel", (0.35, 0.19, 0.08, 1.0), 0.8, 0.55),
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def make_material(key):
    name, color, roughness, metallic = MATERIALS[key]
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = color
        principled.inputs["Roughness"].default_value = roughness
        principled.inputs["Metallic"].default_value = 0.0
    material.diffuse_color = color
    return material


def classify_by_vertex_group(name):
    lower = name.lower()
    if "head" in lower or "neck" in lower or "hand" in lower:
        return "skin"
    if "foot" in lower or "toe" in lower:
        return "boots"
    if "leg" in lower or "upleg" in lower:
        return "trousers"
    if "spine" in lower or "shoulder" in lower or "arm" in lower:
        return "coat"
    return None


def assign_by_vertex_groups(mesh_obj, materials, report):
    mesh = mesh_obj.data
    mesh.materials.clear()
    slot_index = {}
    for key, material in materials.items():
        mesh.materials.append(material)
        slot_index[key] = len(mesh.materials) - 1

    vertex_to_key = {}
    for vertex in mesh.vertices:
        best = None
        for group_ref in vertex.groups:
            if group_ref.weight < 0.35:
                continue
            group = mesh_obj.vertex_groups[group_ref.group]
            key = classify_by_vertex_group(group.name)
            if key:
                best = key
                break
        vertex_to_key[vertex.index] = best

    counts = {key: 0 for key in materials}
    for polygon in mesh.polygons:
        keys = [vertex_to_key.get(index) for index in polygon.vertices]
        key = max((item for item in keys if item), key=keys.count, default=None)
        if not key:
            z = sum(mesh.vertices[index].co.z for index in polygon.vertices) / len(polygon.vertices)
            x = sum(mesh.vertices[index].co.x for index in polygon.vertices) / len(polygon.vertices)
            y = sum(mesh.vertices[index].co.y for index in polygon.vertices) / len(polygon.vertices)
            if z > 1.46:
                key = "hair" if y < -0.05 else "skin"
            elif z < 0.22:
                key = "boots"
            elif z < 0.9:
                key = "trousers"
            elif abs(x) < 0.22 and 0.95 < z < 1.38:
                key = "waistcoat"
            elif abs(x) < 0.18 and 1.2 < z < 1.58:
                key = "shirt"
            else:
                key = "coat"
        polygon.material_index = slot_index[key]
        counts[key] += 1

    report["materialPolygonCounts"] = counts


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
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=args.input)
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    report = {
        "input": args.input,
        "output": args.output,
        "meshes": [
            {
                "name": obj.name,
                "vertices": len(obj.data.vertices),
                "polygons": len(obj.data.polygons),
                "vertexGroups": len(obj.vertex_groups),
                "existingMaterials": len(obj.material_slots),
            }
            for obj in mesh_objects
        ],
        "materialPolygonCounts": {},
    }
    materials = {key: make_material(key) for key in MATERIALS}
    for obj in mesh_objects:
        assign_by_vertex_groups(obj, materials, report)
    export_glb(args.output)
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)


if __name__ == "__main__":
    main()
