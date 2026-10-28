"""
The study's Chesterfield -- low cover in the open front half: crouch behind it.

    exec in the live Blender, or: blender --background --python blender/study/import_chesterfield.py

Writes blender/study/study_chesterfield.blend and src/assets/models/study/study_chesterfield.glb.

THE SOURCE is a library model, not a script: "Sofa 02" by Kirill Sannikov on
Poly Haven, CC0 -- a button-tufted black leather sofa on a carved frame, 2.7k
triangles. Kiran picked it over Sofa 03 and a scripted one. It is in
blender/source/sofa_02/ as downloaded (SOURCE.md says how); this script owns
everything done to it, so the GLB stays a build artefact:

  * its seat and base joined into one mesh, turned to face +Y (the game's -Z);
  * SCALED UP to 0.9 m tall. It is a low-backed sofa (0.71 m), and low cover
    has to hide the point of a crouching Mark she would see -- 0.85 m up
    (StudySeeker's SEEN_BELOW_EYE). At 0.9 m it is a large Chesterfield,
    2.3 x 1.0 m, which studyHideProps.js takes as its collider and cover box;
  * its own colour and roughness maps kept at 512 px, the normal and metallic
    maps dropped (no new shader variant, CLAUDE.md). The leather stays black:
    "Chesterfield leather" matches none of harmoniseAsset's keywords, so the
    room does not repaint it.
"""

import importlib
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hide_and_seek_kit as kit  # noqa: E402
importlib.reload(kit)

NAME = 'study_chesterfield'
SOURCE = os.path.join(kit.REPO, 'blender', 'source', 'sofa_02', 'sofa_02_polyhaven_1k.blend')
HEIGHT = 0.90


def main():
    kit.clear_scene()
    parts = kit.append_objects(SOURCE, {'sofa_02_Base', 'sofa_02_Seat'})
    source_material = parts[0].material_slots[0].material
    bm = kit.joined_bmesh(parts)
    for obj in parts:
        bpy.data.objects.remove(obj, do_unlink=True)
    # Downloaded facing -Y; the game wants +Y (its -Z).
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi, 3, 'Z'))
    zs = [v.co.z for v in bm.verts]
    scale = HEIGHT / (max(zs) - min(zs))
    bmesh.ops.scale(bm, vec=(scale, scale, scale), verts=bm.verts)
    kit.floor_and_centre(bm)
    for f in bm.faces:
        f.material_index = 0
    leather = kit.material(
        'Chesterfield leather', (1, 1, 1), roughness=0.6,
        image=kit.downscaled(kit.image_in(source_material, 'diff'), 512, 'Chesterfield diffuse 512'),
        roughness_image=kit.downscaled(kit.image_in(source_material, 'rough'), 512, 'Chesterfield roughness 512'))
    sofa = kit.mesh_object('Chesterfield', bm, [leather], uvs=False, smooth=None)
    kit.report([sofa])
    print('  size', tuple(round(v, 3) for v in sofa.dimensions))
    return [sofa]


if __name__ == '__main__':
    OBJECTS = main()
    if bpy.app.background:
        kit.save_and_export(NAME, OBJECTS)
