"""
Generates video8_tape_stack.glb: the lab's earlier session tapes, stacked in
their cases on the CCTV desk beside the deck -- SESSION 1 at the bottom up to
SESSION 13 on top. Session 14 is the one still in the camcorder on the floor,
and that gap is the point of the prop.

Each case shows its spine to the room: the format's blue-and-white sleeve
through the plastic, and a label in the same marker hand as the tape in the
camcorder. They are stacked by hand, so no two sit quite square.

Axes: the stack stands on Blender's XY plane with the spines toward -Y (the
model's front), origin at the middle of its footprint. The glTF Y-up
conversion stands that on y = 0 facing +Z.

Run headless: blender --background --python blender/build_video8_tape_stack.py
"""

import sys
import os
import math
import random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix  # noqa: E402
from common import add_box  # noqa: E402

TAPE_COUNT = 13
# A Video8 library case, lying flat: length, depth (spine to back), thickness.
CASE_SIZE = (0.106, 0.072, 0.021)
# How untidily they are stacked: the most a case strays from the one below.
JITTER_IN_METRES = 0.004
JITTER_IN_RADIANS = math.radians(3.5)
# Seeded so the stack comes out the same shape on every build.
STACK_SEED = 14

SPINE_Y = -CASE_SIZE[1] / 2
FONTS = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
HAND_FONT = os.path.join(FONTS, 'Inkfree.ttf')
LOGO_FONT = os.path.join(FONTS, 'arialbi.ttf')
# The same marker as build_video8_cassette.py's label.
MARKER_WEIGHT = 0.00022
# Lettering on a spine stands up in the XZ plane facing -Y.
ON_SPINE = (math.pi / 2, 0, 0)


def case_transform(index, rng):
    """Where case `index` (0 at the bottom) lies: lifted onto the one below, nudged and turned a little."""
    z = index * CASE_SIZE[2]
    dx = rng.uniform(-JITTER_IN_METRES, JITTER_IN_METRES)
    dy = rng.uniform(-JITTER_IN_METRES, JITTER_IN_METRES) * 0.6
    turn = rng.uniform(-JITTER_IN_RADIANS, JITTER_IN_RADIANS)
    return Matrix.Translation((dx, dy, z)) @ Matrix.Rotation(turn, 4, 'Z')


def add_case(parts, transform):
    """One case: the shell, the sleeve's spine with its blue band, and the paper label."""
    length, depth, thickness = CASE_SIZE
    add_box(parts['shell'], (0, 0, thickness / 2), CASE_SIZE, transform=transform)
    spine_face = SPINE_Y - 0.0003
    add_box(parts['sleeve'], (0.008, spine_face, thickness / 2), (length - 0.022, 0.0006, thickness - 0.005),
            transform=transform)
    add_box(parts['band'], (-length / 2 + 0.013, spine_face, thickness / 2), (0.016, 0.0006, thickness - 0.005),
            transform=transform)


def build():
    common.clear_scene()
    shell_mat = common.make_material('TapeCaseShell', (0.05, 0.052, 0.058), roughness=0.18)
    sleeve_mat = common.make_material('TapeCaseSleeve', (0.82, 0.82, 0.8), roughness=0.75)
    band_mat = common.make_material('TapeCaseBand', (0.08, 0.17, 0.48), roughness=0.6)
    ink_mat = common.make_material('TapeCaseInk', (0.04, 0.05, 0.11), roughness=0.7)
    print_mat = common.make_material('TapeCasePrint', (0.85, 0.86, 0.9), roughness=0.5)

    parts = {name: bmesh.new() for name in ('shell', 'sleeve', 'band')}
    rng = random.Random(STACK_SEED)
    transforms = [case_transform(i, rng) for i in range(TAPE_COUNT)]
    for transform in transforms:
        add_case(parts, transform)

    shell = common.new_object('TapeCaseShells', parts['shell'], shell_mat)
    bevel = shell.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.0012
    bevel.segments = 1
    common.new_object('TapeCaseSleeves', parts['sleeve'], sleeve_mat)
    common.new_object('TapeCaseBands', parts['band'], band_mat)

    # Lettering per case, placed in the case's own frame and carried by its transform.
    for i, transform in enumerate(transforms):
        spine = SPINE_Y - 0.0008
        mid = CASE_SIZE[2] / 2
        for name, text, mat, size, font, x, weight in (
            (f'TapeCaseLabel{i + 1}', f'SESSION {i + 1}', ink_mat, 0.0085, HAND_FONT, 0.009, MARKER_WEIGHT),
            (f'TapeCaseBandMark{i + 1}', '8', print_mat, 0.009, LOGO_FONT, -CASE_SIZE[0] / 2 + 0.013, 0.0),
        ):
            obj = common.make_text_mesh(name, text, mat, size, font, location=(x, spine, mid),
                                        rotation=ON_SPINE, weight=weight, resolution=2)
            # matrix_basis, not matrix_world: the world matrix is not computed
            # until the depsgraph next updates, so composing with it here
            # threw away the location and turn just given to the lettering.
            obj.matrix_basis = transform @ obj.matrix_basis

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'video8_tape_stack.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
