"""Build Darwin's percussion double-barreled fowling piece (shotgun.glb).

Replaces the blocky primitive placeholder with a proper 1830s side-by-side:
tapered browned-steel barrels with a top rib, percussion locks with hammers,
a curved walnut wrist and cheeked butt with a brass butt plate, fore-end with
a brass wedge, trigger guard, and ramrod.

Convention (matches blender_build_tool_placeholders.py so the existing hand
attachment offsets keep working):
  - "forward" (glTF -Z) is built along Blender +Y
  - "up"      (glTF +Y) is built along Blender +Z
  - the grip/wrist sits at the world origin so the hand holds it there

Usage:
  Blender -b -P scripts/blender_build_shotgun.py
"""
import math
import os
import bpy

OUT_DIR = os.path.join(os.getcwd(), "public", "assets", "models", "tools")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def make_material(name, color, roughness=0.7, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def _finish(obj, material, bevel=None, smooth=False):
    if material:
        obj.data.materials.append(material)
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    if smooth:
        bpy.ops.object.shade_smooth()
    return obj


def cylinder(radius, depth, location, rotation=(0, 0, 0), material=None, vertices=20, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=location,
                                        rotation=rotation, vertices=vertices)
    return _finish(bpy.context.active_object, material, smooth=smooth)


def taper(radius1, radius2, depth, location, rotation=(0, 0, 0), material=None, vertices=20, smooth=True):
    bpy.ops.mesh.primitive_cone_add(radius1=radius1, radius2=radius2, depth=depth,
                                    location=location, rotation=rotation, vertices=vertices)
    return _finish(bpy.context.active_object, material, smooth=smooth)


def box(size, location, rotation=(0, 0, 0), material=None, bevel=0.005):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.scale = (size[0], size[1], size[2])
    return _finish(obj, material, bevel=bevel)


def torus(major, minor, location, rotation=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=location,
                                     rotation=rotation, major_segments=22, minor_segments=8)
    return _finish(bpy.context.active_object, material, smooth=True)


LAY_FORWARD = (math.radians(90), 0, 0)  # lay a Z-cylinder down along +Y


def build_shotgun():
    clear_scene()
    walnut = make_material("gunWalnut", (0.24, 0.135, 0.07), roughness=0.52)
    walnut_dark = make_material("gunWalnutDark", (0.185, 0.10, 0.052), roughness=0.55)
    steel = make_material("gunSteel", (0.115, 0.115, 0.13), roughness=0.38, metallic=0.88)
    brass = make_material("gunBrass", (0.52, 0.40, 0.17), roughness=0.34, metallic=1.0)

    barrel_z = 0.036
    barrel_dx = 0.0165
    # Tapered side-by-side barrels, breech y=0.055 to muzzle y=0.945.
    for side in (-1, 1):
        taper(0.0115, 0.0155, 0.89, location=(side * barrel_dx, 0.5, barrel_z),
              rotation=(math.radians(-90), 0, 0), material=steel)
        # Muzzle band.
        cylinder(0.0135, 0.012, location=(side * barrel_dx, 0.939, barrel_z),
                 rotation=LAY_FORWARD, material=steel)
    # Sighting rib between the barrels + tiny bead foresight.
    box((0.010, 0.86, 0.008), location=(0, 0.49, barrel_z + 0.014), material=steel, bevel=0.002)
    cylinder(0.0035, 0.006, location=(0, 0.925, barrel_z + 0.021), material=brass, vertices=10)

    # Breech block and standing tang.
    box((0.052, 0.10, 0.052), location=(0, 0.015, barrel_z - 0.004), material=steel, bevel=0.007)
    box((0.020, 0.05, 0.014), location=(0, -0.05, barrel_z + 0.014),
        rotation=(math.radians(-14), 0, 0), material=steel, bevel=0.003)

    # Percussion lock plates, nipples, and cocked hammers.
    for side in (-1, 1):
        box((0.010, 0.075, 0.034), location=(side * 0.030, -0.012, barrel_z - 0.012),
            rotation=(0, math.radians(side * 4), 0), material=steel, bevel=0.003)
        cylinder(0.005, 0.012, location=(side * 0.026, 0.012, barrel_z + 0.020),
                 rotation=(0, math.radians(side * 28), 0), material=steel, vertices=10)
        # Hammer: spur arcing up-back over the nipple.
        box((0.008, 0.012, 0.036), location=(side * 0.030, -0.026, barrel_z + 0.016),
            rotation=(math.radians(18), 0, 0), material=steel, bevel=0.002)
        box((0.008, 0.026, 0.010), location=(side * 0.030, -0.014, barrel_z + 0.036),
            rotation=(math.radians(-38), 0, 0), material=steel, bevel=0.002)

    # Wrist: curved grip sweeping back and down from the breech to the comb.
    box((0.040, 0.105, 0.046), location=(0, -0.075, barrel_z - 0.035),
        rotation=(math.radians(-22), 0, 0), material=walnut, bevel=0.010)
    # Butt stock in two beveled masses: body + comb, then a brass butt plate.
    box((0.046, 0.165, 0.082), location=(0, -0.20, barrel_z - 0.072),
        rotation=(math.radians(-13), 0, 0), material=walnut, bevel=0.013)
    box((0.036, 0.13, 0.030), location=(0, -0.185, barrel_z - 0.026),
        rotation=(math.radians(-17), 0, 0), material=walnut_dark, bevel=0.009)
    box((0.048, 0.014, 0.098), location=(0, -0.288, barrel_z - 0.090),
        rotation=(math.radians(-9), 0, 0), material=brass, bevel=0.005)

    # Trigger guard bow + twin triggers.
    torus(0.026, 0.0042, location=(0, -0.028, barrel_z - 0.062),
          rotation=(0, math.radians(90), 0), material=brass)
    for offset in (-0.006, 0.006):
        box((0.004, 0.006, 0.020), location=(0, -0.022 + offset, barrel_z - 0.048),
            rotation=(math.radians(12), 0, 0), material=steel, bevel=0.001)

    # Fore-end: walnut strip under the barrels with a brass wedge pin.
    box((0.042, 0.34, 0.026), location=(0, 0.24, barrel_z - 0.026), material=walnut, bevel=0.009)
    taper(0.014, 0.020, 0.05, location=(0, 0.435, barrel_z - 0.020),
          rotation=(math.radians(-90), 0, 0), material=walnut)
    cylinder(0.004, 0.048, location=(0, 0.30, barrel_z - 0.028),
             rotation=(0, math.radians(90), 0), material=brass, vertices=10)

    # Ramrod seated in its pipes under the fore-end.
    cylinder(0.0038, 0.62, location=(0, 0.42, barrel_z - 0.043), rotation=LAY_FORWARD,
             material=brass, vertices=10)
    for pipe_y in (0.22, 0.48):
        cylinder(0.0062, 0.018, location=(0, pipe_y, barrel_z - 0.043), rotation=LAY_FORWARD,
                 material=brass, vertices=12)

    export("shotgun")


def export(name):
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT_DIR, name + ".glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
    )
    print("SHOTGUN_GLB_DONE")


if __name__ == "__main__":
    build_shotgun()
