"""
Generate src/assets/models/creature.glb -- the thing in the house.

    blender --background --python blender/build_creature.py

WHY THIS FILE LOOKS DIFFERENT TO THE OTHER build_*.py. The props in this
directory are hard-surface and get their shape from bmesh primitives plus a
Bevel or Subsurf modifier. A character cannot be built that way, because the
mesh has to DEFORM: an edge loop has to sit exactly on each joint or the limb
creases in the middle of the forearm instead of at the elbow. So the geometry
here is built from explicit rings of vertices bridged into quads, which is the
only way to say "put a loop at 0.30 m down the arm, because that is where
Creature.js puts the elbow bone".

WHY THE NUMBERS ARE NOT NEGOTIABLE. Every absolute length below is copied from
the HUMAN table in src/systems/Creature.js. They are joint positions, and the
armature lands on them, and Creature.js lerps between them and the HOLLOW table
at runtime to drive the twist. If a number here and a number there disagree,
the mesh and the skeleton disagree, and the failure looks like bad weighting
rather than like a typo.

The one deliberate exception is SURFACE thickness. torsoWidth 0.165 in that
table was tuned as a scale on a unit box for a rig made of capsules; read as a
real torso it is half the width of a person. So joint positions are taken
absolutely and surface widths are taken as RATIOS -- the Hollow key thins the
body by 0.125/0.165 = 0.758, not to a literal 0.125 m.

FACING. Blender is Z-up and the glTF exporter maps blender(x, y, z) to
gltf(x, z, -y), so Blender +Y becomes glTF -Z. Creature.js's setYaw documents
"0 looks down -Z", so the figure is built facing +Y. That means it faces AWAY
from you in Blender's default front view and is correct in the game -- use
Blender's BACK view to look at its face.
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402  (path has to be set first)

# ---------------------------------------------------------------------------
# Proportions -- src/systems/Creature.js HUMAN, lines 44-78
# ---------------------------------------------------------------------------

P = dict(
    hipHeight=0.92, spine=0.26, chest=0.20, neck=0.09, headRadius=0.115,
    upperArm=0.30, forearm=0.27, hand=0.10, thigh=0.44, shin=0.42,
    shoulderWidth=0.19, hipWidth=0.11, footLength=0.20,
)

Y_HIP = P['hipHeight']                                  # 0.92
Y_CHEST = Y_HIP + P['spine']                            # 1.18
Y_NECK = Y_CHEST + P['chest']                           # 1.38
Y_HEAD = Y_NECK + P['neck']                             # 1.47
HEIGHT = Y_HEAD + P['headRadius'] * 2                   # 1.70

# Shoulder joint. Creature.js parents the arm to `chest` at chest*0.86, and
# chest itself sits at hipHeight+spine, so this is that same point in world.
Y_SHOULDER = Y_CHEST + P['chest'] * 0.86                # 1.352
Y_KNEE = Y_HIP - P['thigh']                             # 0.48
Y_ANKLE = Y_KNEE - P['shin']                            # 0.06
HR = P['headRadius']
CY = Y_HEAD + HR                                        # head centre, 1.585

# Arm rest angle, out from vertical. A real A-pose (35-45 degrees) weights
# better but would need the gait to rotate the arms back down by that much;
# straight down weights badly at the armpit. 15 degrees is the compromise, and
# it is close to the 0.18 rad Creature.js already holds the arms out by.
ARM_A_POSE = math.radians(15)

# Radial density. These were 12/8/10/14, which put the model squarely in PS1
# territory: an 8-sided forearm has 45 degrees between facets and reads as a
# faceted stick under any light with a direction to it, which is the single
# most visible "low poly" tell on a character. Doubling the radial count is the
# cheapest fidelity there is -- it costs triangles in the one dimension nobody
# looks at (silhouette smoothness) and buys a surface that takes a normal map
# without the shading breaking into bands.
TORSO_SEGMENTS = 16
LIMB_SEGMENTS = 12

# 20%, applied to every limb radius and to the sleeve that covers one.
#
# The arms, hands and legs read as too thin to be a person -- which matters
# specifically because the twist depends on the Hollow being a DISTORTION of a
# human body rather than a different species. The human reading has to be
# convincingly human for the Hollow to be a corruption of it.
#
# THE SLEEVE SCALES WITH THE ARM, and it has to. The sleeve's inner wall sits at
# (outer radius - SLEEVE_T), and at the elbow that cleared the skin by 6 mm.
# Scaling the arm alone would have closed that to -1.4 mm and pushed bare
# forearm through the coat -- the same failure the deltoid comment below
# records, where 8 mm of skin showed over the shoulder. Scaling both keeps the
# clearance proportional and in fact widens it, because SLEEVE_T is a fixed wall
# thickness rather than a ratio: the gap goes from (R - r) - T to
# 1.2*(R - r) - T. scratchpad/girthcheck.py measures it rather than trusting
# that argument.
#
# The Hollow is unchanged in ABSOLUTE terms, deliberately -- see LIMB_THIN,
# which is expressed against the thickened human radius so the emaciated
# reading stays exactly as thin as it was while the human reading grows. The
# contrast between the two readings is what the dial is for, and this widens it.
LIMB_GIRTH = 1.20

# ARMS ARE ON THEIR OWN DIAL, because the two readings want opposite things
# from them and a single number cannot deliver both. Seen side by side, the
# human arms came out tubular at 1.20 while the Hollow's stayed pencil-thin --
# so this pulls the human arm IN and ARM_THIN below pushes the Hollow's OUT.
# The legs keep LIMB_GIRTH.
#
# 0.95, i.e. slightly under the ORIGINAL radius and about 21% down on what 1.20
# produced. Annabelle is written as underweight (BMI 18.8), so a thin arm is on
# brief for her; it was only ever the Hollow that needed mass.
ARM_GIRTH = 0.95


def girth(sections, k=None):
    """
    Scale a limb's RADII by a girth dial, leaving the distances alone.

    A fourth column, if present, is the ring's rearward offset and passes
    through UNSCALED: it places the ring rather than sizing it, and a calf
    that drifts backwards every time the girth dial moves is not a calf.
    """
    k = LIMB_GIRTH if k is None else k
    return [(sec[0], sec[1] * k, sec[2] * k) + tuple(sec[3:]) for sec in sections]


# ---------------------------------------------------------------------------
# Lofting
# ---------------------------------------------------------------------------


def bridge(bm, a, b):
    """Quad-bridge two equal-length rings."""
    n = len(a)
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))


def fan(bm, ring, rise):
    """
    Close a ring with a triangle fan to an apex above its own centroid.

    `rise` is in metres above the ring's HIGHEST vertex, not its mean. A tilted
    ring fanned to a point above its mean height puts the apex BELOW part of
    the ring, which dents the cap inward at exactly the place the shape is
    supposed to be proudest.
    """
    cx = sum(v.co.x for v in ring) / len(ring)
    cy = sum(v.co.y for v in ring) / len(ring)
    top = bm.verts.new((cx, cy, max(v.co.z for v in ring) + rise))
    for i in range(len(ring)):
        bm.faces.new((ring[i], ring[(i + 1) % len(ring)], top))
    return top


def zring(bm, z, rx, ry, n=TORSO_SEGMENTS, cy=0.0):
    """
    A horizontal ellipse at height z, optionally shifted forward/back by cy.

    cy is what gives the figure a posture instead of a profile like a plank:
    buttocks behind the hips, belly and chest in front, neck craned forward.
    Without it the side view is a straight taper and the coat has nothing to
    hang off.
    """
    return [bm.verts.new((rx * math.cos(2 * math.pi * i / n),
                          cy + ry * math.sin(2 * math.pi * i / n), z))
            for i in range(n)]


def limb_basis(direction):
    """
    The frame a limb's rings are built in: columns are (x, y, along).

    Split out of limb_rings so the hand can place fingers in the same frame the
    forearm was lofted in. For an arm hanging at 15 degrees, basis x runs
    roughly along world X (across the back of the hand) and basis y along world
    -Y (front to back) -- which is the axis fingers actually spread along,
    because a relaxed hanging hand turns its palm toward the thigh.
    """
    d = Vector(direction).normalized()
    up = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
    x = d.cross(up).normalized()
    y = d.cross(x).normalized()
    return Matrix((x, y, d)).transposed()


def limb_rings(bm, origin, direction, sections, n=LIMB_SEGMENTS):
    """The rings of a limb, unbridged. Split out so a double-walled garment can
    build an outer and an inner tube off the same axis."""
    d = Vector(direction).normalized()
    up = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
    x = d.cross(up).normalized()
    y = d.cross(x).normalized()
    basis = Matrix((x, y, d)).transposed()
    return [[bm.verts.new(Vector(origin) + basis @ Vector(
        (rx * math.cos(2 * math.pi * i / n),
         rz * math.sin(2 * math.pi * i / n), along))) for i in range(n)]
        for along, rx, rz in sections]


def limb(bm, origin, direction, sections, n=LIMB_SEGMENTS,
         cap_start=True, cap_end=True):
    """
    Loft rings PERPENDICULAR to an arbitrary axis.

    sections is [(distance_along_axis, radius_x, radius_z[, back]), ...]. A
    negative distance puts the ring behind the origin, which is how a limb is
    buried inside the torso: overlapping shells, not a welded junction. That is
    standard for a low-poly character and it is what stops an arm reading as
    detached from the shoulder.

    `back`, optional, shifts the whole ring REARWARD off the limb's axis. Both
    limbs here run with local +y pointing at world -y, so one sign means the
    same thing on an arm and on a leg. It exists because a calf is not a
    swelling: it is mass hung BEHIND the bone, and a ring that only grows makes
    the shin bulge forward as much as back -- which reads as an injury.
    """
    d = Vector(direction).normalized()
    up = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
    x = d.cross(up).normalized()
    y = d.cross(x).normalized()
    basis = Matrix((x, y, d)).transposed()

    rings = []
    for sec in sections:
        along, rx, rz = sec[0], sec[1], sec[2]
        back = sec[3] if len(sec) > 3 else 0.0
        rings.append([bm.verts.new(Vector(origin) + basis @ Vector(
            (rx * math.cos(2 * math.pi * i / n),
             rz * math.sin(2 * math.pi * i / n) + back, along))) for i in range(n)])
    for a, b in zip(rings, rings[1:]):
        bridge(bm, a, b)
    if cap_start:
        bm.faces.new(tuple(reversed(rings[0])))
    if cap_end:
        bm.faces.new(tuple(rings[-1]))
    return rings


# ---------------------------------------------------------------------------
# Head surface
# ---------------------------------------------------------------------------

# (height, width_scale, forward_shift, depth_scale), bottom to top. The forward
# shift is what turns a sphere on a stick into a head: the jaw and chin carry
# forward while the cranium sits back over the neck. Okabe's is a square jaw on
# bony cheeks, which at this budget means exactly two things -- the jaw stays
# WIDE down to the chin instead of tapering to a point, and the cheek is drawn
# in. Deliberately no further than that: the locked art direction is a close
# OUTFIT and BUILD likeness with a non-portrait face.
HEAD_PROFILE_COARSE = [(-1.00, 0.30, +0.034, 0.16),   # chin, forward and squared off
                (-0.84, 0.56, +0.026, 0.56),   # jaw line
                (-0.54, 0.74, +0.010, 0.84),   # cheek, drawn in
                (-0.16, 0.97, +0.000, 1.00),   # cheekbone / eye line
                (+0.24, 1.00, -0.006, 1.02),   # temple
                (+0.62, 0.88, -0.012, 0.92),   # cranium
                (+0.88, 0.52, -0.014, 0.56),
                (+1.00, 0.10, -0.012, 0.12)]
# 28, not 16. This is the one place in the model where radial density buys
# something other than smoothness. At 16 segments there are only about five
# vertices across the whole face -- one at the centreline and two either side
# -- which physically cannot hold a brow, two sockets, a nose AND cheekbones,
# no matter how hard they are displaced. Two passes were spent discovering
# that by pushing the displacements instead, and the face stayed an egg.
# 44 rather than 28 for a second reason that is easy to get backwards: MORE
# segments allow DEEPER sockets, not shallower. The fold limit is not depth
# against vertex spacing, it is the depth CHANGE between two adjacent
# vertices -- and a socket spread across six vertices steps down in six small
# increments instead of three large ones. Density is what buys depth.
# The head plus hair is ~3000 triangles at this density, which is cheap for
# the one part of the model the Level 1 window beat deliberately lights.
HEAD_SEGMENTS = 32
# How hard the head's vertices are pulled toward the face. 1.0 is an even ring.
HEAD_FACE_BIAS = 1.6


def head_angle(i, n=None):
    """
    Head ring angles, CLUSTERED ON THE FACE instead of evenly spaced.

    The head was the most expensive part of the model -- 44 segments x 22 rings
    x 2 -- and it needed that many only across the front, where a brow, two eye
    sockets, a nose and two cheekbones have to have vertices to land on. The
    back of the skull is a smooth dome with nothing on it, and it is underneath
    the HAIR, so every vertex spent there was invisible twice over.

    Warping the distribution puts about 42% of the ring within 45 degrees of
    the face, against 25% for an even ring. That is MORE face detail than 44
    even segments gave, for 32 segments of cost.

    The figure faces +Y, so the face is at a = pi/2 and the warp is applied to
    the signed offset from it.
    """
    n = n or HEAD_SEGMENTS
    off = 2.0 * math.pi * i / n - math.pi * 0.5
    off = (off + math.pi) % (2.0 * math.pi) - math.pi      # to [-pi, pi]
    warped = math.copysign(math.pi * (abs(off) / math.pi) ** HEAD_FACE_BIAS, off)
    return math.pi * 0.5 + warped

# The hair does NOT need the face's density and was silently inheriting it,
# which made a solid near-black cap the second most expensive part of the
# whole model -- 1,056 triangles, more than the coat and sleeves together,
# for a shape with no features on it at all. 44 segments exist so a brow and
# two eye sockets have vertices to land on; a smooth dome does not care.
# The hair is a separate shell, not welded to the head, so it is free to
# carry its own count.
#
# 32 rather than 22, which is a REVERSAL and worth saying why. When the hair
# was a smooth dome, angular density bought nothing and 22 was generous. It is
# now a sculpted shape with a notch in front of each ear and an off-centre
# parting, and a notch needs vertices to be a notch: at 22 the sideburn tip
# fell between two of them and rounded off into a dent. Density is what buys
# shape -- exactly the lesson the face taught at HEAD_SEGMENTS, in the opposite
# direction. The whole piece is still under 650 triangles.
HAIR_SEGMENTS = 32

# THE HAIRLINE, keyed by angular distance from dead centre of the face
# (0 = brow, pi/2 = ear, pi = nape) to height t on the skull. Hand-keyed
# rather than derived from a formula because the shape IS the design: a
# smooth monotonic fall from brow to nape is a bowl cut, and no amount of
# texture rescues one.
#
# The pair at 1.26 / 1.60 is the sideburn -- a point in front of the ear and a
# lift behind it. The notch only reads because the rim comes back UP after it;
# a rim that merely kept falling would just be a lower bowl cut.
HAIR_RIM = [(0.00,  0.360),   # centre of the brow, highest point of the hairline
            (0.52,  0.338),   # forehead, held flat across
            (0.92,  0.205),   # the temple corner turns down
            (1.26, -0.045),   # SIDEBURN: the point in front of the ear
            (1.60,  0.080),   # behind the ear the rim lifts -- this is the notch
            (2.25, -0.110),
            (3.15, -0.245)]   # nape

# (height fraction from hairline to crown, wall thickness in metres).
#
# NINE BANDS, UNEVENLY SPACED, and the spacing is the load-bearing part. The
# skull's own profile collapses from 0.88 of its width to 0.10 over the top
# fifth of its height, so evenly spaced bands made the surface turn 65 degrees
# in a single step -- well past the part's sharp-edge threshold, which put a
# hard crease across the crown that rendered as a dent. These cluster where the
# skull is actually turning. scratchpad/haircheck.py measures the worst turn.
#
# The thickness is held near flat through the middle rather than peaked. A peak
# makes the widest point of the hair sit above the widest point of the head,
# which is a MUSHROOM, and the first attempt at this read as a beret.
HAIR_BANDS = [(0.00, 0.005),   # rim: thin, so the bottom edge is an edge
              (0.14, 0.017),
              (0.32, 0.023),
              (0.46, 0.025),
              (0.58, 0.025),
              (0.70, 0.024),
              (0.82, 0.021),
              (0.91, 0.016),
              (1.00, 0.008)]   # closes the dome onto the crown chamfer

# The inner wall, in the same height fractions -- but only TWO rings, because
# it is sunk into an opaque skull and nothing ever sees it. See build_hair.
HAIR_INNER_BANDS = [(0.00, 0.0), (1.00, 0.0)]

# Crown height in skull-t. ABOVE 1.0, which is what lifts the hair off the top
# of the head -- skull_point's `grow` is radial and can only ever widen a
# crown, never raise one.
#
# ONE HEIGHT, NOT A FRONT AND A BACK ONE. The first version tilted the top ring
# forward by 0.14 to make the quiff, and that ring is only ~18 mm across, so a
# 17 mm tilt across it is close to vertical -- the band closing the crown came
# out as an overhang and rendered as a spike with a flat facet beside it. The
# quiff is now HAIR_QUIFF, a bulge on the bands BELOW the top, and it is
# windowed to zero at u = 1 so the top ring stays level and its cap stays a
# clean dome.
HAIR_TOP = 1.10
HAIR_QUIFF = 0.13      # extra skull-t of lift on the front upper bands
HAIR_APEX = 0.010      # metres the outer cap rises above its last ring

# THREE RAGGED POINTS ON THE UPPER-BACK EDGE, which the art brief asked for
# from the start ("a single solid wedge, tallest just behind the forehead,
# sweeping back, two or three ragged points on the upper-back edge") and which
# nothing here had ever built. Without them the cap is a smooth shell at a
# near-constant 25 mm off the skull, so head and hair share one outline and the
# whole thing reads as a swimming cap.
#
# (signed angle from the brow, strength). SIGNED, therefore NOT MIRRORED, for
# the same reason the forelock is parted off-centre: perfect bilateral symmetry
# is what makes procedural hair read as moulded plastic. Mirroring these would
# also have put two points either side of the nape and a third merged pair at
# dead centre -- five bumps in a neat row, which is a crown, not a haircut.
HAIR_SPIKES = ((+2.10, 1.00), (-2.48, 0.85), (+3.00, 0.70))
HAIR_SPIKE_WIDTH = 0.34   # radians; HAIR_SEGMENTS gives 0.196 rad, so ~2 wide
HAIR_SPIKE_MASS = 0.036   # extra metres of shell at the point
# The lift is windowed to almost nothing by u = 1 ON PURPOSE. The top ring
# closes with a fan, and the file already records what happens when that ring
# stops being level: the cap came out as an overhang and rendered as a spike
# with a flat facet beside it. These points are mass on the BACK, which is
# where the outline is, not height at the apex.
HAIR_SPIKE_LIFT = 0.105   # extra skull-t on the mid bands

HAIR_PART = 0.38        # radians off the midline -- where the forelock sits
HAIR_FORELOCK = 0.013   # extra metres of mass on the brow
HAIR_NAPE = 0.008       # extra metres of flick over the nape
HAIR_INNER = -0.002     # inner wall, sunk into the skull (see build_hair)


# Above this height the skull is under the HAIR from every angle -- the
# hairline runs from t = -0.20 at the nape to +0.35 at the face -- so rings up
# there are paying for detail nobody can see through an opaque cap.
# 0.23, just above the highest feature: the brow window closes at t = 0.22.
# Anything above that is cranium.
FACE_BAND_TOP = 0.23


def _subdivide_profile(profile, cuts=2):
    """
    Insert interpolated rings, but only where the face needs them.

    The coarse profile is eight rings over the whole skull, a ring every 29 mm,
    which is coarser than the features are wide -- a brow or an eye socket
    would land between two rings and simply not exist. So the face band is
    subdivided.

    The CRANIUM IS NOT. Subdividing uniformly was the first version and it
    spent a third of the head's triangles on the top and back of the skull,
    which carries no features and is covered by hair besides. Vertical density
    follows the same rule as the angular warp above: put it where something is
    actually being shaped.
    """
    out = []
    for (a, b) in zip(profile, profile[1:]):
        out.append(a)
        n = cuts if min(a[0], b[0]) < FACE_BAND_TOP else 0
        for i in range(1, n + 1):
            k = i / (n + 1.0)
            out.append(tuple(a[j] + (b[j] - a[j]) * k for j in range(4)))
    out.append(profile[-1])
    return out


HEAD_PROFILE = _subdivide_profile(HEAD_PROFILE_COARSE, cuts=2)


def _window(x, lo, hi):
    """Raised cosine: 0 at both ends of [lo, hi], 1 in the middle."""
    if x <= lo or x >= hi:
        return 0.0
    return 0.5 - 0.5 * math.cos(2.0 * math.pi * (x - lo) / (hi - lo))


def _falloff(x, width):
    """1 at x = 0, easing to 0 at |x| >= width."""
    if abs(x) >= width:
        return 0.0
    return 0.5 + 0.5 * math.cos(math.pi * x / width)


def _arc_falloff(angle, centre, width):
    """
    _falloff on a CIRCLE, so it works across the seam at +/- pi.

    The hair's angles run -pi..pi with the nape at both ends, and a feature
    placed near the nape has half its falloff on the other side of that seam.
    Subtracting raw would make the near half of the bump simply not exist,
    which is the sort of defect that renders as a flat spot and gets blamed on
    the band spacing.
    """
    d = (angle - centre + math.pi) % (2.0 * math.pi) - math.pi
    return _falloff(d, width)


def face_features(t, angle):
    """
    Brow, eye sockets, nose, cheekbones and a mouth line, as a displacement.

    WHY THIS EXISTS AT ALL, given the locked art direction says a deliberately
    non-portrait face. Because "no portrait" is not the same as "no face": an
    unbroken ellipsoid reads as a mannequin head, and the Level 1 window glimpse
    lights her specifically so the player gets one clear look. What this adds is
    the handful of planes that catch light and make a skull read as a skull --
    a brow that shadows the eyes, a nose that casts, cheekbones under a
    hollow -- and nothing that identifies anybody.

    It also does real work for the twist: an eye socket is a hole to deepen, so
    the Hollow key has something to hollow.

    Returns (forward_m, radial_m). The figure faces +Y, so forward is +Y.
    """
    # Angular distance from dead centre of the face.
    off = abs(((angle - math.pi * 0.5 + math.pi) % (2.0 * math.pi)) - math.pi)
    if off > 1.5:
        return 0.0, 0.0

    # Widths matter as much as depths. The eye sockets were first centred 30
    # degrees off the midline, which on a 16-segment head put nearly all of the
    # recess on the one vertex 22 degrees out -- next to the nose, where eyes
    # are not. Real sockets sit around 35 degrees and are wide, so they need to
    # span two segments either side or they read as a crease beside the nose.
    brow = _falloff(off, 1.05) * _window(t, -0.16, 0.22)
    eye = _falloff(off - 0.62, 0.62) * _window(t, -0.34, 0.08)
    nose = _falloff(off, 0.38) * _window(t, -0.50, 0.02)
    cheekbone = _falloff(off - 0.80, 0.42) * _window(t, -0.50, -0.20)
    hollow = _falloff(off - 0.62, 0.55) * _window(t, -0.72, -0.34)
    mouth = _falloff(off, 0.52) * _window(t, -0.80, -0.54)

    # A brow that overhangs and sockets that sink are what make a skull read as
    # a skull under a single hard light, which is exactly the Level 1 window
    # beat. The cheek HOLLOW under the cheekbone is the "bony cheeks" note from
    # the reference, and it doubles as somewhere for the Hollow key to deepen.
    # These are roughly 1.6x what reads as "anatomically correct" on a head this
    # size, and that is on purpose. Displacing an ellipsoid procedurally has a
    # hard ceiling -- at true-to-life depths every plane below vanishes into the
    # skull's own curvature under any soft light, which is exactly what the
    # first pass did. Overshooting gives the normal map something to sit on and
    # gives a single hard light (the Level 1 window beat) an edge to catch.
    # DEPTHS ARE BOUNDED BY THE PER-VERTEX STEP, NOT BY THE TOTAL. At 28
    # segments a 22 mm socket fell across about three vertices, turned the
    # surface through nearly 45 degrees between two of them and folded over
    # itself -- which rendered as a hard bright bar across each temple and read
    # as a broken normal, not as a deep eye. At 44 the same depth is spread
    # over roughly six, so these can be pushed well past what 28 tolerated.
    # blender/../scratchpad checks for folds numerically; do not just look.
    forward = (brow * 0.0215) + (nose * 0.0205) - (eye * 0.0235) - (mouth * 0.0065)
    radial = (cheekbone * 0.0105) - (hollow * 0.0165) - (eye * 0.0060)
    return forward, radial


def skull_point(t, angle, grow=0.0, y_shift=0.0):
    """
    A point on the skull at height t (-1 chin .. +1 crown) and the given angle.

    Shared by the head and the hair so the hair provably sits ON the skull
    rather than near it -- a hair cap modelled from its own numbers drifts into
    or out of the head the moment either is tweaked.
    """
    prof = HEAD_PROFILE
    if t <= prof[0][0]:
        _, rw, fy, rd = prof[0]
    elif t >= prof[-1][0]:
        _, rw, fy, rd = prof[-1]
    else:
        for (t0, w0, y0, d0), (t1, w1, y1, d1) in zip(prof, prof[1:]):
            if t0 <= t <= t1:
                k = (t - t0) / (t1 - t0)
                rw = w0 + (w1 - w0) * k
                fy = y0 + (y1 - y0) * k
                rd = d0 + (d1 - d0) * k
                break
    # Facial planes, but only on the bare skull. The hair shell passes grow > 0
    # and must sit on the SMOOTH cranium -- pushing a nose through a hair cap
    # would be a memorable bug. It never overlaps in practice (the hairline runs
    # from t = -0.20 at the nape to +0.35 at the face, and every feature below
    # lives under t = 0.20) but relying on that would be relying on two
    # unrelated tables staying out of each other's way.
    forward, radial = face_features(t, angle) if grow == 0.0 else (0.0, 0.0)
    # THE THREE AXIS MULTIPLIERS ARE NOT DECORATION -- they are the head's
    # proportions, and the first two were wrong by about a third.
    #
    # scratchpad/headcheck.py measures the skull's bounding box directly, and
    # at 0.92 / 1.04 / 1.08 it came out 211 wide, 265 deep and 248 tall: a
    # height-to-width of 1.18 where a real adult head is about 155 / 195 / 240,
    # i.e. 1.55. A head as wide as it is tall is why this figure kept reading
    # as a toy no matter what the hair did, and it is why the "7.3 heads tall"
    # figure in the plan never matched the model -- at 248 mm the human reading
    # is 6.8 heads, not 7.3.
    #
    # 0.72 and 0.82 put it at roughly 165 / 210 / 248. On the Hollow, which
    # stretches the skull 1.34x and narrows it again, the same change takes the
    # height-to-width from 1.85 to about 2.4 -- a long narrow skull, which is
    # what "a head at the wrong angle" in the basement sketch wants.
    return (( HR * rw * 0.72 + grow + radial) * math.cos(angle),
            fy + y_shift + forward + (HR * rd * 0.82 + grow + radial) * math.sin(angle),
            CY + HR * t * 1.08)


# ---------------------------------------------------------------------------
# Body
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Hand
# ---------------------------------------------------------------------------

# Creature.js's HOLLOW table quotes the basement sketch directly: "Long arms.
# Thin body. Hunched back. LONG FINGERS. A head at the wrong angle." The fingers
# are a NAMED part of the design, and the hand bone doubles from 0.10 m to
# 0.20 m between the two readings. A tapered block cannot become long fingers
# however far that bone is stretched -- so they are modelled.
WRIST_ALONG = 0.570
# The knuckles sit only 36 mm past the wrist, so the fingers get nearly TWO
# THIRDS of the hand's length. An even palm/finger split was tried first and
# read as a mitten with stubs poking out of it -- on a real hand the palm is
# barely longer than the middle finger, and on this one the fingers are
# supposed to be the thing you notice.
KNUCKLE_ALONG = 0.606
FINGER_SEGMENTS = 6


def _digit(bm, origin, basis, root, direction, lengths, radii, curl=0.0):
    """
    One finger: a short tapered tube from `root`, in the limb's own frame.

    `curl` is radians of bend added at EVERY joint, about the palm's wide axis,
    so the digit arcs instead of pointing. A relaxed hand does not hold its
    fingers straight -- they fall into a loose hook under their own weight, and
    four parallel rods are most of why the old hand read as a garden fork. It
    is applied per segment rather than as a single bend so the curvature is
    distributed, which is what a chain of three phalanges actually does.
    """
    d = Vector(direction).normalized()
    pts = [Vector(root)]
    for ln in lengths:
        pts.append(pts[-1] + d * ln)
        if curl:
            # About local Y, the palm's wide axis: the finger falls toward the
            # palm rather than sideways across its neighbours.
            d = Matrix.Rotation(curl, 3, 'Y') @ d

    rings = []
    for k, (pt, r) in enumerate(zip(pts, radii)):
        seg = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)])
        if seg.length < 1e-6:
            seg = Vector(direction)
        seg.normalize()
        perp1 = Vector((-seg.y, seg.x, 0.0))
        if perp1.length < 1e-6:
            perp1 = Vector((1.0, 0.0, 0.0))
        perp1.normalize()
        perp2 = seg.cross(perp1).normalized()
        rings.append([bm.verts.new(Vector(origin) + basis @ (
            pt + perp1 * (r * math.cos(2 * math.pi * i / FINGER_SEGMENTS))
               + perp2 * (r * math.sin(2 * math.pi * i / FINGER_SEGMENTS))))
            for i in range(FINGER_SEGMENTS)])
    for a, b in zip(rings, rings[1:]):
        bridge(bm, a, b)
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(tuple(rings[-1]))


def build_hand(bm, origin, direction, side):
    """
    Palm, four fingers and a thumb, as an overlapping shell on the wrist.

    Deliberately crude per digit -- six sides, three segments, no knuckle
    creases. There are NO finger bones in the armature, so every digit moves as
    one with the hand bone regardless (pin_hands_to_hand_bone makes that true
    rather than hoped for); adding twenty joints would quadruple the skeleton
    to articulate something that is never seen closer than about two metres,
    and then only in a lightning flash. What has to read is the COUNT and the
    LENGTH, and those are free.
    """
    basis = limb_basis(direction)
    palm_len = KNUCKLE_ALONG - WRIST_ALONG

    # THE PALM TAPERS INTO THE KNUCKLES NOW, and that is the fix for fingers
    # that looked stuck on rather than grown out. It used to hold 0.030 across
    # the wide axis all the way to a flat end cap, and the fingers -- 0.0076
    # tubes -- came out of the middle of that disc. The result was a paddle
    # with sticks in it: a hard ledge all the way round the knuckle line, with
    # the palm standing proud of every digit by about 8 mm.
    #
    # A real hand is THINNEST at the knuckles and the fingers continue its
    # profile rather than interrupting it. So the last ring is close to a
    # finger's own thickness, and the fingers start inside it.
    palm = []
    # WIDER ACROSS THE KNUCKLES than it was (0.031 -> 0.036), because the palm
    # has to be a mass the fingers come OUT of rather than the same width as
    # the fan they make. It stays thin in the other axis: see below, the
    # knuckles are the thinnest part of a real hand front-to-back.
    for along, rx, ry in girth(((WRIST_ALONG - 0.014, 0.027, 0.031),
                                (WRIST_ALONG + palm_len * 0.35, 0.022, 0.036),
                                (WRIST_ALONG + palm_len * 0.75, 0.017, 0.035),
                                (KNUCKLE_ALONG, 0.013, 0.032)), ARM_GIRTH):
        palm.append([bm.verts.new(Vector(origin) + basis @ Vector(
            (rx * math.cos(2 * math.pi * i / (FINGER_SEGMENTS * 2)),
             ry * math.sin(2 * math.pi * i / (FINGER_SEGMENTS * 2)), along)))
            for i in range(FINGER_SEGMENTS * 2)])
    for a, b in zip(palm, palm[1:]):
        bridge(bm, a, b)
    bm.faces.new(tuple(reversed(palm[0])))
    bm.faces.new(tuple(palm[-1]))

    # Four fingers across the palm's wide axis.
    #
    # LENGTHS ARE NOT SYMMETRIC ABOUT THE MIDDLE. The old taper was
    # 1 - abs(k - 1.5) * 0.12, which gives 0.82 / 0.94 / 0.94 / 0.82 -- a
    # mirror-image pair, and a hand whose index and ring finger are identical
    # is a rake. Real proportions run roughly index 0.88, middle 1.00, ring
    # 0.94, little 0.76 of the longest, and the little finger's knuckle also
    # sits further back down the palm.
    # SPLAY HALVED AND CURL NEARLY DOUBLED, and the reason is the HOLLOW.
    #
    # The Hollow stretches the hand bone 2.0x along its own axis and does
    # nothing to its width, so the monster's hand is 200 mm long on a 62 mm
    # palm -- a ratio of 0.31 against a real hand's 0.45. At those proportions
    # four straight fingers held apart by a splay are a garden fork, and that
    # is exactly what the wrist shot showed: five parallel spikes coming out of
    # the end of the forearm with no palm visible at all.
    #
    # Length is not negotiable -- the fingertips landing at 0.419 m while the
    # hem rides up to 0.709 is the measurement the whole design rests on. So the
    # hand has to read as a CLAW instead: fingers that hook rather than point,
    # and a fan that is closed rather than open. _digit turns the direction by
    # `curl` at every joint, so the bend between the first segment and the last
    # is 2 x curl -- 0.90 rad, about 52 degrees, where it used to be 23.
    FINGERS = (
        # (spread across the palm, length scale, knuckle set-back, splay)
        (-0.0215, 0.88, 0.004, -0.09),
        (-0.0072, 1.00, 0.000, -0.03),
        (0.0072, 0.94, 0.002, 0.03),
        (0.0215, 0.76, 0.008, 0.10),
    )
    for spread, scale, setback, splay in FINGERS:
        s = spread * ARM_GIRTH
        _digit(bm, origin, basis,
               root=(0.0, s, KNUCKLE_ALONG - 0.006 - setback),
               # Splay opens the fan slightly so the four are not parallel, and
               # the sign follows the finger's own side of the palm.
               direction=(0.0, splay, 1.0),
               lengths=[0.028 * scale, 0.023 * scale, 0.018 * scale],
               radii=[r * ARM_GIRTH for r in (0.0082, 0.0072, 0.0058, 0.0036)],
               # The little finger curls hardest, which is what it does.
               curl=0.45 + (0.12 if scale < 0.80 else 0.0))

    # Thumb: off the side of the palm and well BELOW the knuckles, swung away
    # from the fingers and forward. It used to sit at 0.28 of the palm's length
    # -- barely past the wrist -- which put it on the forearm rather than on
    # the hand, reading as a spur rather than as a thumb.
    _digit(bm, origin, basis,
           root=(0.004 * side, 0.026 * side * ARM_GIRTH, WRIST_ALONG + palm_len * 0.55),
           direction=(0.18 * side, 0.74 * side, 0.65),
           lengths=[0.023, 0.018],
           radii=[r * ARM_GIRTH for r in (0.0088, 0.0074, 0.0048)],
           curl=0.34)

# The sleeve, hoisted beside the arm it covers because the two are a PAIR: the
# clearance between them is the thing that matters and it is invisible if they
# live in different scopes. girth() scales both, so the margin scales with them.
SLEEVE_OUTER = [# A CLOSED SLEEVE HEAD, not an open-mouthed tube. Until this ring the
                # sleeve stopped at -0.050 in a bare rim, and the comment below
                # excused it as "hidden under the coat" -- which it was, while
                # the coat's own neckline ring still passed through the sleeve.
                # Once the coat was widened to clear the deltoid, the sleeve's
                # mouth was left looking up at the coat's front opening, and
                # through it you could see straight down the throat of the
                # sleeve onto the arm's end cap: a wedge of bare skin at the
                # top of each shoulder, plainly visible at the player's own eye
                # height. The arm's topmost geometry is at -0.040, so a ring at
                # -0.060 and the lid on it clear the arm by 20 mm.
                (-0.060, 0.044, 0.044),
                (-0.050, 0.068, 0.068),
                (0.040, 0.072, 0.073),
                (0.180, 0.062, 0.064),
                (0.310, 0.055, 0.057),    # just past the ELBOW
                (0.330, 0.052, 0.054)]
# NOT scaled by girth(). A fixed wall thickness is what a garment has, and
# leaving it fixed is what makes the arm-to-sleeve clearance GROW rather than
# merely keep up: 1.2*(R - r) - T against the old (R - r) - T.
SLEEVE_T = 0.009

ARM_SECTIONS = [
    # Narrower and shorter than they were. These rings exist only
    # to overlap the shoulder YOKE, and at 0.066 they out-reached
    # the sleeve above them and left up to 8 mm of bare deltoid
    # showing over the coat -- which rendered as a brown patch on
    # each shoulder and looked like a hole in the coat.
    # 0.060/0.062 UNTIL girthcheck STARTED MEASURING THE RIGHT ARM. That check
    # had been scaling both tables by LIMB_GIRTH (1.20) while the model builds
    # them at ARM_GIRTH (0.95), so its reported 0.5 mm of clearance here was
    # really -1.5 mm: the deltoid was sitting inside the sleeve's inner wall.
    # Nothing showed, because skincheck's ray cast only asks whether skin comes
    # out through the OUTER wall and it does not -- but 1.5 mm inside the lining
    # is 1.5 mm from the failure this table's own comment already records.
    (-0.040, 0.056, 0.056),   # buried in the yoke
    (-0.008, 0.058, 0.058),   # deltoid, the widest point
    # Two rings removed here. The sleeve covers -0.050 to 0.330,
    # so everything between the deltoid and the elbow bracket was
    # shaping a surface inside a garment. The elbow rings stay:
    # they are structural, not decorative.
    (0.110, 0.049, 0.052),    # upper-arm mass
    (0.270, 0.037, 0.039),
    (0.300, 0.036, 0.038),    # ELBOW, the narrowest point above it
    (0.330, 0.037, 0.039),
    # The forearm is WIDER just below the elbow than the elbow
    # itself -- that is where the flexor mass sits, and a straight
    # elbow-to-wrist taper is the single thing that makes a
    # low-poly arm read as a broom handle.
    #
    # AND THE MASS IS ON ONE SIDE, which is the fourth column. The
    # bulge above was symmetric, so it pushed the front edge out and
    # the back edge back by the same 3.8 mm and the profile barely
    # moved -- the same failure the calf had before LEG_VISIBLE got
    # its offsets. A forearm is straight along the back, where the
    # ulna is, and carries its bulk at the front.
    #
    # NOTHING ABOVE THE CUFF GETS AN OFFSET. The sleeve ends at
    # along 0.330, so the elbow at 0.300 is inside it and an offset
    # there would buy no outline at all while eating the arm's
    # clearance inside the sleeve -- which girthcheck puts at 9.5 mm
    # at the elbow and 0.5 mm at the deltoid. Offsets start at the
    # cuff, on the bare forearm, which is the part that is seen.
    (0.385, 0.041, 0.043, -0.011),   # flexor mass, carried forward
    (0.470, 0.033, 0.035, -0.006),
    (0.540, 0.027, 0.029, -0.002),
    (WRIST_ALONG, 0.024, 0.026),   # WRIST, narrowest
]

# THE BURIED RINGS DO NOT SCALE, and finding that out cost a render. They sit
# at z = 0.94 and 1.00, INSIDE the coat, and their job is to overlap the pelvis
# rather than to be seen. Scaling them by 1.2 stepped the thigh from 0.190 to
# 0.206 against a coat whose inner wall at that height is 0.177, and the dark
# trouser geometry came through the pale coat as a ragged patch on each hip.
LEG_BURIED = [
    (-0.075, 0.074, 0.078),   # buried in the pelvis, kept INSIDE its
    (-0.020, 0.080, 0.084),   # radius so the thigh does not step out
]
# Everything at or below the coat hem (z = 0.70, i.e. along = 0.22) is seen, so
# this is what gets the girth. The hem ring is explicit rather than left to the
# loft: without it the taper from an unscaled buried ring to a scaled knee put
# the widest VISIBLE part of the thigh at +10% instead of +20%.
LEG_VISIBLE = [
    (0.220, 0.0674, 0.0714),  # at the hem -- interpolated from the old table
    (0.400, 0.058, 0.062, -0.004),
    # THE CALF, which this leg did not have. The old table ran 0.055 at the
    # knee down to 0.034 at the ankle without a single increase anywhere in it
    # -- a monotonic taper, i.e. a cone, and in a backlit profile the whole leg
    # read as a stilt. The arm's own table records this exact lesson one limb
    # over: "the forearm is WIDER just below the elbow than the elbow itself --
    # that is where the flexor mass sits, and a straight elbow-to-wrist taper
    # is the single thing that makes a low-poly arm read as a broom handle".
    # A leg is the same problem with a bigger muscle: narrowest AT the knee,
    # widest about 100 mm below it, then a long taper to a thin ankle.
    #
    # Worth four extra rings because the leg is the longest unbroken stretch of
    # outline the figure has, and outline is the only channel that survives fog
    # and setSilhouette.
    #
    # AND THE MASS SITS BEHIND THE BONE. The fourth column is a rearward shift
    # of the whole ring, and without it the calf added above was a symmetric
    # swelling -- the shin bulged forward exactly as much as it bulged back,
    # which reads as a swollen leg rather than as a calf. In a backlit profile,
    # which is the view that matters, a symmetric bulge is nearly invisible
    # anyway: it moves the front edge and the back edge apart by the same
    # amount and the eye reads the midline, not the width.
    #
    # Offsets are NOT scaled by girth (see girth()), but they ARE scaled by
    # LIMB_THIN in the Hollow like everything else, so these are sized for what
    # survives that: knee-to-calf moves the back edge 35 mm on the human and
    # 19 mm on the monster, against 6.0 and 3.3 for the symmetric version.
    (0.440, 0.053, 0.056, -0.010),   # KNEE, narrowest, and the forward-most point
    (0.490, 0.056, 0.059, +0.004),
    (0.545, 0.059, 0.062, +0.018),   # CALF, the widest point below the knee
    (0.620, 0.051, 0.054, +0.014),
    (0.760, 0.038, 0.040, +0.004),
    (0.860, 0.031, 0.033, -0.002),   # ankle, narrower now the calf carries the mass
]
LEG_SECTIONS = LEG_BURIED + LEG_VISIBLE


# A shoe, as flat-bottomed cross-sections along the forward axis.
#
# It was FOUR VERTICES: a truncated box from the ankle to the toe, which in a
# backlit profile -- the view the corridor actually gives you -- read as a
# flipper. It is the crudest geometry left on the figure and it is in the
# OUTLINE, which is the only channel that survives fog and setSilhouette, so
# it was worth more than its 150 triangles.
#
# (y along the foot, half width, sole height, top height). The sole stays flat
# because a rounded one puts the figure on tiptoe: at this scale the whole shoe
# is 20 mm tall and any curvature under it reads as hovering.
FOOT_SECTIONS = [
    (-0.062, 0.028, 0.000, 0.074),   # back of the heel
    # A BLUNT TOE AND A ROUNDED HEEL, both of them because of what the HOLLOW
    # does to this shape rather than because of how it looked on the human.
    #
    # The foot stretches 1.2x along its own axis and thins across it, and at
    # LIMB_THIN the monster's shoe came out 240 mm long and 50 mm wide -- 4.8:1
    # where a real shoe is about 3:1 -- with the old last ring (48 mm across)
    # capped straight off. Backlit that is not a shoe, it is a dagger, and
    # both feet are in frame the whole time against a lit floor where nothing
    # is in shadow. The heel had the matching problem at the other end: one
    # ring at -0.034 capped flat, which read as a square block bolted on.
    # THE SOLE IS FLAT AND THE INSTEP IS THE TALLEST POINT. Both were wrong
    # and both showed. The sole used to wander -- 0.000, 0.003, 0.000, 0.000 --
    # which put a shallow V under the heel and made the shoe look like it was
    # rocking on a point. And the highest part of the shoe was the HEEL, 30 mm
    # behind the ankle, so the leg came down in front of a hump and the two
    # silhouettes crossed in a V notch at the back of the ankle.
    #
    # A shoe is flat from heel to ball, tallest where the ankle enters it, and
    # lifts only at the very back and the very front.
    (-0.048, 0.024, 0.006, 0.048),   # back of the heel, rounded off
    (-0.030, 0.037, 0.000, 0.074),   # heel
    (0.004, 0.042, 0.000, 0.086),    # instep, TALLEST -- the ankle enters here
    (0.050, 0.046, 0.000, 0.060),    # ball of the foot, the widest point
    (0.100, 0.044, 0.000, 0.036),    # toe box
    (0.134, 0.033, 0.008, 0.024),    # toe, blunt and lifted off the floor
]


# DEGREES EACH SHOE IS TURNED OUT, (left, right). Nobody stands with their
# feet parallel, and two parallel shoes are the last place on this figure
# where bilateral symmetry was still shouting mannequin -- both feet are in
# frame the whole time, at the bottom of the outline, against a lit floor.
#
# The two angles differ on purpose, for the same reason the hair is parted
# off-centre and the hem now hangs unevenly: a symmetric splay is still a
# symmetry. Measured in scratchpad/footcheck.py, which un-rotates by these
# before reporting the shoe's proportions -- otherwise turning the foot out
# would have shown up there as the shoe getting wider, which is exactly the
# kind of drift that makes a check worse than useless.
FOOT_SPLAY = (5.0, 8.0)


def build_foot(bm, side):
    """One shoe. See FOOT_SECTIONS and FOOT_SPLAY."""
    x0 = side * P['hipWidth']
    out = math.radians(-side * FOOT_SPLAY[1 if side > 0 else 0])
    ca, sa = math.cos(out), math.sin(out)
    rings = []
    for y, hw, zlo, zhi in FOOT_SECTIONS:
        zm = zlo + (zhi - zlo) * 0.55
        # Flat-bottomed hexagon: two sole corners, two waist points, and a
        # narrowed top so the upper rolls over instead of ending in a box edge.
        # Rotated about the ankle by `out`; the sole stays flat because the
        # rotation is about z and never touches the heights.
        rings.append([bm.verts.new((x0 + px * ca - y * sa, px * sa + y * ca, pz))
                      for px, pz in (
            (-hw, zlo), (hw, zlo), (hw, zm),
            (hw * 0.74, zhi), (-hw * 0.74, zhi), (-hw, zm))])
    for a, b in zip(rings, rings[1:]):
        bridge(bm, a, b)
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(tuple(rings[-1]))


def build_body(bm, marks=None):
    """
    marks, if given, collects (material_name, first_face, last_face) spans.

    Faces are tagged by WHICH PART BUILT THEM, never by testing their position
    afterwards. A position test was tried and is a trap: the coat is an ellipse
    0.246 m wide and 0.13 m deep, so any single distance-from-axis threshold
    that catches its sides classifies its front and back as body, and the figure
    ends up with white flanks and a dark stripe up the chest and spine.
    """
    def mark(name, start):
        if marks is not None:
            marks.append((name, start, len(bm.faces)))

    # --- torso --------------------------------------------------------------
    _f0 = len(bm.faces)
    # The SHOULDER YOKE at Y_SHOULDER carries the full shoulderWidth so the
    # arms emerge from the body rather than beside it; the steep taper from
    # there up to the neck is the trapezius slope. Without it the figure has
    # sloped mannequin shoulders.
    #
    # The torso runs down to 0.79, well below the hip JOINT at 0.92, because
    # the pelvis has to reach the crotch. Ending it at the joint left the
    # thighs hanging below a flat plate with a visible step.
    # Two rings carry the shoulder, not one. A single wide ring followed by a
    # narrow neck ring makes the taper a CLIFF -- the surface drops from 0.190
    # to 0.085 in 68 mm, which reads as a flat plate and, worse, leaves the
    # arm's buried rings emerging into open air above it. Holding the width out
    # to 1.39 gives the trapezius a slope and gives the deltoid something to
    # overlap.
    # THREE RINGS BELOW THE OLD CROTCH, and a material split at the hip.
    #
    # The torso used to stop dead at z 0.79 in a flat cap, and the legs only
    # ever come within 29 mm of the centre line, so between the shirt's bottom
    # edge and the thighs there was a 58 mm slot running the whole width of the
    # figure. Through it you saw the coat's PALE INNER WALL -- and at the
    # player's own eye line, which is a few degrees above horizontal at 5-15 m,
    # that rendered as a bright grey block slung between the legs. It was not
    # the downward-facing cap: that is only visible from below, and nothing in
    # this game ever looks at the monster from below.
    #
    # These taper to a narrow crotch at z 0.700, which is the coat's own hem,
    # so the slot is closed everywhere the coat is not already closing it. They
    # overlap the thighs by about 19 mm at the bottom and more above, which is
    # the same overlapping-shells approach the whole model uses.
    torso = [
        zring(bm, 0.700, 0.048, 0.064, cy=+0.004),         # CROTCH, at the hem
        zring(bm, 0.730, 0.082, 0.076, cy=+0.001),
        zring(bm, 0.760, 0.104, 0.084, cy=-0.002),
        zring(bm, 0.79, 0.115, 0.088, cy=-0.004),          # old crotch ring
        zring(bm, Y_HIP - 0.05, 0.160, 0.101, cy=-0.012),  # pelvis, seat back
        zring(bm, Y_HIP + 0.03, 0.155, 0.093, cy=-0.006),  # hip crest
        zring(bm, Y_HIP + 0.14, 0.120, 0.080, cy=+0.006),  # waist, narrowest
        zring(bm, Y_CHEST, 0.144, 0.094, cy=+0.011),       # lower ribs
        zring(bm, Y_CHEST + 0.10, 0.168, 0.104, cy=+0.013),  # chest, forward
        zring(bm, Y_SHOULDER, 0.188, 0.099, cy=+0.004),    # SHOULDER YOKE
        zring(bm, Y_NECK + 0.01, 0.170, 0.094, cy=+0.000),  # still broad
        zring(bm, Y_NECK + 0.05, 0.100, 0.076, cy=-0.004),  # trapezius slope
        zring(bm, Y_HEAD, 0.050, 0.048, cy=+0.010),        # neck, craned
    ]
    # SPLIT AT THE HIP CREST. Everything below is trousers, everything above is
    # shirt. Until now the entire torso was one shirt-coloured tube from the
    # neck to the crotch and the trousers began at the thigh, so the figure was
    # wearing a garment no one wears. The boundary is a real garment line -- an
    # untucked tee over the waistband -- and it is the only horizontal edge in
    # the outfit that is SUPPOSED to be horizontal.
    HIP_RING = 5            # zring at Y_HIP + 0.03; see the table above
    for a, b in zip(torso[:HIP_RING], torso[1:HIP_RING + 1]):
        bridge(bm, a, b)
    bm.faces.new(tuple(reversed(torso[0])))
    mark('CreatureTrousers', _f0)

    _f0 = len(bm.faces)
    for a, b in zip(torso[HIP_RING:], torso[HIP_RING + 1:]):
        bridge(bm, a, b)
    bm.faces.new(tuple(torso[-1]))
    mark('CreatureShirt', _f0)

    # --- arms ---------------------------------------------------------------
    _f0 = len(bm.faces)
    # Loops land ON the elbow (0.30) and wrist (0.57), with one either side of
    # the elbow so the crease has something to fold into.
    for side in (-1, 1):
        limb(bm, (side * P['shoulderWidth'], 0.0, Y_SHOULDER),
             (math.sin(ARM_A_POSE) * side, 0.0, -math.cos(ARM_A_POSE)), girth(ARM_SECTIONS, ARM_GIRTH))
        build_hand(bm, (side * P['shoulderWidth'], 0.0, Y_SHOULDER),
                   (math.sin(ARM_A_POSE) * side, 0.0, -math.cos(ARM_A_POSE)), side)
    # The whole arm is bare skin: the sleeve is a separate shell that covers
    # everything above the elbow, so there is nothing here to paint as cloth.
    mark('CreatureSkin', _f0)

    # --- legs ---------------------------------------------------------------
    _f0 = len(bm.faces)
    for side in (-1, 1):
        # capped: an open ankle ring left 16 boundary edges you could see into
        limb(bm, (side * P['hipWidth'], 0.0, Y_HIP), (0, 0, -1),
             LEG_BURIED + girth(LEG_VISIBLE))

        build_foot(bm, side)
    mark('CreatureTrousers', _f0)

    # --- head ---------------------------------------------------------------
    _f0 = len(bm.faces)
    # Under-detailed on purpose. The art direction is a close OUTFIT and BUILD
    # likeness with a deliberately non-portrait face, and at setSilhouette(true)
    # every material colour is multiplied by 0.05 inside FogExp2 -- the face is
    # a few hundred triangles that are almost never lit.
    rings = [[bm.verts.new(skull_point(t, head_angle(i)))
              for i in range(HEAD_SEGMENTS)] for t, _, _, _ in HEAD_PROFILE]
    for a, b in zip(rings, rings[1:]):
        bridge(bm, a, b)
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(tuple(rings[-1]))
    mark('CreatureSkin', _f0)


# ---------------------------------------------------------------------------
# Coat
# ---------------------------------------------------------------------------

# Hem height. This is the single most load-bearing number in the file and it is
# not an arbitrary "mid-thigh": the thigh runs 0.92 -> 0.48, so mid-thigh is
# 0.70, and the fingertips in the HUMAN reading land at 0.705. The hands are
# therefore AT the hem, which is the hands-in-pockets read, and the arms
# disappear into one clean column.
#
# In the HOLLOW reading the arms grow to 1.09 while the coat is carried by the
# torso, so the hem rises to 0.709-0.769 and the fingertips fall to 0.419 --
# the hands end up hanging 29 cm clear of the hem's lowest point, 35 cm clear
# of its highest, on a coat that has become a short jacket. (0.83 and 40 cm
# were a design estimate that anchored the hem to the shoulder; the coat is
# weighted to the hips, so it only partly follows the torso as that lengthens.
# scratchpad/reading.py measures both readings on the posed rig.) The coat
# is a ruler the viewer measures the distortion against, which is a far stronger
# effect than long arms on a bare body. A knee-length coat would cover the
# fingertip/knee relationship and destroy it.
COAT_HEM = 0.70
# The top of the SHOULDER YOKE, not the top of the coat -- the collar rings
# sit above it. Raised from Y_NECK + 0.02 to + 0.035 because the arm's topmost
# geometry reaches z 1.410 and the yoke has to clear it; scratchpad/channel.py
# measures that directly against the arm's surface.
COAT_TOP = Y_NECK + 0.035
# Wall thickness. The coat is modelled double-walled rather than solidified,
# because export_apply=False (mandatory for shape keys) means no modifier is
# ever applied and a Solidify would simply not be in the GLB.
COAT_T = 0.011
COAT_SEGMENTS = 20


# HOW FAR THE HEM HANGS BELOW COAT_HEM, along the arc.
#
# The hem was one flat ellipse, so in profile the coat ended in a horizontal
# line with a right angle at each end -- a cardboard cut-out, and the loudest
# thing left on the monster's outline once the shoulders were fixed. Real
# cloth hung on an open coat does not do that: the front panels have nothing
# holding them and drop, the back drops a little, and the side seams -- which
# are the only part actually sitting on the body -- stay where they are.
#
# Keyed by the ARC PARAMETER rather than by angle, so the outer and inner
# walls agree at the corners even though their gap angles differ by 1.2
# degrees. u = 0 and u = 1 are the two front corners, u = 0.5 is centre back.
#
# Everything is zero or NEGATIVE on purpose. COAT_HEM stays the highest point
# of the hem, because the hem-versus-fingertip inversion is the measurement
# the whole design rests on and raising the hem anywhere would start eating
# it; the sides, where the hands hang, are exactly unchanged.
# The flat run at each end is the corner of the front panel, and it is there
# on purpose: with a single straight rise from the corner the panel ended in a
# POINT, which reads as a tailcoat or as damage rather than as a lab coat. At
# 20 segments the first two vertices fall inside that run, so the corner comes
# out square and the rise starts after it.
# NOT SYMMETRIC ANY MORE. Everything on this figure except the hair is a
# mirror image, and a perfectly bilateral figure reads as a mannequin no
# matter how good its parts are -- the hair's own comment already records the
# cure ("perfect bilateral symmetry is what makes procedural hair read as a
# helmet, and an off-centre parting is the cheapest possible cure"). The same
# argument applies to the largest pale shape on the model.
#
# So one front corner hangs 52 mm below COAT_HEM and the other 31, and the
# back's lowest point sits at u = 0.56 rather than dead centre. The 21 mm
# difference between the two corners is about 8 px at the preview scale --
# not a detail, a silhouette.
HEM_SWEEP = [(0.00, -0.052), (0.07, -0.047), (0.17, -0.018), (0.26, 0.000),
             (0.36, -0.006), (0.46, -0.019), (0.56, -0.026), (0.68, -0.011),
             (0.78, 0.000), (0.86, -0.011), (0.94, -0.028), (1.00, -0.031)]


def hem_sweep(u, scale=1.0):
    """Vertical offset at arc parameter u. See HEM_SWEEP."""
    for (u0, d0), (u1, d1) in zip(HEM_SWEEP, HEM_SWEEP[1:]):
        if u0 <= u <= u1:
            return (d0 + (d1 - d0) * (u - u0) / (u1 - u0)) * scale
    return HEM_SWEEP[-1][1] * scale


# DEGREES THE FRONT OPENING IS ROTATED OFF THE CENTRE LINE, by height. An
# unbuttoned coat hanging on a body that is walking does not keep its opening
# on the midline; it swings. Zero at the collar, which sits on the neck and
# cannot move, growing to 9 degrees at the hem.
#
# This rotates WHICH PART of the ellipse is missing, not the ellipse, so most
# of it is a lit-view change -- but not all: the two front edges end up at 73
# and 125 degrees instead of 64 and 116, and the first of those reaches about
# 8 mm further forward at the hem than the symmetric version did.
COAT_SWING = [(COAT_HEM, 9.0), (0.92, 7.0), (1.16, 4.5), (1.34, 2.0),
              (1.415, 1.0), (1.470, 0.0)]


def coat_swing(z):
    """Degrees of off-centre swing at height z. See COAT_SWING."""
    if z <= COAT_SWING[0][0]:
        return COAT_SWING[0][1]
    if z >= COAT_SWING[-1][0]:
        return COAT_SWING[-1][1]
    for (z0, a0), (z1, a1) in zip(COAT_SWING, COAT_SWING[1:]):
        if z0 <= z <= z1:
            return a0 + (a1 - a0) * (z - z0) / (z1 - z0)
    return COAT_SWING[-1][1]


def arc_ring(bm, z, rx, ry, cy, gap_deg, n=COAT_SEGMENTS, sweep=0.0, swing=0.0):
    """
    A partial ellipse, open across the front.

    `sweep` scales HEM_SWEEP, which drops the ring below z by an amount that
    varies along the arc. 0 leaves the ring flat, which is what every ring
    except the bottom two wants.

    The coat is WORN OPEN -- two sources say unbuttoned explicitly, and it is
    the whole silhouette. A closed coat would hide the narrowed torso and the
    arms and turn the figure into a featureless cone. The figure faces +Y, so
    the gap is centred on +Y, i.e. on 90 degrees.
    """
    a0 = math.radians(90 + gap_deg + swing)
    a1 = math.radians(450 - gap_deg + swing)
    return [bm.verts.new((rx * math.cos(a0 + (a1 - a0) * i / (n - 1)),
                          cy + ry * math.sin(a0 + (a1 - a0) * i / (n - 1)),
                          z + (hem_sweep(i / (n - 1.0), sweep) if sweep else 0.0)))
            for i in range(n)]


def open_bridge(bm, a, b, flip=False):
    """Bridge two equal-length ring ARCS. Unlike bridge() it does not wrap."""
    for i in range(len(a) - 1):
        q = (a[i], a[i + 1], b[i + 1], b[i])
        bm.faces.new(tuple(reversed(q)) if flip else q)


# THE GAP IS IN DEGREES BUT THE SILHOUETTE IS IN METRES, and that mismatch is
# what put a horn on each shoulder. The rings are ellipses roughly twice as
# wide as they are deep (rx 0.196 against ry 0.101 at the collar), so a gap
# quoted as an angle cuts away far less WIDTH at the top than the number
# suggests: the old 62 degrees at the collar left the front corner at
# |x| = 0.173, which is 91% of the shoulder's own half-width, standing 118 mm
# ABOVE the shoulder seam. Backlit, that is not a collar. It is a pointed wing
# on each side of the neck, and outline is the only thing that survives
# FogExp2 at 5-15 m with setSilhouette on, so it was the loudest thing about
# the monster.
#
# So the fourth column is now chosen by the half-width it PRODUCES rather than
# by eye: gap = degrees(acos(-w / rx)) - 90 for the w in each comment. The
# profile runs 52 mm at the collar top -- corners tucked either side of the
# throat -- out to 98 mm across the chest, pinching to 72 at the waist and
# flaring again to 92 at the hem. That is a front edge that falls more or less
# straight, which is what an unbuttoned coat does.
#
# The old comment here claimed the widening gap WAS the lapel ("at this budget
# a lapel is a shape the OPENING makes, not a separately folded panel"). That
# stopped being true when build_lapels started folding a real flap off this
# same edge, and the two were then drawing the same feature twice -- the flap
# rolling back off an edge that had already rolled itself back.
COAT_SECTIONS = [
    # A COLLAR ROUND THE NECK, not a bucket round the shoulders. These two
    # rings used to be 0.196 and 0.224 wide -- 39 and 45 cm across, on a neck
    # 10 cm across -- so the top of the coat was an open funnel you could see
    # straight down into, with the neck rising out of the middle of it and the
    # garment's own inner wall lit inside. Closing the front gap in the last
    # pass stopped it having horns; it did not stop it being a bucket.
    #
    # They now hug the neck (0.115 and 0.150) and the YOKE below carries the
    # width out to the shoulder instead, which is the order a coat is actually
    # built in. ry never drops below about 0.088: the head is craned forward,
    # and scratchpad/channel.py finds the chin -- not the neck -- is what a
    # collar ring hits when it is drawn too shallow.
    (1.470,     0.115, 0.095, 0.006, 24.7),    # collar top, w = 0.048
    (1.445,     0.150, 0.102, 0.006, 22.7),    # collar base, on the trapezius
    # TWO RINGS TO ROUND THE SHOULDER OVER, because the corner they replace was
    # a crease and the crease was the outline. The yoke used to run dead
    # vertical at 0.256 up to 1.415 and then cone straight to the collar, which
    # is a 65-degree turn in one step -- past the 62-degree smoothing angle
    # this model uses everywhere, so it shaded as a hard rim across the top of
    # each shoulder and the silhouette came to a POINT at the outer corner.
    # Angular epaulettes on a lab coat.
    #
    # These sit on a quarter-round from (0.248, 1.415) to (0.150, 1.445). The
    # worst turn in the chain is now 48 degrees. channel.py's scan puts the
    # arm's surface inside every one of them: 0.210 already cleared at z 1.425
    # and 0.130 at 1.445.
    (1.440,     0.192, 0.110, 0.006, 21.4),    # shoulder round, upper
    (1.428,     0.228, 0.124, 0.006, 19.7),    # shoulder round, lower
    # THE YOKE, and it has to be 0.256 rather than 0.246. The arm's topmost
    # geometry reaches z 1.410 and out to x 0.245, so a neckline ring at 0.234
    # passed straight THROUGH the deltoid -- which is what the notch at each
    # shoulder was: the coat's rim sawing across the sleeve cap with a sliver
    # of bare arm showing in the cut. channel.py scans the ellipse against the
    # arm's own surface; 0.240 still hits at z 1.380 and 0.252 is the first
    # width that clears, so this takes 0.256 for margin.
    (COAT_TOP,  0.248, 0.134, 0.006, 18.8),    # shoulder edge, w = 0.080
    (Y_SHOULDER, 0.256, 0.134, 0.008, 21.1),  # SHOULDER SEAM, w = 0.092
    (1.26,      0.212, 0.130, 0.012, 27.5),   # w = 0.098
    (1.16,      0.190, 0.124, 0.010, 31.1),   # sternum, most open, w = 0.098
    # WIDENED OVER THE HIP. These two rings used to be 0.180/0.118 and
    # 0.190/0.128, and the hip came through them: 2.9 mm past the OUTER wall
    # at z 0.94 and 0.5 mm at z 1.00, on both sides at about 166 degrees --
    # a thin dark seam down each hip in the human reading, which is the same
    # defect the thigh produced once already. It was invisible until
    # girthcheck's body_vs_coat stopped comparing the whole body against the
    # collar ring (see that file); the number it had been printing was a
    # different measurement entirely.
    (1.04,      0.188, 0.124, 0.004, 22.5),   # waist, least open, w = 0.072
    (0.92,      0.199, 0.134, -0.004, 20.9),  # over the hips, w = 0.071
    (0.80,      0.200, 0.138, -0.006, 23.9),  # w = 0.081
    (COAT_HEM,  0.210, 0.144, -0.006, 26.0),  # hem, flared, w = 0.092
]


def coat_at(z):
    """(rx, ry, cy, gap_deg) of the coat at height z, interpolated."""
    tbl = COAT_SECTIONS
    if z >= tbl[0][0]:
        return tbl[0][1:]
    if z <= tbl[-1][0]:
        return tbl[-1][1:]
    for (z0, rx0, ry0, cy0, g0), (z1, rx1, ry1, cy1, g1) in zip(tbl, tbl[1:]):
        if z1 <= z <= z0:
            k = (z - z0) / (z1 - z0)
            return (rx0 + (rx1 - rx0) * k, ry0 + (ry1 - ry0) * k,
                    cy0 + (cy1 - cy0) * k, g0 + (g1 - g0) * k)
    return tbl[-1][1:]


# A REAL NOTCHED LAPEL, folded back off the front edge.
#
# Until now the lapel was the OPENING's shape and nothing else -- the arc gap
# widening from 40 degrees at the neckline to 62 at the collar top -- and the
# comment on those rings said so: "at this budget a lapel is a shape the
# OPENING makes, not a separately folded panel". That was the right call when
# the model was 3,000 triangles. It is not any more, and it is the single
# biggest thing standing between this coat and a lab coat: a notch lapel is the
# most recognisable feature a coat has, it sits exactly where the Level 1
# window reveal is pointed, and a gap alone cannot produce the step at the
# notch or the triangle of cloth lying on the chest.
#
# Built as a folded FLAP rather than by widening the coat: the fold line is the
# coat's own front edge, the panel lies proud of the chest, and its free edge
# runs out and down. That is what a lapel is, and it gives the notch for free
# as the step between the flap's top and the collar above it.
LAPEL_BREAK = 1.130    # where the lapel merges back into the front edge
LAPEL_TOP = 1.396      # just under the neckline; the step above it is the notch
LAPEL_WIDE = 0.40      # radians of arc at its widest
LAPEL_PROUD = 0.014    # metres the flap stands off the coat beneath it
LAPEL_T = 0.008        # its own cloth thickness
LAPEL_STEPS = 7


def _lapel_width(t):
    """
    Arc width of the lapel at height fraction t (0 at the break, 1 at the top).

    Widest just BELOW the top, not at it. That dip over the last stretch is the
    notch: the collar above steps back out again, and the corner between the
    two is the thing the eye reads as a lapel rather than as a flap.
    """
    if t < 0.62:
        return LAPEL_WIDE * (t / 0.62) ** 0.75
    if t < 0.86:
        return LAPEL_WIDE
    return LAPEL_WIDE * (1.0 - 0.42 * (t - 0.86) / 0.14)


# ACROSS the flap, not just along it: (fraction of the width, metres proud).
#
# The lapel was two columns -- the fold line and the free edge -- which makes
# it a flat ribbon, and flat is exactly how it rendered: two hard-edged plates
# stuck on the chest with a crease where they met the coat. Cloth folded back
# on itself ROLLS; it does not hinge. The middle column sits at 45% of the
# width but 86% of the way out, so the panel is convex rather than a straight
# ramp, and the roll catches the light along its length instead of presenting
# one flat face.
#
# This is the one part of the garment the Level 1 window reveal is pointed
# straight at, and it is lit there -- so unlike most of this model it is worth
# geometry that does nothing for the silhouette.
LAPEL_COLUMNS = ((0.00, 0.002), (0.45, LAPEL_PROUD * 0.86), (1.00, LAPEL_PROUD))


def build_lapels(bm):
    """Two folded lapel panels, one per front edge. See LAPEL_BREAK."""
    for side in (-1, 1):
        # side -1 is the -X edge, which arc_ring emits first (angle 90 + gap).
        outer, inner = [], []
        for k in range(LAPEL_STEPS):
            t = k / (LAPEL_STEPS - 1.0)
            z = LAPEL_BREAK + (LAPEL_TOP - LAPEL_BREAK) * t
            rx, ry, cy, gap = coat_at(z)
            # The same swing the coat's own rings take, or the flap would
            # fold off an edge that is no longer there.
            edge = math.radians(90.0 + coat_swing(z)) + side * math.radians(gap)
            wide = _lapel_width(t)

            def at(ang, proud):
                return (( rx + proud) * math.cos(ang),
                        cy + (ry + proud) * math.sin(ang), z)

            # The fold line sits ON the coat; the free edge stands proud of it,
            # so the flap tilts away from the chest the way folded cloth does
            # instead of lying flat against it and z-fighting.
            outer.append([bm.verts.new(at(edge + side * wide * f, pr))
                          for f, pr in LAPEL_COLUMNS])
            inner.append([bm.verts.new(at(edge + side * wide * f, pr - LAPEL_T))
                          for f, pr in LAPEL_COLUMNS])

        # Winding is settled by recalc_face_normals later, so these only have
        # to be the right LOOPS.
        cols = len(LAPEL_COLUMNS)
        for rows in (outer, inner):
            for a, b in zip(rows, rows[1:]):
                for c in range(cols - 1):
                    bm.faces.new((a[c], a[c + 1], b[c + 1], b[c]))
        # Close the free edge, the fold edge and the two ends, so the flap is a
        # solid rather than a pair of loose sheets -- an open rim here would
        # read as a slot at exactly the distance the reveal is lit from.
        for i in range(len(outer) - 1):
            bm.faces.new((outer[i][-1], inner[i][-1],
                          inner[i + 1][-1], outer[i + 1][-1]))
            bm.faces.new((outer[i][0], outer[i + 1][0],
                          inner[i + 1][0], inner[i][0]))
        for c in range(cols - 1):
            bm.faces.new((outer[0][c], outer[0][c + 1],
                          inner[0][c + 1], inner[0][c]))
            bm.faces.new((outer[-1][c], inner[-1][c],
                          inner[-1][c + 1], outer[-1][c + 1]))


def build_coat(bm):
    # (z, rx, ry, cy, gap_degrees). The coat is deliberately LOOSER than the
    # body at every height -- it is a garment hanging off shoulders, and in the
    # Hollow reading the body inside thins to 0.758 while these numbers do not,
    # so it starts hanging visibly too big. That is free horror.
    #
    # The gap is widest at the collar (lapels rolled back) and narrows to the
    # waist before opening again over the hips, which is how an unbuttoned coat
    # actually hangs.
    # The top two rings carry the SHOULDER, and they have to be as wide as the
    # deltoid (0.19 joint + 0.064 muscle = 0.254) or the coat does not drape
    # over the arm at all -- the sleeve tops poke through it as pointed wings.
    # A coat hangs from the shoulder seam, so that is the widest point and
    # everything below it falls away.
    sections = COAT_SECTIONS
    # The bottom ring takes the full sweep and the one above it a quarter of
    # it, so the drop is a slanted PANEL rather than a kink in the last 100 mm.
    # See HEM_SWEEP.
    sweeps = [0.0] * (len(sections) - 2) + [0.25, 1.0]
    outer = [arc_ring(bm, z, rx, ry, cy, g, sweep=w, swing=coat_swing(z))
             for (z, rx, ry, cy, g), w in zip(sections, sweeps)]
    inner = [arc_ring(bm, z, rx - COAT_T, ry - COAT_T, cy, g + 1.2, sweep=w,
                      swing=coat_swing(z))
             for (z, rx, ry, cy, g), w in zip(sections, sweeps)]

    for a, b in zip(outer, outer[1:]):
        open_bridge(bm, a, b)
    for a, b in zip(inner, inner[1:]):
        open_bridge(bm, a, b, flip=True)
    # Close the four boundary loops: top, hem, and the two front edges.
    open_bridge(bm, outer[0], inner[0], flip=True)
    open_bridge(bm, outer[-1], inner[-1])
    for i in range(len(outer) - 1):
        bm.faces.new((outer[i][0], inner[i][0], inner[i + 1][0], outer[i + 1][0]))
        bm.faces.new((outer[i + 1][-1], inner[i + 1][-1], inner[i][-1], outer[i][-1]))

    build_lapels(bm)


def build_sleeves(bm):
    """
    Short sleeves, ending just past the elbow.

    At 1.63x arm length in the Hollow reading a fixed-length sleeve would leave
    the forearm hanging out of it and a sleeve that stretched with the arm would
    HIDE the elongation -- either way the best cue in the design gets animated
    away. Stopping at the elbow in both readings dodges the problem entirely and
    leaves 60 cm of bare forearm, which is its own kind of wrong.
    """
    # Double-walled, like the coat and for the same reason: a single tube is
    # open at the cuff, and an open rim is not a subtle defect -- it rendered
    # as a dark slot on each side of the figure, which is exactly the kind of
    # thing that survives all the way to a shipped build because it looks like
    # shading. export_apply=False means a Solidify modifier would never make it
    # into the GLB, so the thickness has to be real geometry.
    # 50 mm up the arm -- ABOVE the arm shell's own top ring at 40 mm, so
    # no bare deltoid can appear over it -- and 68 mm across, which still
    # measures inside the coat's shoulder. The ordering matters: arm
    # inside sleeve inside coat, checked by scratchpad/shoulder.py.
    # coat's shoulder. This ring is an open RIM -- the annulus where the
    # sleeve's outer and inner walls meet -- so any part of it the coat
    # fails to cover reads as a dark slot at the shoulder. Everything
    # BELOW here is supposed to sit outside the coat body: that is the
    # armhole, and it measured 38-144 mm proud, which is correct.
    OUTER = girth(SLEEVE_OUTER, ARM_GIRTH)
    T = SLEEVE_T
    for side in (-1, 1):
        origin = (side * P['shoulderWidth'], 0.0, Y_SHOULDER)
        direction = (math.sin(ARM_A_POSE) * side, 0.0, -math.cos(ARM_A_POSE))
        outer = limb_rings(bm, origin, direction, OUTER)
        inner = limb_rings(bm, origin, direction,
                           [(a, rx - T, rz - T) for a, rx, rz in OUTER])
        for a, b in zip(outer, outer[1:]):
            bridge(bm, a, b)
        for a, b in zip(inner, inner[1:]):
            bridge(bm, b, a)
        bridge(bm, inner[-1], outer[-1])   # cuff rim
        bridge(bm, outer[0], inner[0])     # shoulder rim, under the coat
        # THE LID. Without it the rim above is an annulus round a hole, and a
        # hole at the top of the shoulder is not hidden just because cloth is
        # nearby -- see SLEEVE_OUTER's first ring. recalc_face_normals settles
        # the winding, so this only has to be the right LOOP.
        bm.faces.new(tuple(reversed(inner[0])))


def _hair_rim(off):
    """Hairline height t, keyed by angular distance from dead centre of the face."""
    a = abs(off)
    if a <= HAIR_RIM[0][0]:
        return HAIR_RIM[0][1]
    if a >= HAIR_RIM[-1][0]:
        return HAIR_RIM[-1][1]
    for (x0, y0), (x1, y1) in zip(HAIR_RIM, HAIR_RIM[1:]):
        if x0 <= a <= x1:
            # LINEAR, not smoothstep. Smoothstep flattens the approach to each
            # key, which rounds the sideburn tip off -- and the tip is the
            # whole point of keying this by hand.
            return y0 + (y1 - y0) * (a - x0) / (x1 - x0)
    return HAIR_RIM[-1][1]


def _hair_height(off, u):
    """
    Height t of the outer shell at this angle and height fraction.

    The quiff is added here rather than by tilting the top ring, and it is
    windowed to zero at BOTH ends of u: at u = 0 so it does not drag the
    hairline down over the brow, and at u = 1 so the top ring stays level and
    the cap that closes it stays a clean dome. See HAIR_TOP.
    """
    t0 = _hair_rim(off)
    lift = 0.0
    for centre, strength in HAIR_SPIKES:
        lift += (HAIR_SPIKE_LIFT * strength
                 * _arc_falloff(off, centre, HAIR_SPIKE_WIDTH)
                 * _window(u, 0.25, 1.05))
    return (t0 + (HAIR_TOP - t0) * u
            + HAIR_QUIFF * _falloff(off, 1.30) * _window(u, 0.20, 1.00)
            + lift)


# THE WALL TRACKS THE SKULL. HAIR_BANDS is in absolute metres, so narrowing
# the head's width multiplier from 0.92 to 0.72 left a 25 mm shell sitting on
# a skull 23% narrower and the cap flared out past the temples as a beret --
# the exact failure the band table's own comment records from the first
# attempt at this shape ("a MUSHROOM, and the first attempt read as a beret").
# 0.78 is the same ratio the skull's width moved by, so the hair keeps the
# proportion it was tuned at rather than being re-tuned by hand.
HAIR_WALL = 0.78


def _hair_thickness(off, k):
    """Wall thickness in metres at this angle, for outer band k."""
    u, base = HAIR_BANDS[k]
    f = abs(off) / math.pi
    # Swept BACK: more mass behind the crown than on the brow.
    grow = base * HAIR_WALL * (0.86 + 0.20 * f ** 0.65)
    # Forelock over the brow, parted off-centre. Dies out by the crown -- it is
    # a mass hanging on the forehead, not a thicker skull.
    grow += HAIR_FORELOCK * _falloff(off - HAIR_PART, 0.90) * _window(u, -0.20, 0.74)
    # Flick over the nape, on the lowest bands only.
    grow += HAIR_NAPE * _falloff(abs(off) - math.pi, 1.00) * _window(u, -0.30, 0.45)
    # The three points. Upper bands only, so the hairline below stays a clean
    # cut edge -- a ragged BOTTOM edge would read as damage rather than as hair.
    for centre, strength in HAIR_SPIKES:
        grow += (HAIR_SPIKE_MASS * strength
                 * _arc_falloff(off, centre, HAIR_SPIKE_WIDTH)
                 * _window(u, 0.25, 1.30))
    return grow


def build_hair(bm):
    """
    ONE SOLID PIECE, shaped like a Lego minifigure's hair -- not strands.

    The brief is explicit and it is the right call: no individual fibres. At
    this budget, in FogExp2, under a material that is 8% grey before
    setSilhouette multiplies it by another 0.05, a fibre is a triangle you
    cannot see. What a viewer CAN see is the OUTLINE, so all the effort goes
    there. A Lego hair piece is a moulded shell with a chunky wall and a
    crisply cut bottom edge, and it is instantly readable at any size precisely
    because it is a shape rather than a texture.

    Four shaping decisions, all of them silhouette:

      1. THE WALL STAYS THICK OVER THE CROWN. The version before this tapered
         to 8 mm up there, which hugged the skull and read as a painted-on
         skullcap -- the head's outline and the hair's outline were the same
         curve. HAIR_BANDS now holds 21-25 mm from a third of the way up to
         four fifths, so the hair is visibly a separate mass sitting ON a head.

      2. THE TOP IS RAISED, AND MORE AT THE FRONT. skull_point's `grow` is
         radial, so it can widen a crown but never lift one -- every previous
         band topped out at exactly the skull's own crown height. Running t
         past 1.0 lifts it (the profile clamps, z does not), and running it
         further at the face than at the nape gives the swept-back quiff the
         reference has.

      3. THE HAIRLINE IS A SCULPTED CURVE WITH A NOTCH IN IT. A rim that falls
         smoothly from forehead to nape is a bowl cut. HAIR_RIM keys it by hand
         so it drops off the temple, comes to a POINT in front of the ear,
         lifts behind the ear, then falls to the nape. That notch is the single
         most recognisable thing in the outline and it costs nothing.

      4. MASS IS ASYMMETRIC. A forelock sits over the brow, offset to one side
         (HAIR_PART), and a flick juts over the nape. Perfect bilateral
         symmetry is what makes procedural hair read as a helmet, and an
         off-centre parting is the cheapest possible cure.

    THE BAND HEIGHTS ARE NOT EVENLY SPACED, AND THAT IS THE WHOLE FIX for the
    first version of this shape. Evenly spaced bands put a 65-degree turn
    between the last two, because the skull's own profile collapses from 0.88
    to 0.10 of its width over the top fifth of its height -- so the surface had
    to turn through most of a right angle in one step. Past the part's sharp
    threshold that is a CREASE, and it rendered as a dent in the crown that
    looked like a modelling error. HAIR_BANDS therefore clusters where the
    skull is turning. scratchpad/haircheck.py measures the worst turn; it is
    not a thing to judge by looking, because on a near-black object a crease
    and a dent are the same pixel.

    THE INNER WALL IS ONLY TWO RINGS (HAIR_INNER_BANDS) while the outer is
    nine. It is sunk into the skull and the skull is opaque, so NONE of it is
    ever seen -- it exists to close the volume, and rings spent following a
    curve nobody can look at are pure cost. Two is safe rather than merely
    cheap: the cranium above the hairline is convex, so a chord between two
    points inside it stays inside it. haircheck.py verifies that rather than
    taking the convexity argument on trust.

    THE HAIR IS THE ONE PART THAT DOES NOT CHANGE COLOUR BETWEEN READINGS.
    Creature.js keeps it out of the correction lerp -- it is the thread between
    the thing in the corridor and the woman in the family portrait, and a
    player who notices it before the reveal has been given the reveal honestly.
    So it gets its own material. It does still move with the skull: the Hollow
    key weights it to `head` like everything else up there, so it narrows and
    stretches along with the face rather than being left behind as a cap.
    """
    def angles():
        for i in range(HAIR_SEGMENTS):
            a = 2 * math.pi * i / HAIR_SEGMENTS
            yield a, (a - math.pi * 0.5 + math.pi) % (2.0 * math.pi) - math.pi

    outer = [[bm.verts.new(skull_point(_hair_height(off, HAIR_BANDS[k][0]), a,
                                       _hair_thickness(off, k)))
              for a, off in angles()]
             for k in range(len(HAIR_BANDS))]

    # Sunk 2 mm INTO the skull, not laid exactly on it. At grow = 0 the hair's
    # underside is coplanar with the head surface and the two z-fight -- which
    # renders as a ragged patch of scalp punched through the hair, looks
    # exactly like a hole in the mesh, and is not one. Being strictly inside
    # also means this shell never has to care what the face features are doing.
    inner = [[bm.verts.new(skull_point(_hair_rim(off) + (1.0 - _hair_rim(off)) * u,
                                       a, HAIR_INNER))
              for a, off in angles()]
             for u, _ in HAIR_INNER_BANDS]

    for a, b in zip(outer, outer[1:]):
        bridge(bm, a, b)
    for a, b in zip(inner, inner[1:]):
        bridge(bm, b, a)
    bridge(bm, inner[0], outer[0])      # hairline rim
    # CAPPED WITH FANS, NOT BRIDGED TO EACH OTHER. Joining the two top rings
    # directly leaves an annulus at the apex, and an annulus between rings of
    # different heights and radii is an overhanging skirt -- it rendered as a
    # spike with a flat facet beside it. Two fans close the two domes
    # separately and the shell is still one closed manifold, because the domes
    # already meet each other at the rim. Same triangle count, no apex.
    fan(bm, outer[-1], HAIR_APEX)
    fan(bm, inner[-1], 0.002)


# ---------------------------------------------------------------------------
# Armature
# ---------------------------------------------------------------------------

# Elbow, wrist and fingertip fall out of the arm axis rather than being typed
# in, so they cannot drift away from the mesh loops that were placed at the
# same distances.
_ARM_DIR = (math.sin(ARM_A_POSE), 0.0, -math.cos(ARM_A_POSE))


def _along_arm(distance, side):
    return (side * P['shoulderWidth'] + side * _ARM_DIR[0] * distance,
            0.0,
            Y_SHOULDER + _ARM_DIR[2] * distance)


def build_armature():
    """
    A hand-authored deform skeleton, ~22 bones.

    NOT RIGIFY. Rigify's stock human metarig generates around 500 bones with
    IK/FK switching, driver-backed UI and custom widget meshes, for a skeleton
    that wants twenty-odd. Every one of those would then have to be filtered
    back out with export_def_bones on the way to a GLB. Authoring the bones
    directly is smaller, diffable, and puts each joint exactly on the number
    Creature.js already lerps.

    Blender bone names keep the .L/.R convention (+X is L) because
    parent_set(xmirror=True) and any later symmetrize depend on it. Note this
    is the OPPOSITE hand to Creature.js, whose `l` is -X -- the JS side maps by
    name and the mapping is documented there.
    """
    arm_data = bpy.data.armatures.new('creature_rig')
    arm_obj = bpy.data.objects.new('creature_rig', arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    def bone(name, head, tail, parent=None, connect=False):
        b = eb.new(name)
        b.head = head
        b.tail = tail
        b.use_deform = True
        if parent is not None:
            b.parent = eb[parent]
            # DELIBERATELY NEVER CONNECTED, even for the chains where it would
            # be the natural authoring choice. glTF has no notion of a connected
            # bone -- it stores a plain node translation -- so this changes
            # nothing about the export. What it changes is Blender: a connected
            # pose bone refuses to translate, and translating bones is precisely
            # how Creature.js lengthens a limb at runtime. Leaving them
            # connected meant the Hollow could not be previewed the way it
            # actually ships, and the preview quietly lied about it.
            b.use_connect = False
        return b

    # Spine. There is no separate root bone: Creature.js moves the whole group
    # for position and yaw (root.position/rotation on an Object3D), so a root
    # BONE would be a second thing doing the same job.
    bone('hips', (0, 0, Y_HIP - 0.06), (0, 0, Y_HIP))
    bone('spine', (0, 0, Y_HIP), (0, 0, Y_CHEST), 'hips')
    bone('chest', (0, 0, Y_CHEST), (0, 0, Y_NECK), 'spine', connect=True)
    bone('neck', (0, 0, Y_NECK), (0, 0, Y_HEAD), 'chest', connect=True)
    bone('head', (0, 0, Y_HEAD), (0, 0, HEIGHT), 'neck', connect=True)

    for side, suf in ((1, 'L'), (-1, 'R')):
        bone('clavicle.' + suf, (side * 0.030, 0, Y_SHOULDER),
             _along_arm(0.0, side), 'chest')
        bone('upper_arm.' + suf, _along_arm(0.0, side),
             _along_arm(P['upperArm'], side), 'clavicle.' + suf, connect=True)
        bone('forearm.' + suf, _along_arm(P['upperArm'], side),
             _along_arm(P['upperArm'] + P['forearm'], side),
             'upper_arm.' + suf, connect=True)
        bone('hand.' + suf, _along_arm(P['upperArm'] + P['forearm'], side),
             _along_arm(P['upperArm'] + P['forearm'] + P['hand'], side),
             'forearm.' + suf, connect=True)

        bone('thigh.' + suf, (side * P['hipWidth'], 0, Y_HIP),
             (side * P['hipWidth'], 0, Y_KNEE), 'hips')
        bone('shin.' + suf, (side * P['hipWidth'], 0, Y_KNEE),
             (side * P['hipWidth'], 0, Y_ANKLE), 'thigh.' + suf, connect=True)
        bone('foot.' + suf, (side * P['hipWidth'], 0, Y_ANKLE),
             (side * P['hipWidth'], P['footLength'] - 0.062, 0.0),
             'shin.' + suf, connect=True)

        # One bone per front panel so the coat can lag behind a turn. Motion
        # reads in fog long after value contrast has gone, so a hem that swings
        # is worth three bones.
        bone('coat_front.' + suf, (side * 0.075, 0.085, 1.10),
             (side * 0.095, 0.105, COAT_HEM), 'hips')
    bone('coat_back', (0, -0.085, 1.10), (0, -0.105, COAT_HEM), 'hips')

    bpy.ops.object.mode_set(mode='OBJECT')
    return arm_obj


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

# NAMES ARE THE INTEGRATION SEAM AND THEY ARE LOAD-BEARING. This repo ships zero
# image files: src/world/textures.js generates every map on a canvas at runtime
# and binds it with applyTextureByMaterialName(root, name, map, normalMap),
# which is a plain string compare. A typo on either side is silent -- the mesh
# simply never receives its texture. scripts/check-creature.mjs asserts this
# exact set, as an EQUALITY not a subset, so an unexpected name fails the build.
#
# The base colours here are only what the GLB carries before the runtime
# texture lands on it; the hex values come from the Okabe reference. The coat is
# a warm off-white and explicitly never pure white.
MATERIALS = [
    ('CreatureSkin',     (0.48, 0.37, 0.29, 1.0), 0.92),   # ~#E8CDB4 in linear
    ('CreatureCoat',     (0.86, 0.85, 0.81, 1.0), 0.88),   # #EFEDE8
    ('CreatureShirt',    (0.20, 0.20, 0.19, 1.0), 0.90),   # heather grey tee
    ('CreatureTrousers', (0.16, 0.13, 0.09, 1.0), 0.90),   # khaki, read dark
    ('CreatureHair',     (0.021, 0.027, 0.022, 1.0), 0.96),  # #1B211C
]
MATERIAL_INDEX = {name: i for i, (name, _, _) in enumerate(MATERIALS)}


def ensure_materials():
    """Create the five materials once, in a fixed order.

    Every part gets ALL five slots in the SAME order, so join() does not have to
    remap anything and a face's material_index means the same thing before and
    after the merge.
    """
    out = []
    for name, rgba, rough in MATERIALS:
        mat = bpy.data.materials.get(name)
        if mat is None:
            mat = bpy.data.materials.new(name)
            mat.use_nodes = True
            # Look the shader up BY TYPE. nodes['Principled BSDF'] returns None
            # on a non-English Blender, where the node is named differently.
            bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            bsdf.inputs['Base Color'].default_value = rgba
            bsdf.inputs['Roughness'].default_value = rough
            # SOLID viewport shading reads this, not the BSDF input.
            mat.diffuse_color = rgba
        out.append(mat)
    return out


def build():
    common.clear_scene()
    mats = ensure_materials()

    # Parts stay separate objects up to the join so each one can be inspected
    # and hidden on its own while the shapes are still being judged.
    # (material_name_or_None, builder, sharp_angle). A single name means the
    # whole part is that material.
    SPEC = (
        # 62 degrees, not 40. The face features turn the surface through more
        # than 40 degrees at the outer corner of each eye socket, so a 40
        # degree threshold split those edges and flat-shaded the quad
        # between them -- which renders as a hard bright bar across the
        # temple and looks like a broken normal rather than a sharp edge.
        ('body', None, build_body, 62.0),
        ('coat', 'CreatureCoat', build_coat, 25.0),
        # The sleeves ARE the coat -- same garment, same material, one fewer
        # draw call, and it keeps the set at the five names the JS binds.
        ('sleeves', 'CreatureCoat', build_sleeves, 30.0),
        # 62, the same number the head uses, and for the same reason rather
        # than by coincidence. The hair shell follows HEAD_PROFILE, and that
        # profile has a KINK in it at t = 0.62 where the cranium starts
        # collapsing toward the crown -- the surface turns 56 degrees there
        # whatever the band spacing is, because more bands sample a kink more
        # precisely rather than rounding it off. The head smooths that kink at
        # 62; anything lower creases the hair at a height the head does NOT
        # crease at, which renders as a ring around the crown that looks like a
        # seam. The edges that are supposed to be hard clear this easily: the
        # bottom rim turns ~180 degrees, so it creases at any threshold at all.
        #
        # The NOTCH does not, and that is worth stating because it was the
        # opposite of what was assumed. Measured, the sideburn V turns only
        # 26-35 degrees a step -- 32 segments spread it over three or four
        # vertices, so it is a smooth swoop in the bottom edge rather than a
        # crease across the surface. That turns out to be what is wanted: a
        # moulded hair piece has a sharp RIM and a swooping outline, not a
        # facet down the temple. scratchpad/haircheck.py prints both numbers,
        # because on a near-black object a crease and a dent are the same
        # pixel and neither is judgeable by looking.
        ('hair', 'CreatureHair', build_hair, 62.0),
    )

    parts = {}
    for name, single, builder, smooth in SPEC:
        bm = bmesh.new()
        marks = []
        if single is None:
            builder(bm, marks)
        else:
            builder(bm)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new('creature_%s_mesh' % name)
        bm.to_mesh(me)
        bm.free()

        for mat in mats:
            me.materials.append(mat)
        if single is None:
            for mat_name, first, last in marks:
                idx = MATERIAL_INDEX[mat_name]
                for f in range(first, last):
                    me.polygons[f].material_index = idx
        else:
            idx = MATERIAL_INDEX[single]
            for poly in me.polygons:
                poly.material_index = idx

        obj = bpy.data.objects.new('creature_%s' % name, me)
        bpy.context.collection.objects.link(obj)
        # TAGGED HERE, because after the join there is no way to tell a sleeve
        # vertex from a coat-body one. They share a material, they overlap in
        # space around the shoulder, and their auto-weights overlap too -- a
        # geometric test at the armhole needs a 6 mm margin to separate them,
        # which is not a test, it is a coincidence. A vertex group survives the
        # join with exactly the right members. Removed again before export.
        if name == 'sleeves':
            vg = obj.vertex_groups.new(name=SLEEVE_TAG)
            vg.add(range(len(me.vertices)), 1.0, 'REPLACE')
        for poly in me.polygons:
            poly.use_smooth = True
        # 4.1 removed use_auto_smooth; this is the replacement.
        me.set_sharp_from_angle(angle=math.radians(smooth))
        parts[name] = obj

    return parts


def pin_hands_to_hand_bone(obj):
    """
    Every vertex past the wrist belongs 100% to its own hand bone.

    THE FINGERS WERE COMING OFF. build_hand already states the intent -- "there
    are NO finger bones in the armature, so every digit moves as one with the
    hand bone regardless" -- but ARMATURE_AUTO does not know that. Bone heat
    solves per vertex, and on five thin separate digits it handed some of them
    mostly to `hand` and others mostly to `forearm`. That is invisible in the
    rest pose and invisible in the human reading, because the two bones are
    barely doing anything different.

    In the HOLLOW reading they are: SEGMENT_STRETCH grows the hand by 2.00 and
    the forearm by 1.63, each measured along its own bone. A digit on the wrong
    bone therefore travels a different distance from the one beside it, and at
    full correction 0 two fingers detach and hang in the air a few centimetres
    off the hand. It is unmistakable in a close render and completely absent
    from every numeric check in this file, which is why it survived.

    Pinning is the correct fix rather than a patch: with no finger bones there
    is no deformation the blend could be buying, so the blend is pure downside.
    Done AFTER vertex_group_limit_total so nothing re-normalises it away.
    """
    axis = Vector(_ARM_DIR).normalized()
    wrist = WRIST_ALONG - 0.02          # a little behind the wrist, into the cuff
    groups = {g.name: g for g in obj.vertex_groups}
    pinned = 0
    for side, suffix in ((-1, '.R'), (1, '.L')):
        target = groups.get('hand' + suffix)
        if target is None:
            continue
        origin = Vector((side * P['shoulderWidth'], 0.0, Y_SHOULDER))
        # The arm's own axis mirrors with the side, like the geometry does.
        arm = Vector((axis.x * side, axis.y, axis.z))
        idx = []
        for v in obj.data.vertices:
            along = (v.co - origin).dot(arm)
            if along < wrist:
                continue
            # Across the axis too: without this the check would also catch
            # anything that merely happens to be far out along that direction,
            # such as the far hip on a wide pose.
            if (v.co - (origin + arm * along)).length > 0.09:
                continue
            idx.append(v.index)
        for g in obj.vertex_groups:
            if g.name != target.name:
                g.remove(idx)
        target.add(idx, 1.0, 'REPLACE')
        pinned += len(idx)

    if pinned == 0:
        print('WARNING: pin_hands_to_hand_bone matched no vertices -- the '
              'fingers will detach in the Hollow reading. Check WRIST_ALONG '
              'and the arm axis.')
    return pinned


def blend_sleeve_to_shoulder(obj):
    """
    Rebind the sleeves: shoulder at the top, arm everywhere else.

    ARMATURE_AUTO GOT THIS BADLY WRONG and it is the reason the arm looked
    stiff. Measured off the bound mesh, the sleeve two-thirds of the way to the
    elbow carried clavicle 0.53 against upper_arm 0.02 -- so the cloth over the
    bicep was pinned to the collarbone and barely followed the arm at all. Bone
    heat solves by proximity and visibility, and a sleeve is a shell OUTSIDE
    the arm with the arm's own mesh between it and the upper_arm bone, so the
    clavicle wins a line-of-sight test it should lose.

    What a sleeve actually wants is the opposite gradient: sewn into the
    armhole at the top, hanging off the arm below it. That is what this writes
    -- clavicle at the cap, easing to pure upper_arm by SLEEVE_ANCHOR_UNTIL,
    and pure upper_arm for the whole rest of the tube.

    The sleeve is found by its build-time tag rather than by geometry; see
    SLEEVE_TAG for why a geometric test does not work here.
    """
    tag = obj.vertex_groups.get(SLEEVE_TAG)
    if tag is None:
        print('WARNING: no %s group -- sleeves keep their auto-weights, which '
              'bind the bicep to the collarbone.' % SLEEVE_TAG)
        return 0
    tag_idx = tag.index
    sleeve = [v.index for v in obj.data.vertices
              if any(g.group == tag_idx and g.weight > 0.5 for g in v.groups)]

    groups = {g.name: g for g in obj.vertex_groups}
    base = Vector(_ARM_DIR).normalized()
    touched = 0
    for vi in sleeve:
        v = obj.data.vertices[vi]
        # Which arm is it on? The sleeve is mirrored, so the sign of x decides,
        # and Blender's .L is +X.
        side = 1 if v.co.x >= 0 else -1
        suffix = '.L' if side > 0 else '.R'
        arm_g = groups.get('upper_arm' + suffix)
        clav_g = groups.get('clavicle' + suffix)
        if arm_g is None or clav_g is None:
            continue
        origin = Vector((side * P['shoulderWidth'], 0.0, Y_SHOULDER))
        arm = Vector((base.x * side, base.y, base.z))
        along = (v.co - origin).dot(arm)
        t = max(0.0, min(1.0, along / SLEEVE_ANCHOR_UNTIL))
        w = SLEEVE_ANCHOR * (1.0 - t)
        # Everything that is not the shoulder anchor goes to the arm, and the
        # OTHER groups are cleared -- leaving the auto-weights in place is what
        # produced the 0.53 clavicle on the bicep in the first place.
        for g in obj.vertex_groups:
            if g.index != tag_idx and g.name not in (arm_g.name, clav_g.name):
                g.remove([vi])
        clav_g.add([vi], w, 'REPLACE')
        arm_g.add([vi], 1.0 - w, 'REPLACE')
        touched += 1

    # NOT removed here any more -- build_hollow_key needs it too. See the note
    # on its sleeve test.
    if touched == 0:
        print('WARNING: blend_sleeve_to_shoulder matched no vertices.')
    return touched


def weight_orphans(obj, rig):
    """
    Give every unweighted vertex to the bone nearest it, and say how many.

    ARMATURE_AUTO's bone heat solves a diffusion problem over the mesh volume,
    and it silently gives up on geometry it cannot see a bone from. The lapels
    triggered it the first time they were built: they stand 14 mm proud of the
    coat, outside the surface heat propagates over, so a batch of their
    vertices came out with no weights at all.

    THAT FAILS LOUDLY RATHER THAN QUIETLY, which is the only reason it was
    caught. The glTF exporter invents a joint called neutral_bone to park
    unweighted vertices on, and check-creature.mjs asserts that joint is
    absent -- so "some geometry does not deform" turns into a red build instead
    of a lapel that hangs in the air while the body walks out from under it.
    Keep that assertion.

    Nearest-bone is the right default here: an orphan is by definition a vertex
    the solver could not attribute, and the closest bone is what it would have
    followed had it been inside the surface. It prints the count because a
    LARGE number means something is structurally wrong rather than a few
    vertices being awkward.
    """
    bones = [(b.name, Vector(b.head_local), Vector(b.tail_local))
             for b in rig.data.bones]

    def nearest(co):
        best, bestd = None, 1e9
        for name, head, tail in bones:
            seg = tail - head
            L2 = seg.length_squared
            t = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, (co - head).dot(seg) / L2))
            d = (co - (head + seg * t)).length
            if d < bestd:
                best, bestd = name, d
        return best

    groups = {g.name: g for g in obj.vertex_groups}
    claimed = {}
    for v in obj.data.vertices:
        if any(g.weight > 1e-4 for g in v.groups):
            continue
        name = nearest(v.co)
        if name is None or name not in groups:
            continue
        claimed.setdefault(name, []).append(v.index)

    total = 0
    for name, idx in claimed.items():
        groups[name].add(idx, 1.0, 'REPLACE')
        total += len(idx)
    if total:
        print('weight_orphans: adopted %d unweighted vertices -> %s'
              % (total, ', '.join('%s x%d' % (k, len(v)) for k, v in sorted(claimed.items()))))
    return total


def build_rigged():
    """
    Geometry -> one joined mesh -> armature -> weights, in one reproducible go.

    This exists because the rig was originally assembled by hand through a live
    Blender session, which meant the geometry was reproducible and the SKELETON
    was not. Anything that cannot be rebuilt by `blender --background --python`
    is not really in the repo.
    """
    parts = build()
    rig = build_armature()

    # --- join ---------------------------------------------------------------
    # Deliberately NO remove_doubles after this: the parts are overlapping
    # shells and welding them would fuse the coat to the body.
    bpy.ops.object.select_all(action='DESELECT')
    for key in ('body', 'coat', 'sleeves', 'hair'):
        parts[key].select_set(True)
    obj = parts['body']
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()
    obj.name = 'creature'
    obj.data.name = 'creature_mesh'

    # --- bind ---------------------------------------------------------------
    # The ARMATURE must be active and the mesh merely selected, or the operator
    # binds nothing and reports success.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO', xmirror=True)

    # --- four influences, decided here rather than at export ----------------
    # three.js reads only JOINTS_0/WEIGHTS_0. Left to the exporter, BLENDER
    # picks which four survive and renormalises, so the mesh stays intact and
    # deforms wrongly at exactly the multi-bone regions where it is hardest to
    # see. Limiting on purpose is the difference between a known rig and a
    # subtly melted one.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    weight_orphans(obj, rig)
    pin_hands_to_hand_bone(obj)
    blend_sleeve_to_shoulder(obj)

    # AFTER the weight edits above, not before. blend_sleeve_to_shoulder adds a
    # clavicle influence to vertices that already carry four, and limiting
    # first leaves them at five -- at which point the glTF exporter drops the
    # smallest itself, renormalises, and says so only in a log line. That is
    # the exact failure this call exists to prevent, and it is worth being
    # precise about why: a mesh with five influences still EXPORTS, still
    # loads, and deforms wrongly only at the multi-bone regions, which is where
    # it is hardest to see.
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)

    unwrap(obj)
    build_hollow_key(obj, rig)

    # The tag has done both its jobs now (rebinding the sleeves, and telling
    # the shape key a sleeve from a lapel). Dropped before export so it cannot
    # be mistaken for a joint influence by anything downstream.
    tag = obj.vertex_groups.get(SLEEVE_TAG)
    if tag:
        obj.vertex_groups.remove(tag)
    return obj, rig


# ---------------------------------------------------------------------------
# The Hollow shape key
# ---------------------------------------------------------------------------

# Ratios, not absolutes, read straight off the HUMAN and HOLLOW tables in
# src/systems/Creature.js. Ratios because the surface widths here are
# anatomical while that file's were box scales -- see the header.
# HOW LONG EACH SEGMENT GETS, as HOLLOW / HUMAN from src/systems/Creature.js.
#
# THIS IS IN THE SHAPE KEY AND NOT IN THE BONES, AND THAT COST A REBUILD TO
# WORK OUT. The obvious reading of the tables is that a limb lengthens by
# moving the CHILD bone further down its parent -- and that is exactly what
# Creature.js does to place the joints. But in a skinned mesh moving a child
# only moves the child: the parent's GEOMETRY does not stretch to follow. The
# result was a forearm still 0.27 m long with its hand floating 0.17 m past the
# end of it, and the same hole at every other joint. It showed up first as
# "the fingers do not get longer", which looked like a small cosmetic miss and
# was actually this.
#
# Bone scaling is not the answer either: a non-uniform scale on a bone shears
# every child that sits at an angle to it, which is most of an arm.
#
# So the bones move the JOINTS and the key stretches the FLESH, both read off
# the same table, and they agree by construction. The key is applied in bind
# space before skinning, so a lengthened forearm still bends at its own elbow.
SEGMENT_STRETCH = {
    'spine': 0.30 / 0.26,
    'chest': 0.22 / 0.20,
    'neck': 0.155 / 0.09,
    'upper_arm': 0.45 / 0.30,
    'forearm': 0.44 / 0.27,
    'hand': 0.20 / 0.10,
    'thigh': 0.46 / 0.44,
    'shin': 0.45 / 0.42,
    'foot': 0.24 / 0.20,
}

# LEGS. Against the thickened human radius, so the Hollow's legs stay exactly
# as emaciated in absolute terms (0.034 m) while the human reading grew.
LIMB_THIN = 0.034 / (0.052 * LIMB_GIRTH)

# THE SHOES DO NOT WASTE AWAY, and that is the point of giving them their own
# number rather than letting them ride LIMB_THIN with the rest of the limb.
# Everything else on this figure thins because it is flesh on a starved frame.
# A shoe is an object: it keeps the size it was made in, and a wasted leg
# standing in a shoe that still fits is a far better statement of what happened
# to this body than a shoe that shrank politely along with the foot inside it.
#
# 0.82 rather than a flat 1.0 only so the ankle does not step out into a clown
# shoe. scratchpad/footcheck.py measures what it buys, against a control that
# lets the shoe waste with the rest of the limb: 212 x 50 mm and 4.23:1 becomes
# 214 x 75 mm and about 2.8:1, which is the proportion a real shoe has. 0.92
# was tried first and came out stubby at 2.54:1.
FOOT_THIN = 0.82

# ARMS, and this one goes the OTHER WAY on purpose. The Hollow's arms were
# 0.034 m -- pencils, and the thing the player actually looks at in the
# backrooms, since the human reading only appears at the Level 1 window and the
# reveal. 0.043 puts some meat on them.
#
# THE CONTRAST IS NOT LOST BY DOING THIS, which is the objection to answer.
# Against a human arm now at 0.052 * 0.95 = 0.0494 the ratio is 0.87, where it
# used to be 0.65 -- so thickness is no longer carrying much of the twist. It
# did not have to: the arms still LENGTHEN by 1.5x (SEGMENT_STRETCH), the coat
# hem still inverts against the fingertips, and length at a silhouette reads
# from across a corridor where a 15 mm difference in radius never did.
ARM_THIN = 0.043 / (0.052 * ARM_GIRTH)
# Sleeves thin only ~72% of the way the arm inside them does, so the cloth
# ends up about 10 mm proud of the arm rather than 22 mm. Loose, not hollow.
SLEEVE_THIN = 1.0 - (1.0 - ARM_THIN) * 0.72

# THE SLEEVE CAP COLLAPSES WITH THE COAT IT SITS UNDER.
#
# The sleeve's top ring is an open RIM -- the annulus where its outer and inner
# walls meet -- and the coat's shoulder is what covers it. Once COAT_COLLAPSE
# pulled the shoulder seam in to 0.79 the rim stopped being covered and came
# out as a bright square shelf on each shoulder, which is the same defect the
# sleeve's own comment records from the other direction ("any part of it the
# coat fails to cover reads as a dark slot at the shoulder").
#
# So the cap thins to roughly what the coat above it does, easing back to
# SLEEVE_THIN by the elbow, where the coat is no longer over it and the loose
# cloth is the point. 0.22 m along the arm is just past halfway to the elbow.
# How much of the sleeve cap belongs to the SHOULDER rather than the arm, and
# how far down the arm that hand-over finishes. See blend_sleeve_to_shoulder.
SLEEVE_TAG = '_sleeve_tag'
SLEEVE_ANCHOR = 0.78
SLEEVE_ANCHOR_UNTIL = 0.11

SLEEVE_CAP_THIN = 0.80
SLEEVE_CAP_UNTIL = 0.22
# ---------------------------------------------------------------------------
# How the COAT hangs on the Hollow
# ---------------------------------------------------------------------------
#
# The coat body used to be excluded from this key entirely -- it kept its full
# human measurements while the torso inside went to 0.758 x 0.686 and the arms
# grew half again as long. The comment called that free horror. Seen rendered
# beside the human reading it is not: a rigid full-size garment standing off a
# wasted frame does not read as a coat hanging loose, it reads as a box with a
# stick in it, and the squared-off shoulders are the worst of it because the
# shoulder seam is the one part of a coat that is supposed to SIT on the body.
#
# What cloth actually does when the body under it wastes: it keeps its own
# length and hem, because cloth does not shrink -- but it loses the shoulders
# that were holding it out, so the top collapses toward the frame and the
# excess falls into slack lower down. So the collapse is strongest at the
# shoulder seam and eases to nothing at the hem, which is the opposite of
# scaling the whole garment and is what keeps the silhouette a coat.
#
# The hem is left at 1.00 deliberately. It is load-bearing: the hem-versus-
# fingertip inversion is the single measurement the whole design rests on, and
# pulling the hem in would start eating it.
COAT_COLLAPSE = [
    (COAT_HEM, 1.00),   # hangs free, unchanged -- see above
    (0.92, 0.96),       # over the hips
    (1.04, 0.91),       # waist
    (1.16, 0.88),
    (1.26, 0.96),       # flaring back out to meet the shoulder
    # THE SHOULDER BARELY NARROWS, and that is both more accurate and the fix
    # for a hole. Cloth does not shrink: when the body under a coat wastes, the
    # shoulder SLUMPS rather than pulling in, and the width stays roughly what
    # it was. Collapsing it to 0.79 pulled the coat off the sleeve cap it is
    # sewn to and opened a ragged gap through to the shirt on each shoulder --
    # visible head-on, which is the angle the corridor gives you. The drape now
    # lives in the chest and waist, where it belongs.
    # THE SHOULDER DOES NOT NARROW AT ALL, and this is the second time that
    # number has had to come up. The coat collapses about the BODY's centre
    # while the arm stays where it is -- nothing in the Hollow moves the
    # shoulder joint inward -- so every millimetre the coat pulls in is a
    # millimetre of arm it stops covering. At 0.90 the seam moved ~25 mm and
    # the deltoid came through as a patch of bare skin on the shoulder, which
    # is precisely the failure the arm's own section table already records
    # ("left up to 8 mm of bare deltoid showing over the coat -- which rendered
    # as a brown patch on each shoulder and looked like a hole in the coat").
    #
    # Nothing is lost by holding it at 1.0. The drape that makes the garment
    # read as too big lives in the chest and waist, where the body actually
    # wasted; a coat that is full width at the shoulder and 0.85 at the chest
    # is exactly what a too-big coat on a thin frame looks like.
    (1.34, 1.00),       # shoulder seam: holds the arm, must not move
    # ABOVE the shoulder the collar is free to close in, and it has to. The
    # Hollow thins the neck to 0.545 and lengthens it 1.72x, so what stands in
    # the collar is a stalk -- and the collar, left at full width, gaped round
    # it and showed a dark wedge at the back of the neck in profile. These sit
    # above z = 1.34 so nothing here can uncover the arm again.
    # HELD AT FULL WIDTH UNTIL 1.42, which is above the sleeve's top rim. The
    # sleeve starts at along -0.050, i.e. z = 1.400, and the deltoid inside it
    # reaches higher still -- so a taper beginning at the neckline pulls cloth
    # off the shoulder and 16 skin vertices came through with an 8 mm gap.
    # Measured by scratchpad/skincheck.py, which casts a ray straight out from
    # the arm bone and asks whether it passes through cloth; by eye this was
    # three rounds of "looks about right" and it was not.
    (1.42, 1.00),
    (1.47, 0.88),       # collar, now clear of the sleeve, free to close in
    (1.50, 0.80),       # collar top, following the thinned neck
]

# Radians the front panels swing OPEN. An unbuttoned coat on a body that has
# lost its chest has nothing keeping the fronts near each other, and a wider
# opening is also what lets the dark core show through -- the pale-over-dark
# read the whole garment exists for.
COAT_GAPE = 0.13

# The coat's rings are offset forward/back per height (the `cy` column in its
# sections). Collapsing toward y = 0 instead of toward the garment's own centre
# would drag the whole coat backwards as it narrowed. This is the mean of those
# offsets, which is within 8 mm of every one of them.
COAT_CENTRE_Y = 0.0


def coat_collapse(z):
    """Inward scale for a coat vertex at height z. See COAT_COLLAPSE."""
    if z <= COAT_COLLAPSE[0][0]:
        return COAT_COLLAPSE[0][1]
    if z >= COAT_COLLAPSE[-1][0]:
        return COAT_COLLAPSE[-1][1]
    for (z0, k0), (z1, k1) in zip(COAT_COLLAPSE, COAT_COLLAPSE[1:]):
        if z0 <= z <= z1:
            return k0 + (k1 - k0) * (z - z0) / (z1 - z0)
    return COAT_COLLAPSE[-1][1]


TORSO_THIN_X = 0.125 / 0.165  # torsoWidth   0.758
TORSO_THIN_Y = 0.072 / 0.105  # torsoDepth   0.686
HEAD_THIN = 0.098 / 0.115     # headRadius   0.852
HEAD_STRETCH = 1.34           # headStretch


def build_hollow_key(obj, rig):
    """
    One shape key: everything about the Hollow that BONES CANNOT DO.

    THE DIVISION OF LABOUR, because getting it wrong is the one mistake that
    would quietly wreck the twist. A shape key moves vertices; it cannot move a
    joint. Morph the arm half again as long and the elbow BONE stays where it
    was, so the limb creases through the middle of the forearm. So:

        lengths and rotations  -> bones, driven from the same lerped table
        thickness and the skull -> this key

    Creature.js drives both from the one correction dial, in lockstep, so a
    half-corrected figure is a coherent in-between rather than a mixture of two
    unrelated effects.

    THE COAT BODY IS DELIBERATELY EXCLUDED. It thins to nothing while the body
    inside it goes to 0.65-0.76, so the garment starts visibly hanging too big
    on a wasted frame. That is free horror and thinning it with the body would
    throw it away.

    THE SLEEVES ARE A SEPARATE CASE, and treating them as coat was wrong. A
    coat body hangs loose to begin with, so leaving it alone reads as drape. A
    sleeve is a close tube, and leaving it alone around an arm that has thinned
    by a third leaves a 22 mm void you can see into at the cuff -- which reads
    as a modelling hole, not as a loose garment. They thin PARTWAY instead
    (SLEEVE_THIN), so they stay visibly too big without floating.

    They still do not STRETCH, which is the point: the arm lengthens by 1.5x
    underneath a sleeve that does not, so the sleeve rides up the arm and
    leaves progressively more bare forearm hanging out of it. That is the
    effect, not a side effect.

    Sleeves are told apart from coat by WHICH BONE OWNS THEM, not by where
    they are: both are CreatureCoat, but nothing on the coat body is ever
    weighted to an arm bone.

    Vertices are transformed through their BONE WEIGHTS rather than by testing
    their position, so the blend across a joint is automatically smooth and a
    vertex half-owned by the chest and half by the arm gets half of each.
    """
    LIMB = {'upper_arm', 'forearm', 'hand', 'thigh', 'shin', 'foot'}
    TORSO = {'hips', 'spine', 'chest'}

    rest = {b.name: (Vector(b.head_local), Vector(b.tail_local))
            for b in rig.data.bones}

    coat_idx = MATERIAL_INDEX['CreatureCoat']
    coat_verts = set()
    for poly in obj.data.polygons:
        if poly.material_index == coat_idx:
            coat_verts.update(poly.vertices)

    if obj.data.shape_keys is None:
        # from_mix defaults to TRUE, which would bake whatever is currently
        # showing into the key instead of the rest shape.
        obj.shape_key_add(name='Basis', from_mix=False)
    key = obj.shape_key_add(name='Hollow', from_mix=False)
    key.value = 0.0

    group_name = {g.index: g.name for g in obj.vertex_groups}
    _tag = obj.vertex_groups.get(SLEEVE_TAG)
    sleeve_tag = _tag.index if _tag else None
    if sleeve_tag is None:
        print('WARNING: %s missing in build_hollow_key -- sleeves and lapels '
              'will be transformed alike.' % SLEEVE_TAG)

    ARM = {'upper_arm', 'forearm', 'hand'}

    for v in obj.data.vertices:
        sleeve = False
        if v.index in coat_verts:
            # TAGGED, not inferred. This used to be "a coat vertex owned by an
            # arm bone is a sleeve; the coat body is never weighted to one" --
            # which was true until weight_orphans started adopting stranded
            # lapel vertices, and the nearest bone to a lapel lying on the
            # chest is frequently upper_arm. Eight vertices a side were then
            # handed the SLEEVE transform, which thins about the ARM's axis, so
            # cloth sitting on the sternum got dragged toward a bone half a
            # body away. The lapels came out shredded, with holes punched
            # through them, in the Hollow reading only.
            #
            # The build-time tag says which vertices are actually sleeve, so
            # there is nothing left to infer.
            sleeve = bool(sleeve_tag is not None
                          and any(g.group == sleeve_tag and g.weight > 0.5
                                  for g in v.groups))
            if not sleeve:
                # THE COAT BODY DRAPES rather than being skipped. Done here in
                # the shape key and NOT through bone weights, because this is
                # not something a bone does: it is the garment losing the
                # shoulders that were holding it out, which is a change of
                # shape rather than of pose.
                q = v.co
                k = coat_collapse(q.z)
                cy = COAT_CENTRE_Y
                x, y = q.x * k, cy + (q.y - cy) * k
                # Swing the front panels open. The weight is cos of the angle
                # off the opening, so it is full at the front edges and zero at
                # the spine -- a coat gapes at the front, it does not rotate.
                ang = math.atan2(x, y - cy)
                w = max(0.0, math.cos(ang))
                # NEGATIVE, and the sign is the whole trick. A positive
                # rotation takes +X toward +Y, so on the front-RIGHT panel it
                # swings the edge toward the front centre-line -- it CLOSES the
                # coat, and the two panels then cross through each other. That
                # rendered as V-shaped bites out of the chest, which looked
                # like torn geometry rather than a sign error.
                a2 = -COAT_GAPE * w * math.copysign(1.0, x if abs(x) > 1e-9 else 1.0)
                ca, sa = math.cos(a2), math.sin(a2)
                ox, oy = x, y - cy
                key.data[v.index].co = Vector((ox * ca - oy * sa,
                                               cy + ox * sa + oy * ca,
                                               q.z))
                continue
        p = v.co
        delta = Vector((0.0, 0.0, 0.0))
        for g in v.groups:
            if g.weight <= 1e-4:
                continue
            name = group_name[g.group]
            base = name.split('.')[0]
            if sleeve:
                # Thin partway about the arm axis; deliberately NO stretch, so
                # the sleeve rides up as the arm grows underneath it.
                if base not in ARM:
                    continue
                head, tail = rest[name]
                axis = tail - head
                if axis.length < 1e-6:
                    continue
                axis.normalize()
                along = (p - head).dot(axis)
                on_axis = head + axis * along
                t = min(1.0, max(0.0, along / SLEEVE_CAP_UNTIL))

                # THE CAP MOVES WITH THE COAT, NOT WITH THE ARM, and getting
                # that wrong tore the shoulder open. The coat collapses toward
                # the BODY's centre-line and the sleeve was thinning toward the
                # ARM's axis -- two different transforms about two different
                # centres, so however well each was tuned on its own the two
                # surfaces slid apart at the armhole and left a ragged hole
                # through to the shirt on each shoulder. Shrinking both by
                # similar amounts did not help: it moved them apart equally.
                #
                # So the cap gets the coat's own transform, exactly, and is
                # therefore still welded to the shoulder it is sewn into. Only
                # further down the arm, where there is no coat over it any
                # more, does it become loose cloth on a thin limb.
                k = coat_collapse(p.z)
                coat_target = Vector((p.x * k,
                                      COAT_CENTRE_Y + (p.y - COAT_CENTRE_Y) * k,
                                      p.z))
                arm_target = on_axis + (p - on_axis) * SLEEVE_THIN
                target = coat_target.lerp(arm_target, t)
                delta += (target - p) * g.weight
                continue

            if base in LIMB or base == 'neck':
                head, tail = rest[name]
                axis = tail - head
                if axis.length < 1e-6:
                    continue
                axis.normalize()
                along = (p - head).dot(axis)
                on_axis = head + axis * along
                # Stretch ALONG the bone as well as thinning across it -- see
                # SEGMENT_STRETCH. Measured from the bone's HEAD, so the joint
                # itself stays put and only the flesh beyond it moves.
                grow = (SEGMENT_STRETCH.get(base, 1.0) - 1.0) * along
                thin = (ARM_THIN if base in ARM
                        else FOOT_THIN if base == 'foot' else LIMB_THIN)
                target = on_axis + axis * grow + (p - on_axis) * thin
            elif base in TORSO:
                # The spine and chest lengthen too, and they run up +Z.
                head, _ = rest[name]
                grow = (SEGMENT_STRETCH.get(base, 1.0) - 1.0) * (p.z - head.z)
                target = Vector((p.x * TORSO_THIN_X, p.y * TORSO_THIN_Y, p.z + grow))
            elif base == 'head':
                # Narrow AND stretch, about the head's base rather than its
                # centre, so the skull grows upward out of the collar instead
                # of sinking into the chest. The hair rides along with it --
                # Creature.js scales the hair by headStretch too, and the hair
                # being the one constant between the two readings is about its
                # COLOUR, which never lerps, not its shape.
                target = Vector((p.x * HEAD_THIN, p.y * HEAD_THIN,
                                 Y_HEAD + (p.z - Y_HEAD) * HEAD_STRETCH))
            else:
                continue      # coat bones drive cloth; cloth does not thin
            delta += (target - p) * g.weight
        if delta.length > 1e-9:
            key.data[v.index].co = p + delta

    return key


def unwrap(obj):
    """
    Smart UV Project.

    NOT common.box_project_uvs. That helper projects world position onto the two
    axes nearest each face's normal, which is exact for the boxes and panels the
    props are made of and wrong for anything curved -- build_flashlight.py
    already refuses it for the lathed barrel because of the seam and the axial
    stretching. A character is curved everywhere.

    It does not have to be a beautiful unwrap. The textures are procedural
    canvases from src/world/textures.js viewed at 5-15 m through FogExp2, and
    for most of the creature's screen time setSilhouette(true) has multiplied
    every colour by 0.05. What it DOES have to be is roughly even in texel
    density, because heightToNormalMap() derives normals from a height canvas
    and uneven density makes the derived normal strength vary across the body.

    Without TEXCOORD_0 the GLB carries no UVs at all and every runtime texture
    silently does nothing -- which is why check-creature.mjs asserts it.
    """
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0),
                             island_margin=0.02,
                             correct_aspect=True,
                             scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj.data.uv_layers.active.name


def audit(obj, rig):
    """Everything scripts/check-creature.mjs will later assert, checked here
    where it is still cheap to fix."""
    unweighted = 0
    over4 = 0
    for v in obj.data.vertices:
        gs = [g for g in v.groups if g.weight > 1e-4]
        if not gs:
            unweighted += 1
        if len(gs) > 4:
            over4 += 1
    counts = {}
    for poly in obj.data.polygons:
        n = obj.data.materials[poly.material_index].name
        counts[n] = counts.get(n, 0) + (len(poly.vertices) - 2)
    keys = obj.data.shape_keys
    moved = 0
    max_move = 0.0
    if keys and 'Hollow' in keys.key_blocks:
        basis = keys.key_blocks['Basis'].data
        hollow = keys.key_blocks['Hollow'].data
        for i in range(len(obj.data.vertices)):
            d = (hollow[i].co - basis[i].co).length
            if d > 1e-6:
                moved += 1
            max_move = max(max_move, d)
    return {
        'verts': len(obj.data.vertices),
        'tris': sum(len(p.vertices) - 2 for p in obj.data.polygons),
        'bones': len(rig.data.bones),
        'unweighted_verts': unweighted,
        'verts_over_4_influences': over4,
        'materials': [m.name for m in obj.data.materials],
        'tris_per_material': counts,
        'uv_layers': [l.name for l in obj.data.uv_layers],
        'shape_keys': [k.name for k in keys.key_blocks] if keys else [],
        'hollow_verts_moved': moved,
        'hollow_max_move_m': round(max_move, 4),
    }


def stats(obj):
    return {
        'verts': len(obj.data.vertices),
        'faces': len(obj.data.polygons),
        'tris': sum(len(p.vertices) - 2 for p in obj.data.polygons),
    }


def report(parts):
    out = {k: stats(o) for k, o in parts.items()}
    out['TOTAL_tris'] = sum(v['tris'] for v in out.values() if isinstance(v, dict))
    out['budget_tris'] = 5000
    return out


OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        '..', 'src', 'assets', 'models', 'creature.glb')


if __name__ == '__main__':
    import json
    obj, rig = build_rigged()
    print(json.dumps(audit(obj, rig), indent=1))
    common.export_rigged_glb(os.path.normpath(OUT_PATH), [obj, rig])
