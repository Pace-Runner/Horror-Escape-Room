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

    sections is [(distance_along_axis, radius_x, radius_z), ...]. A negative
    distance puts the ring behind the origin, which is how a limb is buried
    inside the torso: overlapping shells, not a welded junction. That is
    standard for a low-poly character and it is what stops an arm reading as
    detached from the shoulder.
    """
    d = Vector(direction).normalized()
    up = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
    x = d.cross(up).normalized()
    y = d.cross(x).normalized()
    basis = Matrix((x, y, d)).transposed()

    rings = []
    for along, rx, rz in sections:
        rings.append([bm.verts.new(Vector(origin) + basis @ Vector(
            (rx * math.cos(2 * math.pi * i / n),
             rz * math.sin(2 * math.pi * i / n), along))) for i in range(n)])
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
    return (( HR * rw * 0.92 + grow + radial) * math.cos(angle),
            fy + y_shift + forward + (HR * rd * 1.04 + grow + radial) * math.sin(angle),
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


def _digit(bm, origin, basis, root, direction, lengths, radii):
    """One finger: a short tapered tube from `root`, in the limb's own frame."""
    d = Vector(direction).normalized()
    perp1 = Vector((-d.y, d.x, 0.0))
    if perp1.length < 1e-6:
        perp1 = Vector((1.0, 0.0, 0.0))
    perp1.normalize()
    perp2 = d.cross(perp1).normalized()

    pts = [Vector(root)]
    for ln in lengths:
        pts.append(pts[-1] + d * ln)

    rings = []
    for pt, r in zip(pts, radii):
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
    one with the hand bone regardless; adding twenty joints would quadruple the
    skeleton to articulate something that is never seen closer than about two
    metres, and then only in a lightning flash. What has to read is the COUNT
    and the LENGTH, and those are free.
    """
    basis = limb_basis(direction)
    palm_len = KNUCKLE_ALONG - WRIST_ALONG

    # Thin across the back of the hand, wide front-to-back -- the palm plane of
    # a hanging arm faces the thigh.
    # The first ring starts BEFORE the wrist and slightly WIDER than the
    # forearm is there, so it sleeves over the forearm's end cap. Starting it
    # flush and narrower left the cap's rim standing proud of the palm as a
    # hard ledge right where a wrist should be.
    palm = []
    for along, rx, ry in ((WRIST_ALONG - 0.014, 0.027, 0.029),
                          (WRIST_ALONG + palm_len * 0.40, 0.019, 0.030),
                          (KNUCKLE_ALONG, 0.015, 0.030)):
        palm.append([bm.verts.new(Vector(origin) + basis @ Vector(
            (rx * math.cos(2 * math.pi * i / (FINGER_SEGMENTS * 2)),
             ry * math.sin(2 * math.pi * i / (FINGER_SEGMENTS * 2)), along)))
            for i in range(FINGER_SEGMENTS * 2)])
    for a, b in zip(palm, palm[1:]):
        bridge(bm, a, b)
    bm.faces.new(tuple(reversed(palm[0])))
    bm.faces.new(tuple(palm[-1]))

    # Four fingers across the palm's wide axis, splayed slightly so they do not
    # read as one slab, and with the middle pair longest.
    for k, spread in enumerate((-0.0215, -0.0072, 0.0072, 0.0215)):
        taper = 1.0 - abs(k - 1.5) * 0.12
        _digit(bm, origin, basis,
               root=(0.0, spread, KNUCKLE_ALONG - 0.006),
               direction=(0.0, spread * 0.22, 1.0),
               lengths=[0.026 * taper, 0.022 * taper, 0.018 * taper],
               radii=[0.0076, 0.0068, 0.0055, 0.0034])

    # Thumb: off the front edge of the palm, swung well away from the fingers.
    _digit(bm, origin, basis,
           root=(0.0, 0.026 * side, WRIST_ALONG + palm_len * 0.28),
           direction=(0.0, 0.68 * side, 0.73),
           lengths=[0.021, 0.017],
           radii=[0.0082, 0.0068, 0.0044])


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
    torso = [
        zring(bm, 0.79, 0.115, 0.088, cy=-0.004),          # crotch, narrow
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
    for a, b in zip(torso, torso[1:]):
        bridge(bm, a, b)
    bm.faces.new(tuple(reversed(torso[0])))
    bm.faces.new(tuple(torso[-1]))
    mark('CreatureShirt', _f0)

    # --- arms ---------------------------------------------------------------
    _f0 = len(bm.faces)
    # Loops land ON the elbow (0.30) and wrist (0.57), with one either side of
    # the elbow so the crease has something to fold into.
    for side in (-1, 1):
        limb(bm, (side * P['shoulderWidth'], 0.0, Y_SHOULDER),
             (math.sin(ARM_A_POSE) * side, 0.0, -math.cos(ARM_A_POSE)), [
                 # Narrower and shorter than they were. These rings exist only
                 # to overlap the shoulder YOKE, and at 0.066 they out-reached
                 # the sleeve above them and left up to 8 mm of bare deltoid
                 # showing over the coat -- which rendered as a brown patch on
                 # each shoulder and looked like a hole in the coat.
                 (-0.040, 0.060, 0.060),   # buried in the yoke
                 (-0.008, 0.062, 0.062),   # deltoid, the widest point
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
                 (0.385, 0.041, 0.043),
                 (0.470, 0.033, 0.035),
                 (0.540, 0.027, 0.029),
                 (WRIST_ALONG, 0.024, 0.026),   # WRIST, narrowest
             ])
        build_hand(bm, (side * P['shoulderWidth'], 0.0, Y_SHOULDER),
                   (math.sin(ARM_A_POSE) * side, 0.0, -math.cos(ARM_A_POSE)), side)
    # The whole arm is bare skin: the sleeve is a separate shell that covers
    # everything above the elbow, so there is nothing here to paint as cloth.
    mark('CreatureSkin', _f0)

    # --- legs ---------------------------------------------------------------
    _f0 = len(bm.faces)
    for side in (-1, 1):
        limb(bm, (side * P['hipWidth'], 0.0, Y_HIP), (0, 0, -1), [
            (-0.075, 0.074, 0.078),   # buried in the pelvis, kept INSIDE its
            (-0.020, 0.080, 0.084),   # radius so the thigh does not step out
            # (0.060) removed: it carried the SAME radius as the ring above it,
            # so it shaped nothing, and it sits at z = 0.86 -- 160 mm up inside
            # the coat, whose hem is at 0.70.
            (0.400, 0.058, 0.062),
            (0.440, 0.055, 0.058),    # KNEE
            (0.480, 0.054, 0.057),
            (0.620, 0.048, 0.050),
            (0.860, 0.034, 0.036),    # ankle
        ])  # capped: an open ankle ring left 16 boundary edges you could see into

        # Foot: a wedge from the ankle forward along +Y, the facing direction.
        fr = []
        for z, y0, y1, hw in ((Y_ANKLE + 0.02, -0.055, 0.045, 0.040),
                              (0.0, -0.062, P['footLength'] - 0.062, 0.046)):
            fr.append([bm.verts.new((side * P['hipWidth'] + v[0], v[1], v[2]))
                       for v in [(-hw, y0, z), (hw, y0, z), (hw, y1, z), (-hw, y1, z)]])
        bridge(bm, fr[0], fr[1])
        bm.faces.new(tuple(reversed(fr[0])))
        bm.faces.new(tuple(fr[1]))
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
# torso, so the hem rises to ~0.83 and the fingertips fall to ~0.42 -- the hands
# end up hanging 40 cm clear of a coat that has become a short jacket. The coat
# is a ruler the viewer measures the distortion against, which is a far stronger
# effect than long arms on a bare body. A knee-length coat would cover the
# fingertip/knee relationship and destroy it.
COAT_HEM = 0.70
COAT_TOP = Y_NECK + 0.02
# Wall thickness. The coat is modelled double-walled rather than solidified,
# because export_apply=False (mandatory for shape keys) means no modifier is
# ever applied and a Solidify would simply not be in the GLB.
COAT_T = 0.011
COAT_SEGMENTS = 20


def arc_ring(bm, z, rx, ry, cy, gap_deg, n=COAT_SEGMENTS):
    """
    A partial ellipse, open across the front.

    The coat is WORN OPEN -- two sources say unbuttoned explicitly, and it is
    the whole silhouette. A closed coat would hide the narrowed torso and the
    arms and turn the figure into a featureless cone. The figure faces +Y, so
    the gap is centred on +Y, i.e. on 90 degrees.
    """
    a0 = math.radians(90 + gap_deg)
    a1 = math.radians(450 - gap_deg)
    return [bm.verts.new((rx * math.cos(a0 + (a1 - a0) * i / (n - 1)),
                          cy + ry * math.sin(a0 + (a1 - a0) * i / (n - 1)), z))
            for i in range(n)]


def open_bridge(bm, a, b, flip=False):
    """Bridge two equal-length ring ARCS. Unlike bridge() it does not wrap."""
    for i in range(len(a) - 1):
        q = (a[i], a[i + 1], b[i + 1], b[i])
        bm.faces.new(tuple(reversed(q)) if flip else q)


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
    sections = [
        # COLLAR. Two rings above the neckline that rise, tuck in behind the
        # neck and open wider at the front. The gap widening from 40 to 62
        # degrees is what reads as a notched lapel rolling back off the
        # sternum -- at this budget a lapel is a shape the OPENING makes, not
        # a separately folded panel. Before this the coat simply stopped in a
        # flat rim at the neckline, which is the one part of the garment the
        # Level 1 window reveal looks straight at.
        (1.470,     0.196, 0.101, -0.004, 62.0),   # collar top, behind the neck
        (1.437,     0.224, 0.113, 0.000, 52.0),    # roll
        (COAT_TOP,  0.234, 0.120, 0.004, 40.0),    # neckline
        (1.34,      0.246, 0.128, 0.008, 36.0),   # SHOULDER SEAM, widest
        (1.26,      0.212, 0.130, 0.012, 30.0),
        (1.16,      0.190, 0.124, 0.010, 25.0),
        (1.04,      0.180, 0.118, 0.004, 22.0),   # waist, least open
        (0.92,      0.190, 0.128, -0.004, 22.0),  # over the hips
        (0.80,      0.200, 0.138, -0.006, 24.0),
        (COAT_HEM,  0.210, 0.144, -0.006, 26.0),  # hem, flared
    ]
    outer = [arc_ring(bm, z, rx, ry, cy, g) for z, rx, ry, cy, g in sections]
    inner = [arc_ring(bm, z, rx - COAT_T, ry - COAT_T, cy, g + 1.2)
             for z, rx, ry, cy, g in sections]

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
    OUTER = [(-0.050, 0.068, 0.068),
             (0.040, 0.072, 0.073),
             (0.180, 0.062, 0.064),
             (0.310, 0.055, 0.057),    # just past the ELBOW
             (0.330, 0.052, 0.054)]
    T = 0.009
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
        bridge(bm, outer[0], inner[0])     # shoulder rim, hidden under the coat


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
    return (t0 + (HAIR_TOP - t0) * u
            + HAIR_QUIFF * _falloff(off, 1.30) * _window(u, 0.20, 1.00))


def _hair_thickness(off, k):
    """Wall thickness in metres at this angle, for outer band k."""
    u, base = HAIR_BANDS[k]
    f = abs(off) / math.pi
    # Swept BACK: more mass behind the crown than on the brow.
    grow = base * (0.86 + 0.20 * f ** 0.65)
    # Forelock over the brow, parted off-centre. Dies out by the crown -- it is
    # a mass hanging on the forehead, not a thicker skull.
    grow += HAIR_FORELOCK * _falloff(off - HAIR_PART, 0.90) * _window(u, -0.20, 0.74)
    # Flick over the nape, on the lowest bands only.
    grow += HAIR_NAPE * _falloff(abs(off) - math.pi, 1.00) * _window(u, -0.30, 0.45)
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
        for poly in me.polygons:
            poly.use_smooth = True
        # 4.1 removed use_auto_smooth; this is the replacement.
        me.set_sharp_from_angle(angle=math.radians(smooth))
        parts[name] = obj

    return parts


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
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)

    unwrap(obj)
    build_hollow_key(obj, rig)
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

LIMB_THIN = 0.034 / 0.052     # limbRadius   0.654
# Sleeves thin only ~72% of the way the arm inside them does, so the cloth
# ends up about 10 mm proud of the arm rather than 22 mm. Loose, not hollow.
SLEEVE_THIN = 1.0 - (1.0 - LIMB_THIN) * 0.72
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

    ARM = {'upper_arm', 'forearm', 'hand'}

    for v in obj.data.vertices:
        sleeve = False
        if v.index in coat_verts:
            # A coat vertex owned by an arm bone is a SLEEVE. The coat body is
            # never weighted to one, so this needs no geometry test.
            best = max(v.groups, key=lambda g: g.weight, default=None)
            sleeve = bool(best and group_name[best.group].split('.')[0] in ARM)
            if not sleeve:
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
                on_axis = head + axis * (p - head).dot(axis)
                delta += ((on_axis + (p - on_axis) * SLEEVE_THIN) - p) * g.weight
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
                target = on_axis + axis * grow + (p - on_axis) * LIMB_THIN
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
