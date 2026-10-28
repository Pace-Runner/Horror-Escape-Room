"""
The study's three-panel folding screen -- tall cover: stand behind it.

    exec in the live Blender, or: blender --background --python blender/study/build_folding_screen.py

Writes blender/study/study_folding_screen.blend and src/assets/models/study/study_folding_screen.glb.

THE CONTRACT (src/levels/studyHideProps.js): three 0.6 m panels in a zigzag,
each turned 0.35 rad the opposite way to its neighbour so their edges meet at
the hinges, 1.8 m end to end and about 1.75 m tall -- tall enough to hide a
man standing. The level turns the whole screen a quarter so it runs front to
back between the Chesterfield and the window wall; this model runs along X.

Each panel: walnut stiles and rails on little bracket feet, a fielded wooden
panel below, and a faded damask above -- the one GENERATED texture here, a
repeating medallion in tired gold on olive, gone grey with dust and darker
where hands and the frame have rubbed it. The middle panel stands a little
taller under its crest, as a screen's centre leaf usually does.
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

NAME = 'study_folding_screen'
SEED = 1887

PANEL_W = 0.6
HALF = PANEL_W / 2
STEP = PANEL_W * 0.94      # centre to centre along X, as the placeholder
TURN = 0.35
FRAME_T = 0.016            # half the frame's thickness
STILE = 0.04
FOOT_H = 0.06
MID_RAIL = (0.52, 0.58)


def damask_image():
    """A tired damask, 256 x 512 to match the upper panel's shape (0.52 x 1.12 m)."""
    rng = np.random.default_rng(SEED)
    h, w = 512, 256
    v, u = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
    # The medallion: a diamond lattice of lobed rosettes, two repeats across.
    px, py = (u * 2.0) % 1.0 - 0.5, (v * 4.0) % 1.0 - 0.5
    r = np.hypot(px * 1.25, py)
    a = np.arctan2(py, px)
    rosette = np.clip(1.0 - np.abs(r - (0.22 + 0.05 * np.cos(6 * a))) * 9.0, 0, 1)
    stem = np.clip(1.0 - np.abs(np.abs(px) + np.abs(py) - 0.48) * 14.0, 0, 1) * 0.6
    leaves = np.clip(np.cos(px * 18) * np.cos(py * 18) - 0.55, 0, 1) * 1.4 * (r > 0.3)
    motif = np.clip(rosette + stem + leaves, 0, 1)
    ground = np.array([0.20, 0.19, 0.11])
    thread = np.array([0.44, 0.36, 0.18])
    colour = ground[None, None, :] * (1 - motif[..., None]) + thread[None, None, :] * motif[..., None]
    # A fine weave, the dust, and the grime where the frame and hands met it.
    weave = 0.94 + 0.06 * np.sin(u * w * math.pi) * np.sin(v * h * math.pi)
    dust = kit.fbm(rng, h, w, octaves=4, base=3)
    edge = np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v))
    grime = np.clip(1.0 - edge * 9.0, 0, 1) ** 2
    colour = colour * weave[..., None]
    colour = colour * (0.78 + 0.3 * dust[..., None]) * (1 - 0.45 * grime[..., None])
    grey = colour.mean(axis=2, keepdims=True)
    colour = colour * 0.75 + grey * 0.25 + 0.025          # faded: towards grey, lifted
    # Moth holes: a few dark specks.
    for _ in range(14):
        cy, cx = rng.integers(20, h - 20), rng.integers(12, w - 12)
        rr = rng.uniform(1.5, 3.5)
        mask = (np.hypot(np.arange(h)[:, None] - cy, np.arange(w)[None, :] - cx) < rr)
        colour[mask] *= 0.25
    return kit.painted_image('Screen damask 256x512', colour)


def panel_bmesh(top, crest_rise):
    """One panel in its own space: width along u (x), thickness along y, up z. Fabric faces get panel UVs."""
    bm = bmesh.new()
    wood, fabric, brass = 0, 1, 2
    t = FRAME_T
    # Bracket feet under the stiles, a little wider than them.
    for s in (-1, 1):
        x_out = s * (HALF + 0.004)
        x_in = s * (HALF - STILE - 0.004)
        kit.box_into(bm, (min(x_out, x_in), -t - 0.008, 0.0), (max(x_out, x_in), t + 0.008, FOOT_H), wood)
    # Stiles, rails.
    kit.box_into(bm, (-HALF, -t, FOOT_H), (-HALF + STILE, t, top), wood)
    kit.box_into(bm, (HALF - STILE, -t, FOOT_H), (HALF, t, top), wood)
    inner = HALF - STILE
    kit.box_into(bm, (-inner, -t, FOOT_H), (inner, t, FOOT_H + 0.08), wood)
    kit.box_into(bm, (-inner, -t, MID_RAIL[0]), (inner, t, MID_RAIL[1]), wood)
    kit.box_into(bm, (-inner, -t, top - 0.07), (inner, t, top), wood)
    # The fielded panel below: a slab 10 mm in from the frame's faces, a field 6 mm proud of it.
    low0, low1 = FOOT_H + 0.08, MID_RAIL[0]
    kit.box_into(bm, (-inner, -0.006, low0), (inner, 0.006, low1), wood)
    kit.box_into(bm, (-inner + 0.03, -0.010, low0 + 0.03), (inner - 0.03, 0.010, low1 - 0.03), wood)
    # The damask above: 12 mm in from the frame's faces, both sides showing.
    up0, up1 = MID_RAIL[1], top - 0.07
    fabric_faces = kit.box_into(bm, (-inner, -0.004, up0), (inner, 0.004, up1), fabric)
    # The crest: a low arch on the top rail, the frame's thickness.
    if crest_rise > 0:
        outline = [(-inner, top)]
        for i in range(11):
            x = -inner + 2 * inner * i / 10
            outline.append((x, top + 0.012 + crest_rise * math.cos(math.pi * x / (2 * inner)) ** 2))
        outline.append((inner, top))
        front = [bm.verts.new((x, t, z)) for x, z in outline]
        back = [bm.verts.new((x, -t, z)) for x, z in outline]
        bm.faces.new(list(reversed(front)))
        bm.faces.new(back)
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Wood gets the usual box projection; the damask is stretched once over its panel.
    kit.box_uvs(bm)
    uv = bm.loops.layers.uv.verify()
    for f in fabric_faces:
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = ((co.x + inner) / (2 * inner), (co.z - up0) / (up1 - up0))
    return bm


def main():
    kit.clear_scene()
    wood = kit.material('Screen walnut', (0.22, 0.12, 0.065), roughness=0.75)
    damask = kit.material('Screen faded damask', (1, 1, 1), roughness=0.95, image=damask_image())
    brass = kit.material('Screen brass', (0.62, 0.47, 0.22), roughness=0.45, metallic=0.85)
    out = bmesh.new()
    tops = (1.70, 1.73, 1.70)
    crests = (0.04, 0.09, 0.04)
    for i in range(3):
        bm = panel_bmesh(tops[i], crests[i])
        yaw = -TURN if i == 1 else TURN
        bmesh.ops.transform(bm, matrix=Matrix.Translation(((i - 1) * STEP, 0, 0)) @ Matrix.Rotation(yaw, 4, 'Z'),
                            verts=bm.verts)
        mesh = bpy.data.meshes.new('tmp')
        bm.to_mesh(mesh)
        bm.free()
        out.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    # Brass hinges where the leaves meet: three on each joint.
    for jx, jy in ((-STEP / 2, HALF * math.sin(TURN)), (STEP / 2, -HALF * math.sin(TURN))):
        for z in (0.32, 0.95, 1.52):
            kit.box_into(out, (jx - 0.012, jy - 0.02, z - 0.03), (jx + 0.012, jy + 0.02, z + 0.03), 2)
    bmesh.ops.recalc_face_normals(out, faces=out.faces)
    obj = kit.mesh_object('Folding_Screen', out, [wood, damask, brass], uvs=False)
    kit.bevel(obj, width=0.0025)
    kit.report([obj])
    return [obj]


if __name__ == '__main__':
    OBJECTS = main()
    if bpy.app.background:
        kit.save_and_export(NAME, OBJECTS)
