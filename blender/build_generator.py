"""
Generates generator.glb: the enclosed diesel standby generator in the corner
of the Level 2 basement lab.

After a photo of an enclosed generating set, made right for the game's
1980s: a sheet-steel cabinet of screwed panels, a latched access door down
the long side, louvred vents, and a steel skid with forklift pockets
underneath rather than the photo's caster wheels. The control panel is on
the end that faces the room, laid out for 1980s hardware -- three analogue
gauges in a row, a pilot lamp over each control, and the controls
themselves in a row under them.

What is NOT in here, because the level drives it:

  * the gauge faces and needles, which rise when the engine runs;
  * the pilot lamps, the fuel valve lever, the primer plunger and the
    pull-start handle and rope, which the puzzle moves and lights;
  * the exhaust hose and wall vent, which depend on where the room's walls
    are;
  * every click target -- Interaction raycasts non-recursively, so nothing
    inside a loaded .glb can be hit.

This model supplies the mounting each of those sits on: gauge bezels, lamp
sockets, the valve's boss, the primer's housing, and the cup the pull handle
rests in with the grommet its rope comes out of. The level's GENERATOR_*
constants mirror the positions below.

Axes: the cabinet's length runs along X with the control panel on the +X
end, and its door side faces Blender -Y. The origin is the centre of the
skid's underside. After the glTF Y-up conversion the door side faces +Z and
the panel +X, which is exactly how the generator stands in the lab, so the
level places it without turning it.

Run headless: blender --background --python blender/build_generator.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bmesh  # noqa: E402
from common import add_box, add_cylinder  # noqa: E402

PAINT = (0.06, 0.2, 0.19)       # teal-green; the level swaps in a worn painted-steel texture
PANEL = (0.03, 0.035, 0.035)    # the control panel's dark face
SKID = (0.04, 0.04, 0.042)
STEEL = (0.45, 0.46, 0.46)
BLACK = (0.015, 0.015, 0.015)

LENGTH, DEPTH = 1.0, 0.7
SKID_H = 0.07
TOP = 0.85
FRONT_Y = -DEPTH / 2            # the door side
END_X = LENGTH / 2              # the control panel end

# The control panel on the +X end, in Blender coordinates (y across, z up).
# glTF z is -y here, so slot y = -0.18 is glTF z = +0.18 -- the room side.
PANEL_Y = (-0.31, 0.31)
PANEL_Z = (0.18, 0.80)
CONTROL_Y = (-0.18, 0.0, 0.18)  # fuel valve, primer, starter
GAUGE_Z = 0.70
LAMP_Z = 0.60
CONTROL_Z = 0.50

EXHAUST = (-0.2, 0.2)           # roof outlet, x and y
CABLE_GLAND = (-0.27, 0.35)     # on the -X end: y and z


def build_cabinet():
    bm = bmesh.new()
    add_box(bm, (0, 0, (SKID_H + TOP) / 2), (LENGTH, DEPTH, TOP - SKID_H))
    return bm


def build_paint_details():
    """The door, its surround and the louvre slats, all in the cabinet's paint."""
    bm = bmesh.new()
    # The access door, standing just proud of the side.
    add_box(bm, (0.185, FRONT_Y - 0.003, 0.465), (0.47, 0.006, 0.67))
    # Louvres: a stack of slats on the door side's left-hand panel...
    for i in range(9):
        add_box(bm, (-0.27, FRONT_Y - 0.008, 0.48 + i * 0.034), (0.26, 0.01, 0.012))
    # ...a small one up on the door side's right, as on the photo...
    for i in range(5):
        add_box(bm, (0.455, FRONT_Y - 0.006, 0.62 + i * 0.03), (0.04, 0.008, 0.01))
    # ...and an intake grille low on the panel end.
    for i in range(3):
        add_box(bm, (END_X + 0.006, 0, 0.1 + i * 0.027), (0.01, 0.5, 0.01))
    return bm


def build_black():
    """Everything near-black: louvre backings, door seam, latch, sockets, cup."""
    bm = bmesh.new()
    add_box(bm, (-0.27, FRONT_Y - 0.0015, 0.616), (0.28, 0.003, 0.32))
    add_box(bm, (0.455, FRONT_Y - 0.0015, 0.68), (0.05, 0.003, 0.16))
    add_box(bm, (END_X + 0.0015, 0, 0.127), (0.003, 0.52, 0.08))
    # The seam round the door: a dark frame a few millimetres wider than it.
    add_box(bm, (0.185, FRONT_Y - 0.0012, 0.465), (0.486, 0.0024, 0.686))
    # The door's latch handle.
    add_box(bm, (-0.025, FRONT_Y - 0.012, 0.46), (0.03, 0.014, 0.075))
    # Forklift pockets in the skid's front and back rails.
    for y in (FRONT_Y + 0.02, -FRONT_Y - 0.02):
        for x in (-0.26, 0.26):
            add_box(bm, (x, y + (-0.0225 if y < 0 else 0.0225), 0.035), (0.13, 0.002, 0.04))
    # The control panel's sockets: gauge bezels, lamp holders, the primer's
    # housing, and the cup the pull handle sits in with its rope's grommet.
    face_x = END_X + 0.004
    for y in CONTROL_Y:
        add_cylinder(bm, (face_x + 0.006, y, GAUGE_Z), 0.05, 0.012, 'X', 24)
        add_cylinder(bm, (face_x + 0.004, y, LAMP_Z), 0.014, 0.008, 'X', 12)
    add_cylinder(bm, (face_x + 0.01, CONTROL_Y[1], CONTROL_Z), 0.03, 0.02, 'X', 16)
    add_box(bm, (face_x + 0.005, CONTROL_Y[2], CONTROL_Z), (0.01, 0.13, 0.06))
    add_cylinder(bm, (face_x + 0.011, CONTROL_Y[2], CONTROL_Z), 0.012, 0.004, 'X', 12)
    # Where the feed to the fuse box leaves the cabinet.
    add_cylinder(bm, (-END_X - 0.012, CABLE_GLAND[0], CABLE_GLAND[1]), 0.022, 0.024, 'X', 12)
    return bm


def build_panel():
    bm = bmesh.new()
    add_box(bm, (END_X + 0.002, sum(PANEL_Y) / 2, sum(PANEL_Z) / 2),
            (0.004, PANEL_Y[1] - PANEL_Y[0], PANEL_Z[1] - PANEL_Z[0]))
    return bm


def build_steel():
    bm = bmesh.new()
    # Door hinges on its right-hand edge.
    for z in (0.25, 0.68):
        add_box(bm, (0.425, FRONT_Y - 0.009, z), (0.018, 0.012, 0.05))
    # Panel screws: four on the louvre panel, four on the control panel.
    for x, z in ((-0.4, 0.46), (-0.14, 0.46), (-0.4, 0.77), (-0.14, 0.77)):
        add_cylinder(bm, (x, FRONT_Y - 0.002, z), 0.006, 0.004, 'Y', 10)
    for y, z in ((PANEL_Y[0] + 0.02, PANEL_Z[0] + 0.02), (PANEL_Y[1] - 0.02, PANEL_Z[0] + 0.02),
                 (PANEL_Y[0] + 0.02, PANEL_Z[1] - 0.02), (PANEL_Y[1] - 0.02, PANEL_Z[1] - 0.02)):
        add_cylinder(bm, (END_X + 0.006, y, z), 0.006, 0.004, 'X', 10)
    # The fuel valve's boss.
    add_cylinder(bm, (END_X + 0.009, CONTROL_Y[0], CONTROL_Z), 0.024, 0.01, 'X', 16)
    # The roof: the exhaust outlet on its flange, and the radiator filler cap.
    add_cylinder(bm, (EXHAUST[0], EXHAUST[1], TOP + 0.005), 0.06, 0.01, 'Z', 20)
    add_cylinder(bm, (EXHAUST[0], EXHAUST[1], TOP + 0.04), 0.036, 0.07, 'Z', 20)
    add_cylinder(bm, (0.3, 0.0, TOP + 0.015), 0.04, 0.03, 'Z', 20)
    # Lifting eyes at the corners of the roof.
    for x in (-0.44, 0.44):
        add_box(bm, (x, 0, TOP + 0.02), (0.012, 0.05, 0.04))
    return bm


def build_skid():
    bm = bmesh.new()
    for y in (FRONT_Y + 0.02, -FRONT_Y - 0.02):
        add_box(bm, (0, y, SKID_H / 2), (LENGTH + 0.04, 0.045, SKID_H))
    for x in (-0.45, 0.0, 0.45):
        add_box(bm, (x, 0, SKID_H / 2), (0.06, DEPTH - 0.04, SKID_H - 0.01))
    return bm


def build():
    common.clear_scene()
    paint = common.make_material('GenPaint', PAINT, roughness=0.6, metallic=0.3)
    panel = common.make_material('GenPanel', PANEL, roughness=0.6)
    skid = common.make_material('GenSkid', SKID, roughness=0.7, metallic=0.5)
    steel = common.make_material('GenSteel', STEEL, roughness=0.4, metallic=0.85)
    black = common.make_material('GenBlack', BLACK, roughness=0.6)

    cabinet = common.new_object('GenCabinet', build_cabinet(), paint)
    bevel = cabinet.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.012
    bevel.segments = 3
    common.new_object('GenPaintDetails', build_paint_details(), paint)
    common.new_object('GenBlackParts', build_black(), black)
    common.new_object('GenPanelFace', build_panel(), panel)
    steel_obj = common.new_object('GenSteelParts', build_steel(), steel)
    for p in steel_obj.data.polygons:
        p.use_smooth = True
    common.new_object('GenSkid', build_skid(), skid)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'generator.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
