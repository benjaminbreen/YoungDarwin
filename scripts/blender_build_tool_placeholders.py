"""Build compact low-poly tool models for Darwin's hand props.

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


def beveled_box(name, size, location, rotation=(0, 0, 0), material=None, bevel=0.004):
    obj = box(size, location, rotation, material)
    obj.name = name
    modifier = obj.modifiers.new(name="softened hand-worked edges", type="BEVEL")
    modifier.width = bevel
    modifier.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
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
    wood = make_material("hafthandle", (0.32, 0.20, 0.10), roughness=0.55)
    grip = make_material("haftgrip", (0.24, 0.14, 0.07), roughness=0.75)
    metal = make_material("hammerhead", (0.52, 0.54, 0.58), roughness=0.22, metallic=1.0)
    # Geologist's hammer. Handle up along +Z (head at the top), grip at origin.
    head_z = 0.27
    # Haft: slight taper toward the head, wrapped grip + flared butt below.
    cone(0.014, 0.011, 0.33, location=(0, 0, 0.115), material=wood)
    cylinder(0.015, 0.10, location=(0, 0, -0.01), material=grip)
    cone(0.012, 0.018, 0.028, location=(0, 0, -0.064), material=wood)
    # Eye collar where the haft passes through the head, haft peeking above.
    cylinder(0.019, 0.048, location=(0, 0, head_z), material=metal)
    cylinder(0.0115, 0.018, location=(0, 0, head_z + 0.028), material=wood)
    # Square striking face on +X: neck flaring out to a wider face cap.
    cone(0.024, 0.018, 0.05, location=(0.04, 0, head_z), rotation=(0, math.radians(90), 0), material=metal)
    box((0.02, 0.04, 0.04), location=(0.073, 0, head_z), material=metal)
    # Tapered pick on -X, drooping slightly toward the tip.
    cone(0.019, 0.0025, 0.12, location=(-0.066, 0, head_z - 0.007),
         rotation=(0, math.radians(-98), 0), material=metal)
    export("hammer")


def build_pocket_knife():
    """Open horn-handled folding knife, authored at real-world metre scale.

    Blender +Z exports as glTF +Y, so the blade continues through Darwin's
    curled fingers while the grip pivot remains at the origin.
    """
    clear_scene()
    horn = make_material("polished dark horn", (0.075, 0.052, 0.038), roughness=0.34)
    horn_highlight = make_material("horn edge", (0.16, 0.105, 0.065), roughness=0.42)
    brass = make_material("aged brass", (0.54, 0.34, 0.105), roughness=0.24, metallic=0.82)
    steel = make_material("honed steel", (0.48, 0.52, 0.54), roughness=0.2, metallic=0.94)
    steel_edge = make_material("bright cutting edge", (0.72, 0.76, 0.77), roughness=0.12, metallic=1.0)

    # Horn scales sandwich a thin dark backspring. The grip is centered on the
    # origin and slightly waisted, with brass bolsters and three visible pins.
    beveled_box("horn handle", (0.044, 0.018, 0.13), (0, 0, -0.002), material=horn, bevel=0.009)
    beveled_box("back spring", (0.028, 0.0205, 0.108), (0, 0, -0.005), material=horn_highlight, bevel=0.003)
    beveled_box("lower bolster", (0.047, 0.021, 0.026), (0, 0, -0.061), material=brass, bevel=0.005)
    beveled_box("hinge bolster", (0.047, 0.021, 0.029), (0, 0, 0.058), material=brass, bevel=0.005)
    # Pins cross the handle thickness and remain readable in the close third-
    # person camera without adding a texture atlas for such a small prop.
    for index, pin_z in enumerate((-0.032, 0.008, 0.055)):
        pin = cylinder(0.004 if index == 2 else 0.0028, 0.023, (0, 0, pin_z),
                       rotation=(math.radians(90), 0, 0), material=brass)
        pin.name = "hinge pin" if index == 2 else f"scale pin {index + 1}"

    # A tapered clip-point blade, made as a shallow extruded profile rather
    # than a rectangular primitive. The last two faces form a brighter bevel.
    profile = [
        (-0.018, 0.061),
        (-0.020, 0.176),
        (-0.012, 0.222),
        (0.000, 0.247),
        (0.017, 0.196),
        (0.022, 0.075),
    ]
    half_thickness = 0.0027
    vertices = [(x, -half_thickness, z) for x, z in profile]
    vertices += [(x, half_thickness, z) for x, z in profile]
    count = len(profile)
    faces = [
        tuple(reversed(range(count))),
        tuple(range(count, count * 2)),
    ]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, next_index + count, index + count))
    mesh = bpy.data.meshes.new("clip-point blade mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    blade = bpy.data.objects.new("open clip-point blade", mesh)
    bpy.context.collection.objects.link(blade)
    blade.data.materials.append(steel)
    blade.data.materials.append(steel_edge)
    # Assign the forward cutting-side faces to the bright bevel material.
    for polygon in blade.data.polygons:
        if polygon.index in (5, 6):
            polygon.material_index = 1
    bevel_modifier = blade.modifiers.new(name="honed blade edges", type="BEVEL")
    bevel_modifier.width = 0.0014
    bevel_modifier.segments = 2
    bpy.context.view_layer.objects.active = blade
    bpy.ops.object.modifier_apply(modifier=bevel_modifier.name)

    # The exposed tang and nail nick make the object read as a folding knife,
    # even when most of its silhouette is only a few dozen screen pixels.
    cylinder(0.008, 0.0066, (0, 0, 0.059), rotation=(math.radians(90), 0, 0), material=steel)
    nick = beveled_box(
        "blade nail nick",
        (0.012, 0.001, 0.0022),
        (-0.006, -0.0032, 0.178),
        rotation=(0, math.radians(-8), 0),
        material=horn_highlight,
        bevel=0.0007,
    )
    nick.name = "blade nail nick"
    export("pocket-knife")


BUILDERS = {
    "shotgun": build_shotgun,
    "net": build_net,
    "snare": build_snare,
    "hammer": build_hammer,
    "pocket-knife": build_pocket_knife,
}


def main():
    # Blender passes script args after "--"; with none, build everything.
    import sys
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    targets = args or list(BUILDERS)
    for name in targets:
        BUILDERS[name]()
    print("TOOL_PLACEHOLDERS_DONE")


if __name__ == "__main__":
    main()
