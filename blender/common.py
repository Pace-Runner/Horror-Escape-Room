"""
Shared bmesh-based geometry helpers for this project's Blender generation
scripts (blender/build_*.py). Import with:

    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import common

Built on bmesh.ops throughout, not bpy.ops -- bpy.ops relies on window/
viewport context that `blender --background` doesn't provide, so scripting
geometry that way is a common source of "context is incorrect" failures.
bmesh.ops works directly on mesh data with no such dependency.
"""

import bpy
import bmesh
import math
import os
from mathutils import Matrix, Vector


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def make_material(name, color, roughness=0.6, metallic=0.0):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*color, 1.0)
        bsdf.inputs['Roughness'].default_value = roughness
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = metallic
    return mat


def box_project_uvs(bm, density=2.2):
    # Per-face planar (box/triplanar) projection: each face picks the two
    # world axes closest to its own plane based on its dominant normal
    # axis, and uses vertex position on those two directly as UV -- no UV
    # data exists on this geometry at all otherwise (bmesh.ops never
    # creates any), which meant every exported mesh so far had no way to
    # carry a texture map. Not a true unwrap (cylindrical surfaces like
    # the turned posts get some stretching/seams), but correct and
    # seamless for the box/panel shapes most of this project's geometry
    # actually is.
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                u, v = co.x, co.y
            elif ay >= ax and ay >= az:
                u, v = co.x, co.z
            else:
                u, v = co.y, co.z
            loop[uv_layer].uv = (u * density, v * density)


def new_object(name, bm, material, uv_density=2.2):
    box_project_uvs(bm, density=uv_density)
    mesh = bpy.data.meshes.new(name + '_mesh')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def make_turned_post(name, height, material, foot_r=0.05, shaft_r=0.022, cap_r=0.045, segments=24):
    profile = [
        (0.0, -height / 2),
        (foot_r, -height / 2 + height * 0.04),
        (shaft_r * 1.1, -height / 2 + height * 0.09),
        (foot_r * 0.85, -height / 2 + height * 0.14),
        (shaft_r, -height / 2 + height * 0.2),
        (shaft_r, height / 2 - height * 0.12),
        (shaft_r * 1.3, height / 2 - height * 0.09),
        (cap_r, height / 2 - height * 0.05),
        (0.0, height / 2),
    ]
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0.0, z)) for (r, z) in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(
        bm, geom=verts + edges, axis=(0.0, 0.0, 1.0), cent=(0.0, 0.0, 0.0),
        angle=math.radians(360), steps=segments, use_duplicate=False
    )
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    obj = new_object(name, bm, material)
    for p in obj.data.polygons:
        p.use_smooth = True
    mod = obj.modifiers.new('Subsurf', type='SUBSURF')
    mod.levels = 1
    mod.render_levels = 1
    return obj


def make_panel_frame(name, width, height, material, depth=0.06, frame_w=0.09, inset_depth=0.02, bevel_width=0.01):
    hw, hh = width / 2, height / 2
    bm = bmesh.new()
    v0 = bm.verts.new((-hw, 0.0, -hh))
    v1 = bm.verts.new((hw, 0.0, -hh))
    v2 = bm.verts.new((hw, 0.0, hh))
    v3 = bm.verts.new((-hw, 0.0, hh))
    face = bm.faces.new((v0, v1, v2, v3))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    ret = bmesh.ops.extrude_face_region(bm, geom=[face])
    extruded_verts = [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=extruded_verts, vec=(0.0, depth, 0.0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    front_faces = [f for f in bm.faces if all(abs(v.co.y - depth) < 1e-5 for v in f.verts)]
    inset = bmesh.ops.inset_region(bm, faces=front_faces, thickness=frame_w, use_boundary=True)
    inner_faces = [f for f in inset['faces'] if f not in front_faces]
    inner_verts = list({v for f in inner_faces for v in f.verts})
    bmesh.ops.translate(bm, verts=inner_verts, vec=(0.0, -inset_depth, 0.0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    obj = new_object(name, bm, material)
    for p in obj.data.polygons:
        p.use_smooth = False
    bevel = obj.modifiers.new('Bevel', type='BEVEL')
    bevel.width = bevel_width
    bevel.segments = 3
    return obj


def make_box(name, size, material, bevel_ratio=0.06):
    sx, sy, sz = (s / 2 for s in size)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, verts=bm.verts, vec=(sx * 2, sy * 2, sz * 2))
    obj = new_object(name, bm, material)
    if bevel_ratio > 0:
        bevel = obj.modifiers.new('Bevel', type='BEVEL')
        bevel.width = min(size) * bevel_ratio
        bevel.segments = 2
    return obj


def make_cylinder(name, radius, height, material, segments=16):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius, radius2=radius, depth=height)
    obj = new_object(name, bm, material)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def export_glb(out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=True,
        export_apply=True
    )
    print(f'Exported {out_path}')


def export_rigged_glb(out_path, objects):
    """
    Export a SKINNED, shape-keyed character. Sibling of export_glb(), not a
    replacement for it.

    WHY A SECOND FUNCTION. export_glb passes export_apply=True, and that is
    load-bearing for the props: make_box adds a Bevel, make_turned_post adds a
    Subsurf, make_panel_frame adds a Bevel, and none of them are applied in the
    mesh data. Flipping the shared helper to False would silently ship bed.glb,
    door.glb and dresser.glb with hard un-bevelled edges and a faceted bedpost.

    WHY export_apply MUST BE FALSE HERE. The 5.2 exporter's own tooltip says it:
    "Apply modifiers (excluding Armatures) to mesh objects - WARNING: prevents
    exporting shape keys". An evaluated to_mesh() result has shape_keys = None
    and every morph read site guards on that, so you get a VALID GLB with zero
    morph targets and no error at all. Since the whole twist is driven by
    setCorrection lerping a morph, that is the single most expensive silent
    failure available in this pipeline.

    Note it does NOT destroy skinning, contrary to a note in
    src/systems/hands/HANDOVER.md -- the exporter disables Armature modifiers
    before evaluating. The advice there is right for the wrong reason.

    `objects` must include the armature AND every skinned mesh. Selecting the
    mesh without its armature makes the exporter drop the skin and ship a
    static mesh, again silently.
    """
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=True,
        export_apply=False,                   # see above; MANDATORY
        export_yup=True,                      # Blender +Y becomes glTF -Z

        # --- skinning -------------------------------------------------------
        export_skins=True,
        export_influence_nb=4,                # three.js reads only JOINTS_0
        export_all_influences=False,          # ...so never emit JOINTS_1
        export_def_bones=False,               # every bone here already deforms
        export_leaf_bone=False,               # also keeps the export free of
                                              # mode switches under --background
        export_rest_position_armature=True,   # joints ship at the EDIT-bone
                                              # rest pose, so whatever is in the
                                              # viewport at export time is moot

        # --- morph targets --------------------------------------------------
        export_morph=True,
        export_morph_normal=False,            # halves the key's cost; at 5 m in
                                              # fog through a barrel-warp pass
                                              # nobody resolves the difference
        export_morph_tangent=False,
        export_morph_animation=False,
        export_try_sparse_sk=True,            # stores only moved vertices

        # --- no animation ---------------------------------------------------
        export_animations=False,

        # --- attributes -----------------------------------------------------
        export_materials='EXPORT',            # ENUM, not a bool
        export_texcoords=True,                # no UVs means every runtime
                                              # canvas texture is a no-op
        export_normals=True,
        export_tangents=False,                # three derives them from UVs
        export_vertex_color='NONE',           # ENUM, not a bool
        export_all_vertex_colors=False,       # DEFAULTS TO TRUE, and fabricates
                                              # a COLOR_0 that then multiplies
                                              # the albedo at runtime
    )
    print(f'Exported {out_path} ({os.path.getsize(out_path)} bytes)')


# ---------------------------------------------------------------------------
# Building INTO an existing bmesh.
#
# The make_* helpers above create one object per part. These instead add a
# primitive to a bmesh the caller already holds, so every part that shares a
# material can be built into one bmesh and exported as ONE mesh -- one draw
# call at runtime instead of one per screw. build_fuse_box.py and
# glass_fuse.py are built this way.
# ---------------------------------------------------------------------------

def add_box(bm, centre, size):
    matrix = Matrix.Translation(centre) @ Matrix.Diagonal((*size, 1.0))
    bmesh.ops.create_cube(bm, size=1.0, matrix=matrix)


def add_cylinder(bm, centre, radius, depth, axis='Z', segments=12, radius2=None):
    rotation = {
        'X': Matrix.Rotation(math.pi / 2, 4, 'Y'),
        'Y': Matrix.Rotation(math.pi / 2, 4, 'X'),
        'Z': Matrix.Identity(4),
    }[axis]
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth,
        matrix=Matrix.Translation(centre) @ rotation
    )


def catmull_rom(points, samples_per_segment=3):
    """Smooths a short polyline so a wire bends instead of kinking."""
    pts = [Vector(p) for p in points]
    padded = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[i - 1], padded[i], padded[i + 1], padded[i + 2]
        for s in range(samples_per_segment):
            t = s / samples_per_segment
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t
                              + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return out


def add_tube(bm, points, radius, sides=6, samples_per_segment=3):
    """
    A wire along `points`. Each ring is carried forward from the last one
    (parallel transport) instead of being rebuilt from a fixed up vector,
    which is what stops the tube twisting where the path turns vertical.
    """
    path = catmull_rom(points, samples_per_segment)
    rings = []
    normal = None
    for i, p in enumerate(path):
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        if normal is None:
            seed = Vector((1, 0, 0)) if abs(tangent.x) < 0.9 else Vector((0, 1, 0))
            normal = tangent.cross(seed).normalized()
        else:
            normal = (normal - tangent * normal.dot(tangent)).normalized()
        binormal = tangent.cross(normal)
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            ring.append(bm.verts.new(p + radius * (math.cos(a) * normal + math.sin(a) * binormal)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))


def object_keeping_uvs(name, bm, material, smooth=False):
    """
    new_object() without the box projection, for geometry that has already
    been given UVs of its own -- the glass fuse's caps are wrapped
    cylindrically so a stamped rating runs round them undistorted.
    """
    mesh = bpy.data.meshes.new(name + '_mesh')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    for p in obj.data.polygons:
        p.use_smooth = smooth
    return obj
