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
