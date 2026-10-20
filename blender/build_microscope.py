"""
Generates microscope.glb: the lab's monocular microscope on the workbench,
after photos of a 1960s-70s Olympus student microscope -- black enamel and
chrome, about 33 cm tall.

From the bench up: a horseshoe foot, open at the front; a pillar with the
tilt joint and its chrome knob; the C-shaped arm, curving back and over to the
focus block, with a big coarse-focus knob and a small fine-focus knob each
side; the black body tube with a chrome eyepiece; the revolving nosepiece and
its three objectives, each with its coloured band; the square stage with two
spring clips, the iris diaphragm under it, and the round mirror on its fork
below that, catching the light up through the stage.

A slide is under the clips (build_glass_slides.add_slide) -- whoever was
looking at it left it there.

No maker's name, on purpose: the serial number on the tube is all there is.

Axes: built with its front -- the stage, the objectives -- toward Blender -Y
and the arm behind, origin at the middle of the foot's underside. The glTF
Y-up conversion stands it on y = 0 facing +Z.

Run headless: blender --background --python blender/build_microscope.py
"""

import sys
import os
import math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from common import add_box, add_cylinder, add_band, add_ring  # noqa: E402
import build_glass_slides as slides  # noqa: E402

# The optical axis: the tube, the objective in use, the stage's hole and the mirror all sit on it.
AXIS_Y = -0.012
FOOT = {'outer': 0.068, 'inner': 0.036, 'height': 0.022, 'centre_y': 0.012, 'stretch_y': 1.12}
PILLAR = {'y': 0.045, 'top': 0.1}
TILT_JOINT = (0.045, 0.1)          # y, z
STAGE = {'size': 0.11, 'centre_y': -0.015, 'bottom': 0.13, 'thickness': 0.008}
FOCUS_AXIS = (0.017, 0.245)        # y, z of the coarse knobs
FINE_AXIS = (0.017, 0.212)
TUBE = {'radius': 0.016, 'bottom': 0.194, 'top': 0.3}
NOSEPIECE_Z = 0.186
MIRROR_Z = 0.064

# The arm's spine, in the YZ plane, from the tilt joint round to the focus block.
ARM_PATH = ((0.045, 0.1), (0.07, 0.13), (0.085, 0.17), (0.086, 0.21), (0.072, 0.245), (0.048, 0.267), (0.024, 0.27))
ARM_HALF = (0.014, 0.016)          # across (x), and through the curve

BLACK = (0.012, 0.012, 0.013)
CHROME = (0.8, 0.8, 0.82)
FONTS = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
PRINT_FONT = os.path.join(FONTS, 'arial.ttf')


def add_swept_bar(bm, path, half_x, half_n, samples=6):
    """
    A bar of rectangular section swept along a path in the YZ plane: the
    microscope's arm. The section stays square to the path as it curves.
    """
    pts = common.catmull_rom([Vector((0, y, z)) for y, z in path], samples)
    rings = []
    for i, p in enumerate(pts):
        tangent = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        normal = Vector((1, 0, 0)).cross(tangent).normalized()
        across = Vector((1, 0, 0))
        rings.append([bm.verts.new(p + across * sx * half_x + normal * sn * half_n)
                      for sx, sn in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    for a, b in zip(rings, rings[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def build_black_parts():
    """Everything in black enamel: foot, pillar, arm, stage, focus block, tube, collars."""
    bm = bmesh.new()
    # The horseshoe foot, open to the front (-Y), stretched a little front to back.
    foot = Matrix.Translation((0, FOOT['centre_y'], FOOT['height'] / 2)) @ Matrix.Diagonal((1, FOOT['stretch_y'], 1, 1))
    add_band(bm, FOOT['inner'], FOOT['outer'], FOOT['height'], segments=40, transform=foot,
             arc=(math.radians(-58), math.radians(238)))
    add_box(bm, (0, PILLAR['y'], (FOOT['height'] + PILLAR['top']) / 2), (0.034, 0.03, PILLAR['top'] - FOOT['height']))
    add_cylinder(bm, (0, *TILT_JOINT), 0.014, 0.05, 'X', 20)
    add_swept_bar(bm, ARM_PATH, *ARM_HALF)
    # The stage, and the bracket that carries it off the arm.
    s = STAGE
    add_box(bm, (0, s['centre_y'], s['bottom'] + s['thickness'] / 2), (s['size'], s['size'], s['thickness']))
    add_box(bm, (0, 0.05, s['bottom'] - 0.004), (0.03, 0.04, 0.02))
    # The focus block the tube slides in, between the arm's end and the tube.
    add_box(bm, (0, 0.017, 0.233), (0.03, 0.026, 0.07))
    # The body tube, its collar, and the nosepiece's top.
    add_cylinder(bm, (0, AXIS_Y, (TUBE['bottom'] + TUBE['top']) / 2), TUBE['radius'], TUBE['top'] - TUBE['bottom'], 'Z', 32)
    add_cylinder(bm, (0, AXIS_Y, TUBE['top'] + 0.004), 0.0185, 0.008, 'Z', 32)
    add_cylinder(bm, (0, AXIS_Y, 0.343), 0.0135, 0.004, 'Z', 32)
    # The iris diaphragm under the stage.
    add_cylinder(bm, (0, AXIS_Y, s['bottom'] - 0.008), 0.019, 0.012, 'Z', 28)
    # The mirror's fork, off the front of the pillar.
    add_box(bm, (0, 0.016, MIRROR_Z + 0.004), (0.006, 0.032, 0.006))
    for sx in (-1, 1):
        add_box(bm, (sx * 0.025, AXIS_Y + 0.002, MIRROR_Z), (0.004, 0.006, 0.012))
    add_box(bm, (0, AXIS_Y + 0.02, MIRROR_Z + 0.004), (0.054, 0.006, 0.005))
    return bm


def build_chrome_parts():
    """Everything bright: knobs, the tilt knob, the eyepiece, the nosepiece rim, the objectives, the clips."""
    bm = bmesh.new()
    for sx in (-1, 1):
        # Coarse focus: a big knurled knob; fine focus below it, smaller.
        add_cylinder(bm, (sx * 0.031, *FOCUS_AXIS), 0.019, 0.011, 'X', 32)
        add_ring(bm, (sx * 0.031, *FOCUS_AXIS), 0.019, 0.0016, 'X', 32, 6)
        add_cylinder(bm, (sx * 0.024, *FINE_AXIS), 0.011, 0.011, 'X', 24)
        add_cylinder(bm, (sx * 0.028, *TILT_JOINT), 0.009, 0.006, 'X', 20)
        # The side plates on the focus block.
        add_box(bm, (sx * 0.0155, 0.017, 0.233), (0.0012, 0.022, 0.058))
        # The stage clips: a post and a sprung strip toward the axis.
        add_cylinder(bm, (sx * 0.03, STAGE['centre_y'] + 0.03, STAGE['bottom'] + STAGE['thickness'] + 0.003), 0.003, 0.006, 'Z', 12)
        clip = Matrix.Translation((sx * 0.026, STAGE['centre_y'] + 0.008, STAGE['bottom'] + STAGE['thickness'] + 0.0035)) \
            @ Matrix.Rotation(sx * math.radians(12), 4, 'Z')
        add_box(bm, (0, 0, 0), (0.005, 0.045, 0.0008), transform=clip)
    add_cylinder(bm, (0, AXIS_Y, 0.324), 0.0125, 0.04, 'Z', 32)
    # The revolving nosepiece, tipped toward the front, and its three objectives.
    nose = Matrix.Translation((0, AXIS_Y + 0.004, NOSEPIECE_Z)) @ Matrix.Rotation(math.radians(-14), 4, 'X')
    add_cylinder(bm, (0, 0, 0), 0.027, 0.01, 'Z', 40, transform=nose)
    for angle, length in ((0, 0.026), (2.2, 0.02), (4.1, 0.032)):
        place = nose @ Matrix.Rotation(angle, 4, 'Z') @ Matrix.Translation((0, -0.012, -0.005)) \
            @ Matrix.Rotation(math.radians(14), 4, 'X')
        add_cylinder(bm, (0, 0, -length / 2), 0.0068, length, 'Z', 20, radius2=0.0058, transform=place)
    # The mirror's rim.
    mirror = Matrix.Translation((0, AXIS_Y, MIRROR_Z)) @ Matrix.Rotation(math.radians(28), 4, 'X')
    add_ring(bm, (0, 0, 0), 0.021, 0.0025, 'Z', 40, 8, transform=mirror)
    return bm


def build_bands():
    """The coloured band round each objective -- its power -- and the eyepiece's lens."""
    bands = {'red': bmesh.new(), 'yellow': bmesh.new(), 'blue': bmesh.new()}
    nose = Matrix.Translation((0, AXIS_Y + 0.004, NOSEPIECE_Z)) @ Matrix.Rotation(math.radians(-14), 4, 'X')
    for (angle, length), colour in zip(((0, 0.026), (2.2, 0.02), (4.1, 0.032)), ('yellow', 'red', 'blue')):
        place = nose @ Matrix.Rotation(angle, 4, 'Z') @ Matrix.Translation((0, -0.012, -0.005)) \
            @ Matrix.Rotation(math.radians(14), 4, 'X')
        add_cylinder(bands[colour], (0, 0, -length * 0.35), 0.0071, 0.003, 'Z', 20, transform=place)
    return bands


def build_dark_glass():
    """The eyepiece's lens, the stage's hole, and the mirror's face."""
    lens, mirror = bmesh.new(), bmesh.new()
    add_cylinder(lens, (0, AXIS_Y, 0.3448), 0.009, 0.001, 'Z', 24)
    add_cylinder(lens, (0, AXIS_Y, STAGE['bottom'] + STAGE['thickness'] + 0.00005), 0.008, 0.0002, 'Z', 24)
    face = Matrix.Translation((0, AXIS_Y, MIRROR_Z)) @ Matrix.Rotation(math.radians(28), 4, 'X')
    add_cylinder(mirror, (0, 0, 0), 0.0205, 0.003, 'Z', 40, transform=face)
    return lens, mirror


def build():
    common.clear_scene()
    black = common.make_material('MicroscopeEnamel', BLACK, roughness=0.28)
    chrome = common.make_material('MicroscopeChrome', CHROME, roughness=0.18, metallic=1.0)
    lens_mat = common.make_material('MicroscopeLens', (0.02, 0.025, 0.03), roughness=0.05)
    mirror_mat = common.make_material('MicroscopeMirror', (0.85, 0.87, 0.9), roughness=0.05, metallic=1.0)
    band_mats = {'red': (0.6, 0.06, 0.05), 'yellow': (0.75, 0.55, 0.08), 'blue': (0.1, 0.2, 0.55)}
    print_mat = common.make_material('MicroscopePrint', (0.85, 0.85, 0.85), roughness=0.5)

    body = common.new_object('MicroscopeBody', build_black_parts(), black)
    for p in body.data.polygons:
        p.use_smooth = False
    common.new_object('MicroscopeChrome', build_chrome_parts(), chrome)
    for colour, bm in build_bands().items():
        common.new_object(f'MicroscopeBand_{colour}', bm, common.make_material(f'MicroscopeBand_{colour}', band_mats[colour], roughness=0.4))
    lens, mirror = build_dark_glass()
    common.new_object('MicroscopeLens', lens, lens_mat)
    common.new_object('MicroscopeMirror', mirror, mirror_mat)
    # The serial number on the tube, facing the front.
    common.make_text_mesh('MicroscopeSerial', '14207', print_mat, 0.005, PRINT_FONT,
                          location=(0, AXIS_Y - TUBE['radius'] - 0.0003, 0.262), rotation=(math.pi / 2, 0, 0))

    # The slide left under the clips, across the stage, its smear over the hole.
    mats = slides.make_materials()
    parts = {key: bmesh.new() for key in ('glass', 'frost', 'tissue')}
    on_stage = Matrix.Translation((-0.005, AXIS_Y, STAGE['bottom'] + STAGE['thickness']))
    slides.add_slide(parts, on_stage, seed=14)
    slides.label_slide('StageSlideLabel', 'S14 / 1', mats['ink'], on_stage)
    slides.new_slide_objects('StageSlide', parts, mats)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'microscope.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
