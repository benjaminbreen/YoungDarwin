"""Build simple primitive placeholder tool models for Darwin's hand props.

Exports one GLB per tool to public/assets/models/tools/. These are meant to be
swapped out for Meshy/sculpted models later — the runtime only cares about the
file path, so replacing the GLB in place is enough.

Convention (so it lines up with three.js after the glTF +Y-up export):
  - "forward" (glTF -Z) is built along Blender +Y
  - "up"      (glTF +Y) is built along Blender +Z
  - grip/pivot sits at the world origin so the hand holds it there

Usage:
  Blender -b -P scripts/blender_build_tool_placeholders.py
"""
import math
import os
import bpy

OUT_DIR = os.path.join(os.getcwd(), "public", "assets", "models", "tools")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def make_material(name, color, roughness=0.7, metallic=0.0, alpha=1.0, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Alpha" in bsdf.inputs and alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    if emission is not None and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (emission[0], emission[1], emission[2], 1.0)
        bsdf.inputs["Emission Strength"].default_value = 2.0
    return mat


def cylinder(radius, depth, location, rotation=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=location, rotation=rotation, vertices=16)
    obj = bpy.context.active_object
    if material:
        obj.data.materials.append(material)
    return obj


def box(size, location, rotation=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.scale = (size[0], size[1], size[2])
    if material:
        obj.data.materials.append(material)
    return obj


def torus(major, minor, location, rotation=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=location, rotation=rotation,
                                     major_segments=20, minor_segments=8)
    obj = bpy.context.active_object
    if material:
        obj.data.materials.append(material)
    return obj


def cone(radius1, radius2, depth, location, rotation=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_cone_add(radius1=radius1, radius2=radius2, depth=depth, location=location,
                                    rotation=rotation, vertices=16)
    obj = bpy.context.active_object
    if material:
        obj.data.materials.append(material)
    return obj


def export(name):
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT_DIR, name + ".glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
    )


def build_shotgun():
    clear_scene()
    wood = make_material("gunwood", (0.30, 0.18, 0.09), roughness=0.6)
    metal = make_material("gunmetal", (0.16, 0.16, 0.18), roughness=0.35, metallic=0.9)
    # Barrel along +Y (forward), grip at origin. Lay the Z-cylinder down along Y.
    cylinder(0.016, 0.92, location=(0, 0.5, 0.02), rotation=(math.radians(90), 0, 0), material=metal)
    cylinder(0.012, 0.92, location=(0.018, 0.5, 0.02), rotation=(math.radians(90), 0, 0), material=metal)
    # Breech / lock block.
    box((0.05, 0.12, 0.06), location=(0.01, 0.02, 0.0), material=metal)
    # Wrist + stock sweeping back (-Y) and down (-Z).
    box((0.045, 0.16, 0.05), location=(0.01, -0.13, -0.03), rotation=(math.radians(-12), 0, 0), material=wood)
    box((0.05, 0.14, 0.10), location=(0.01, -0.27, -0.07), rotation=(math.radians(-16), 0, 0), material=wood)
    # Trigger guard.
    torus(0.022, 0.004, location=(0.01, -0.02, -0.05), rotation=(0, math.radians(90), 0), material=metal)
    export("shotgun")


def build_net():
    clear_scene()
    wood = make_material("netpole", (0.45, 0.30, 0.16), roughness=0.7)
    rim = make_material("netrim", (0.55, 0.55, 0.60), roughness=0.4, metallic=0.7)
    mesh = make_material("netmesh", (0.93, 0.95, 0.92), roughness=0.9, alpha=0.35)
    # Pole forward along +Y from grip.
    cylinder(0.011, 0.74, location=(0, 0.37, 0), rotation=(math.radians(90), 0, 0), material=wood)
    # Hoop at the far end, facing forward (ring in the X-Z plane).
    torus(0.13, 0.007, location=(0, 0.75, 0), rotation=(math.radians(90), 0, 0), material=rim)
    # Net bag tapering back from the hoop.
    cone(0.13, 0.02, 0.28, location=(0, 0.9, 0), rotation=(math.radians(-90), 0, 0), material=mesh)
    export("net")


def build_snare():
    clear_scene()
    wood = make_material("snarepole", (0.42, 0.28, 0.15), roughness=0.7)
    cord = make_material("snarecord", (0.78, 0.70, 0.50), roughness=0.85)
    # Pole forward.
    cylinder(0.010, 0.80, location=(0, 0.40, 0), rotation=(math.radians(90), 0, 0), material=wood)
    # Noose loop at the end, slightly tilted.
    torus(0.085, 0.006, location=(0, 0.82, 0), rotation=(math.radians(75), 0, 0), material=cord)
    # Spare coil near the grip.
    torus(0.05, 0.006, location=(0, 0.08, -0.02), rotation=(math.radians(80), 0, 0), material=cord)
    export("snare")


def build_hammer():
    clear_scene()
    wood = make_material("hafthandle", (0.40, 0.26, 0.13), roughness=0.7)
    metal = make_material("hammerhead", (0.20, 0.20, 0.22), roughness=0.4, metallic=0.9)
    # Handle up along +Z (a rock hammer is held head-up), grip at origin.
    cylinder(0.013, 0.32, location=(0, 0, 0.10), material=wood)
    # Head across +X at the top: a flat striking face and a tapered pick.
    box((0.05, 0.035, 0.035), location=(0.05, 0, 0.26), material=metal)
    cone(0.028, 0.004, 0.10, location=(-0.07, 0, 0.26), rotation=(0, math.radians(-90), 0), material=metal)
    export("hammer")


def main():
    build_shotgun()
    build_net()
    build_snare()
    build_hammer()
    print("TOOL_PLACEHOLDERS_DONE")


if __name__ == "__main__":
    main()
