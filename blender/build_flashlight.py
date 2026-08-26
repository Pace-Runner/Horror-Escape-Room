"""
Generates flashlight.glb: a 2C-cell-sized aluminium torch -- domed tail cap,
two diamond-knurled grip bands, a rubber side switch, a stepped head flaring
into a chromed bezel, and a parabolic reflector with an emissive emitter
behind a glass lens.

ORIENTATION AND ORIGIN ARE LOAD-BEARING, so read this before changing any
number below. src/systems/hands/sockets.js fixes the convention for every
held prop in this project: "+Y runs along the cylinder axis, out of the top
of the fist. A torch modelled with its beam down +Y and its origin at the
point the hand grips drops in with no per-prop tuning." glTF is Y-up while
Blender is Z-up, and the exporter's export_yup (on by default) rewrites
Blender +Z to glTF +Y -- so the beam is modelled down Blender +Z here and
arrives on the three.js side already pointing +Y. The origin sits at the
centre of the main knurled grip band, which is where a fist actually closes,
not at the tail and not at the bounding-box centre: that is why the geometry
straddles z=0 asymmetrically (-0.0895 m at the tail, +0.1305 m at the bezel).

Body diameter is 35 mm because src/systems/hands/poses/grip-cylinder.js
authors the grip pose against a 35 mm tube and calls that out as its
acceptance check.

Unlike the other build scripts this one revolves its profiles by hand rather
than calling bmesh.ops.spin, because three things here need control over
where individual rings land and which verts they share. Hard creases at the
step-ups are emitted as coincident duplicate rings so vertex normals
physically cannot blend across them, which keeps the machined edges crisp
without depending on Blender's shading API -- mesh.use_auto_smooth was
removed in 4.1 and this runs on 5.2. The knurl bands need their rows placed
at a specific pitch so the knurl cells come out square. And UVs are written
cylindrically during face creation because a lathed barrel run through
common.box_project_uvs shows a visible seam and axial stretching, so
common.new_object is deliberately not used for the revolved parts.

The knurl itself is bmesh.ops.poke: every quad in a band gets a centre vert
raised along its normal, turning each cell into a little pyramid. The
obvious cheaper trick -- displacing alternate verts in a checkerboard --
looks right in a wireframe and is wrong in practice, because a quad with two
raised and two lowered corners is a saddle, and triangulating a field of
saddles yields one parallel diagonal ridge per cell. That renders as spiral
fluting, not as cross-hatching. Pyramids cost four triangles per cell and
are the thing that actually reads as knurled metal.

Run headless: blender --background --python blender/build_flashlight.py
"""

import sys
import os
import math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import bpy  # noqa: E402
import bmesh  # noqa: E402

# ---------------------------------------------------------------- constants --

SEGMENTS = 32          # ring resolution; a torch is held near the camera, so
                       # the silhouette has to stay round at close range
KNURL_DEPTH = 0.0007   # height of each knurl pyramid above the band, metres
UV_DENSITY = 2.2       # matches common.box_project_uvs' default

# A knurl only reads as cross-hatching if its cells are roughly square, and
# the ring resolution already fixes the column pitch at 2*pi*0.0178/32 =
# 3.49 mm. 12 rows over the 55 mm grip band gives 4.58 mm: slightly elongated
# along the axis, which is how rolled knurling actually comes out, and 384
# cells is the most this can spend when every cell costs four triangles.
KNURL_PITCH = 2.0 * math.pi * 0.0178 / SEGMENTS
GRIP_ROWS = 12

TOTAL_LEN = 0.2200     # tail to bezel face
BARREL_R = 0.0175      # 35 mm diameter -- pinned by the grip pose
GRIP_CENTRE = 0.0895   # distance from the tail to the middle of the grip band

# knurl bands, in tail-origin z, before the origin shift
TAIL_BAND = (0.0110, 0.0270)
GRIP_BAND = (0.0620, 0.1170)

# Base colours are LINEAR (Principled BSDF takes linear, not sRGB). The metal
# is deliberately a mid grey rather than the near-black of the old primitive
# placeholder: this prop has to be findable on a nightstand in an almost dark
# room lit only by a flickering lamp, and bare scuffed aluminium catches that
# flicker where anodised black would vanish.
#
# Metallic is held around 0.75 rather than pushed to 1.0 for the same reason.
# A fully metallic surface has no diffuse term at all -- it can only show what
# it reflects -- so in a room this dark a physically "correct" aluminium torch
# renders as a black silhouette. Backing off metallic buys back enough diffuse
# response to keep the shape legible, which is why the rest of this project
# also sits in that range (brass 0.8, the nightstand lamp 0.4-0.5).
BODY_COL = (0.165, 0.170, 0.175)
GRIP_COL = (0.075, 0.077, 0.080)   # knurling holds dirt and hand grease
BEZEL_COL = (0.300, 0.305, 0.315)  # polished, so it throws a highlight
SWITCH_COL = (0.022, 0.022, 0.024)
REFLECTOR_COL = (0.800, 0.795, 0.780)
LENS_COL = (0.900, 0.930, 0.880)
BULB_COL = (0.950, 0.900, 0.760)


def zz(z):
    """Tail-origin z -> object-space z (origin on the grip band)."""
    return z - GRIP_CENTRE


# ------------------------------------------------------------ lathe machinery --

def _ring(bm, r, z):
    """One ring of SEGMENTS verts at radius r, or a single pole vert if r == 0."""
    if abs(r) < 1e-7:
        return [bm.verts.new((0.0, 0.0, z))], True
    verts = []
    for j in range(SEGMENTS):
        a = 2.0 * math.pi * j / SEGMENTS
        verts.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
    return verts, False


def revolve(profile, recalc=True, flip=False):
    """
    Revolve a (radius, z, sharp) profile around the Z axis.

    r == 0 closes that end as a pole. sharp=True emits the ring twice and
    leaves no faces between the copies, so shading breaks there -- that is
    the crease trick described in the module docstring. Profile order may
    double back in z (the bezel's bore does exactly that); consecutive
    entries are simply bridged in the order given.
    """
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.verify()

    rows = []    # (verts, is_pole, radius, z)
    bridge = []  # bridge[i] -> build faces between rows[i] and rows[i + 1]
    for (r, z, sharp) in profile:
        for copy in range(2 if sharp else 1):
            verts, is_pole = _ring(bm, r, z)
            rows.append((verts, is_pole, r, z))
            bridge.append(True)
        if sharp:
            bridge[len(rows) - 2] = False

    for i in range(len(rows) - 1):
        if not bridge[i]:
            continue
        va, pole_a, ra, za = rows[i]
        vb, pole_b, rb, zb = rows[i + 1]
        if pole_a and pole_b:
            continue
        circ = 2.0 * math.pi * max(ra, rb, 1e-4)
        for j in range(SEGMENTS):
            j2 = (j + 1) % SEGMENTS
            # Column index is carried alongside each vert so UVs can use
            # j + 1 on the wrap-around face instead of 0 -- otherwise the
            # final column's U collapses back to the seam and that one quad
            # gets the whole texture squeezed into it.
            if pole_a:
                spec = [(va[0], j + 0.5, za), (vb[j2], j + 1, zb), (vb[j], j, zb)]
            elif pole_b:
                spec = [(va[j], j, za), (va[j2], j + 1, za), (vb[0], j + 0.5, zb)]
            else:
                spec = [(va[j], j, za), (va[j2], j + 1, za), (vb[j2], j + 1, zb), (vb[j], j, zb)]
            face = bm.faces.new([s[0] for s in spec])
            for loop, (_, col, zc) in zip(face.loops, spec):
                loop[uv_layer].uv = ((col / SEGMENTS) * circ * UV_DENSITY, zc * UV_DENSITY)

    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if flip:
        # For an open sheet there is no "outward" for recalc to find, so the
        # winding above decides which side three.js will keep -- it culls
        # backfaces, and Blender's own render shows both, so this cannot be
        # eyeballed. See the reflector's note in build().
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return bm


def apply_knurl(bm, bands, depth):
    """
    Raise a pyramid on every quad whose centre falls inside one of `bands`.

    Runs after revolve()'s recalc_face_normals, because poke's offset follows
    each face's normal and would dimple the surface inward if the normals had
    not been made outward-consistent first.
    """
    faces = [f for f in bm.faces
             if any(lo - 1e-6 <= f.calc_center_median().z <= hi + 1e-6 for lo, hi in bands)]
    if faces:
        bmesh.ops.poke(bm, faces=faces, offset=depth)
    return len(faces)


def lathe_object(name, bm, materials, smooth=True):
    """bmesh -> object. Skips common.new_object because UVs are already set."""
    mesh = bpy.data.meshes.new(name + '_mesh')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for mat in materials:
        mesh.materials.append(mat)
    if smooth:
        # Safe to smooth everything: the creases are duplicated rings whose
        # verts belong to only one face band, so nothing blends across them.
        for poly in mesh.polygons:
            poly.use_smooth = True
    return obj


def emissive(mat, colour, strength):
    """
    Add emission to a material made by common.make_material.

    The glTF exporter reads 'Emission Color' x 'Emission Strength'; Principled
    defaults Emission Strength to 0.0 in 4.x+, so it has to be set explicitly
    or the export carries no emission at all. Strength is kept at 1.0 so the
    result is plain glTF emissiveFactor and does not lean on
    KHR_materials_emissive_strength.
    """
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Emission Color'].default_value = (*colour, 1.0)
    bsdf.inputs['Emission Strength'].default_value = strength
    return mat


def translucent(mat, alpha):
    """
    Make a material export as glTF alphaMode BLEND with the given opacity.

    glTF has no refraction without KHR_materials_transmission, and three's
    MeshStandardMaterial could not honour it anyway, so the lens is plain
    alpha blending: the Base Color alpha carries the opacity and
    blend_method is what the exporter reads to pick alphaMode.
    """
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    base = bsdf.inputs['Base Color'].default_value
    bsdf.inputs['Base Color'].default_value = (base[0], base[1], base[2], alpha)
    bsdf.inputs['Alpha'].default_value = alpha
    mat.blend_method = 'BLEND'
    return mat


# ------------------------------------------------------------------ profiles --

def body_profile():
    """(radius, z, sharp) from the tail pole round to the reflector cavity floor."""
    p = []

    def add(r, z, sharp=False):
        p.append((r, zz(z), sharp))

    # Tail cap: a shallow dome over a flat-ish end, not a cone. The first
    # radius has to jump almost immediately or the pole pulls the profile into
    # a visible spike where a real torch stands squarely on its end.
    add(0.0000, 0.0000)
    add(0.0110, 0.0015)
    add(0.0152, 0.0040)
    add(0.0172, 0.0080)
    add(0.0178, TAIL_BAND[0], True)

    # tail knurl band -- a real torch is knurled here so it doesn't roll.
    # Row pitch is matched to the column pitch (see KNURL_PITCH) so the
    # checkerboard comes out as square diamonds rather than stretched waves.
    for k in range(1, 5):
        add(0.0178, TAIL_BAND[0] + 0.0032 * k)
    add(0.0178, TAIL_BAND[1], True)

    # step down onto the barrel
    add(BARREL_R, 0.0285, True)
    add(BARREL_R, 0.0605)

    # Main grip band: 55 mm of knurling sitting 0.3 mm proud of the barrel the
    # way rolled knurling actually does, in GRIP_ROWS rows of KNURL_PITCH.
    add(0.0178, GRIP_BAND[0], True)
    for k in range(1, GRIP_ROWS + 1):
        add(0.0178, GRIP_BAND[0] + (GRIP_BAND[1] - GRIP_BAND[0]) * k / GRIP_ROWS,
            sharp=(k == GRIP_ROWS))

    # barrel again, past the switch
    add(BARREL_R, 0.1185, True)
    add(BARREL_R, 0.1500)

    # neck step-up into the head
    add(0.0182, 0.1520)
    add(0.0196, 0.1555, True)
    add(0.0196, 0.1600)

    # head cone flaring out to the bezel
    add(0.0210, 0.1700)
    add(0.0228, 0.1830)
    add(0.0240, 0.1950)
    add(0.0246, 0.2050)

    # bezel ring
    add(0.0248, 0.2080, True)
    add(0.0250, 0.2110)
    add(0.0250, 0.2180, True)
    add(0.0243, TOTAL_LEN, True)

    # front face, then back down the bore: this is what makes the head read as
    # hollow with something recessed inside rather than a capped cylinder
    add(0.0215, TOTAL_LEN, True)
    add(0.0212, 0.2160)
    add(0.0212, 0.1990, True)
    add(0.0000, 0.1980)
    return p


def reflector_profile():
    """Parabolic reflector, hole at the emitter end, rim meeting the bezel bore."""
    focal = 0.005408
    vertex_z = 0.1985
    rows = []
    steps = 7  # 8 rings; Solidify doubles this, so extra rows are pricey here
    for i in range(steps + 1):
        z = 0.1990 + (0.2185 - 0.1990) * (i / float(steps))
        rows.append((math.sqrt(4.0 * focal * (z - vertex_z)), zz(z), False))
    return rows


def lens_profile():
    r, back, front = 0.0209, 0.2172, 0.2184
    return [
        (0.0000, zz(back), False),
        (r, zz(back), True),
        (r, zz(front), True),
        (0.0000, zz(front), False),
    ]


def bulb_profile():
    return [
        (0.0000, zz(0.1985), False),
        (0.0028, zz(0.1992), True),
        (0.0030, zz(0.2015), False),
        (0.0022, zz(0.2035), False),
        (0.0000, zz(0.2042), False),
    ]


# --------------------------------------------------------------------- build --

def build():
    common.clear_scene()

    body_mat = common.make_material('TorchBody', BODY_COL, roughness=0.34, metallic=0.75)
    grip_mat = common.make_material('TorchGrip', GRIP_COL, roughness=0.50, metallic=0.70)
    bezel_mat = common.make_material('TorchBezel', BEZEL_COL, roughness=0.18, metallic=0.85)
    switch_mat = common.make_material('TorchSwitch', SWITCH_COL, roughness=0.75, metallic=0.0)
    # A true mirror (metallic 1.0, roughness 0.04) has nothing to reflect in a
    # room this dark and would just read as a black hole behind the glass, so
    # the reflector is deliberately a bright satin instead of a chrome.
    refl_mat = common.make_material('TorchReflector', REFLECTOR_COL, roughness=0.15, metallic=0.55)
    # Faint, not lit: enough for the lens to catch the eye across a dark room
    # without reading as a torch that is already switched on.
    lens_mat = translucent(
        emissive(common.make_material('TorchLens', LENS_COL, roughness=0.04, metallic=0.0),
                 (0.06, 0.058, 0.048), 1.0),
        0.22)
    bulb_mat = emissive(common.make_material('TorchBulb', BULB_COL, roughness=0.4, metallic=0.0),
                        (1.0, 0.92, 0.72), 1.0)

    # ---- body: three materials on one lathe, split by axial position -------
    bands = ((zz(TAIL_BAND[0]), zz(TAIL_BAND[1])), (zz(GRIP_BAND[0]), zz(GRIP_BAND[1])))
    body_bm = revolve(body_profile())
    cells = apply_knurl(body_bm, bands, KNURL_DEPTH)
    print(f'knurled {cells} cells')
    body = lathe_object('body', body_bm, [body_mat, grip_mat, bezel_mat])
    mesh = body.data
    for poly in mesh.polygons:
        zc = sum(mesh.vertices[v].co.z for v in poly.vertices) / len(poly.vertices)
        if any(lo - 1e-6 <= zc <= hi + 1e-6 for lo, hi in bands):
            poly.material_index = 1
            # Knurling MUST be flat shaded. Smooth shading averages each
            # displaced vertex against its four neighbours, which turns the
            # checkerboard back into a soft wobble in the surface -- the
            # diamonds only exist as shading, so they have to be faceted.
            poly.use_smooth = False
        elif zc >= zz(0.2060):
            poly.material_index = 2
        else:
            poly.material_index = 0

    # ---- reflector: a single-sided dish, not a solid shell. Giving it
    # ---- thickness would double its triangles for a part that is only ever
    # ---- seen through the lens from the front, so it is one surface wound to
    # ---- face the viewer instead: the natural winding of an outward-flaring
    # ---- lathe points radially out and backwards, which is exactly the wrong
    # ---- side, hence flip=True. Verified by normals, not by eye.
    lathe_object('reflector', revolve(reflector_profile(), recalc=False, flip=True), [refl_mat])

    lathe_object('lens', revolve(lens_profile()), [lens_mat])
    lathe_object('emitter', revolve(bulb_profile()), [bulb_mat])

    # ---- rubber side switch: pad plus button, both embedded in the barrel.
    # No booleans -- at this scale interpenetrating solids read correctly and
    # a boolean would only add faces and failure modes.
    pad = common.make_box('switchPad', (0.009, 0.017, 0.027), switch_mat, bevel_ratio=0.28)
    pad.location = (0.0166, 0.0, zz(0.1350))

    button = common.make_cylinder('switchButton', 0.0058, 0.0060, switch_mat, segments=12)
    button.rotation_euler = (0.0, math.pi / 2, 0.0)  # lay the axis along X
    button.location = (0.0198, 0.0, zz(0.1350))

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.abspath(os.path.join(script_dir, '..', 'src', 'assets', 'models', 'flashlight.glb'))
    common.export_glb(out_path)


if __name__ == '__main__':
    build()
