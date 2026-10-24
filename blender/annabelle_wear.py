"""
Annabelle after the woods: brown hair, a faded flannel shirt, worn jeans,
mud, grass stains, rips and scrapes, and a tired face -- painted in 3D onto
a fresh unwrap of her. Used by import_annabelle.py.

WHY A NEW UNWRAP. The source maps every face into one cell of a generic
16x16 colour swatch, so a hundred faces of shirt share the same few pixels
and nothing can differ from one part of the shirt to another. Mud on a knee
needs the knee to own some texture. So the three meshes are joined into one,
unwrapped afresh, and given a 1024 texture of their own -- which is about what
a PS2 character got, and the look the rest of the house is pitched at.

WHY IN 3D. The same reasoning as befoul.py, whose noise and dilation this
borrows: every texel is baked to the point on her body it lands on, and every
effect is a function of that point. Mud rises from the floor because the
floor is z = 0, the rip is on the left knee because the knee bone says where
the knee is, and nothing can tear at a UV seam.

WHAT EACH FACE IS comes from the swatch it used to sit in (which cell was the
shirt, which the jeans), tagged before the meshes are joined. The tag drives
the paint and is then thrown away; the old UVs go with it.
"""
import math
import os
import tempfile

import bpy
import numpy as np

from befoul import _fbm

SIZE = 1024
SEED = 19870623

# --- what a face is, from the swatch it sat in ------------------------------
SKIN, SHIRT, JEANS, TRIM, SHOES, HAIR, EYE, DETAIL = range(8)
SHIRT_CELLS = {(2, 15), (1, 16), (2, 16), (3, 14), (1, 15)}
JEANS_CELLS = {(5, 12), (6, 12), (6, 13), (5, 13)}
TRIM_CELLS = {(13, 13)}           # orange denim stitching, and the buttons
EYE_CELLS = {(13, 15), (12, 15)}  # the whites
# The source's names for the parts that are not the body.
HAIR_MESH = 'femaleBasemesh01.007'
DETAIL_MESH = 'femaleBasemesh01.004'

# --- the paint (sRGB, 0..1) --------------------------------------------------
# Brown, not the source's near-black: a warm mid-brown with lighter and darker
# strands running down it, and dust in it.
HAIR_BASE = np.array([0.40, 0.25, 0.14], np.float32)
HAIR_DARK = np.array([0.22, 0.13, 0.07], np.float32)
HAIR_LIGHT = np.array([0.58, 0.40, 0.24], np.float32)
# A 1980s flannel shirt in place of the pink blouse: faded red, dark bands,
# a thin pale line, washed out towards grey.
FLANNEL = np.array([0.50, 0.18, 0.15], np.float32)
FLANNEL_BAND = np.array([0.17, 0.15, 0.16], np.float32)
FLANNEL_LINE = np.array([0.72, 0.66, 0.54], np.float32)
FADED = np.array([0.56, 0.52, 0.48], np.float32)
FLANNEL_CHECK = 0.085            # metres from one dark band to the next
# The source's jeans are a pale lavender; real denim is a deep indigo that
# goes pale and grey where it rubs.
DENIM = np.array([0.24, 0.30, 0.45], np.float32)
DENIM_WORN = np.array([0.58, 0.62, 0.68], np.float32)
SHOE = np.array([0.13, 0.12, 0.12], np.float32)
MUD = np.array([0.25, 0.18, 0.11], np.float32)
MUD_DRY = np.array([0.42, 0.34, 0.24], np.float32)
GRASS = np.array([0.29, 0.31, 0.16], np.float32)
GRIME = np.array([0.30, 0.25, 0.19], np.float32)
SCRATCH = np.array([0.56, 0.22, 0.18], np.float32)
THREADS = np.array([0.86, 0.85, 0.80], np.float32)
# Inside a rip in the shirt: shadow, not skin. A pale patch of skin at her
# waist read as a hole in the model rather than in the cloth.
RENT = np.array([0.07, 0.05, 0.05], np.float32)
# Skin that has not slept: paler, greyer, the colour drained a little.
PALLOR = np.array([0.80, 0.73, 0.70], np.float32)
# Under the eyes: a bruise-grey shadow, multiplied in.
SHADOW_UNDER_EYES = np.array([0.74, 0.64, 0.70], np.float32)
BLOODSHOT = np.array([0.93, 0.74, 0.72], np.float32)
LEAF = np.array([0.36, 0.30, 0.16], np.float32)


def _smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _mix(a, b, t):
    return a + (b - a) * np.asarray(t, np.float32)[..., None]


def tag_parts(meshes, palette):
    """Store what every face is as an integer face attribute, 'wear_part'."""
    w, h = palette.size
    px = np.array(palette.pixels[:], np.float32).reshape(h, w, 4)[..., :3]
    for obj in meshes:
        me = obj.data
        uv = me.uv_layers.active.data
        attr = me.attributes.get('wear_part') or me.attributes.new('wear_part', 'INT', 'FACE')
        for p in me.polygons:
            u = sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total
            v = sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total
            cell = (round(u * 16), round(v * 16))
            colour = px[min(h - 1, int(v * h)), min(w - 1, int(u * w))]
            if obj.name == HAIR_MESH:
                part = HAIR
            elif obj.name == DETAIL_MESH:
                part = EYE if cell in EYE_CELLS else DETAIL
            elif cell in SHIRT_CELLS:
                part = SHIRT
            elif cell in JEANS_CELLS:
                part = JEANS
            elif cell in TRIM_CELLS:
                part = TRIM
            elif p.center.z < 0.12 and colour.mean() < 0.3:
                part = SHOES
            else:
                part = SKIN
            attr.data[p.index].value = part
    return px


def join(rig, meshes):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    body = max(meshes, key=lambda o: len(o.data.vertices))
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = body.data.name = 'annabelle_body'
    return body


def unwrap(body, neck_z, head_weight=1.8):
    """
    A new UV map, 'Worn', by Smart UV Project -- with the head scaled up for
    the length of the unwrap. Smart Project gives each island texture in
    proportion to its area in 3D, which would leave the face, the one place a
    player looks, a few dozen pixels wide. Scaled up, the head and hair take
    roughly three times their share; scaled back, they keep it.
    """
    me = body.data
    worn = me.uv_layers.new(name='Worn')
    me.uv_layers.active = worn
    saved = [v.co.copy() for v in me.vertices]
    for v in me.vertices:
        if v.co.z > neck_z:
            v.co.x *= head_weight
            v.co.y *= head_weight
            v.co.z = neck_z + (v.co.z - neck_z) * head_weight
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.006)
    bpy.ops.object.mode_set(mode='OBJECT')
    for v, co in zip(me.vertices, saved):
        v.co = co


def bake_surface(body, w, h):
    """
    For each texel of the 'Worn' map, the point on her body it lands on and
    the face it belongs to. befoul.bake_positions does the first half of this;
    this one also keeps the face, because the paint depends on what the face
    WAS (shirt, jeans, skin), not just where it is.
    """
    me = body.data
    uvs = me.uv_layers['Worn'].data
    pos = np.zeros((h, w, 3), np.float32)
    face = np.full((h, w), -1, np.int32)
    for poly in me.polygons:
        li = list(poly.loop_indices)
        for k in range(1, len(li) - 1):
            tri = (li[0], li[k], li[k + 1])
            t = np.array([uvs[i].uv[:] for i in tri], np.float64) * (w, h)
            P = np.array([me.vertices[me.loops[i].vertex_index].co[:] for i in tri], np.float32)
            x0, x1 = max(0, int(t[:, 0].min())), min(w - 1, int(math.ceil(t[:, 0].max())))
            y0, y1 = max(0, int(t[:, 1].min())), min(h - 1, int(math.ceil(t[:, 1].max())))
            if x1 < x0 or y1 < y0:
                continue
            X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            den = (t[1, 1] - t[2, 1]) * (t[0, 0] - t[2, 0]) + (t[2, 0] - t[1, 0]) * (t[0, 1] - t[2, 1])
            if abs(den) < 1e-12:
                continue
            a = ((t[1, 1] - t[2, 1]) * (X - t[2, 0]) + (t[2, 0] - t[1, 0]) * (Y - t[2, 1])) / den
            b = ((t[2, 1] - t[0, 1]) * (X - t[2, 0]) + (t[0, 0] - t[2, 0]) * (Y - t[2, 1])) / den
            c = 1.0 - a - b
            inside = (a >= -0.01) & (b >= -0.01) & (c >= -0.01)
            if not inside.any():
                continue
            pts = a[..., None] * P[0] + b[..., None] * P[1] + c[..., None] * P[2]
            pos[y0:y1 + 1, x0:x1 + 1][inside] = pts[inside]
            face[y0:y1 + 1, x0:x1 + 1][inside] = poly.index
    return pos, face


def _grow(face, pos, rounds):
    """Spread the baked texels outward, so filtering at an island's edge reads paint, not black."""
    for _ in range(rounds):
        for ax, sh in ((0, 1), (0, -1), (1, 1), (1, -1)):
            f2 = np.roll(face, sh, axis=ax)
            p2 = np.roll(pos, sh, axis=ax)
            fill = (face < 0) & (f2 >= 0)
            face[fill] = f2[fill]
            pos[fill] = p2[fill]


def _sphere(p, centre, radius, rng=None, wobble=0.0):
    d = np.linalg.norm(p - np.asarray(centre, np.float32), axis=1)
    if rng is not None and wobble:
        d = d + (_fbm(rng, p, radius * 0.8, octaves=3) - 0.5) * 2 * wobble * radius
    return np.clip(1.0 - d / radius, 0.0, 1.0)


def paint(body, rig, palette_px, landmarks):
    """The colour of every texel. Returns an (h, w, 3) sRGB array."""
    pos, face = bake_surface(body, SIZE, SIZE)
    _grow(face, pos, 6)
    covered = face >= 0
    p = pos[covered]
    f = face[covered]

    me = body.data
    part_of = np.array([d.value for d in me.attributes['wear_part'].data], np.int32)
    normal_of = np.array([pl.normal[:] for pl in me.polygons], np.float32)
    # Each face's own swatch colour, through the OLD map.
    old = me.uv_layers['UVMap'].data
    ph, pw = palette_px.shape[:2]
    swatch_of = np.zeros((len(me.polygons), 3), np.float32)
    for pl in me.polygons:
        u = sum(old[i].uv.x for i in pl.loop_indices) / pl.loop_total
        v = sum(old[i].uv.y for i in pl.loop_indices) / pl.loop_total
        swatch_of[pl.index] = palette_px[min(ph - 1, int(v * ph)), min(pw - 1, int(u * pw))]
    part = part_of[f]
    n = normal_of[f]
    col = swatch_of[f].copy()
    rng = np.random.default_rng(SEED)
    z = p[:, 2]

    skin, shirt, jeans = part == SKIN, part == SHIRT, part == JEANS
    trim, shoes, hair, eye = part == TRIM, part == SHOES, part == HAIR, part == EYE
    cloth = shirt | jeans | trim

    # --- hair: brown, in strands that run down her head --------------------
    strands = _fbm(rng, p, 0.05, octaves=3, aniso=(3.5, 3.5, 0.35))
    hc = _mix(HAIR_DARK, HAIR_BASE, _smooth(0.25, 0.55, strands))
    hc = _mix(hc, HAIR_LIGHT, _smooth(0.60, 0.80, strands) * 0.7)
    col[hair] = hc[hair]

    # --- the shirt becomes a faded flannel ----------------------------------
    # Checks run round her: across the front and back by x, across her sides
    # by y, whichever the surface faces.
    across = np.where(np.abs(n[:, 0]) > np.abs(n[:, 1]), p[:, 1], p[:, 0])
    ga, gz = (across / FLANNEL_CHECK) % 1.0, (z / FLANNEL_CHECK) % 1.0
    band = (ga < 0.34).astype(np.float32) + (gz < 0.34).astype(np.float32)
    flannel = _mix(np.broadcast_to(FLANNEL, p.shape), FLANNEL_BAND, band * 0.45)
    line = ((np.abs(ga - 0.64) < 0.035) | (np.abs(gz - 0.64) < 0.035)).astype(np.float32)
    flannel = _mix(flannel, FLANNEL_LINE, line * 0.6)
    flannel = _mix(flannel, FADED, 0.25 + 0.2 * _fbm(rng, p, 0.15))
    col[shirt] = flannel[shirt]

    # --- denim, worn pale where it rubs ------------------------------------
    rub = _fbm(rng, p, 0.06, aniso=(1, 1, 0.5))
    knees = [_sphere(p, k, 0.11) for k in landmarks['knees']]
    worn = np.clip(0.1 + 0.3 * _smooth(0.45, 0.75, rub) + 0.45 * np.maximum(*knees), 0, 0.6)
    col[jeans] = _mix(_mix(col, DENIM, 0.6), DENIM_WORN, worn)[jeans]
    col[shoes] = SHOE

    # --- tired: pale skin, shadowed eyes, reddened whites -----------------
    col[skin] = _mix(col, PALLOR, 0.22)[skin]
    under = np.zeros(len(p), np.float32)
    for e in landmarks['eyes']:
        d = (p - (e + np.array([0, -0.004, -0.015], np.float32))) / np.array([0.024, 0.03, 0.011], np.float32)
        under = np.maximum(under, np.clip(1.0 - np.linalg.norm(d, axis=1), 0, 1) ** 0.7)
    col[skin] = (col * _mix(np.ones(3, np.float32), SHADOW_UNDER_EYES, under))[skin]
    col[eye] = _mix(col, BLOODSHOT, 0.35)[eye]

    # --- the woods: grime everywhere, mud from the ground up --------------
    grime = _smooth(0.45, 0.8, _fbm(rng, p, 0.12, aniso=(1, 1, 0.5)))
    col = _mix(col, GRIME, grime * np.where(hair, 0.15, np.where(cloth | shoes, 0.5, 0.22)))
    rising = _smooth(0.55, 0.0, z)                     # 1 at the floor, 0 at mid-thigh
    splash = _fbm(rng, p, 0.035, octaves=3, aniso=(1, 1, 0.6))
    mud = np.clip(rising * 1.3, 0, 1) * _smooth(0.35 - 0.25 * rising, 0.6, splash)
    mud = np.where(skin, mud * 0.4, mud)
    col = _mix(col, _mix(np.broadcast_to(MUD, p.shape), MUD_DRY, _smooth(0.5, 0.8, splash)), mud * 0.9)
    # Down on her knees in the grass, more than once.
    stain = np.maximum(*[_sphere(p, k + np.array([0, -0.03, 0], np.float32), 0.08, rng, 0.6) for k in landmarks['knees']])
    col = _mix(col, _mix(np.broadcast_to(GRASS, p.shape), MUD, _smooth(0.4, 0.7, splash)),
               np.where(jeans | trim, stain * 0.75, 0))
    # Hands that broke her falls, and the dirt they wiped on her face.
    hands = np.maximum(*[_sphere(p, hd, 0.14) for hd in landmarks['hands']])
    col = _mix(col, MUD, np.where(skin, hands * _smooth(0.3, 0.6, splash) * 0.8, 0))
    smudge = _sphere(p, landmarks['face'], 0.11) * _smooth(0.55, 0.75, _fbm(rng, p, 0.025, octaves=3))
    col = _mix(col, GRIME, np.where(skin, smudge * 0.55, 0))
    # Bits of leaf and dust caught in her hair.
    debris = _smooth(0.74, 0.8, _fbm(rng, p, 0.012, octaves=2))
    col = _mix(col, LEAF, np.where(hair, debris * 0.8, 0))

    # --- branches: scratches on her forearms and one cheek ----------------
    for elbow, wrist in landmarks['forearms']:
        along = wrist - elbow
        t = np.clip(((p - elbow) @ along) / (along @ along), 0, 1)
        near = np.linalg.norm(p - (elbow + t[:, None] * along), axis=1) < 0.06
        lines = np.abs(np.sin((p @ np.array([0.6, 0.3, 0.75], np.float32)) * 230
                              + 9 * _fbm(rng, p, 0.04, octaves=2)))
        cut = (lines < 0.07) & near & skin & (_fbm(rng, p, 0.05, octaves=2) > 0.52)
        col[cut] = _mix(col, SCRATCH, 0.65)[cut]
    cheek = _sphere(p, landmarks['cheek'], 0.022, rng, 0.5)
    col = _mix(col, SCRATCH, np.where(skin, _smooth(0.3, 0.6, cheek) * 0.45, 0))

    # --- rips: the left knee through to a grazed knee; a sleeve and the
    # shirt's hem torn open on shadow ---
    grazed = _mix(np.broadcast_to(PALLOR, p.shape), SCRATCH, 0.3)
    for centre, radius, where, inside in (
            (landmarks['knees'][0] + np.array([0, -0.06, 0], np.float32), 0.042, jeans, grazed),
            (landmarks['sleeve'], 0.04, shirt, np.broadcast_to(RENT, p.shape)),
            (landmarks['hem'], 0.03, shirt, np.broadcast_to(RENT, p.shape))):
        r = _sphere(p, centre, radius, rng, 0.8)
        hole = (r > 0.32) & where
        fray = (r > 0.12) & (r <= 0.32) & where
        col[hole] = _mix(inside, GRIME, 0.2)[hole]
        col[fray] = _mix(col, THREADS, 0.6)[fray]

    # A little fabric grain, so the cloth is not flat paint up close.
    grain = (_fbm(rng, p, 0.006, octaves=2) - 0.5) * 0.12
    col = np.where(cloth[:, None], col * (1 + grain[:, None]), col)

    out = np.zeros((SIZE, SIZE, 3), np.float32)
    out[covered] = np.clip(col, 0, 1)
    return out


def landmarks_of(body, rig):
    bones = rig.data.bones
    head = lambda name: np.array(bones['mixamorig:' + name].head_local[:], np.float32)  # noqa: E731
    me = body.data
    parts = np.array([d.value for d in me.attributes['wear_part'].data], np.int32)
    whites = np.array([pl.center[:] for pl in me.polygons], np.float32)[parts == EYE]
    eyes = [whites[whites[:, 0] > 0].mean(axis=0), whites[whites[:, 0] < 0].mean(axis=0)]
    face = (eyes[0] + eyes[1]) / 2 + np.array([0, -0.02, -0.04], np.float32)
    arm_r, fore_r = head('RightArm'), head('RightForeArm')
    # The shirt's hem: its lowest face on the front of her left hip.
    centres = np.array([pl.center[:] for pl in me.polygons], np.float32)
    normals = np.array([pl.normal[:] for pl in me.polygons], np.float32)
    front_left = (parts == SHIRT) & (centres[:, 0] > 0.04) & (centres[:, 0] < 0.12) & (normals[:, 1] < -0.5)
    hem = centres[front_left][np.argmin(centres[front_left][:, 2])] + np.array([0, 0, 0.012], np.float32)
    return {
        'knees': [head('LeftLeg'), head('RightLeg')],
        'hands': [head('LeftHand'), head('RightHand')],
        'forearms': [(head('LeftForeArm'), head('LeftHand')), (head('RightForeArm'), head('RightHand'))],
        'eyes': eyes,
        'face': face,
        'cheek': eyes[1] + np.array([-0.012, -0.012, -0.045], np.float32),
        'sleeve': arm_r + (fore_r - arm_r) * 0.45 + np.array([-0.025, -0.02, 0], np.float32),
        'hem': hem,
    }


def wear(rig, meshes, palette):
    """Join, tag, unwrap and paint her. Returns the one body mesh, textured."""
    palette_px = tag_parts(meshes, palette)
    body = join(rig, meshes)
    neck_z = rig.data.bones['mixamorig:Neck'].head_local.z
    unwrap(body, neck_z)
    rgb = paint(body, rig, palette_px, landmarks_of(body, rig))

    img = bpy.data.images.new('annabelle_worn', SIZE, SIZE, alpha=False)
    rgba = np.ones((SIZE, SIZE, 4), np.float32)
    rgba[..., :3] = rgb
    img.pixels.foreach_set(rgba.ravel())
    path = os.path.join(tempfile.gettempdir(), 'annabelle_worn.jpg')
    img.filepath_raw = path
    img.file_format = 'JPEG'
    img.save(quality=88)
    bpy.data.images.remove(img)
    tex = bpy.data.images.load(path)
    tex.name = 'annabelle_worn'
    tex.pack()

    me = body.data
    me.uv_layers.remove(me.uv_layers['UVMap'])
    me.uv_layers['Worn'].active = True
    me.uv_layers['Worn'].active_render = True
    me.attributes.remove(me.attributes['wear_part'])
    mat = me.materials[0]
    nt = mat.node_tree
    img_node = next(nd for nd in nt.nodes if nd.type == 'TEX_IMAGE')
    img_node.image = tex
    for nd in [nd for nd in nt.nodes if nd.type == 'UVMAP']:
        nt.nodes.remove(nd)
    return body, path
