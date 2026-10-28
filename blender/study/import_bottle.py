"""
The bottle Mark throws -- the loud lure: glass, heard across both floors, and it
breaks where it lands.

    exec in the live Blender, or: blender --background --python blender/study/import_bottle.py

Writes blender/study/study_bottle.blend and src/assets/models/study/study_bottle.glb.

THE SOURCE is a library model: the Bordeaux bottle of "Wine Bottles 01" by
Jurita Burger and Rico Cilliers on Poly Haven, CC0, which Kiran picked. It is in
blender/source/wine_bottles_01/ (SOURCE.md). This script owns what is done to
it:

  * the wine inside goes -- once the glass is opaque it is never seen;
  * the glass is OPAQUE dark green, not transmissive: a transmission material
    is another shader program and an extra render pass, which the study's
    frame budget cannot spare (CLAUDE.md) for a thing the size of a hand;
  * the capsule and the label keep their own colour maps, at 256 px;
  * decimated from 6.5k triangles to about 900, the label left alone, since a
    throwable is seen at arm's length and across a dark room;
  * the ORIGIN AT THE NECK, where the hand holds it: world/itemMeshes.js's
    canonical frame, long axis up, the fist round the grip. Node "Bottle".
"""

import importlib
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hide_and_seek_kit as kit  # noqa: E402
importlib.reload(kit)

NAME = 'study_bottle'
SOURCE = os.path.join(kit.REPO, 'blender', 'source', 'wine_bottles_01', 'wine_bottle_bordeaux_polyhaven_1k.blend')
TARGET_TRIS = 900
NECK_Z = 0.22


def main():
    kit.clear_scene()
    [source] = kit.append_objects(SOURCE, {'wine_bottles_01_bordeaux'})
    slots = [slot.material for slot in source.material_slots]
    index_of = lambda part: next(i for i, m in enumerate(slots) if part in m.name)
    glass_i, seal_i, wine_i, label_i = index_of('glass'), index_of('seal'), index_of('wine_red'), index_of('ftero')
    bm = kit.joined_bmesh([source])
    bpy.data.objects.remove(source, do_unlink=True)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == wine_i], context='FACES')
    remap = {glass_i: 0, seal_i: 1, label_i: 2}
    for f in bm.faces:
        f.material_index = remap[f.material_index]
    kit.floor_and_centre(bm)
    glass = kit.material('Bottle dark glass', (0.06, 0.10, 0.055), roughness=0.12, metallic=0.0)
    capsule = kit.material('Bottle capsule', (1, 1, 1), roughness=0.4, metallic=0.5,
                           image=kit.downscaled(kit.image_in(slots[seal_i], 'diff'), 256, 'Bottle capsule 256'))
    label = kit.material('Bottle label', (1, 1, 1), roughness=0.85,
                         image=kit.downscaled(kit.image_in(slots[label_i], 'diff'), 256, 'Bottle label 256'))
    bottle = kit.mesh_object('Bottle', bm, [glass, capsule, label], uvs=False, smooth=None)
    # Decimate the glass and the capsule; the label (its own few faces) is kept as it is.
    group = bottle.vertex_groups.new(name='decimate')
    keep = {v for poly in bottle.data.polygons if poly.material_index == 2 for v in poly.vertices}
    group.add([v.index for v in bottle.data.vertices if v.index not in keep], 1.0, 'REPLACE')
    before = kit.triangles(bottle)
    decimate = bottle.modifiers.new('Decimate', 'DECIMATE')
    decimate.decimate_type = 'COLLAPSE'
    decimate.ratio = min(1.0, TARGET_TRIS / max(1, before))
    decimate.vertex_group = 'decimate'
    decimate.use_collapse_triangulate = True
    kit.set_origin(bottle, (0.0, 0.0, NECK_Z))
    kit.report([bottle])
    print('  was', before, 'tris; size', tuple(round(v, 3) for v in bottle.dimensions))
    return [bottle]


if __name__ == '__main__':
    OBJECTS = main()
    if bpy.app.background:
        kit.save_and_export(NAME, OBJECTS)
