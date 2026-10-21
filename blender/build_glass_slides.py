"""
Generates glass_slides.glb: three microscope slides left lying on the lab's
workbench beside the microscope -- tissue samples, labelled in the same marker
as the session tapes. One has been snapped in two.

A slide is a strip of glass, 75 x 25 x 1 mm, with a frosted end to write on
and, in the middle, a smear of tissue stained dark under a square cover glass.

add_slide() is shared with build_microscope.py, which puts a fourth slide
under the microscope's stage clips.

Axes: lying on Blender's XY plane, origin at the middle of the group's
footprint on the bench. The glTF Y-up conversion lays that on y = 0.

Run headless: blender --background --python blender/build_glass_slides.py
"""

import sys
import os
import math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix  # noqa: E402
from common import add_box, add_blob  # noqa: E402

SLIDE = (0.075, 0.025, 0.0011)
# The frosted end, written on: how far it reaches along the slide.
FROSTED_LENGTH = 0.019
COVER_GLASS = 0.02
FONTS = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
HAND_FONT = os.path.join(FONTS, 'Inkfree.ttf')
MARKER_WEIGHT = 0.00012

# The three on the bench: where each lies (x, y), how it is turned, what is
# written on it, and whether it is the broken one.
SCATTER = (
    ((-0.035, 0.03), math.radians(14), 'S14 / 3', False),
    ((0.02, -0.012), math.radians(-27), 'S14 / 5', False),
    ((-0.012, -0.055), math.radians(62), 'S14 / 6', True),
)


def make_materials():
    glass = common.make_material('SlideGlass', (0.62, 0.72, 0.7), roughness=0.05)
    bsdf = glass.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Alpha'].default_value = 0.3
    if hasattr(glass, 'surface_render_method'):
        glass.surface_render_method = 'BLENDED'
    return {
        'glass': glass,
        'frost': common.make_material('SlideFrost', (0.82, 0.83, 0.82), roughness=0.9),
        # Stained near black, with the red of the stain at its edges.
        'tissue': common.make_material('SlideTissue', (0.3, 0.02, 0.09), roughness=0.4),
        'ink': common.make_material('SlideInk', (0.04, 0.05, 0.11), roughness=0.7),
    }


def add_slide(parts, transform, seed, broken=False):
    """
    One slide into `parts` (bmeshes keyed glass, frost, tissue), placed by
    `transform` from its own frame: length along X, frosted end toward -X,
    lying on z = 0. A broken one is in two pieces, the far piece knocked
    askew.
    """
    length, width, thickness = SLIDE
    z = thickness / 2
    pieces = [(-length / 2, length / 2, Matrix.Identity(4))]
    if broken:
        snap = 0.012
        pieces = [(-length / 2, snap, Matrix.Identity(4)),
                  (snap + 0.0015, length / 2,
                   Matrix.Translation((0.004, 0.003, 0)) @ Matrix.Rotation(math.radians(9), 4, 'Z'))]
    for x0, x1, nudge in pieces:
        add_box(parts['glass'], ((x0 + x1) / 2, 0, z), (x1 - x0, width, thickness), transform=transform @ nudge)
    add_box(parts['frost'], (-length / 2 + FROSTED_LENGTH / 2, 0, thickness + 0.00005),
            (FROSTED_LENGTH, width - 0.001, 0.0001), transform=transform)
    # The smear, and the cover glass over it.
    before = set(parts['tissue'].faces)
    add_blob(parts['tissue'], (0.005, 0, thickness + 0.00008), 0.0065, seed, points=18, wobble=0.5,
             stretch=(1.25, 0.8), transform=transform)
    # One flat face, wound whichever way its points came: turned to face up,
    # or only its back -- culled -- would be under the cover glass.
    for face in parts['tissue'].faces:
        if face not in before:
            face.normal_update()
            if face.normal.z < 0:
                face.normal_flip()
    add_box(parts['glass'], (0.005, 0, thickness + 0.0002), (COVER_GLASS, COVER_GLASS, 0.0002), transform=transform)


def label_slide(name, text, ink_mat, transform):
    """The marker on the frosted end, read along the slide."""
    obj = common.make_text_mesh(name, text, ink_mat, 0.0042, HAND_FONT,
                                location=(-SLIDE[0] / 2 + FROSTED_LENGTH / 2, 0, SLIDE[2] + 0.00012),
                                rotation=(0, 0, math.pi / 2), weight=MARKER_WEIGHT, resolution=2)
    obj.matrix_basis = transform @ obj.matrix_basis
    return obj


def new_slide_objects(prefix, parts, mats):
    """Turns the bmeshes of add_slide() into objects; returns them."""
    objects = []
    for key in ('glass', 'frost', 'tissue'):
        objects.append(common.new_object(f'{prefix}{key.capitalize()}', parts[key], mats[key], uv_density=40))
    return objects


def build():
    common.clear_scene()
    mats = make_materials()
    parts = {key: bmesh.new() for key in ('glass', 'frost', 'tissue')}
    for i, ((x, y), turn, text, broken) in enumerate(SCATTER):
        transform = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(turn, 4, 'Z')
        add_slide(parts, transform, seed=31 + i, broken=broken)
        label_slide(f'SlideLabel{i + 1}', text, mats['ink'], transform)
    new_slide_objects('Slides', parts, mats)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'glass_slides.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
