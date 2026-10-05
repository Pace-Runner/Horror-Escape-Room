"""
Generates fuse.glb: one glass cartridge fuse (see glass_fuse.py), which the
level clones for each of the three loose fuses the player chooses between.

It carries the element twice: `FuseElementWire`, whole, and
`FuseElementWireBroken`, snapped in two. The level shows one or the other,
so a fuse that blows can be seen to have blown without a second model.

The rating is NOT in here. It is stamped onto the caps at runtime by a
canvas texture (createFuseCapStampTexture), because all three fuses are
this same model and only the stamp tells them apart.

Run headless: blender --background --python blender/build_fuse.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import glass_fuse  # noqa: E402


def build():
    common.clear_scene()
    materials = glass_fuse.make_materials()

    parts = glass_fuse.new_parts()
    glass_fuse.add_glass_fuse(parts, (0.0, 0.0, 0.0))
    glass_fuse.finish_objects('Fuse', parts, materials)

    broken = glass_fuse.new_parts()
    glass_fuse.add_glass_fuse(broken, (0.0, 0.0, 0.0), broken=True)
    # Only the snapped element is wanted from the second build; the caps,
    # glass and sleeves would just be a duplicate fuse in the same place.
    for key in ('cap', 'glass', 'end'):
        broken[key].free()
    wire = common.new_object('FuseElementWireBroken', broken['wire'], materials['wire'])
    for p in wire.data.polygons:
        p.use_smooth = True

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'fuse.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
