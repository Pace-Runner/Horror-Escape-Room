"""
Generates cassette_stack.glb: the lab's earlier session tapes, stacked in
their cases on the CCTV desk behind the deck -- SESSION 1 at the bottom up to
SESSION 13 on top. Session 14 is the one still in the recorder on the floor,
and that gap is the point of the prop.

Each case shows its spine to the room: the card inside it through the clear
plastic, ruled in red, with a label in the same marker hand as the tape in
the recorder. They are stacked by hand, so no two sit quite square.

Axes: the stack stands on Blender's XY plane with the spines toward -Y (the
model's front), origin at the middle of its footprint. The glTF Y-up
conversion stands that on y = 0 facing +Z.

Run headless: blender --background --python blender/build_cassette_stack.py
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
# A compact cassette case, lying flat: length, depth (spine to back), thickness.
CASE_SIZE = (0.11, 0.069, 0.017)
# How untidily they are stacked: the most a case strays from the one below.
JITTER_IN_METRES = 0.004
JITTER_IN_RADIANS = math.radians(3.5)
# Seeded so the stack comes out the same shape on every build.
STACK_SEED = 14

SPINE_Y = -CASE_SIZE[1] / 2
FONTS = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
HAND_FONT = os.path.join(FONTS, 'Inkfree.ttf')
# The same marker as build_audio_cassette.py's label.
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
    """One case: the clear shell, the card's spine behind it, and the red rule along the card."""
    length, depth, thickness = CASE_SIZE
    add_box(parts['shell'], (0, 0, thickness / 2), CASE_SIZE, transform=transform)
    spine_face = SPINE_Y - 0.0003
    add_box(parts['card'], (0, spine_face, thickness / 2), (length - 0.006, 0.0006, thickness - 0.004),
            transform=transform)
    add_box(parts['rule'], (0, spine_face - 0.0002, thickness - 0.0042), (length - 0.012, 0.0004, 0.0005),
            transform=transform)


def build():
    common.clear_scene()
    shell_mat = common.make_material('CassetteCaseShell', (0.32, 0.34, 0.36), roughness=0.12)
    card_mat = common.make_material('CassetteCaseCard', (0.84, 0.81, 0.72), roughness=0.8)
    rule_mat = common.make_material('CassetteCaseRule', (0.62, 0.12, 0.1), roughness=0.8)
    ink_mat = common.make_material('CassetteCaseInk', (0.04, 0.05, 0.11), roughness=0.7)

    parts = {name: bmesh.new() for name in ('shell', 'card', 'rule')}
    rng = random.Random(STACK_SEED)
    transforms = [case_transform(i, rng) for i in range(TAPE_COUNT)]
    for transform in transforms:
        add_case(parts, transform)

    shell = common.new_object('CassetteCaseShells', parts['shell'], shell_mat)
    bevel = shell.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.0012
    bevel.segments = 1
    common.new_object('CassetteCaseCards', parts['card'], card_mat)
    common.new_object('CassetteCaseRules', parts['rule'], rule_mat)

    # Lettering per case, placed in the case's own frame and carried by its transform.
    for i, transform in enumerate(transforms):
        obj = common.make_text_mesh(f'CassetteCaseLabel{i + 1}', f'SESSION {i + 1}', ink_mat, 0.0082, HAND_FONT,
                                    location=(-0.004, SPINE_Y - 0.0008, CASE_SIZE[2] / 2 - 0.0008),
                                    rotation=ON_SPINE, weight=MARKER_WEIGHT, resolution=2)
        # matrix_basis, not matrix_world: the world matrix is not computed
        # until the depsgraph next updates, so composing with it here would
        # throw away the location and turn just given to the lettering.
        obj.matrix_basis = transform @ obj.matrix_basis

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'cassette_stack.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
