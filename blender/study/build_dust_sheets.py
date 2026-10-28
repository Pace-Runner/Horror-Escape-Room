"""
The study's dust-sheeted furniture: an armchair, a sofa and a tall cabinet, put
away under linen when the house was shut up.

    exec in the live Blender, or: blender --background --python blender/study/build_dust_sheets.py

Writes blender/study/study_dust_sheets.blend and src/assets/models/study/study_dust_sheets.glb.

THE SHEETS ARE SIMULATED, NOT SCULPTED. Each piece is a plain collider shape
(seat, back, arms; or a cabinet with a cornice lip) and a flat sheet dropped
over it with Blender's cloth solver, run to rest, then applied to an ordinary
mesh. THE FURNITURE SHIPS TOO (Kiran, 2026-10-28: there was "nothing
underneath them"): add_furniture() builds the same shapes again inside the
sheet -- an old velvet seat on walnut legs, or a walnut cabinet on its plinth
-- so a lifted hem or a look underneath finds furniture, not a hollow. It is
joined into the sheet's mesh, so the GLB is still three meshes:

  Sheet_Armchair  0.9 x 0.9 m, 1.0 m tall   (low cover, on the ground floor)
  Sheet_Sofa      1.9 x 0.85 m, 0.9 m tall  (low cover, on the loft)
  Sheet_Cabinet   0.9 x 0.6 m, 1.8 m tall   (tall cover, on the loft)

THE CONTRACT is src/levels/studyHideProps.js's sheeted(): those footprints and
heights are its colliders and cover boxes. The cloth pools a little past them
on the boards, as a sheet does; the pooled hem is drawn, not collided with.

The linen is one GENERATED texture (cream, so harmoniseAsset tunes it): a
plain weave, the creases of the folds it was stored in, foxing and a few old
stains. Double-sided, since a sheet's underside shows at the hem.
"""

import importlib
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hide_and_seek_kit as kit  # noqa: E402
importlib.reload(kit)

NAME = 'study_dust_sheets'
SEED = 1904
FRAMES = 140

# name: (footprint w, d, height, sheet w, d, grid nx, ny, proxy boxes)
PIECES = {
    'Sheet_Armchair': (0.9, 0.9, 1.0, 2.3, 2.3, 32, 32, [
        ((-0.40, -0.40, 0.0), (0.40, 0.40, 0.45)),          # seat
        ((-0.43, -0.44, 0.0), (0.43, -0.22, 1.0)),          # back
        ((-0.45, -0.40, 0.0), (-0.30, 0.42, 0.66)),         # arms
        ((0.30, -0.40, 0.0), (0.45, 0.42, 0.66)),
    ]),
    'Sheet_Sofa': (1.9, 0.85, 0.9, 3.2, 2.3, 44, 32, [
        ((-0.90, -0.38, 0.0), (0.90, 0.40, 0.42)),
        ((-0.93, -0.42, 0.0), (0.93, -0.20, 0.90)),
        ((-0.95, -0.40, 0.0), (-0.78, 0.42, 0.62)),
        ((0.78, -0.40, 0.0), (0.95, 0.42, 0.62)),
    ]),
    'Sheet_Cabinet': (0.9, 0.6, 1.8, 3.3, 3.0, 40, 36, [
        ((-0.44, -0.29, 0.16), (0.44, 0.29, 1.74)),
        ((-0.47, -0.32, 1.74), (0.47, 0.32, 1.80)),         # the cornice lip the sheet hangs from
    ]),
}


def linen_image():
    rng = np.random.default_rng(SEED)
    h = w = 512
    v, u = np.mgrid[0:h, 0:w] / float(h)
    base = np.array([0.80, 0.77, 0.69])
    weave = 0.95 + 0.05 * (np.sin(u * w * math.pi * 0.9) * np.sin(v * h * math.pi * 0.9))
    slub = 0.97 + 0.06 * kit.value_noise(rng, h, w, 64)
    # The creases of a sheet folded in sixteenths for years.
    crease = np.zeros((h, w))
    for k in (0.25, 0.5, 0.75):
        crease += np.exp(-((u - k + 0.004 * np.sin(v * 13)) / 0.006) ** 2)
        crease += np.exp(-((v - k + 0.004 * np.sin(u * 11)) / 0.006) ** 2)
    # Foxing: small brown spots; and a few big pale water stains with darker rims.
    foxing = (kit.value_noise(rng, h, w, 90) > 0.86) * kit.value_noise(rng, h, w, 40)
    stains = np.zeros((h, w))
    for _ in range(5):
        cy, cx = rng.uniform(0.1, 0.9, 2)
        r = rng.uniform(0.05, 0.13)
        d = np.hypot(u - cx, v - cy) / r
        stains += np.clip(1 - d, 0, 1) * 0.35 + np.exp(-((d - 1) / 0.07) ** 2) * 0.5
    dust = kit.fbm(rng, h, w, octaves=4, base=3)
    colour = base[None, None, :] * (weave * slub)[..., None]
    colour *= (1 - 0.10 * crease)[..., None]
    colour *= (0.90 + 0.14 * dust)[..., None]
    tea = np.array([0.80, 0.68, 0.48])
    colour = colour * (1 - 0.25 * stains[..., None]) + tea * 0.25 * stains[..., None] * 0.8
    colour *= (1 - 0.35 * foxing)[..., None]
    return kit.painted_image('Dust sheet linen 512', colour)


def drape(name, spec, offset_x, floor, linen_mat):
    fw, fd, fh, sw, sd, nx, ny, boxes = spec
    # The furniture under it, as a collider only.
    bm = bmesh.new()
    for lo, hi in boxes:
        kit.box_into(bm, lo, hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    proxy = kit.mesh_object(name + '_proxy', bm, [], uvs=False)
    proxy.location.x = offset_x
    # Rounded first, so the cloth slides off the edges instead of snagging on them.
    rounded = proxy.modifiers.new('Bevel', 'BEVEL')
    rounded.width = 0.045
    rounded.segments = 3
    proxy.modifiers.new('Collision', 'COLLISION')
    proxy.collision.thickness_outer = 0.012
    proxy.collision.cloth_friction = 3.0
    # The sheet, flat, just above, a little off square so it does not fall symmetrically.
    rng = np.random.default_rng(SEED + len(name))
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=nx, y_segments=ny, size=0.5, calc_uvs=True)
    bmesh.ops.scale(bm, vec=(sw, sd, 1.0), verts=bm.verts)
    for vert in bm.verts:
        vert.co.z = fh + 0.06 + rng.uniform(-0.01, 0.01)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rng.uniform(-0.12, 0.12), 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 0), verts=bm.verts)
    sheet = kit.mesh_object(name, bm, [linen_mat], uvs=False, smooth=True)
    sheet.location.x = offset_x
    cloth = sheet.modifiers.new('Cloth', 'CLOTH')
    s = cloth.settings
    # Heavy old linen: stiff enough to hang in soft folds, not crumple into points.
    s.quality = 12
    s.mass = 0.35
    s.tension_stiffness = 18
    s.compression_stiffness = 18
    s.shear_stiffness = 8
    s.bending_stiffness = 3.0
    s.air_damping = 1.5
    c = cloth.collision_settings
    c.use_collision = True
    c.collision_quality = 4
    c.distance_min = 0.008
    c.use_self_collision = True
    c.self_distance_min = 0.007
    cloth.point_cache.frame_start = 1
    cloth.point_cache.frame_end = FRAMES
    return sheet, proxy


def apply_cloth(sheet):
    """The simulated shape, as plain mesh data, lightly smoothed; the modifiers go."""
    smooth = sheet.modifiers.new('Smooth', 'SMOOTH')
    smooth.factor = 0.5
    smooth.iterations = 4
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = sheet.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated)
    old = sheet.data
    sheet.modifiers.clear()
    sheet.data = mesh
    mesh.name = sheet.name + '_mesh'
    bpy.data.meshes.remove(old)
    for poly in mesh.polygons:
        poly.use_smooth = True


# What is under each sheet. Inside the shape the cloth settled on by INSET
# (the cloth rests a further 20 mm off that shape: its collision thickness and
# distance), and rounded by ROUND, less than the proxy's own bevel, so the two
# never meet. The seats stand on LEG-tall walnut legs at these points; the
# cabinet on its plinth.
INSET = 0.015
ROUND = 0.03
LEG = 0.11
LEGS = {
    'Sheet_Armchair': [(-0.32, -0.32), (0.32, -0.32), (-0.32, 0.33), (0.32, 0.33)],
    'Sheet_Sofa': [(-0.82, -0.30), (0.82, -0.30), (-0.82, 0.33), (0.82, 0.33), (0.0, -0.30), (0.0, 0.33)],
}
WALNUT, VELVET = 1, 2


def add_furniture(sheet, spec, walnut, velvet):
    """The furniture the sheet was draped on, joined into its mesh: material 1 walnut, 2 velvet."""
    boxes = spec[7]
    bm = bmesh.new()
    bm.from_mesh(sheet.data)
    before = set(bm.faces)
    if sheet.name == 'Sheet_Cabinet':
        # The plinth shows under the hem: a sheet over something that tall stops short of the floor.
        kit.box_into(bm, (-0.46, -0.31, 0.0), (0.46, 0.31, 0.17), WALNUT)
        kit.box_into(bm, (-0.44, -0.29, 0.17), (0.44, 0.29, 0.30), WALNUT)
        plinth = set(bm.faces) - before
        # The carcass and its cornice, on the plinth: 5 mm clear of its top.
        (x0, y0, z0), (x1, y1, z1) = boxes[0]
        kit.box_into(bm, (x0 + INSET, y0 + INSET, 0.305), (x1 - INSET, y1 - INSET, z1 - INSET), WALNUT)
        (x0, y0, z0), (x1, y1, z1) = boxes[1]
        kit.box_into(bm, (x0 + INSET, y0 + INSET, z0 - INSET + 0.01), (x1 - INSET, y1 - INSET, z1 - INSET), WALNUT)
        body = set(bm.faces) - before - plinth
        material = WALNUT
    else:
        # Seat, back and arms, up off the floor on their legs.
        for (x0, y0, z0), (x1, y1, z1) in boxes:
            kit.box_into(bm, (x0 + INSET, y0 + INSET, max(z0, LEG)), (x1 - INSET, y1 - INSET, z1 - INSET), VELVET)
        body = set(bm.faces) - before
        material = VELVET
    edges = {e for f in body for e in f.edges}
    bmesh.ops.bevel(bm, geom=list(edges) + list({v for e in edges for v in e.verts}), offset=ROUND,
                    segments=2, affect='EDGES', profile=0.5)
    for f in set(bm.faces) - before:
        if f.material_index not in (WALNUT, VELVET):
            f.material_index = material
    for x, y in LEGS.get(sheet.name, []):
        # A short turned leg, narrower at the foot.
        made = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.022, radius2=0.03,
                                     depth=LEG, matrix=Matrix.Translation((x, y, LEG / 2)))
        for f in {f for v in made['verts'] for f in v.link_faces}:
            f.material_index = WALNUT
    bmesh.ops.recalc_face_normals(bm, faces=list(set(bm.faces) - before))
    bm.to_mesh(sheet.data)
    bm.free()
    sheet.data.materials.append(walnut)
    sheet.data.materials.append(velvet)
    for poly in sheet.data.polygons:
        poly.use_smooth = poly.material_index == 0


def main(names=None):
    kit.clear_scene()
    scene = bpy.context.scene
    linen = kit.material('Dust sheet cream linen', (1, 1, 1), roughness=0.95, image=linen_image(), double_sided=True)
    walnut = kit.material('Cabinet base walnut', (0.20, 0.11, 0.06), roughness=0.75)
    # The seats' old upholstery: a dark, dusty plum velvet, flat colour (no map).
    # Darker than it looks here: the first try (0.17, 0.08, 0.10) read pink in the room.
    velvet = kit.material('Sheeted furniture velvet', (0.075, 0.026, 0.038), roughness=0.92)
    # The floor it pools on.
    bm = bmesh.new()
    kit.box_into(bm, (-8, -4, -0.2), (8, 4, 0.0))
    floor = kit.mesh_object('Floor_collider', bm, [], uvs=False)
    floor.modifiers.new('Collision', 'COLLISION')
    floor.collision.cloth_friction = 10.0
    built = []
    for i, name in enumerate(names or PIECES):
        sheet, proxy = drape(name, PIECES[name], (i - 1) * 4.5, floor, linen)
        built.append((sheet, proxy))
    scene.frame_start, scene.frame_end = 1, FRAMES
    for frame in range(1, FRAMES + 1):
        scene.frame_set(frame)
    out = []
    for sheet, proxy in built:
        apply_cloth(sheet)
        add_furniture(sheet, PIECES[sheet.name], walnut, velvet)
        bpy.data.objects.remove(proxy, do_unlink=True)
        out.append(sheet)
    bpy.data.objects.remove(floor, do_unlink=True)
    scene.frame_set(1)
    kit.report(out)
    return out


if __name__ == '__main__':
    OBJECTS = main()
    if bpy.app.background:
        kit.save_and_export(NAME, OBJECTS)
