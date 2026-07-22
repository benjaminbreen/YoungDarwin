#!/usr/bin/env python3
"""Author and review the Darwin5 eyelid blink morph without touching animations.

The script deliberately separates inspection/review from export. Initial usage:

  Blender --background --factory-startup --disable-autoexec \
    --python scripts/blender_author_darwin5_blink.py -- \
    --input assets-src/darwin/runtime/darwin5-full.glb \
    --review-dir test-results/animation-sheets/darwin5-blink-review \
    --inspect-only

The author/export mode is enabled only after the eyelid vertex selection has
been reviewed and encoded below.
"""

import argparse
import json
import math
import os
import struct
import sys

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


HEAD_BONE = "mixamorig:Head"
EYE_CENTERS_X = (-0.0232, 0.0444)
EYE_CENTER_Y = 1.810
EYE_HALF_WIDTH = 0.035
EYE_HALF_HEIGHT = 0.016
EYE_MIN_FRONT_Z = 0.075

# The generated source mesh does not name its clothing parts, but the eight
# double-breasted coat buttons form stable clusters of loose mesh islands. The
# waistcoat buttons are partly welded into nearby generated topology, so their
# visible front caps use a deliberately tight local-space surface mask.
COAT_BUTTON_X_BANDS = ((-0.158, -0.112), (0.135, 0.178))
COAT_BUTTON_Y_RANGE = (1.19, 1.46)
VEST_BUTTON_SPECS = (
    {"center": (-0.0174, 1.4201), "radius": (0.019, 0.018), "min_z": 0.121},
    {"center": (0.0605, 1.3441), "radius": (0.014, 0.016), "min_z": 0.115},
    {"center": (0.0530, 1.2835), "radius": (0.019, 0.018), "min_z": 0.116},
)

# Three genuinely separate foreground locks in the generated Darwin5 hair.
# They are extracted without changing their geometry or skin weights, then get
# visible but bounded morph targets so runtime motion stays cheap and
# reversible at normal third-person camera distance.
HAIR_LOCK_SPECS = (
    {
        "root": 103891,
        "name": "Darwin5_HairLock_Left",
        "sourceCenter": (-0.0456, 1.9091, 0.0867),
        "sway": 0.0140,
        "lift": 0.0110,
        "phase": 0.35,
    },
    {
        "root": 103159,
        "name": "Darwin5_HairLock_Center",
        "sourceCenter": (0.0006, 1.9176, 0.0895),
        "sway": 0.0130,
        "lift": 0.0100,
        "phase": 2.25,
    },
    {
        "root": 102563,
        "name": "Darwin5_HairLock_Right",
        "sourceCenter": (0.0435, 1.9100, 0.0901),
        "sway": 0.0135,
        "lift": 0.0105,
        "phase": 4.15,
    },
)

# A recessed segment of an ellipsoidal forehead beneath the animated locks.
# The generated source head is open behind these loose islands, so moving them
# can otherwise expose the sky. Keep this closure strictly in the front
# hairline band: a full scalp cap can show as a bald spot from overhead.
FOREHEAD_UNDERLAY_CENTER = (0.008, 1.800, -0.027)
FOREHEAD_UNDERLAY_RADII = (0.094, 0.168, 0.105)
FOREHEAD_UNDERLAY_MIN_Y = 1.850
FOREHEAD_UNDERLAY_MAX_Y = 1.940
FOREHEAD_UNDERLAY_HALF_ANGLE = math.radians(102.0)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--review-dir", required=True)
    parser.add_argument("--inspect-only", action="store_true")
    parser.add_argument("--skip-render", action="store_true")
    parser.add_argument("--preview-selection", action="store_true")
    parser.add_argument("--preview-blink", action="store_true")
    parser.add_argument("--preview-overlay", action="store_true")
    parser.add_argument("--preview-overlay-blink", action="store_true")
    parser.add_argument("--preview-guides", action="store_true")
    parser.add_argument("--preview-material-regions", action="store_true")
    parser.add_argument("--preview-button-candidates", action="store_true")
    parser.add_argument("--preview-brass-buttons", action="store_true")
    parser.add_argument("--preview-hair-roots", default="")
    parser.add_argument(
        "--preview-hair-motion",
        choices=("positive", "negative", "lift", "drop"),
    )
    parser.add_argument("--inspect-material-components", action="store_true")
    parser.add_argument("--inspect-button-components", action="store_true")
    parser.add_argument("--inspect-hair-components", action="store_true")
    parser.add_argument("--author", action="store_true")
    parser.add_argument("--output-glb")
    parser.add_argument("--output-blend")
    parser.add_argument("--boot-reference", default="public/assets/models/darwin5.glb")
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(args)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def primary_mesh():
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("Darwin5 import produced no mesh objects.")
    return max(meshes, key=lambda obj: len(obj.data.vertices))


def primary_armature():
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"Expected one Darwin5 armature; found {len(armatures)}.")
    return armatures[0]


def assign_idle(armature):
    action = bpy.data.actions.get("idle")
    if action is None:
        raise RuntimeError("Darwin5 source is missing its idle action.")
    armature.animation_data_create()
    armature.animation_data.action = action
    bpy.context.scene.frame_set(round(action.frame_range[0]))


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def head_target(armature):
    bone = armature.pose.bones.get(HEAD_BONE)
    if bone is None:
        raise RuntimeError(f'Darwin5 armature is missing bone "{HEAD_BONE}".')
    head = armature.matrix_world @ bone.head
    tail = armature.matrix_world @ bone.tail
    # The bone runs neck-to-crown. Aim just above its midpoint toward the eyes.
    return head.lerp(tail, 0.36) + Vector((0.0, -0.015, 0.0))


def stabilize_materials(mesh):
    # Match the runtime's non-metallic character treatment. The source glTF
    # omits metallicFactor, whose specification default is 1.0; leaving that
    # untouched turns skin and hair into reflective gold in Blender reviews.
    for material in mesh.data.materials:
        if material is None:
            continue
        material.metallic = 0.02
        material.roughness = max(material.roughness, 0.72)


def eye_region_weight(coordinate):
    if coordinate.z < EYE_MIN_FRONT_Z:
        return 0.0
    best = 0.0
    for center_x in EYE_CENTERS_X:
        dx = (coordinate.x - center_x) / EYE_HALF_WIDTH
        dy = (coordinate.y - EYE_CENTER_Y) / EYE_HALF_HEIGHT
        radius = math.sqrt(dx * dx + dy * dy)
        if radius >= 1.0:
            continue
        # Full influence through most of the aperture with a feathered rim.
        best = max(best, min(1.0, (1.0 - radius) / 0.28))
    return best


def apply_selection_preview(mesh):
    preview = bpy.data.materials.new("Blink selection preview")
    preview.diffuse_color = (1.0, 0.015, 0.005, 1.0)
    preview.metallic = 0.0
    preview.roughness = 0.5
    preview.use_nodes = True
    principled = preview.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = (1.0, 0.005, 0.002, 1.0)
        principled.inputs["Emission Color"].default_value = (0.4, 0.0, 0.0, 1.0)
        principled.inputs["Emission Strength"].default_value = 0.35
    mesh.data.materials.append(preview)
    preview_index = len(mesh.data.materials) - 1
    selected_polygons = 0
    selected_vertices = set()
    for polygon in mesh.data.polygons:
        weights = [eye_region_weight(mesh.data.vertices[index].co) for index in polygon.vertices]
        if max(weights, default=0.0) < 0.08:
            continue
        polygon.material_index = preview_index
        selected_polygons += 1
        selected_vertices.update(index for index, weight in zip(polygon.vertices, weights) if weight > 0)
    return {"vertices": len(selected_vertices), "polygons": selected_polygons}


def author_blink_shape(mesh):
    if mesh.data.shape_keys:
        raise RuntimeError("Darwin5 unexpectedly already has shape keys; refusing to overwrite them.")
    basis = mesh.shape_key_add(name="Basis", from_mix=False)
    blink = mesh.shape_key_add(name="Blink", from_mix=False)
    blink.relative_key = basis
    changed = 0
    maximum_delta = 0.0
    for vertex in mesh.data.vertices:
        source = basis.data[vertex.index].co
        weight = eye_region_weight(source)
        if weight <= 0.0:
            continue
        center_x = min(EYE_CENTERS_X, key=lambda value: abs(source.x - value))
        horizontal = min(1.0, abs(source.x - center_x) / EYE_HALF_WIDTH)
        # A subtly bowed closure line follows the eye aperture instead of
        # producing a ruler-straight mechanical slit.
        closure_y = EYE_CENTER_Y - 0.0012 - 0.0032 * (horizontal ** 1.7)
        destination = blink.data[vertex.index].co
        original_y = destination.y
        destination.y = original_y + (closure_y - original_y) * weight * 0.96
        # Bring the meeting lids slightly forward so the eye surface cannot
        # z-fight through the closed pose.
        destination.z += 0.0018 * weight * (1.0 - horizontal * 0.35)
        maximum_delta = max(maximum_delta, abs(destination.y - original_y))
        changed += 1
    blink.value = 1.0
    return {"vertices": changed, "maximumDelta": maximum_delta}


def vertex_components(mesh):
    """Return a component id per vertex for the imported loose-triangle mesh."""
    vertex_count = len(mesh.data.vertices)
    parent = list(range(vertex_count))
    sizes = [1] * vertex_count

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(a, b):
        root_a = find(a)
        root_b = find(b)
        if root_a == root_b:
            return
        if sizes[root_a] < sizes[root_b]:
            root_a, root_b = root_b, root_a
        parent[root_b] = root_a
        sizes[root_a] += sizes[root_b]

    for polygon in mesh.data.polygons:
        vertices = polygon.vertices
        for offset in range(1, len(vertices)):
            union(vertices[0], vertices[offset])

    roots = [find(index) for index in range(vertex_count)]
    component_sizes = {}
    for root in roots:
        component_sizes[root] = component_sizes.get(root, 0) + 1
    return roots, component_sizes


def source_uvs(mesh):
    active = mesh.data.uv_layers.active
    if active is None:
        raise RuntimeError("Darwin5 primary mesh has no active UV layer.")
    result = {}
    for polygon in mesh.data.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.data.loops[loop_index].vertex_index
            result.setdefault(vertex_index, active.data[loop_index].uv.copy())
    return result


def eye_face_components(mesh, roots, component_sizes):
    """Locate the two large face islands that surround the eye apertures."""
    candidates = {}
    for vertex in mesh.data.vertices:
        co = vertex.co
        root = roots[vertex.index]
        if component_sizes[root] < 350 or co.z < 0.035 or co.y < 1.69:
            continue
        for eye_index, center_x in enumerate(EYE_CENTERS_X):
            distance = abs(co.x - center_x) + abs(co.y - EYE_CENTER_Y) * 0.45
            current = candidates.get((eye_index, root))
            if current is None or distance < current:
                candidates[(eye_index, root)] = distance

    selected = []
    for eye_index in range(len(EYE_CENTERS_X)):
        options = [
            (distance, -component_sizes[root], root)
            for (candidate_eye, root), distance in candidates.items()
            if candidate_eye == eye_index
        ]
        if not options:
            raise RuntimeError(f"Could not locate face component for eye {eye_index}.")
        # Proximity is primary; size breaks ties between fragments.
        selected.append(min(options)[2])
    if len(set(selected)) != len(EYE_CENTERS_X):
        # Darwin's face is split left/right. Sharing a component here means the
        # selection escaped to a large neck/hair island and should be reviewed.
        raise RuntimeError(f"Expected distinct eye-face components; found {selected}.")
    return selected


def nearest_component_vertex(mesh, roots, component_root, x, y):
    best = None
    best_score = math.inf
    for vertex in mesh.data.vertices:
        if roots[vertex.index] != component_root or vertex.co.z < 0.055:
            continue
        dx = vertex.co.x - x
        dy = vertex.co.y - y
        score = dx * dx + dy * dy * 0.72
        if score < best_score:
            best = vertex
            best_score = score
    if best is None:
        raise RuntimeError("Could not sample Darwin5 face surface near an eye.")
    return best


def component_bounds(mesh, roots):
    result = {}
    for vertex in mesh.data.vertices:
        root = roots[vertex.index]
        item = result.setdefault(root, {
            "indices": [],
            "min": [math.inf, math.inf, math.inf],
            "max": [-math.inf, -math.inf, -math.inf],
        })
        item["indices"].append(vertex.index)
        for axis in range(3):
            item["min"][axis] = min(item["min"][axis], vertex.co[axis])
            item["max"][axis] = max(item["max"][axis], vertex.co[axis])
    return result


def eye_surface_components(mesh, roots):
    """Find the symmetric loose islands that carry each visible eyeball."""
    components = component_bounds(mesh, roots)
    selected = []
    for center_x in EYE_CENTERS_X:
        options = []
        for root, item in components.items():
            count = len(item["indices"])
            minimum = item["min"]
            maximum = item["max"]
            center = [(minimum[axis] + maximum[axis]) * 0.5 for axis in range(3)]
            width = maximum[0] - minimum[0]
            height = maximum[1] - minimum[1]
            if not (70 <= count <= 140 and 0.04 <= width <= 0.075 and 0.014 <= height <= 0.035):
                continue
            if maximum[2] < 0.115:
                continue
            score = abs(center[0] - center_x) * 5.0 + abs(center[1] - EYE_CENTER_Y) * 8.0
            options.append((score, root))
        if not options:
            raise RuntimeError(f"Could not locate eyeball surface near x={center_x}.")
        selected.append(min(options)[1])
    if len(set(selected)) != len(EYE_CENTERS_X):
        raise RuntimeError(f"Expected distinct eyeball components; found {selected}.")
    return selected, components


def sample_image_pixel(image, uv):
    width, height = image.size
    if width <= 0 or height <= 0:
        return None
    u = uv.x % 1.0
    v = uv.y % 1.0
    x = min(width - 1, max(0, round(u * (width - 1))))
    # Blender exposes image pixels bottom-up while glTF UV inspection here is
    # most usefully compared in the texture's top-down image orientation.
    y = min(height - 1, max(0, round((1.0 - v) * (height - 1))))
    offset = (y * width + x) * 4
    pixels = image.pixels
    return tuple(float(pixels[offset + channel]) for channel in range(3))


def image_pixel_buffer(image):
    """Read the atlas once instead of crossing Blender's pixel proxy per sample."""
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape((image.size[1], image.size[0], 4))


def sample_buffered_image_pixel(image, pixels, uv):
    width, height = image.size
    u = uv.x % 1.0
    v = uv.y % 1.0
    x = min(width - 1, max(0, round(u * (width - 1))))
    y = min(height - 1, max(0, round((1.0 - v) * (height - 1))))
    return tuple(float(value) for value in pixels[y, x, :3])


def median(values):
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) * 0.5


def material_component_candidates(mesh):
    roots, _ = vertex_components(mesh)
    components = component_bounds(mesh, roots)
    original_uvs = source_uvs(mesh)

    result = []
    for root, item in components.items():
        indices = item["indices"]
        minimum = item["min"]
        maximum = item["max"]
        if len(indices) < 20:
            continue
        group_weights = {}
        for index in indices:
            for membership in mesh.data.vertices[index].groups:
                name = mesh.vertex_groups[membership.group].name
                group_weights[name] = group_weights.get(name, 0.0) + membership.weight
        hand_weight = sum(
            weight for name, weight in group_weights.items()
            if any(token in name.lower() for token in ("hand", "thumb", "index", "middle", "ring", "pinky"))
        )
        head_candidate = (
            maximum[1] >= 1.67
            and maximum[0] >= -0.16
            and minimum[0] <= 0.16
        )
        if not head_candidate and hand_weight < len(indices) * 0.18:
            continue

        stride = max(1, len(indices) // 8)
        uv_samples = [
            list(original_uvs[index]) for index in indices[::stride]
            if index in original_uvs
        ][:9]
        top_groups = sorted(group_weights.items(), key=lambda item: -item[1])[:6]
        result.append({
            "root": root,
            "vertices": len(indices),
            "min": minimum,
            "max": maximum,
            "uvSamples": uv_samples,
            "handWeight": hand_weight,
            "topGroups": top_groups,
        })
    result.sort(key=lambda item: (-item["max"][1], -item["vertices"]))
    return result


def source_atlas_image(mesh):
    source_material = mesh.data.materials[0] if mesh.data.materials else None
    if source_material is None or not source_material.use_nodes:
        raise RuntimeError("Darwin5 primary mesh has no atlas material.")
    for node in source_material.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image is not None:
            return node.image
    raise RuntimeError("Darwin5 primary material has no atlas image node.")


def make_region_material(source_material, name, roughness, debug_color=None):
    material = source_material.copy()
    material.name = name
    material.metallic = 0.0
    material.roughness = roughness
    material.diffuse_color = (*debug_color, 1.0) if debug_color else (1.0, 1.0, 1.0, 1.0)
    principled = material.node_tree.nodes.get("Principled BSDF") if material.use_nodes else None
    if principled:
        principled.inputs["Metallic"].default_value = 0.0
        principled.inputs["Roughness"].default_value = roughness
        if debug_color:
            base_color = principled.inputs["Base Color"]
            for link in list(base_color.links):
                material.node_tree.links.remove(link)
            base_color.default_value = (*debug_color, 1.0)
            if "Emission Color" in principled.inputs:
                principled.inputs["Emission Color"].default_value = (*debug_color, 1.0)
                principled.inputs["Emission Strength"].default_value = 0.2
    return material


def component_material_kind(mesh, item, face_roots, eye_roots, original_uvs,
                            atlas_image, atlas_pixels):
    indices = item["indices"]
    root = item["root"]
    if root in eye_roots:
        return None, None

    group_weights = {}
    for index in indices:
        for membership in mesh.data.vertices[index].groups:
            name = mesh.vertex_groups[membership.group].name
            group_weights[name] = group_weights.get(name, 0.0) + membership.weight
    hand_weight = sum(
        weight for name, weight in group_weights.items()
        if any(token in name.lower() for token in (
            "hand", "thumb", "index", "middle", "ring", "pinky"
        ))
    )
    if hand_weight >= len(indices) * 0.18:
        return "skin", {"handWeightRatio": hand_weight / len(indices)}

    head_weight = group_weights.get(HEAD_BONE, 0.0)
    if head_weight < len(indices) * 0.18 or item["min"][1] < 1.665:
        return None, None
    if root in face_roots:
        return "skin", {"faceComponent": True}

    # The generated model uses one atlas, but its head is usefully split into
    # hundreds of loose semantic islands. A sparse median atlas sample is more
    # reliable than a positional cut: it keeps peach skin/ears/neck together
    # while assigning the darker, lower-blue hair, brows, and sideburns to hair.
    stride = max(1, len(indices) // 12)
    colors = []
    for index in indices[::stride][:13]:
        uv = original_uvs.get(index)
        if uv is not None:
            colors.append(sample_buffered_image_pixel(atlas_image, atlas_pixels, uv))
    if not colors:
        return None, None
    sampled = tuple(median([color[channel] for color in colors]) for channel in range(3))
    red = max(sampled[0], 1e-5)
    blue_ratio = sampled[2] / red
    green_ratio = sampled[1] / red
    maximum = item["max"]
    minimum = item["min"]
    visibly_head = maximum[1] >= 1.73
    front_face_geometry = (
        minimum[0] >= -0.082
        and maximum[0] <= 0.102
        and minimum[1] >= 1.67
        and maximum[1] <= 1.918
        and maximum[2] >= 0.075
    )
    outer_hair_geometry = (
        maximum[1] >= 1.92
        or (maximum[1] >= 1.73 and maximum[2] <= 0.045)
        or (
            maximum[1] >= 1.75
            and maximum[2] <= 0.105
            and (minimum[0] <= -0.075 or maximum[0] >= 0.085)
        )
    )
    hair_color = blue_ratio < 0.43 and green_ratio < 0.84
    skin_color = blue_ratio >= 0.43 and green_ratio >= 0.62
    ambiguous_ear_band = (
        (minimum[0] <= -0.075 or maximum[0] >= 0.085)
        and minimum[1] >= 1.70
        and maximum[1] <= 1.88
        and maximum[2] <= 0.075
    )
    detail = {
        "sampledColor": sampled,
        "blueRatio": blue_ratio,
        "greenRatio": green_ratio,
        "ambiguousEarBand": ambiguous_ear_band,
        "frontFaceGeometry": front_face_geometry,
        "outerHairGeometry": outer_hair_geometry,
    }
    if front_face_geometry:
        return "skin", detail
    if maximum[1] >= 1.92:
        return "hair", detail
    # The ears, sideburns, and rear hair overlap tightly in this generated
    # topology. Leave that narrow band on the original material instead of
    # creating visible patchwork from a speculative split.
    if ambiguous_ear_band:
        return None, detail
    if outer_hair_geometry:
        return ("hair", detail) if blue_ratio < 0.54 else (None, detail)
    if visibly_head and hair_color:
        return "hair", detail
    if skin_color and maximum[2] >= 0.025:
        return "skin", detail
    return None, detail


def assign_character_material_regions(mesh, debug=False):
    """Split skin and hair into atlas-sharing slots without changing geometry."""
    roots, component_sizes = vertex_components(mesh)
    components = component_bounds(mesh, roots)
    for root, item in components.items():
        item["root"] = root
    face_roots = set(eye_face_components(mesh, roots, component_sizes))
    eye_roots, _ = eye_surface_components(mesh, roots)
    eye_roots = set(eye_roots)
    original_uvs = source_uvs(mesh)
    atlas_image = source_atlas_image(mesh)
    atlas_pixels = image_pixel_buffer(atlas_image)
    source_material = mesh.data.materials[0]
    skin = make_region_material(
        source_material,
        "Darwin5 skin",
        0.62,
        debug_color=(0.02, 0.62, 1.0) if debug else None,
    )
    hair = make_region_material(
        source_material,
        "Darwin5 hair",
        0.68,
        debug_color=(1.0, 0.03, 0.32) if debug else None,
    )
    hair_principled = hair.node_tree.nodes.get("Principled BSDF") if hair.use_nodes else None
    if hair_principled and not debug:
        # Match Blender QA to the intended strand response. The runtime repeats
        # these values explicitly because glTF exporters may omit anisotropy.
        if "Anisotropic IOR Level" in hair_principled.inputs:
            # Keep this at zero: the matching Three.js physical-material path
            # washed out the post-processing framebuffer on target macOS/WebGL.
            hair_principled.inputs["Anisotropic IOR Level"].default_value = 0.0
        if "Anisotropic Rotation" in hair_principled.inputs:
            hair_principled.inputs["Anisotropic Rotation"].default_value = 0.0
    mesh.data.materials.append(skin)
    skin_index = len(mesh.data.materials) - 1
    mesh.data.materials.append(hair)
    hair_index = len(mesh.data.materials) - 1

    assignments = {}
    details = {}
    for root, item in components.items():
        kind, detail = component_material_kind(
            mesh,
            item,
            face_roots,
            eye_roots,
            original_uvs,
            atlas_image,
            atlas_pixels,
        )
        if kind:
            assignments[root] = kind
        if detail:
            details[root] = detail

    polygon_counts = {"skin": 0, "hair": 0, "original": 0}
    component_counts = {"skin": 0, "hair": 0}
    for kind in assignments.values():
        component_counts[kind] += 1
    for polygon in mesh.data.polygons:
        root = roots[polygon.vertices[0]]
        kind = assignments.get(root)
        if kind == "skin":
            polygon.material_index = skin_index
        elif kind == "hair":
            polygon.material_index = hair_index
        polygon_counts[kind or "original"] += 1

    return {
        "debug": debug,
        "materials": [skin.name, hair.name],
        "faceRoots": sorted(face_roots),
        "eyeRootsExcluded": sorted(eye_roots),
        "componentCounts": component_counts,
        "polygonCounts": polygon_counts,
        "assignedRoots": {
            kind: sorted(root for root, assigned in assignments.items() if assigned == kind)
            for kind in ("skin", "hair")
        },
        "sampleDetails": {
            str(root): details[root] for root in sorted(details)
            if root in assignments
        },
    }


def button_component_candidates(mesh):
    """Find small, raised torso islands likely to be authored clothing buttons."""
    roots, _ = vertex_components(mesh)
    components = component_bounds(mesh, roots)
    original_uvs = source_uvs(mesh)
    atlas_image = source_atlas_image(mesh)
    atlas_pixels = image_pixel_buffer(atlas_image)
    results = []
    torso_groups = {
        "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2"
    }
    for root, item in components.items():
        indices = item["indices"]
        minimum = item["min"]
        maximum = item["max"]
        extents = [maximum[axis] - minimum[axis] for axis in range(3)]
        center = [(minimum[axis] + maximum[axis]) * 0.5 for axis in range(3)]
        if not (12 <= len(indices) <= 260):
            continue
        if not (0.76 <= center[1] <= 1.48 and center[2] >= 0.065):
            continue
        if not (extents[0] <= 0.085 and extents[1] <= 0.085 and extents[2] <= 0.05):
            continue
        group_weights = {}
        for index in indices:
            for membership in mesh.data.vertices[index].groups:
                name = mesh.vertex_groups[membership.group].name
                group_weights[name] = group_weights.get(name, 0.0) + membership.weight
        torso_weight = sum(group_weights.get(name, 0.0) for name in torso_groups)
        if torso_weight < len(indices) * 0.2:
            continue
        stride = max(1, len(indices) // 8)
        colors = []
        for index in indices[::stride][:9]:
            uv = original_uvs.get(index)
            if uv is not None:
                colors.append(sample_buffered_image_pixel(atlas_image, atlas_pixels, uv))
        sampled = tuple(
            median([color[channel] for color in colors]) for channel in range(3)
        ) if colors else None
        results.append({
            "root": root,
            "vertices": len(indices),
            "min": minimum,
            "max": maximum,
            "center": center,
            "extents": extents,
            "sampledColor": sampled,
            "torsoWeightRatio": torso_weight / len(indices),
            "topGroups": sorted(group_weights.items(), key=lambda entry: -entry[1])[:5],
        })
    results.sort(key=lambda item: (-item["center"][1], item["center"][0]))
    return results


def selected_coat_button_roots(candidates):
    selected = set()
    for item in candidates:
        x, y, _ = item["center"]
        in_x_band = any(minimum <= x <= maximum for minimum, maximum in COAT_BUTTON_X_BANDS)
        if in_x_band and COAT_BUTTON_Y_RANGE[0] <= y <= COAT_BUTTON_Y_RANGE[1]:
            selected.add(item["root"])
    return selected


def selected_vest_button_roots(candidates):
    selected = set()
    for item in candidates:
        x, y, z = item["center"]
        for spec in VEST_BUTTON_SPECS:
            center_x, center_y = spec["center"]
            radius_x, radius_y = spec["radius"]
            dx = (x - center_x) / radius_x
            dy = (y - center_y) / radius_y
            if dx * dx + dy * dy <= 1.0 and z >= spec["min_z"]:
                selected.add(item["root"])
    return selected


def hair_component_candidates(mesh, hair_roots):
    roots, component_sizes = vertex_components(mesh)
    components = component_bounds(mesh, roots)
    results = []
    for root in hair_roots:
        item = components.get(root)
        if item is None:
            continue
        minimum = item["min"]
        maximum = item["max"]
        center = [(minimum[axis] + maximum[axis]) * 0.5 for axis in range(3)]
        extents = [maximum[axis] - minimum[axis] for axis in range(3)]
        # Keep the useful top/front silhouette band broad at inspection time;
        # selection is finalized only after isolated diagnostic renders.
        if maximum[1] < 1.84 or maximum[2] < 0.015:
            continue
        results.append({
            "root": root,
            "vertices": component_sizes.get(root, len(item["indices"])),
            "min": minimum,
            "max": maximum,
            "center": center,
            "extents": extents,
        })
    results.sort(key=lambda item: (-item["max"][1], -item["max"][2], item["center"][0]))
    return results


def apply_component_root_preview(mesh, selected_roots, name="Component root preview"):
    preview = bpy.data.materials.new(name)
    preview.diffuse_color = (1.0, 0.004, 0.012, 1.0)
    preview.metallic = 0.0
    preview.roughness = 0.28
    preview.use_nodes = True
    principled = preview.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = preview.diffuse_color
        principled.inputs["Emission Color"].default_value = preview.diffuse_color
        principled.inputs["Emission Strength"].default_value = 0.55
    mesh.data.materials.append(preview)
    material_index = len(mesh.data.materials) - 1
    roots, _ = vertex_components(mesh)
    polygons = 0
    for polygon in mesh.data.polygons:
        if roots[polygon.vertices[0]] not in selected_roots:
            continue
        polygon.material_index = material_index
        polygons += 1
    return {
        "roots": sorted(selected_roots),
        "components": len(selected_roots),
        "polygons": polygons,
    }


def object_local_bounds(obj):
    coordinates = [vertex.co for vertex in obj.data.vertices]
    minimum = [min(coordinate[axis] for coordinate in coordinates) for axis in range(3)]
    maximum = [max(coordinate[axis] for coordinate in coordinates) for axis in range(3)]
    center = [(minimum[axis] + maximum[axis]) * 0.5 for axis in range(3)]
    return minimum, maximum, center


def smoothstep_value(edge0, edge1, value):
    t = max(0.0, min(1.0, (value - edge0) / max(edge1 - edge0, 1e-6)))
    return t * t * (3.0 - 2.0 * t)


def extract_hair_lock_objects(mesh):
    roots, _ = vertex_components(mesh)
    selected_roots = {spec["root"] for spec in HAIR_LOCK_SPECS}
    selected_indices = {
        vertex.index for vertex in mesh.data.vertices
        if roots[vertex.index] in selected_roots
    }
    if not selected_indices:
        raise RuntimeError("Darwin5 hair-lock selection found no vertices.")

    before_separate = set(bpy.data.objects)
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="VERT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for vertex in mesh.data.vertices:
        vertex.select = vertex.index in selected_indices
    mesh.data.update()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    extracted = [
        obj for obj in bpy.data.objects
        if obj not in before_separate and obj.type == "MESH"
    ]
    if len(extracted) != 1:
        raise RuntimeError(f"Expected one combined extracted hair object; found {len(extracted)}.")

    combined = extracted[0]
    before_loose = set(bpy.data.objects)
    bpy.ops.object.select_all(action="DESELECT")
    combined.select_set(True)
    bpy.context.view_layer.objects.active = combined
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    locks = [combined] + [
        obj for obj in bpy.data.objects
        if obj not in before_loose and obj.type == "MESH"
    ]
    if len(locks) != len(HAIR_LOCK_SPECS):
        raise RuntimeError(f"Expected three extracted hair locks; found {len(locks)}.")

    remaining_specs = list(HAIR_LOCK_SPECS)
    matched = []
    for obj in locks:
        _, _, center = object_local_bounds(obj)
        spec = min(
            remaining_specs,
            key=lambda candidate: sum(
                (center[axis] - candidate["sourceCenter"][axis]) ** 2
                for axis in range(3)
            ),
        )
        remaining_specs.remove(spec)
        obj.name = spec["name"]
        obj.data.name = spec["name"] + "Mesh"
        obj["hairLock"] = True
        obj["hairLockPhase"] = spec["phase"]
        obj["hairLockSourceRoot"] = spec["root"]
        matched.append((obj, spec))
    return matched


def add_hair_lock_morphs(obj, spec, preview_pose=None):
    minimum, maximum, center = object_local_bounds(obj)
    basis = obj.shape_key_add(name="Basis", from_mix=False)
    positive = obj.shape_key_add(name="HairSwayPositive", from_mix=False)
    negative = obj.shape_key_add(name="HairSwayNegative", from_mix=False)
    lift = obj.shape_key_add(name="HairLift", from_mix=False)
    drop = obj.shape_key_add(name="HairDrop", from_mix=False)

    y_span = max(maximum[1] - minimum[1], 1e-5)
    z_span = max(maximum[2] - minimum[2], 1e-5)
    scores = []
    for base_point in basis.data:
        coordinate = base_point.co
        down = (maximum[1] - coordinate.y) / y_span
        forward = (coordinate.z - minimum[2]) / z_span
        scores.append(down * 0.64 + forward * 0.36)
    tip_threshold = max(0.62, max(scores) * 0.96)

    maximum_weight = 0.0
    weighted_vertices = 0
    for index, base_point in enumerate(basis.data):
        coordinate = base_point.co
        weight = smoothstep_value(0.30, tip_threshold, scores[index])
        weight = weight ** 1.45
        if weight > 0.05:
            weighted_vertices += 1
        maximum_weight = max(maximum_weight, weight)
        lateral = spec["sway"] * weight
        positive.data[index].co = coordinate + Vector((lateral, 0.0006 * weight, 0.0012 * weight))
        negative.data[index].co = coordinate + Vector((-lateral, 0.0003 * weight, -0.0005 * weight))
        lift.data[index].co = coordinate + Vector((0.0, spec["lift"] * weight, -spec["lift"] * 0.72 * weight))
        drop.data[index].co = coordinate + Vector((0.0, -spec["lift"] * 0.58 * weight, spec["lift"] * 0.48 * weight))

    for key in (positive, negative, lift, drop):
        key.slider_min = 0.0
        key.slider_max = 1.0
        key.value = 0.0
    preview_keys = {
        "positive": positive,
        "negative": negative,
        "lift": lift,
        "drop": drop,
    }
    if preview_pose:
        preview_keys[preview_pose].value = 1.0
    return {
        "object": obj.name,
        "sourceRoot": spec["root"],
        "vertices": len(obj.data.vertices),
        "polygons": len(obj.data.polygons),
        "bounds": {"min": minimum, "max": maximum, "center": center},
        "swayTipMeters": spec["sway"],
        "liftTipMeters": spec["lift"],
        "weightedVertices": weighted_vertices,
        "maximumWeight": maximum_weight,
        "phase": spec["phase"],
        "shapeKeys": [key.name for key in obj.data.shape_keys.key_blocks],
        "previewPose": preview_pose,
        "armatureModifiers": [
            modifier.object.name for modifier in obj.modifiers
            if modifier.type == "ARMATURE" and modifier.object is not None
        ],
    }


def author_hair_lock_motion(mesh, preview_pose=None):
    locks = extract_hair_lock_objects(mesh)
    reports = [
        add_hair_lock_morphs(obj, spec, preview_pose=preview_pose)
        for obj, spec in locks
    ]
    return [obj for obj, _ in locks], reports


def make_forehead_underlay_material(mesh):
    """Reuse a real forehead texel for the tiny scalp closure."""
    roots, component_sizes = vertex_components(mesh)
    face_roots = eye_face_components(mesh, roots, component_sizes)
    original_uvs = source_uvs(mesh)
    image = source_atlas_image(mesh)
    samples = []
    sample_xs = (-0.052, -0.034, -0.016, 0.002, 0.020, 0.038, 0.056)
    for x in sample_xs:
        face_root = face_roots[0] if x < 0.010 else face_roots[1]
        vertex = nearest_component_vertex(mesh, roots, face_root, x, 1.866)
        uv = original_uvs.get(vertex.index)
        color = sample_image_pixel(image, uv) if uv is not None else None
        if color is None:
            continue
        luminance = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722
        red = max(color[0], 1e-5)
        if 0.24 < luminance < 0.94 and color[2] / red >= 0.40:
            samples.append((color, uv.copy(), luminance))
    if samples:
        # A lighter real forehead texel blends better than the median here:
        # dark candidates along this generated mesh's hairline include brow and
        # sideburn atlas pixels even though their geometry belongs to the face.
        sampled, sampled_uv, _ = max(samples, key=lambda item: item[2])
    else:
        sampled = (0.56, 0.34, 0.23)
        sampled_uv = Vector((0.5, 0.5))

    source_material = mesh.data.materials[0] if mesh.data.materials else None
    if source_material is None:
        raise RuntimeError("Darwin5 primary mesh has no source material for forehead closure.")
    material = source_material.copy()
    material.name = "Darwin5 forehead underlay"
    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    material.metallic = 0.0
    material.roughness = 0.62
    principled = material.node_tree.nodes.get("Principled BSDF") if material.use_nodes else None
    if principled:
        principled.inputs["Metallic"].default_value = 0.0
        principled.inputs["Roughness"].default_value = 0.62
    return material, sampled, sampled_uv


def add_forehead_underlay(mesh, armature):
    """Close the open forehead behind the three moving foreground locks."""
    segments = 19
    rings = 7
    center_x, center_y, center_z = FOREHEAD_UNDERLAY_CENTER
    radius_x, radius_y, radius_z = FOREHEAD_UNDERLAY_RADII
    minimum_v = (FOREHEAD_UNDERLAY_MIN_Y - center_y) / radius_y
    maximum_v = (FOREHEAD_UNDERLAY_MAX_Y - center_y) / radius_y
    coordinates = []
    for ring in range(rings):
        v = minimum_v + (maximum_v - minimum_v) * ring / (rings - 1)
        cross_section = math.sqrt(max(0.0, 1.0 - v * v))
        for segment in range(segments):
            theta = (
                -FOREHEAD_UNDERLAY_HALF_ANGLE
                + FOREHEAD_UNDERLAY_HALF_ANGLE * 2.0 * segment / (segments - 1)
            )
            coordinates.append((
                center_x + radius_x * cross_section * math.sin(theta),
                center_y + radius_y * v,
                center_z + radius_z * cross_section * math.cos(theta),
            ))
    faces = []
    for ring in range(rings - 1):
        for segment in range(segments - 1):
            next_segment = segment + 1
            lower = ring * segments + segment
            lower_next = ring * segments + next_segment
            upper = (ring + 1) * segments + segment
            upper_next = (ring + 1) * segments + next_segment
            faces.append((lower, lower_next, upper_next, upper))

    data = bpy.data.meshes.new("Darwin5_ForeheadUnderlayMesh")
    data.from_pydata(coordinates, [], faces)
    data.update()
    for polygon in data.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new("Darwin5_ForeheadUnderlay", data)
    bpy.context.collection.objects.link(obj)
    material, sampled_skin, sampled_uv = make_forehead_underlay_material(mesh)
    data.materials.append(material)
    uv_layer = data.uv_layers.new(name="UVMap")
    for polygon in data.polygons:
        for loop_index in polygon.loop_indices:
            uv_layer.data[loop_index].uv = sampled_uv
    head_group = obj.vertex_groups.new(name=HEAD_BONE)
    head_group.add(list(range(len(coordinates))), 1.0, "REPLACE")
    obj["foreheadUnderlay"] = True
    finish_skinned_object(obj, mesh, armature)
    return obj, {
        "object": obj.name,
        "vertices": len(coordinates),
        "polygons": len(faces),
        "sampledSkin": sampled_skin,
        "sampledSkinUv": list(sampled_uv),
        "center": list(FOREHEAD_UNDERLAY_CENTER),
        "radii": list(FOREHEAD_UNDERLAY_RADII),
        "minimumY": FOREHEAD_UNDERLAY_MIN_Y,
        "maximumY": FOREHEAD_UNDERLAY_MAX_Y,
        "halfAngleDegrees": math.degrees(FOREHEAD_UNDERLAY_HALF_ANGLE),
        "headBone": HEAD_BONE,
    }


def make_brass_button_material(source_material, debug=False):
    material = source_material.copy()
    material.name = "Darwin5 brass buttons"
    color = (1.0, 0.004, 0.012, 1.0) if debug else (0.62, 0.29, 0.045, 1.0)
    material.diffuse_color = color
    material.metallic = 0.0 if debug else 0.98
    material.roughness = 0.28 if debug else 0.10
    principled = material.node_tree.nodes.get("Principled BSDF") if material.use_nodes else None
    if principled:
        base_color = principled.inputs["Base Color"]
        for link in list(base_color.links):
            material.node_tree.links.remove(link)
        base_color.default_value = color
        principled.inputs["Metallic"].default_value = 0.0 if debug else 0.98
        principled.inputs["Roughness"].default_value = 0.28 if debug else 0.10
        if debug:
            principled.inputs["Emission Color"].default_value = color
            principled.inputs["Emission Strength"].default_value = 0.5
        if "Coat Weight" in principled.inputs:
            principled.inputs["Coat Weight"].default_value = 0.18
        if "Coat Roughness" in principled.inputs:
            principled.inputs["Coat Roughness"].default_value = 0.06
    return material


def assign_brass_button_material(mesh, candidates=None, debug=False):
    candidates = candidates or button_component_candidates(mesh)
    coat_roots = selected_coat_button_roots(candidates)
    vest_roots = selected_vest_button_roots(candidates)
    material = make_brass_button_material(mesh.data.materials[0], debug=debug)
    mesh.data.materials.append(material)
    material_index = len(mesh.data.materials) - 1
    roots, _ = vertex_components(mesh)
    polygon_counts = {"coat": 0, "waistcoat": 0}
    for polygon in mesh.data.polygons:
        root = roots[polygon.vertices[0]]
        if root in coat_roots:
            polygon.material_index = material_index
            polygon_counts["coat"] += 1
        elif root in vest_roots:
            polygon.material_index = material_index
            polygon_counts["waistcoat"] += 1
    return {
        "debug": debug,
        "material": material.name,
        "coatComponents": len(coat_roots),
        "coatRoots": sorted(coat_roots),
        "waistcoatComponents": len(vest_roots),
        "waistcoatRoots": sorted(vest_roots),
        "polygonCounts": polygon_counts,
        "totalPolygons": sum(polygon_counts.values()),
    }


def make_eyelid_material(mesh, roots, face_roots, original_uvs):
    image = None
    source_material = mesh.data.materials[0] if mesh.data.materials else None
    if source_material and source_material.use_nodes:
        for node in source_material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image is not None:
                image = node.image
                break

    samples = []
    if image is not None:
        for eye_index, center_x in enumerate(EYE_CENTERS_X):
            face_root = face_roots[eye_index]
            for offset in (-0.022, -0.011, 0.0, 0.011, 0.022):
                vertex = nearest_component_vertex(
                    mesh, roots, face_root, center_x + offset, EYE_CENTER_Y - 0.025
                )
                uv = original_uvs.get(vertex.index)
                color = sample_image_pixel(image, uv) if uv is not None else None
                if color is None:
                    continue
                luminance = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722
                if 0.12 < luminance < 0.95:
                    samples.append((color, uv.copy()))

    sampled = tuple(median([color[channel] for color, _ in samples]) for channel in range(3)) \
        if samples else (0.56, 0.34, 0.23)
    if samples:
        _, sampled_uv = min(
            samples,
            key=lambda item: sum((item[0][channel] - sampled[channel]) ** 2 for channel in range(3)),
        )
    else:
        sampled_uv = Vector((0.5, 0.5))
    if source_material is None:
        raise RuntimeError("Darwin5 primary mesh has no source material for the eyelids.")
    # Reuse the real character atlas instead of a flat sampled swatch. Generated
    # eyelid vertices receive UVs from the nearest face-component vertices below,
    # so skin variation and the runtime sidecar maps continue across the closure.
    material = source_material.copy()
    material.name = "Darwin5 eyelid skin"
    lid_color = (*sampled, 1.0)
    material.diffuse_color = lid_color
    material.metallic = 0.02
    material.roughness = 0.74
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled:
        if not principled.inputs["Base Color"].is_linked:
            principled.inputs["Base Color"].default_value = lid_color
        principled.inputs["Metallic"].default_value = 0.02
        principled.inputs["Roughness"].default_value = 0.74
    return material, lid_color[:3], sampled_uv


def copy_skin_weights(source, destination, source_indices):
    groups = {}
    for target_index, source_index in enumerate(source_indices):
        vertex = source.data.vertices[source_index]
        for membership in vertex.groups:
            source_group = source.vertex_groups[membership.group]
            target_group = groups.get(source_group.name)
            if target_group is None:
                target_group = destination.vertex_groups.new(name=source_group.name)
                groups[source_group.name] = target_group
            target_group.add([target_index], membership.weight, "REPLACE")


def finish_skinned_object(obj, source_mesh, armature, no_tint=False,
                          no_material_upgrade=False, eye_gloss=False):
    obj.parent = source_mesh.parent
    obj.matrix_world = source_mesh.matrix_world.copy()
    if no_tint:
        obj["noTint"] = True
    if no_material_upgrade:
        obj["noPlayerMaterialUpgrade"] = True
    if eye_gloss:
        obj["eyeGloss"] = True
    modifier = obj.modifiers.new(name="Armature", type="ARMATURE")
    modifier.object = armature


def finish_morph_object(obj, source_mesh, armature, blink_coordinates, closed,
                        no_tint=False, no_material_upgrade=False):
    finish_skinned_object(
        obj,
        source_mesh,
        armature,
        no_tint=no_tint,
        no_material_upgrade=no_material_upgrade,
    )
    basis = obj.shape_key_add(name="Basis", from_mix=False)
    blink = obj.shape_key_add(name="Blink", from_mix=False)
    blink.relative_key = basis
    for index, coordinate in enumerate(blink_coordinates):
        blink.data[index].co = coordinate
    blink.value = 1.0 if closed else 0.0


def add_eye_gloss_overlays(mesh, armature, roots, original_uvs):
    """Duplicate only the two eye islands for restrained, reversible gloss.

    The original eye geometry and atlas remain untouched. Each fitted copy sits
    just forward of its source and carries an `eyeGloss` runtime marker so the
    renderer can keep eye roughness below the character-wide cloth/skin floor.
    """
    eye_roots, components = eye_surface_components(mesh, roots)
    source_material = mesh.data.materials[0] if mesh.data.materials else None
    if source_material is None:
        raise RuntimeError("Darwin5 primary mesh has no source material for eye gloss.")
    material = source_material.copy()
    material.name = "Darwin5 eye gloss"
    material.metallic = 0.0
    material.roughness = 0.28
    principled = material.node_tree.nodes.get("Principled BSDF") if material.use_nodes else None
    if principled:
        principled.inputs["Metallic"].default_value = 0.0
        principled.inputs["Roughness"].default_value = 0.28
        if "Coat Weight" in principled.inputs:
            principled.inputs["Coat Weight"].default_value = 0.22
        if "Coat Roughness" in principled.inputs:
            principled.inputs["Coat Roughness"].default_value = 0.14

    created = []
    reports = []
    for eye_index, root in enumerate(eye_roots):
        source_indices = sorted(components[root]["indices"])
        remap = {source_index: target_index for target_index, source_index in enumerate(source_indices)}
        coordinates = [
            mesh.data.vertices[source_index].co + Vector((0.0, 0.0, 0.00045))
            for source_index in source_indices
        ]
        faces = []
        for polygon in mesh.data.polygons:
            if not all(roots[index] == root for index in polygon.vertices):
                continue
            faces.append(tuple(remap[index] for index in polygon.vertices))
        if not faces:
            raise RuntimeError(f"Eye gloss component {root} has no polygons.")

        eye_mesh = bpy.data.meshes.new(f"Darwin5_EyeGloss_{eye_index + 1}")
        eye_mesh.from_pydata(coordinates, [], faces)
        eye_mesh.update()
        for polygon in eye_mesh.polygons:
            polygon.use_smooth = True
        eye = bpy.data.objects.new(f"Darwin5_EyeGloss_{eye_index + 1}", eye_mesh)
        bpy.context.collection.objects.link(eye)
        eye_mesh.materials.append(material)
        uv_layer = eye_mesh.uv_layers.new(name="UVMap")
        for polygon in eye_mesh.polygons:
            for loop_index in polygon.loop_indices:
                target_index = eye_mesh.loops[loop_index].vertex_index
                uv_layer.data[loop_index].uv = original_uvs[source_indices[target_index]]
        copy_skin_weights(mesh, eye, source_indices)
        finish_skinned_object(eye, mesh, armature, no_tint=True, eye_gloss=True)
        created.append(eye)
        reports.append({
            "object": eye.name,
            "sourceRoot": root,
            "vertices": len(source_indices),
            "polygons": len(faces),
            "depthOffset": 0.00045,
            "roughness": 0.28,
            "coatWeight": 0.22,
        })
    return created, reports


def add_eye_coordinate_guides(mesh, armature):
    colors = [
        (1.0, 0.01, 0.01, 1.0),
        (1.0, 0.28, 0.01, 1.0),
        (1.0, 0.95, 0.01, 1.0),
        (0.03, 1.0, 0.08, 1.0),
        (0.02, 0.75, 1.0, 1.0),
        (0.3, 0.08, 1.0, 1.0),
    ]
    heights = [1.795, 1.800, 1.805, 1.810, 1.815, 1.820]
    for index, (height, color) in enumerate(zip(heights, colors)):
        data = bpy.data.meshes.new(f"EyeGuide_{height:.3f}")
        data.from_pydata(
            [(-0.062, height - 0.00045, 0.145), (0.083, height - 0.00045, 0.145),
             (0.083, height + 0.00045, 0.145), (-0.062, height + 0.00045, 0.145)],
            [],
            [(0, 1, 2, 3)],
        )
        obj = bpy.data.objects.new(f"EyeGuide_{height:.3f}", data)
        bpy.context.collection.objects.link(obj)
        material = bpy.data.materials.new(f"EyeGuideMaterial_{index}")
        material.diffuse_color = color
        material.use_nodes = True
        principled = material.node_tree.nodes.get("Principled BSDF")
        if principled:
            principled.inputs["Base Color"].default_value = color
            principled.inputs["Emission Color"].default_value = color
            principled.inputs["Emission Strength"].default_value = 1.0
        data.materials.append(material)
        group = obj.vertex_groups.new(name=HEAD_BONE)
        group.add([0, 1, 2, 3], 1.0, "REPLACE")
        obj.parent = mesh.parent
        obj.matrix_world = mesh.matrix_world.copy()
        modifier = obj.modifiers.new(name="Armature", type="ARMATURE")
        modifier.object = armature


def add_eyelid_overlay(mesh, armature, closed):
    """Build fitted, reversible eyelid shells with a real Blink morph target.

    Darwin5's generated face has no usable eyelid loops. Each eye is already a
    separate loose surface, however, so the safest repair is to duplicate that
    exact aperture as a skin-toned lid. The Basis lives behind the eyeball; the
    Blink target moves it just in front. A tiny independently morphed crease
    supplies the closed-eye line. The original face and eye vertices stay intact.
    """
    roots, component_sizes = vertex_components(mesh)
    face_roots = eye_face_components(mesh, roots, component_sizes)
    original_uvs = source_uvs(mesh)
    skin_material, sampled_skin, sampled_skin_uv = make_eyelid_material(
        mesh, roots, face_roots, original_uvs
    )
    surface = BVHTree.FromPolygons(
        [vertex.co.copy() for vertex in mesh.data.vertices],
        [list(polygon.vertices) for polygon in mesh.data.polygons],
        all_triangles=True,
    )
    def front_surface(x, y):
        location, _, _, _ = surface.ray_cast(Vector((x, y, 0.3)), Vector((0.0, 0.0, -1.0)))
        if location is None:
            raise RuntimeError(f"No Darwin5 face surface under eyelid sample ({x}, {y}).")
        return location

    crease_material = bpy.data.materials.new("Darwin5 eyelid crease")
    crease_material.use_nodes = True
    crease_material.diffuse_color = (0.055, 0.022, 0.014, 1.0)
    crease_material.metallic = 0.0
    crease_material.roughness = 0.82
    crease_principled = crease_material.node_tree.nodes.get("Principled BSDF")
    if crease_principled:
        crease_principled.inputs["Base Color"].default_value = (0.055, 0.022, 0.014, 1.0)
        crease_principled.inputs["Roughness"].default_value = 0.82

    created = []
    reports = []
    columns = 17
    rows = 7
    half_width = 0.0295
    half_height = 0.0092
    for eye_index, center_x in enumerate(EYE_CENTERS_X):
        target_coordinates = []
        basis_coordinates = []
        source_indices = []
        eyelid_uvs = []
        # Follow one continuous strip of cheek skin immediately below the eye.
        # Mapping the generated rows across arbitrary nearest UVs can jump atlas
        # seams even when the corresponding 3D vertices are adjacent.
        uv_left_vertex = nearest_component_vertex(
            mesh,
            roots,
            face_roots[eye_index],
            center_x - half_width * 0.72,
            EYE_CENTER_Y - 0.025,
        )
        uv_right_vertex = nearest_component_vertex(
            mesh,
            roots,
            face_roots[eye_index],
            center_x + half_width * 0.72,
            EYE_CENTER_Y - 0.025,
        )
        uv_left = original_uvs[uv_left_vertex.index].copy()
        uv_right = original_uvs[uv_right_vertex.index].copy()
        uv_axis = uv_right - uv_left
        uv_perpendicular = Vector((-uv_axis.y, uv_axis.x))
        if uv_perpendicular.length > 0:
            uv_perpendicular.normalize()
        for row in range(rows):
            row_fraction = row / (rows - 1)
            for column in range(columns):
                column_fraction = column / (columns - 1)
                normalized_x = column_fraction * 2.0 - 1.0
                taper = max(0.035, math.sqrt(max(0.0, 1.0 - normalized_x * normalized_x)))
                x = center_x + normalized_x * half_width
                y = EYE_CENTER_Y + (row_fraction * 2.0 - 1.0) * half_height * taper
                point = front_surface(x, y)
                target = (x, y, min(point.z, 0.116) + 0.00045)
                target_coordinates.append(target)
                basis_coordinates.append((x, y, point.z - 0.05))
                source_vertex = nearest_component_vertex(
                    mesh, roots, face_roots[eye_index], x, y
                )
                source_indices.append(source_vertex.index)
                uv = uv_left.lerp(uv_right, column_fraction)
                uv += uv_perpendicular * ((row_fraction - 0.5) * 0.0014)
                eyelid_uvs.append(uv)
        faces = []
        for row in range(rows - 1):
            for column in range(columns - 1):
                bottom_left = row * columns + column
                faces.append((
                    bottom_left,
                    bottom_left + 1,
                    bottom_left + columns + 1,
                    bottom_left + columns,
                ))

        eyelid_mesh = bpy.data.meshes.new(f"Darwin5_Eyelid_{eye_index + 1}")
        eyelid_mesh.from_pydata(basis_coordinates, [], faces)
        eyelid_mesh.update()
        for polygon in eyelid_mesh.polygons:
            polygon.use_smooth = True
        eyelid = bpy.data.objects.new(f"Darwin5_Eyelid_{eye_index + 1}", eyelid_mesh)
        bpy.context.collection.objects.link(eyelid)
        eyelid_mesh.materials.append(skin_material)
        uv_layer = eyelid_mesh.uv_layers.new(name="UVMap")
        for polygon in eyelid_mesh.polygons:
            for loop_index in polygon.loop_indices:
                target_index = eyelid_mesh.loops[loop_index].vertex_index
                uv_layer.data[loop_index].uv = eyelid_uvs[target_index]
        copy_skin_weights(mesh, eyelid, source_indices)
        finish_morph_object(eyelid, mesh, armature, target_coordinates, closed)
        created.append(eyelid)

        crease_columns = 15
        line_vertices = []
        line_targets = []
        line_source_indices = []
        for row in range(2):
            for column in range(crease_columns):
                u = column / (crease_columns - 1)
                x = center_x + (u * 2.0 - 1.0) * (half_width - 0.003)
                normalized_x = u * 2.0 - 1.0
                curve = -0.0014 * (abs(normalized_x) ** 1.55)
                y = EYE_CENTER_Y + curve + (row - 0.5) * 0.00038
                point = front_surface(x, y)
                source_vertex = nearest_component_vertex(
                    mesh, roots, face_roots[eye_index], x, y
                )
                target = (x, y, min(point.z, 0.116) + 0.0008)
                line_vertices.append((x, y, point.z - 0.05))
                line_targets.append(target)
                line_source_indices.append(source_vertex.index)
        line_faces = []
        for column in range(crease_columns - 1):
            line_faces.append((
                column,
                column + 1,
                crease_columns + column + 1,
                crease_columns + column,
            ))
        line_mesh = bpy.data.meshes.new(f"Darwin5_EyelidCrease_{eye_index + 1}")
        line_mesh.from_pydata(line_vertices, [], line_faces)
        line_mesh.update()
        crease = bpy.data.objects.new(f"Darwin5_EyelidCrease_{eye_index + 1}", line_mesh)
        bpy.context.collection.objects.link(crease)
        line_mesh.materials.append(crease_material)
        copy_skin_weights(mesh, crease, line_source_indices)
        finish_morph_object(
            crease,
            mesh,
            armature,
            line_targets,
            closed,
            no_tint=True,
            no_material_upgrade=True,
        )
        created.append(crease)

        reports.append({
            "eyelid": eyelid.name,
            "crease": crease.name,
            "center": [center_x, EYE_CENTER_Y],
            "halfSize": [half_width, half_height],
            "vertices": len(source_indices),
            "polygons": len(faces),
            "sampledSkin": sampled_skin,
            "sampledSkinUv": list(sampled_skin_uv),
            "skinStripUv": [list(uv_left), list(uv_right)],
            "basisDepthOffset": -0.05,
            "blinkDepthOffset": 0.00045,
            "creaseThickness": 0.00038,
        })
    return created, reports


def setup_render(review_dir):
    os.makedirs(review_dir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"

    scene.world.color = (0.045, 0.055, 0.07)
    world = scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.055, 0.07, 0.095, 1.0)
    background.inputs["Strength"].default_value = 0.22

    camera_data = bpy.data.cameras.new("blink-review-camera")
    camera = bpy.data.objects.new("blink-review-camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera_data.lens = 88
    camera_data.sensor_width = 36
    scene.camera = camera

    key_data = bpy.data.lights.new("blink-review-key", type="AREA")
    key = bpy.data.objects.new("blink-review-key", key_data)
    bpy.context.collection.objects.link(key)
    key.location = (-1.1, -1.7, 2.45)
    key_data.energy = 170
    key_data.shape = "DISK"
    key_data.size = 1.15

    fill_data = bpy.data.lights.new("blink-review-fill", type="AREA")
    fill = bpy.data.objects.new("blink-review-fill", fill_data)
    bpy.context.collection.objects.link(fill)
    fill.location = (1.25, -0.65, 1.95)
    fill_data.energy = 75
    fill_data.size = 1.6

    rim_data = bpy.data.lights.new("blink-review-rim", type="AREA")
    rim = bpy.data.objects.new("blink-review-rim", rim_data)
    bpy.context.collection.objects.link(rim)
    rim.location = (0.65, 0.75, 2.3)
    rim_data.energy = 120
    rim_data.size = 1.0
    return camera


def render_face(camera, target, review_dir, label, view):
    if view == "front":
        camera.location = target + Vector((0.0, -0.74, 0.005))
    elif view == "three-quarter":
        camera.location = target + Vector((0.38, -0.67, 0.035))
    elif view == "profile":
        camera.location = target + Vector((0.72, -0.03, 0.025))
    elif view == "top":
        camera.location = target + Vector((0.0, -0.40, 0.58))
    else:
        raise RuntimeError(f"Unknown review view: {view}")
    aim_offset = Vector((0.0, 0.0, 0.055)) if view == "top" else Vector((0.0, 0.0, -0.015))
    look_at(camera, target + aim_offset)
    bpy.context.scene.render.filepath = os.path.join(review_dir, f"{label}-{view}.png")
    bpy.ops.render.render(write_still=True)


def render_torso(camera, mesh, review_dir, label, view):
    target = mesh.matrix_world @ Vector((0.0, 1.16, 0.09))
    camera.data.lens = 62
    if view == "front":
        camera.location = target + Vector((0.0, -1.18, 0.02))
    elif view == "three-quarter":
        camera.location = target + Vector((0.52, -1.06, 0.05))
    elif view == "profile":
        camera.location = target + Vector((1.05, -0.26, 0.03))
    else:
        raise RuntimeError(f"Unknown torso review view: {view}")
    look_at(camera, target)
    bpy.context.scene.render.filepath = os.path.join(review_dir, f"{label}-{view}.png")
    bpy.ops.render.render(write_still=True)


def mesh_report(mesh, armature):
    local_min = Vector((math.inf, math.inf, math.inf))
    local_max = Vector((-math.inf, -math.inf, -math.inf))
    for vertex in mesh.data.vertices:
        local_min.x = min(local_min.x, vertex.co.x)
        local_min.y = min(local_min.y, vertex.co.y)
        local_min.z = min(local_min.z, vertex.co.z)
        local_max.x = max(local_max.x, vertex.co.x)
        local_max.y = max(local_max.y, vertex.co.y)
        local_max.z = max(local_max.z, vertex.co.z)

    head_group = mesh.vertex_groups.get(HEAD_BONE)
    weighted = []
    if head_group is not None:
        group_index = head_group.index
        for vertex in mesh.data.vertices:
            weight = next((item.weight for item in vertex.groups if item.group == group_index), 0.0)
            if weight >= 0.5:
                weighted.append(vertex.co.copy())
    weighted_min = None
    weighted_max = None
    if weighted:
        weighted_min = [min(point[axis] for point in weighted) for axis in range(3)]
        weighted_max = [max(point[axis] for point in weighted) for axis in range(3)]

    target_world = head_target(armature)
    target_local = mesh.matrix_world.inverted() @ target_world
    return {
        "mesh": mesh.name,
        "vertices": len(mesh.data.vertices),
        "polygons": len(mesh.data.polygons),
        "materials": [material.name for material in mesh.data.materials],
        "shapeKeys": list(mesh.data.shape_keys.key_blocks.keys()) if mesh.data.shape_keys else [],
        "localBounds": {"min": list(local_min), "max": list(local_max)},
        "headWeightedVertexCount": len(weighted),
        "headWeightedBounds": {"min": weighted_min, "max": weighted_max},
        "armature": armature.name,
        "bones": len(armature.data.bones),
        "actions": len(bpy.data.actions),
        "headTarget": list(target_world),
        "headTargetLocal": list(target_local),
        "meshMatrixWorld": [list(row) for row in mesh.matrix_world],
        "eyeRegionComponents": eye_region_components(mesh),
    }


def eye_region_components(mesh):
    """Summarize loose geometry islands intersecting the probable eye band."""
    vertex_count = len(mesh.data.vertices)
    parent = list(range(vertex_count))
    sizes = [1] * vertex_count

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(a, b):
        root_a = find(a)
        root_b = find(b)
        if root_a == root_b:
            return
        if sizes[root_a] < sizes[root_b]:
            root_a, root_b = root_b, root_a
        parent[root_b] = root_a
        sizes[root_a] += sizes[root_b]

    for polygon in mesh.data.polygons:
        vertices = polygon.vertices
        for offset in range(1, len(vertices)):
            union(vertices[0], vertices[offset])

    components = {}
    for vertex in mesh.data.vertices:
        root = find(vertex.index)
        item = components.get(root)
        if item is None:
            item = {
                "count": 0,
                "min": [math.inf, math.inf, math.inf],
                "max": [-math.inf, -math.inf, -math.inf],
            }
            components[root] = item
        item["count"] += 1
        for axis in range(3):
            item["min"][axis] = min(item["min"][axis], vertex.co[axis])
            item["max"][axis] = max(item["max"][axis], vertex.co[axis])

    candidates = []
    for root, item in components.items():
        minimum = item["min"]
        maximum = item["max"]
        intersects_height = maximum[1] >= 1.735 and minimum[1] <= 1.825
        intersects_horizontal = maximum[0] >= -0.105 and minimum[0] <= 0.105
        near_face = maximum[2] >= 0.085
        if not (intersects_height and intersects_horizontal and near_face):
            continue
        candidates.append({
            "root": root,
            "count": item["count"],
            "min": [round(value, 6) for value in minimum],
            "max": [round(value, 6) for value in maximum],
            "center": [round((minimum[axis] + maximum[axis]) * 0.5, 6) for axis in range(3)],
        })
    candidates.sort(key=lambda item: (-item["max"][2], -item["count"]))
    return candidates[:80]


def glb_animation_names(path):
    with open(path, "rb") as handle:
        data = handle.read()
    if data[:4] != b"glTF":
        raise RuntimeError(f"Boot reference is not a GLB: {path}")
    offset = 12
    document = None
    while offset < len(data):
        length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset + length]
        offset += length
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.decode("utf-8"))
    if document is None:
        raise RuntimeError(f"Boot reference has no JSON chunk: {path}")
    return {item.get("name") for item in document.get("animations", []) if item.get("name")}


def export_authored_candidate(output_glb, output_blend, boot_reference):
    if not output_glb or not output_blend:
        raise RuntimeError("Author mode requires both --output-glb and --output-blend.")
    output_glb = os.path.abspath(output_glb)
    output_blend = os.path.abspath(output_blend)
    os.makedirs(os.path.dirname(output_glb), exist_ok=True)
    os.makedirs(os.path.dirname(output_blend), exist_ok=True)
    # Preserve the complete editable authoring scene before trimming the export
    # session to the current boot animation inventory.
    bpy.ops.wm.save_as_mainfile(filepath=output_blend, check_existing=False)
    retained_actions = glb_animation_names(os.path.abspath(boot_reference))
    if len(retained_actions) < 20:
        raise RuntimeError(f"Unexpectedly small Darwin5 boot inventory: {len(retained_actions)}")
    for action in list(bpy.data.actions):
        if action.name not in retained_actions:
            bpy.data.actions.remove(action)
    exported_action_names = {action.name for action in bpy.data.actions}
    if exported_action_names != retained_actions:
        missing = sorted(retained_actions - exported_action_names)
        raise RuntimeError(f"Authored scene is missing boot actions: {missing}")
    bpy.ops.export_scene.gltf(
        filepath=output_glb,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_merge_animation="ACTION",
        export_extra_animations=True,
        export_morph=True,
        export_morph_animation=False,
        export_morph_normal=True,
        export_skins=True,
        export_extras=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_apply=False,
        export_draco_mesh_compression_enable=False,
    )
    return {
        "glb": output_glb,
        "glbBytes": os.path.getsize(output_glb),
        "blend": output_blend,
        "blendBytes": os.path.getsize(output_blend),
        "bootActions": sorted(retained_actions),
    }


def main():
    args = parse_args()
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.input))
    mesh = primary_mesh()
    armature = primary_armature()
    stabilize_materials(mesh)
    assign_idle(armature)
    target = head_target(armature)
    os.makedirs(args.review_dir, exist_ok=True)
    selection = None
    blink = None
    overlays = None
    eye_gloss = None
    material_regions = None
    button_candidates = None
    button_regions = None
    hair_candidates = None
    hair_preview = None
    hair_locks = None
    hair_motion = None
    forehead_underlay = None
    preview_hair_roots = {
        int(value.strip())
        for value in args.preview_hair_roots.split(",")
        if value.strip()
    }
    if (
        args.preview_material_regions
        or args.inspect_hair_components
        or preview_hair_roots
        or args.preview_hair_motion
        or args.author
    ):
        material_regions = assign_character_material_regions(
            mesh, debug=args.preview_material_regions
        )
    if args.preview_selection:
        selection = apply_selection_preview(mesh)
    if args.preview_blink:
        blink = author_blink_shape(mesh)
    if args.preview_overlay or args.preview_overlay_blink or args.author:
        _, overlays = add_eyelid_overlay(mesh, armature, closed=args.preview_overlay_blink)
        roots, _ = vertex_components(mesh)
        _, eye_gloss = add_eye_gloss_overlays(mesh, armature, roots, source_uvs(mesh))
    if args.preview_guides:
        add_eye_coordinate_guides(mesh, armature)
    if args.preview_button_candidates or args.preview_brass_buttons or args.inspect_button_components:
        button_candidates = button_component_candidates(mesh)
    if args.preview_button_candidates or args.preview_brass_buttons or args.author:
        button_regions = assign_brass_button_material(
            mesh,
            candidates=button_candidates,
            debug=args.preview_button_candidates,
        )
    if args.inspect_hair_components or preview_hair_roots:
        hair_candidates = hair_component_candidates(
            mesh,
            material_regions["assignedRoots"]["hair"],
        )
    if preview_hair_roots:
        hair_preview = apply_component_root_preview(
            mesh,
            preview_hair_roots,
            name="Hair lock root preview",
        )
    if args.preview_hair_motion or args.author:
        hair_locks, hair_motion = author_hair_lock_motion(
            mesh,
            preview_pose=args.preview_hair_motion,
        )
        _, forehead_underlay = add_forehead_underlay(mesh, armature)
    if not args.skip_render:
        camera = setup_render(os.path.abspath(args.review_dir))
        if args.preview_overlay_blink:
            label = "overlay-blink"
        elif args.preview_overlay:
            label = "overlay-open"
        elif args.preview_guides:
            label = "guides"
        elif args.preview_material_regions:
            label = "material-regions"
        elif args.preview_button_candidates:
            label = "button-candidates"
        elif args.preview_brass_buttons:
            label = "brass-buttons"
        elif preview_hair_roots:
            label = "hair-roots-" + "-".join(str(root) for root in sorted(preview_hair_roots))
        elif args.preview_hair_motion:
            label = "hair-motion-" + args.preview_hair_motion
        elif args.preview_blink:
            label = "blink"
        elif args.preview_selection:
            label = "selection"
        else:
            label = "open"
        button_preview = args.preview_button_candidates or args.preview_brass_buttons
        render = render_torso if button_preview else render_face
        render_target = mesh if button_preview else target
        render(camera, render_target, args.review_dir, label, "front")
        render(camera, render_target, args.review_dir, label, "three-quarter")
        render(camera, render_target, args.review_dir, label, "profile")
        if args.preview_hair_motion:
            render(camera, render_target, args.review_dir, label, "top")

    export_report = None
    if args.author:
        export_report = export_authored_candidate(
            args.output_glb, args.output_blend, args.boot_reference
        )

    report = mesh_report(mesh, armature)
    report["selectionPreview"] = selection
    report["blinkPreview"] = blink
    report["eyelidOverlays"] = overlays
    report["eyeGlossOverlays"] = eye_gloss
    report["materialRegions"] = material_regions
    report["buttonCandidates"] = button_candidates
    report["buttonRegions"] = button_regions
    report["hairCandidates"] = hair_candidates
    report["hairRootPreview"] = hair_preview
    report["hairMotion"] = hair_motion
    report["foreheadUnderlay"] = forehead_underlay
    report["materialComponentCandidates"] = (
        material_component_candidates(mesh) if args.inspect_material_components else None
    )
    report["export"] = export_report
    report_path = os.path.join(args.review_dir, "inspection.json")
    with open(report_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")
    print("DARWIN5_BLINK_INSPECTION " + json.dumps(report))

    if not args.inspect_only and not args.author:
        raise RuntimeError("Blink authoring is intentionally disabled until the open-face inspection is reviewed.")


if __name__ == "__main__":
    main()
