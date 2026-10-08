"""
Generates operating_table.glb: the restraint table in the Level 2 basement lab.

After a reference of a pedestal operating table -- a heavy plinth, one
column, and a padded top in three hinged sections with the head and leg ends
raised into a shallow V, steel grab handles at the sides -- with leather
restraints added from a second reference of a restraint bed.

The room is meant to say something went wrong here, and this is where it
went wrong:

  * the wrist strap on the near side was torn through. It hangs off the
    side of the table, its cuff gone;
  * the chest strap is snapped in the middle, one half still across the pad
    and the other hanging down the near side;
  * the far wrist cuff and both ankle cuffs have been unbuckled and lie
    open on the pad;
  * a dried stain on the pad runs over the near edge and down to a second
    one on the floor.

Axes: the table's length runs along X with the head end at -X, and its near
side -- the one with the torn restraints, which faces the lab entrance --
is Blender +Y, which glTF's Y-up conversion turns into -Z. The origin is the
floor under the column. The level's OPERATING_TABLE constants mirror the
dimensions below.

Run headless: blender --background --python blender/build_operating_table.py
"""

import sys
import os
import math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix  # noqa: E402
from common import add_box, add_cylinder, add_tube, add_blob  # noqa: E402

BASE = (0.42, 0.42, 0.40)       # the plinth: scuffed grey cast metal
STEEL = (0.5, 0.51, 0.5)
PAD = (0.045, 0.06, 0.055)      # dark green-grey vinyl
LEATHER = (0.085, 0.045, 0.022)
BUCKLE = (0.6, 0.55, 0.42)      # tarnished brass
LINING = (0.42, 0.39, 0.33)     # the cuffs' fleece, gone grubby
STAIN = (0.004, 0.0008, 0.0006)  # dried blood, almost black: a red edge only in direct light

BASE_SIZE = (0.9, 0.5, 0.15)
COLUMN_RADIUS = 0.085
FRAME_TOP = 0.785
TRAY_TOP = 0.80                 # the steel tray the pads sit on
TRAY_THICKNESS = 0.025
PAD_THICKNESS = 0.07
WIDTH = 0.56
PAD_TOP = TRAY_TOP + PAD_THICKNESS

# The three sections along X: (hinge, far end). The middle one is flat; the
# head and leg sections each tilt up about their hinge.
HEAD = (-0.45, -0.95)
MIDDLE = (-0.45, 0.25)
LEGS = (0.25, 0.95)
HEAD_TILT = math.radians(12)
LEG_TILT = math.radians(7)

NEAR = 1                        # Blender +Y: the torn side
RAIL_Y = WIDTH / 2 + 0.03


def section(hinge_x, end_x, tilt):
    """
    The frame of one hinged section: x runs from its hinge (0) toward its far
    end, z = 0 is the top of the tray. Building parts in this frame keeps
    straps and cuffs lying on a tilted pad without working out the slope of
    each one.
    """
    direction = 1 if end_x > hinge_x else -1
    # A positive turn about Y lifts the -X end, so the head (pointing -X)
    # takes the tilt as it is and the legs (pointing +X) take it negated.
    turn = Matrix.Rotation(-direction * tilt, 4, 'Y')
    flip = Matrix.Diagonal((direction, 1, 1, 1))
    return Matrix.Translation((hinge_x, 0, TRAY_TOP)) @ turn @ flip, abs(end_x - hinge_x)


SECTIONS = [section(*HEAD, HEAD_TILT), section(*MIDDLE, 0.0), section(*LEGS, LEG_TILT)]
MIDDLE_FRAME = SECTIONS[1][0]
LEG_FRAME, LEG_LENGTH = SECTIONS[2]


def build_base():
    bm = bmesh.new()
    add_box(bm, (0, 0, BASE_SIZE[2] / 2), BASE_SIZE)
    return bm


def build_steel_flat():
    """The flat-faced steel: frame, trays and rails. Kept apart from the round
    parts so it can be flat-shaded -- smoothing a box shades it like a pillow."""
    bm = bmesh.new()
    add_box(bm, (-0.1, 0, FRAME_TOP - 0.025), (0.62, 0.34, 0.05))
    # The tray under each pad section.
    for frame, length in SECTIONS:
        add_box(bm, (length / 2, 0, -TRAY_THICKNESS / 2), (length, WIDTH, TRAY_THICKNESS), transform=frame)
    # The side rails down the middle section, on stand-offs.
    mid_len = MIDDLE[1] - MIDDLE[0]
    for side in (-1, 1):
        add_box(bm, (mid_len / 2, side * RAIL_Y, 0.0), (mid_len - 0.04, 0.018, 0.018), transform=MIDDLE_FRAME)
        for u in (0.05, mid_len - 0.05):
            add_box(bm, (u, side * (WIDTH / 2 + 0.015), 0.0), (0.016, 0.03, 0.014), transform=MIDDLE_FRAME)
    return bm


def build_steel_round():
    bm = bmesh.new()
    # The column and its collar into the plinth.
    add_cylinder(bm, (0, 0, (BASE_SIZE[2] + FRAME_TOP) / 2), COLUMN_RADIUS, FRAME_TOP - BASE_SIZE[2], 'Z', 28)
    add_cylinder(bm, (0, 0, BASE_SIZE[2] + 0.015), COLUMN_RADIUS + 0.03, 0.03, 'Z', 28)
    # The grab handles: a hoop rising off each side rail, as on the
    # reference. The restraints are anchored to them.
    for side in (-1, 1):
        y = side * RAIL_Y
        add_tube(bm, [
            (MIDDLE[0] + 0.06, y, TRAY_TOP),
            (MIDDLE[0] + 0.08, y, PAD_TOP + 0.08),
            (MIDDLE[0] + 0.2, y, PAD_TOP + 0.11),
            (MIDDLE[0] + 0.32, y, PAD_TOP + 0.08),
            (MIDDLE[0] + 0.34, y, TRAY_TOP),
        ], radius=0.012, sides=10, samples_per_segment=4)
    return bm


def build_pads():
    bm = bmesh.new()
    for frame, length in SECTIONS:
        add_box(bm, (length / 2, 0, PAD_THICKNESS / 2), (length - 0.012, WIDTH - 0.02, PAD_THICKNESS), transform=frame)
    return bm


def strap_across(bm, frame, u, from_y, to_y, width=0.06, lift=0.004):
    """A strap lying over the top of a pad, from one y to another."""
    add_box(bm, (u, (from_y + to_y) / 2, PAD_THICKNESS + lift), (width, abs(to_y - from_y), 0.008), transform=frame)


def strap_down_side(bm, frame, u, side, bottom_z, width=0.06, swing=0.0):
    """A strap hanging off the pad's edge down to `bottom_z` (frame z)."""
    top = PAD_THICKNESS + 0.004
    length = top - bottom_z
    hang = (Matrix.Translation((u, side * (WIDTH / 2 + 0.006), top))
            @ Matrix.Rotation(side * swing, 4, 'X')
            @ Matrix.Translation((0, 0, -length / 2)))
    add_box(bm, (0, 0, 0), (width, 0.008, length), transform=frame @ hang)
    return frame @ hang @ Matrix.Translation((0, 0, -length / 2))


def frayed_end(bm, end_frame, width=0.06):
    """
    Ragged tongues of leather where a strap was torn rather than undone,
    hanging on past the strap's end along the frame's -Z.
    """
    tongues = ((-0.36, 0.035), (-0.12, 0.018), (0.12, 0.042), (0.36, 0.022))
    for across, drop in tongues:
        add_box(bm, (across * width, 0, -drop / 2), (width * 0.2, 0.007, drop), transform=end_frame)


# The cuffs that were NOT torn -- the far wrist and both ankles -- have been
# unbuckled and lie open: a C of leather standing on its edge with a pale
# fleece lining, the buckle hanging off one end and the strap's tongue
# splayed out from the other.
#
# They were solid leather cylinders once, which read as little brown barrels,
# and then closed loops buckled round nothing. Open, they say that someone
# undid them -- which, beside the wrist that was torn free, is the worse
# thought.
CUFF_INNER, CUFF_OUTER, CUFF_WIDTH = 0.038, 0.046, 0.055
LINING_INNER, LINING_OUTER, LINING_WIDTH = 0.031, 0.0375, 0.06
CUFF_MID = (CUFF_INNER + CUFF_OUTER) / 2
# Half the opening, either side of the cuff's local +X.
CUFF_GAP = math.radians(55)
# The ends spring outward once unbuckled, rather than carrying on round.
BUCKLE_SPLAY = math.radians(50)
TONGUE_SPLAY = math.radians(75)
TONGUE_LENGTH = 0.09

# (section frame, distance along the section, y, which way the opening faces)
# for every open cuff: the far wrist and both ankles.
OPEN_CUFFS = [
    (MIDDLE_FRAME, 0.2, -0.2, 0.5),
    (LEG_FRAME, LEG_LENGTH - 0.17, -0.12, -0.35),
    (LEG_FRAME, LEG_LENGTH - 0.17, 0.12, 0.4),
]


def cuff_frame(frame, u, y, turn):
    """The band's own frame: standing on the pad, axis up, opening toward its +X."""
    return (frame @ Matrix.Translation((u, y, PAD_THICKNESS + CUFF_WIDTH / 2 - 0.0015))
            @ Matrix.Rotation(turn, 4, 'Z'))


def end_frame(cuff, angle, heading):
    """
    A frame at one end of the band, at mid-thickness: X points the way the
    end carries on (`heading`, an angle in the cuff's plane), Z is up.
    """
    return (cuff @ Matrix.Translation((CUFF_MID * math.cos(angle), CUFF_MID * math.sin(angle), 0))
            @ Matrix.Rotation(heading, 4, 'Z'))


def buckle_frame(frame, u, y, turn):
    """Just past the band's +GAP end, the buckle's frame: X along the strap, Y through it."""
    # The tangent there runs toward the opening at GAP - 90 degrees; splayed out from it.
    return end_frame(cuff_frame(frame, u, y, turn), CUFF_GAP, CUFF_GAP - math.pi / 2 + BUCKLE_SPLAY)


def tongue_frame(frame, u, y, turn):
    return end_frame(cuff_frame(frame, u, y, turn), -CUFF_GAP, -CUFF_GAP + math.pi / 2 - TONGUE_SPLAY)


def cuff(bm, frame, u, y, turn):
    """The leather of one open cuff: the band, its loose tongue, and the tether."""
    common.add_band(bm, CUFF_INNER, CUFF_OUTER, CUFF_WIDTH, 22,
                    transform=cuff_frame(frame, u, y, turn), arc=(CUFF_GAP, 2 * math.pi - CUFF_GAP))
    # The tongue: the strap's free end, punched for the buckle, splayed out.
    add_box(bm, (TONGUE_LENGTH / 2, 0, 0), (TONGUE_LENGTH, CUFF_OUTER - CUFF_INNER, 0.04),
            transform=tongue_frame(frame, u, y, turn))
    # The short strip from the band to the buckle it carries.
    add_box(bm, (0.01, 0, 0), (0.024, CUFF_OUTER - CUFF_INNER, 0.04), transform=buckle_frame(frame, u, y, turn))
    # The short strap tying it down to the side of the table.
    side = 1 if y > 0 else -1
    reach = WIDTH / 2 - abs(y) + 0.02
    add_box(bm, (u, y + side * reach / 2, PAD_THICKNESS + 0.004), (0.04, reach, 0.006), transform=frame)


def build_lining():
    """The fleece inside each open cuff, standing a little proud of the leather at its top edge."""
    bm = bmesh.new()
    for frame, u, y, turn in OPEN_CUFFS:
        common.add_band(bm, LINING_INNER, LINING_OUTER, LINING_WIDTH, 22,
                        transform=cuff_frame(frame, u, y, turn), arc=(CUFF_GAP + 0.08, 2 * math.pi - CUFF_GAP - 0.08))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def punch_holes(bm, frame, u, y, turn):
    """Brass eyelets punched along the tongue: they are what make it read as the strap end."""
    at = tongue_frame(frame, u, y, turn)
    for i in range(3):
        for face_y in (-1, 1):
            add_cylinder(bm, (0.04 + i * 0.016, face_y * (CUFF_OUTER - CUFF_INNER) / 2, 0), 0.0035, 0.0012, 'Y', 8,
                         transform=at)


def build_leather():
    bm = bmesh.new()
    wrist_u = 0.2

    # Far wrist and both ankles: unbuckled, lying open.
    for frame, u, y, turn in OPEN_CUFFS:
        cuff(bm, frame, u, y, turn)
    # Near wrist: no cuff. The strap that held it hangs off the side, torn.
    end = strap_down_side(bm, MIDDLE_FRAME, wrist_u, NEAR, -0.38, width=0.045, swing=0.12)
    frayed_end(bm, end, width=0.045)

    # The chest strap, snapped in the middle: the far half still lies across
    # the pad and down its far side, the near half hangs off the near side.
    chest_u = 0.08
    strap_across(bm, MIDDLE_FRAME, chest_u, -WIDTH / 2, 0.03, width=0.07)
    strap_down_side(bm, MIDDLE_FRAME, chest_u, -NEAR, -0.06, width=0.07)
    # The torn end lies flat, so its tongues point along the pad (+Y) rather
    # than down: a quarter turn about X takes the frame's -Z there.
    torn_tip = MIDDLE_FRAME @ Matrix.Translation((chest_u, 0.03, PAD_THICKNESS + 0.004)) @ Matrix.Rotation(math.pi / 2, 4, 'X')
    frayed_end(bm, torn_tip, width=0.07)
    end = strap_down_side(bm, MIDDLE_FRAME, chest_u, NEAR, -0.45, width=0.07, swing=0.05)
    frayed_end(bm, end, width=0.07)

    # A head strap across the head section, undone and lying loose.
    head_frame, head_len = SECTIONS[0]
    strap_across(bm, head_frame, head_len - 0.2, -WIDTH / 2, WIDTH / 2 - 0.08, width=0.05)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_buckles():
    bm = bmesh.new()
    for frame, u, y, turn in OPEN_CUFFS:
        # A real buckle on the end of each open cuff, hanging empty: an open
        # rectangular frame wider than the strap, and the prong across it.
        at = buckle_frame(frame, u, y, turn) @ Matrix.Translation((0.035, 0, 0))
        for x in (-0.0135, 0.0135):
            add_box(bm, (x, 0, 0), (0.005, 0.004, 0.062), transform=at)
        for z in (-0.0285, 0.0285):
            add_box(bm, (0, 0, z), (0.032, 0.004, 0.005), transform=at)
        add_box(bm, (0.0, 0.0, 0.0), (0.03, 0.003, 0.003), transform=at)
        punch_holes(bm, frame, u, y, turn)
    # The buckle on the chest strap's far half, by the pad's edge.
    add_box(bm, (0.08, -WIDTH / 2 + 0.06, PAD_THICKNESS + 0.011), (0.075, 0.035, 0.006), transform=MIDDLE_FRAME)
    # Ring anchors where the straps meet the side rails.
    for y in (-RAIL_Y, RAIL_Y):
        add_cylinder(bm, (0.2, y, 0.0), 0.016, 0.03, 'Y', 12, transform=MIDDLE_FRAME)
    return bm


def build_stain():
    bm = bmesh.new()
    lift = PAD_THICKNESS + 0.0015
    # Pooled on the pad toward the near side, where the arm tore free...
    add_blob(bm, (0.24, 0.1, lift), 0.13, seed=7, wobble=0.75, points=28, stretch=(1.2, 0.9), transform=MIDDLE_FRAME)
    add_blob(bm, (0.42, -0.04, lift), 0.06, seed=3, wobble=0.75, points=28, transform=MIDDLE_FRAME)
    add_blob(bm, (0.1, 0.22, lift), 0.04, seed=11, wobble=0.75, points=28, transform=MIDDLE_FRAME)
    # ...run over the edge and down the side of the pad...
    for u, length in ((0.28, PAD_THICKNESS + 0.02), (0.32, PAD_THICKNESS - 0.02)):
        add_box(bm, (u, WIDTH / 2 - 0.009, PAD_THICKNESS - length / 2), (0.022, 0.004, length), transform=MIDDLE_FRAME)
    # ...and dried on the floor below.
    add_blob(bm, (MIDDLE[0] + 0.3, WIDTH / 2 + 0.12, 0.002), 0.2, seed=21, wobble=0.75, points=28, stretch=(1.3, 0.8))
    add_blob(bm, (MIDDLE[0] + 0.62, WIDTH / 2 + 0.26, 0.002), 0.05, seed=5, wobble=0.75, points=28)
    add_blob(bm, (MIDDLE[0] + 0.05, WIDTH / 2 + 0.3, 0.002), 0.035, seed=9, wobble=0.75, points=28)
    return bm


def build():
    common.clear_scene()
    base = common.make_material('TableBase', BASE, roughness=0.85, metallic=0.2)
    steel = common.make_material('TableSteel', STEEL, roughness=0.35, metallic=0.85)
    pad = common.make_material('TablePad', PAD, roughness=0.55)
    leather = common.make_material('TableLeather', LEATHER, roughness=0.7)
    buckle = common.make_material('TableBuckle', BUCKLE, roughness=0.35, metallic=0.9)
    lining = common.make_material('TableLining', LINING, roughness=0.95)
    stain = common.make_material('TableStain', STAIN, roughness=0.35)

    plinth = common.new_object('TablePlinth', build_base(), base)
    bevel = plinth.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.025
    bevel.segments = 3
    common.new_object('TableSteelFrame', build_steel_flat(), steel)
    steel_obj = common.new_object('TableSteelRound', build_steel_round(), steel)
    for p in steel_obj.data.polygons:
        p.use_smooth = True
    pads = common.new_object('TablePads', build_pads(), pad)
    bevel = pads.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.018
    bevel.segments = 3
    common.new_object('TableRestraints', build_leather(), leather)
    common.new_object('TableBuckles', build_buckles(), buckle)
    common.new_object('TableCuffLining', build_lining(), lining)
    common.new_object('TableStain', build_stain(), stain)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'operating_table.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
