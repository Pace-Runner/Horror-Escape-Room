"""
A floor-length velvet curtain for the study's front casements -- a hide spot:
stand between it and the wall.

    exec in the live Blender, or: blender --background --python blender/study/build_curtain.py

Writes blender/study/study_curtain.blend and src/assets/models/study/study_curtain.glb.
The level hangs two of them (src/levels/studyHideProps.js).

THE CONTRACT: 0.9 m wide, from a rod 5.75 m up to 2 cm off the boards. Cloth
hides you without stopping you, so it has no collider -- only a sight box.

FOUR STRIPS, NOT ONE SHEET. The cloth is cut into Strip_0..Strip_3 across its
width, each with its origin ON THE ROD, so the game can swing them: when Mark
steps behind it the strips nearest him bulge out and settle, and the same
happens when she pulls it back to look. The cuts fall in the BACK of a pleat,
where a sliver of a gap opening as a strip swings is inside the fold.

The pleats are gathered at the rings and fall deeper toward the hem, a little
irregular, as a heavy curtain hangs. The plum velvet is GENERATED: the pleat
shading baked into the nap, faded higher up where the sun reached it through
the window, dusty along the hem. Double-sided: the back shows from the wall.
"""

import importlib
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hide_and_seek_kit as kit  # noqa: E402
importlib.reload(kit)

NAME = 'study_curtain'
SEED = 1893

WIDTH = 0.9
ROD_Z = 5.75
TOP_Z = ROD_Z - 0.035     # where the cloth hangs from the rings
HEM_Z = 0.02
STRIPS = 4
PLEATS = 8                # across the whole width: a multiple of STRIPS puts every cut in a fold's back
SEG_X = 9                 # per strip
SEG_Z = 22


def pleat_depth(x, z):
    """How far the cloth sits forward (+Y) at (x, z): a gathered sine, deeper toward the hem."""
    t = (TOP_Z - z) / (TOP_Z - HEM_Z)                       # 0 at the top, 1 at the hem
    u = (x + WIDTH / 2) / WIDTH
    phase = u * PLEATS * 2 * math.pi
    wobble = 0.15 * math.sin(u * 9.0 + t * 4.0) + 0.1 * math.sin(t * 11.0 + u * 3.0)
    amp = 0.028 + 0.030 * t
    # Cosine, so u = 0 and the strip cuts land in the back of a pleat (the minimum).
    return -amp * math.cos(phase + wobble)


def velvet_image():
    rng = np.random.default_rng(SEED)
    h, w = 1024, 256
    v, u = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
    base = np.array([0.26, 0.075, 0.13])
    # The pleats, baked: velvet is brightest where the nap faces you, darkest in the folds.
    pleat = 0.5 + 0.5 * np.cos(u * PLEATS * 2 * math.pi)
    shade = 0.62 + 0.38 * pleat ** 0.8
    nap = 0.92 + 0.10 * kit.value_noise(rng, h, w, 48) + 0.04 * kit.value_noise(rng, h, w, 160)
    streak = 0.95 + 0.08 * kit.value_noise(rng, 64, w, 24).repeat(h // 64, axis=0)
    colour = base[None, None, :] * (shade * nap * streak)[..., None]
    # Faded toward the top (v = 0 is the top row here), where the light came in.
    fade = np.clip(1.0 - v * 1.6, 0, 1) ** 1.5
    colour = colour * (1 - 0.35 * fade[..., None]) + np.array([0.36, 0.25, 0.27]) * 0.35 * fade[..., None]
    # Dust along the hem.
    hem = np.clip((v - 0.93) / 0.07, 0, 1)
    colour = colour * (1 - 0.3 * hem[..., None]) + np.array([0.36, 0.33, 0.29]) * 0.3 * hem[..., None]
    return kit.painted_image('Curtain velvet 256x1024', colour)


def strip_object(index, velvet):
    x0 = -WIDTH / 2 + WIDTH * index / STRIPS
    x1 = x0 + WIDTH / STRIPS
    bm = bmesh.new()
    rows = []
    for j in range(SEG_Z + 1):
        z = TOP_Z - (TOP_Z - HEM_Z) * j / SEG_Z
        row = []
        for i in range(SEG_X + 1):
            x = x0 + (x1 - x0) * i / SEG_X
            row.append(bm.verts.new((x, pleat_depth(x, z), z)))
        rows.append(row)
    uv = bm.loops.layers.uv.verify()
    for j in range(SEG_Z):
        for i in range(SEG_X):
            quad = (rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1])
            face = bm.faces.new(quad)
            for loop in face.loops:
                co = loop.vert.co
                loop[uv].uv = ((co.x + WIDTH / 2) / WIDTH, (co.z - HEM_Z) / (TOP_Z - HEM_Z))
    obj = kit.mesh_object(f'Strip_{index}', bm, [velvet], uvs=False, smooth=True)
    # The origin on the rod, so a turn about X swings the strip from where it hangs.
    kit.set_origin(obj, ((x0 + x1) / 2, 0.0, ROD_Z))
    return obj


def lathe_into(bm, profile, matrix, steps=10):
    """A turned shape (profile of (radius, z) about local Z), placed by `matrix`, into `bm`."""
    tmp = bmesh.new()
    verts = [tmp.verts.new((r, 0.0, z)) for r, z in profile]
    edges = [tmp.edges.new((verts[k], verts[k + 1])) for k in range(len(verts) - 1)]
    bmesh.ops.spin(tmp, geom=verts + edges, axis=(0, 0, 1), cent=(0, 0, 0), angle=2 * math.pi, steps=steps)
    bmesh.ops.remove_doubles(tmp, verts=tmp.verts, dist=1e-5)
    bmesh.ops.transform(tmp, matrix=matrix, verts=tmp.verts)
    mesh = bpy.data.meshes.new('tmp')
    tmp.to_mesh(mesh)
    tmp.free()
    bm.from_mesh(mesh)
    bpy.data.meshes.remove(mesh)


def rod_object(brass):
    bm = bmesh.new()
    length = WIDTH + 0.2
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.016, radius2=0.016, depth=length,
                          matrix=Matrix.Translation((0, 0, ROD_Z)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    # Finials: a turned knob at each end, pointing out along the rod.
    profile = [(0.0, 0.0), (0.022, 0.006), (0.03, 0.03), (0.022, 0.05), (0.012, 0.062), (0.0, 0.07)]
    for side in (-1, 1):
        lathe_into(bm, profile, Matrix.Translation((side * length / 2, 0, ROD_Z)) @ Matrix.Rotation(side * math.pi / 2, 4, 'Y'))
    # Rings along the rod; the cloth's top hangs from their bottoms.
    for k in range(8):
        x = -WIDTH / 2 + 0.02 + (WIDTH - 0.04) * k / 7
        bmesh.ops.create_cone(bm, cap_ends=False, segments=8, radius1=0.026, radius2=0.026, depth=0.008,
                              matrix=Matrix.Translation((x, 0, ROD_Z)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.mesh_object('Curtain_Rod', bm, [brass], smooth=True)


def main():
    kit.clear_scene()
    velvet = kit.material('Curtain plum velvet', (1, 1, 1), roughness=0.92, image=velvet_image(), double_sided=True)
    brass = kit.material('Curtain brass', (0.62, 0.47, 0.22), roughness=0.45, metallic=0.85)
    objects = [strip_object(i, velvet) for i in range(STRIPS)]
    objects.append(rod_object(brass))
    kit.report(objects)
    return objects


if __name__ == '__main__':
    OBJECTS = main()
    if bpy.app.background:
        kit.save_and_export(NAME, OBJECTS)
