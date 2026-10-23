"""
Blood, filth and tears on the Okabe textures, painted in THREE DIMENSIONS.

WHY THIS IS NOT A SET OF PAINTED PNGs. The repo's rule is that assets are
generated, so they can be measured, diffed and argued about; a hand-painted
gore pass would be a binary nobody can review and nobody can re-derive if the
source model is ever re-imported. Everything here runs from the mesh itself
with a fixed seed, so the same model always comes out the same way and the
reasoning sits next to the result.

WHY IT WORKS IN 3D RATHER THAN IN UV SPACE, which is the whole design. A lab
coat's UV layout is a set of arbitrary islands: "lower edge of the hem" and
"around the left eye" are not rectangles in UV, so authoring there means
guessing, and anything drawn across an island boundary tears at the seam. So
the first thing this does is BAKE A POSITION MAP -- for every texel, the point
on the body it lands on -- and then every effect is a function of that point.
Blood runs downward in world Z because that is the direction gravity actually
points, filth collects at the hem because the hem is the low edge of the coat,
and the eye sockets darken because the eye BONES say where they are. Seams
cannot show, because neighbouring texels on different islands that touch the
same piece of body get the same answer.

The model still has to read as Okabe -- the mirror in the study rests on it.
Nothing here moves a vertex: the coat is still a lab coat, the hair is still
the same shape. But it is the same man LONG after something happened to him
(user, 2026-10-23: darker, more ominous, less like the player). The coat has
rotted to a near-black brown-grey, the skin is ashen and mottled, the hair is
matted dark, and the eyes are gone. The player's own copy, okabe_clean.glb,
keeps the white coat, so the two only meet in the mirror.

AND IT IS SOLID. Tears are painted as dark rents, not punched through the
alpha: a hole in this coat used to show the corridor behind the figure, and
that read as a ghost rather than a body.
"""
import bpy   # noqa: F401
import numpy as np
from mathutils import Vector

# Dark, nearly-black arterial red. Fresh blood on cloth is far darker than
# people expect -- a bright red reads as paint, and at SILHOUETTE_DIM it would
# vanish anyway, so the value difference has to carry it, not the hue.
BLOOD = np.array([0.185, 0.013, 0.011], np.float32)
# Old blood, brown and dry, for the large soaked areas.
BLOOD_OLD = np.array([0.105, 0.035, 0.022], np.float32)
# Grime is a desaturate-and-darken toward this, not a colour laid on top.
FILTH = np.array([0.125, 0.108, 0.082], np.float32)
# What the cloth has rotted to: a dark brown-grey, deliberately NOT near-black.
# Paint that dark takes no light, so the figure reads as a flat shadow -- a
# ghost -- rather than a body (user, 2026-10-23: "more solid"). At this value
# the torch still finds every fold, stain and seam, and that shading is what
# gives it weight.
ROT = np.array([0.205, 0.180, 0.150], np.float32)
# Skin with nothing left in it: grey, a touch cold.
ASH = np.array([0.300, 0.295, 0.305], np.float32)
# Inside a rent: shadow, with dark cloth behind it.
RENT = np.array([0.048, 0.036, 0.030], np.float32)
# Vertical streaking. Dirt and dried blood run DOWN a hanging garment, so
# every stain is roughly three times taller than it is wide.
RUNS = (1.0, 1.0, 0.32)

SEED = 20260405


# ---------------------------------------------------------------------------
# value noise, sampled at points in space


def _grid(rng, n):
    return rng.random((n, n, n), dtype=np.float32)


def _sample(grid, p, scale):
    """
    Trilinear sample of a tiling 3D grid at world points p.

    `scale` is the FEATURE SIZE IN METRES -- one grid cell per `scale` -- and
    getting that wrong is worth a comment because the failure is so plausible.
    It was `p / scale * n`, which makes `scale` the size of the whole tile and
    the features scale/16, so a grime pattern asked for at 0.22 m came out at
    14 mm. Rendered, that is not "wrong noise", it is lichen: the coat looked
    speckled with mould rather than ground-in dirt, and no amount of adjusting
    the strength would have fixed it.
    """
    n = grid.shape[0]
    q = p / scale
    i = np.floor(q).astype(np.int64)
    f = q - i
    f = f * f * (3.0 - 2.0 * f)          # smoothstep, so octaves do not grid
    out = np.zeros(len(p), np.float32)
    for dz in (0, 1):
        for dy in (0, 1):
            for dx in (0, 1):
                w = ((f[:, 0] if dx else 1.0 - f[:, 0])
                     * (f[:, 1] if dy else 1.0 - f[:, 1])
                     * (f[:, 2] if dz else 1.0 - f[:, 2]))
                out += w * grid[(i[:, 0] + dx) % n, (i[:, 1] + dy) % n, (i[:, 2] + dz) % n]
    return out


def _fbm(rng, p, scale, octaves=4, gain=0.5, aniso=None):
    """
    Fractal noise in [0,1]. A separate grid per octave, so they cannot align.

    `aniso` stretches the sampling space: (1, 1, 0.3) squashes Z on the way in,
    which makes every feature three times TALLER than it is wide. That is what
    turns a blotch into a streak, and streaks are what dirt and dried blood
    actually look like on a hanging garment -- gravity has had a say in it.
    """
    q = p if aniso is None else p * np.array(aniso, np.float32)
    total = np.zeros(len(q), np.float32)
    amp, norm, s = 1.0, 0.0, scale
    for _ in range(octaves):
        total += amp * _sample(_grid(rng, 16), q, s)
        norm += amp
        amp *= gain
        s *= 0.5
    return total / norm


# ---------------------------------------------------------------------------
# the position bake


def bake_positions(obj, slots, w, h):
    """
    For each texel of a w*h texture, the point on the body that lands there.

    Returns (pos, mask): pos is (h, w, 3) in world metres, mask says which
    texels any triangle actually covered. Texels no triangle covers are left
    alone -- painting them would only ever show up as bleed at a seam.
    """
    me = obj.data
    M = obj.matrix_world
    uvs = me.uv_layers.active.data
    pos = np.zeros((h, w, 3), np.float32)
    mask = np.zeros((h, w), bool)

    for poly in me.polygons:
        if poly.material_index not in slots:
            continue
        li = list(poly.loop_indices)
        for k in range(1, len(li) - 1):     # fan-triangulate n-gons
            tri = (li[0], li[k], li[k + 1])
            t = np.array([[uvs[i].uv[0], uvs[i].uv[1]] for i in tri], np.float64)
            # WRAP THE TRIANGLE INTO THE TILE ITS CENTRE FALLS IN. This model
            # relies on UV tiling: the hands run u -1.000..0.209 and
            # v 1.192..1.871, entirely outside the unit square, and the coat
            # reaches u -0.343. Rasterising the raw coordinates clipped every
            # hand triangle away and half the coat, so the hands baked ZERO
            # texels and came out of befoul() untouched -- which looks exactly
            # like the effect being too subtle rather than never applied.
            #
            # Shifting by the CENTROID's tile keeps each triangle in one piece.
            # A triangle straddling a tile boundary lands slightly off, but at
            # these texel counts that is a handful of pixels and the renderer's
            # own GL_REPEAT does the same thing from the other side.
            t -= np.floor(t.mean(axis=0))
            t *= (w, h)
            P = np.array([(M @ me.vertices[me.loops[i].vertex_index].co)[:] for i in tri],
                         np.float32)
            x0 = max(0, int(np.floor(t[:, 0].min())))
            x1 = min(w - 1, int(np.ceil(t[:, 0].max())))
            y0 = max(0, int(np.floor(t[:, 1].min())))
            y1 = min(h - 1, int(np.ceil(t[:, 1].max())))
            if x1 < x0 or y1 < y0:
                continue
            X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            den = ((t[1, 1] - t[2, 1]) * (t[0, 0] - t[2, 0])
                   + (t[2, 0] - t[1, 0]) * (t[0, 1] - t[2, 1]))
            if abs(den) < 1e-12:
                continue
            a = ((t[1, 1] - t[2, 1]) * (X - t[2, 0]) + (t[2, 0] - t[1, 0]) * (Y - t[2, 1])) / den
            b = ((t[2, 1] - t[0, 1]) * (X - t[2, 0]) + (t[0, 0] - t[2, 0]) * (Y - t[2, 1])) / den
            c = 1.0 - a - b
            # A hair outside the triangle, so adjacent triangles overlap by a
            # texel and no seam is left unbaked.
            inside = (a >= -0.004) & (b >= -0.004) & (c >= -0.004)
            if not inside.any():
                continue
            pts = (a[..., None] * P[0] + b[..., None] * P[1] + c[..., None] * P[2])
            sub = pos[y0:y1 + 1, x0:x1 + 1]
            subm = mask[y0:y1 + 1, x0:x1 + 1]
            sub[inside] = pts[inside].astype(np.float32)
            subm[inside] = True
    return pos, mask


def _dilate(mask, pos, rounds=2):
    """Grow the baked region outward so filtering at a seam has data to read."""
    for _ in range(rounds):
        for ax, sh in ((0, 1), (0, -1), (1, 1), (1, -1)):
            m2 = np.roll(mask, sh, axis=ax)
            p2 = np.roll(pos, sh, axis=ax)
            fill = m2 & ~mask
            pos[fill] = p2[fill]
            mask |= m2 & fill | fill
    return mask


# ---------------------------------------------------------------------------
# the effects, each a function of where the texel is on the body


def _soak(flat, rng, sources, reach, down, strength):
    """
    Blood spreading from a point and running DOWN, in world Z.

    Cloth wicks downward and nowhere else, so the falloff is deliberately
    lopsided: a wide, soft reach below the wound and a tight one above it.
    """
    out = np.zeros(len(flat), np.float32)
    for src, r, dn, st in zip(sources, reach, down, strength):
        d = flat - np.array(src, np.float32)
        horiz = np.sqrt(d[:, 0] ** 2 + d[:, 1] ** 2)
        drop = -d[:, 2]                       # metres BELOW the source
        wander = (_fbm(rng, flat, 0.055, 3) - 0.5) * r * 1.5
        # ** 0.55 fattens the core: a linear falloff gives a soft gradient that
        # reads as a pink wash rather than a stain with a wet middle.
        radial = np.clip(1.0 - (horiz + wander) / r, 0.0, 1.0) ** 0.55
        along = np.where(drop >= 0.0,
                         np.clip(1.0 - drop / dn, 0.0, 1.0),
                         np.clip(1.0 + drop / (dn * 0.18), 0.0, 1.0))
        out = np.maximum(out, radial * along * st)
    return out


def _runnels(flat, rng, sources, count, length, width):
    """Thin individual trickles, which is what sells blood as liquid."""
    out = np.zeros(len(flat), np.float32)
    for src, n, ln in zip(sources, count, length):
        for _ in range(n):
            ox = (rng.random() - 0.5) * 0.16
            oy = (rng.random() - 0.5) * 0.16
            lz = ln * (0.35 + rng.random())
            d = flat - np.array([src[0] + ox, src[1] + oy, src[2]], np.float32)
            drift = (_fbm(rng, flat, 0.05, 2) - 0.5) * 0.035
            horiz = np.sqrt((d[:, 0] + drift) ** 2 + (d[:, 1] + drift) ** 2)
            drop = -d[:, 2]
            on = (drop >= 0.0) & (drop < lz)
            # tapers to nothing at the bottom, the way a trickle dries out
            taper = np.clip(1.0 - drop / max(lz, 1e-6), 0.0, 1.0)
            out = np.maximum(out, np.where(on, np.clip(1.0 - horiz / width, 0.0, 1.0) * taper, 0.0))
    return out


def _spatter(flat, rng, n, lo, hi, radius, span=0.52):
    """
    Discrete droplets, sized on a heavy tail so a few are large.

    `span` is how wide to scatter them in X, and it has to be told rather than
    assumed: the default 0.52 m covers a torso, but this model is imported in
    an A-POSE with the sleeves reaching +-0.9 m, so every drop fell on the body
    and the sleeves stayed spotless while the chest was soaked.
    """
    out = np.zeros(len(flat), np.float32)
    zs = rng.random(n) * (hi - lo) + lo
    for z in zs:
        c = np.array([(rng.random() - 0.5) * span,
                      (rng.random() - 0.5) * 0.36, z], np.float32)
        r = radius * (0.25 + rng.random() ** 3 * 2.2)
        d = np.linalg.norm(flat - c, axis=1)
        out = np.maximum(out, np.clip(1.0 - d / r, 0.0, 1.0) ** 0.45)
    return out


# ---------------------------------------------------------------------------
# applying it


def _slots_for(me, stem):
    out = set()
    for i, m in enumerate(me.materials):
        if not m or not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and n.image.name.split('.')[0] == stem:
                out.add(i)
    return out


def _ring(cut, rounds=2):
    """
    The texels just OUTSIDE a tear, where the cloth frays.

    A hole with a clean edge reads as a modelling mistake; a hole with a dark,
    stained rim reads as damage. Two texels of ring is enough at these sizes.
    Works on the flat array by reshaping back, because the tear masks are
    computed per texel and neighbours in the image are what fray together.
    """
    grown = cut.copy()
    for _ in range(rounds):
        for ax, sh in ((0, 1), (0, -1), (1, 1), (1, -1)):
            grown |= np.roll(grown, sh, axis=ax)
    return grown & ~cut


def _read(img):
    w, h = img.size
    buf = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(buf)
    return buf.reshape(h, w, 4)


def _shrink(px, limit):
    """
    Box-downsample to at most `limit` on a side, by whole factors only.

    BEFOULING COSTS FILE SIZE AND THIS IS WHERE IT IS PAID BACK. PNG encodes
    smooth gradients cheaply and noise expensively, so painting filth over a
    clean texture roughly doubled okarin01: it is 1024x1024, which is 862,000
    baked texels, more than every other texture put together. A face read at
    5-15 m through FogExp2 cannot resolve 1024 either way, so the resolution
    was already past the point of doing anything.

    Whole factors with a box filter, so each output texel is the exact mean of
    the inputs -- no resampling kernel, no ringing on the tear edges, and the
    alpha cutout stays where it was to within half a texel.
    """
    h, w = px.shape[:2]
    f = 1
    while max(h, w) // (f * 2) >= limit and (h % (f * 2) == 0) and (w % (f * 2) == 0):
        f *= 2
    if f == 1:
        return px, 1
    return px.reshape(h // f, f, w // f, f, 4).mean(axis=(1, 3)), f


def _swap(obj, stem, px):
    """
    Replace every use of `stem` with a GENERATED image holding `px`.

    Generated rather than written-back, because Image.pack() re-reads a FILE
    image from disk: edits made to .pixels are silently discarded and the
    export ships the untouched original. That failure looks exactly like the
    effects having no effect, which is a bad hour to spend.
    """
    h, w = px.shape[:2]
    new = bpy.data.images.new(stem + '_befouled', w, h, alpha=True)
    new.pixels.foreach_set(np.clip(px, 0.0, 1.0).reshape(-1).astype(np.float32))
    new.update()
    for m in obj.data.materials:
        if not m or not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and n.image.name.split('.')[0] == stem:
                n.image = new
    return new


def befoul(obj, rig, seed=SEED):
    """
    Blood, filth and tears, measured from the body outward.

    Every number below is in METRES ON THE MODEL rather than in texels, which
    is what makes them arguable: "blood soaks 0.46 m down from the sternum" is
    a claim about a body, and the UV layout can be rebuilt underneath it
    without a line of this needing to change.
    """
    rng = np.random.default_rng(seed)
    me = obj.data
    B = {b.name: (rig.matrix_world @ b.head_local) for b in rig.data.bones}

    def at(name, dz=0.0, dy=0.0, dx=0.0):
        v = B.get(name, Vector((0.0, 0.0, 1.2)))
        return (v.x + dx, v.y + dy, v.z + dz)

    # Blender keeps Z up, and this model faces -Y, so "down the front of the
    # chest" is -Z from a point pushed -Y out of the sternum.
    chest = at('Chest', dz=0.04, dy=-0.06)
    throat = at('Neck', dy=-0.05)
    eyeL, eyeR = at('Eye_L'), at('Eye_R')
    mouth = ((eyeL[0] + eyeR[0]) * 0.5,
             (eyeL[1] + eyeR[1]) * 0.5 - 0.030,
             (eyeL[2] + eyeR[2]) * 0.5 - 0.075)
    hips = at('Hips')
    kneeL = np.array(at('Left knee'), np.float32)
    kneeR = np.array(at('Right knee'), np.float32)
    report = {}
    # The texture currently being painted. The recipes work on flat arrays --
    # one row per texel -- but fraying a tear is a question about NEIGHBOURING
    # PIXELS, so _ring needs the image back in two dimensions.
    shape = [0, 0]

    def run(stem, recipe):
        img = next((i for i in bpy.data.images
                    if i.name.split('.')[0] == stem and i.size[0] > 0), None)
        slots = _slots_for(me, stem) if img else set()
        if img is None or not slots:
            report[stem] = 'ABSENT'
            return
        w, h = img.size
        shape[0], shape[1] = h, w
        px = _read(img)
        pos, mask = bake_positions(obj, slots, w, h)
        mask = _dilate(mask, pos)
        flat = pos.reshape(-1, 3)
        covered = mask.reshape(-1)
        rgb, alpha, note = recipe(flat, px[..., :3].reshape(-1, 3).copy(),
                                  px[..., 3].reshape(-1).copy(), covered, rng)
        # Never touch a texel no triangle lands on: it is either padding or
        # another island's bleed margin, and painting it shows up as a fringe.
        keep = ~covered
        rgb[keep] = px[..., :3].reshape(-1, 3)[keep]
        alpha[keep] = px[..., 3].reshape(-1)[keep]
        px[..., :3] = rgb.reshape(h, w, 3)
        px[..., 3] = alpha.reshape(h, w)
        px, f = _shrink(px, 512)
        _swap(obj, stem, px)
        note['texels'] = int(covered.sum())
        if f > 1:
            note['shrunk'] = '%dx%d/%d' % (w, h, f)
        report[stem] = note

    def torn(cut, rgb, alpha, covered):
        """Paint the rents dark and stain the frayed edge round them. Alpha is left alone."""
        cut = cut & covered
        edge = _ring(cut.reshape(shape[0], shape[1])).reshape(-1) & covered
        rgb[edge] = rgb[edge] * 0.45 + BLOOD_OLD * 0.55
        rgb[cut] = RENT
        return rgb, alpha, round(100.0 * cut.sum() / max(1, covered.sum()), 1)

    def rot(rgb, flat, rng, amount):
        """Cloth gone dark with time and wet, unevenly, in streaks."""
        r = np.clip(amount + 0.30 * (_fbm(rng, flat, 0.18, 3, aniso=RUNS) - 0.5), 0.0, 1.0)
        return rgb * (1.0 - r[:, None]) + ROT * r[:, None]

    # --- the coat: the largest pale shape, so it carries the whole read -----
    def coat(flat, rgb, alpha, covered, rng):
        low = np.clip((1.05 - flat[:, 2]) / 0.60, 0.0, 1.0)   # 0 at chest, 1 at hem
        rgb = rot(rgb, flat, rng, 0.80)
        dirt = (np.clip(0.30 + 0.90 * _fbm(rng, flat, 0.26, 3, aniso=RUNS), 0.0, 1.0)
                * (0.68 + 0.32 * low))
        rgb = rgb * (1.0 - dirt[:, None]) + FILTH * dirt[:, None]
        soak = _soak(flat, rng, [chest, throat], [0.21, 0.13], [0.50, 0.33], [1.0, 0.95])
        wet = np.clip(soak * 1.45
                      + _runnels(flat, rng, [chest, throat], [9, 5], [0.58, 0.36], 0.013)
                      + _spatter(flat, rng, 70, 0.55, 1.55, 0.034, span=1.95) * 1.1, 0.0, 1.0)
        hue = BLOOD_OLD * (1.0 - soak[:, None]) + BLOOD * soak[:, None]
        rgb = rgb * (1.0 - wet[:, None]) + hue * wet[:, None]
        # Rips run DOWN a hanging coat, so the noise is stretched tall (RUNS),
        # and there are fewer of them than there were holes: painted dark,
        # a dense field of them read as camouflage rather than damage.
        rgb, alpha, pct = torn(_fbm(rng, flat, 0.075, 3, aniso=RUNS) > (0.70 - 0.085 * low),
                               rgb, alpha, covered)
        return rgb, alpha, {'torn%': pct,
                            'bloodied%': round(100.0 * (wet[covered] > 0.15).mean(), 1)}

    def shirt(flat, rgb, alpha, covered, rng):
        rgb = rot(rgb, flat, rng, 0.62)
        dirt = (0.22 + 0.78 * _fbm(rng, flat, 0.20, 3, aniso=RUNS)) * 0.85
        rgb = rgb * (1.0 - dirt[:, None]) + FILTH * dirt[:, None]
        soak = _soak(flat, rng, [chest, throat], [0.125, 0.085], [0.42, 0.26], [1.0, 1.0])
        wet = np.clip(soak * 1.35 + _runnels(flat, rng, [chest], [7], [0.50], 0.014), 0.0, 1.0)
        rgb = rgb * (1.0 - wet[:, None]) + BLOOD * wet[:, None]
        # SOAKED BUT NOT TORN, and that is a modelling fact rather than taste.
        # This body has no skin under the neck -- okarin01 covers y 1.50..1.83
        # and nothing else -- so the shirt IS the torso. A hole in it is a hole
        # through the figure, showing the corridor behind. The coat can tear
        # because the shirt backs it; the shirt has nothing behind it at all.
        return rgb, alpha, {'torn%': 0.0,
                            'bloodied%': round(100.0 * (wet[covered] > 0.15).mean(), 1)}

    def trousers(flat, rgb, alpha, covered, rng):
        low = np.clip((0.75 - flat[:, 2]) / 0.70, 0.0, 1.0)
        rgb = rot(rgb, flat, rng, 0.62)
        dirt = np.clip(0.34 + 0.80 * _fbm(rng, flat, 0.24, 3, aniso=RUNS), 0.0, 1.0) * (0.58 + 0.42 * low)
        rgb = rgb * (1.0 - dirt[:, None]) + FILTH * dirt[:, None]
        wet = np.clip(_runnels(flat, rng, [hips], [11], [0.60], 0.014)
                      + _spatter(flat, rng, 34, 0.05, 0.95, 0.032) * 1.0, 0.0, 1.0)
        rgb = rgb * (1.0 - wet[:, None]) + BLOOD_OLD * wet[:, None]
        # The knees take the worst of it: this thing has been down on them.
        # KNEES ONLY. Same reason as the shirt: there is no leg modelled inside
        # these trousers, so a hole anywhere broad shows the floor through the
        # figure. At the knee it is small, it is low, and it is the one place a
        # torn trouser actually tears.
        kd = np.minimum(np.linalg.norm(flat - kneeL, axis=1),
                        np.linalg.norm(flat - kneeR, axis=1))
        rgb, alpha, pct = torn((kd < 0.085) & (_fbm(rng, flat, 0.045, 2) > 0.50),
                               rgb, alpha, covered)
        return rgb, alpha, {'torn%': pct}

    def hands(flat, rgb, alpha, covered, rng):
        rgb = rgb * 0.40 + ASH * 0.60
        wet = np.clip(_fbm(rng, flat, 0.045, 3) * 2.1 - 0.52, 0.0, 1.0)
        rgb = rgb * (1.0 - wet[:, None]) + BLOOD * wet[:, None]
        dirt = _fbm(rng, flat, 0.120, 3) * 0.55
        rgb = rgb * (1.0 - dirt[:, None]) + FILTH * dirt[:, None]
        return rgb, alpha, {'bloodied%': round(100.0 * (wet[covered] > 0.20).mean(), 1)}

    def hair(flat, rgb, alpha, covered, rng):
        # Matted near-black, in clumps.
        rgb = rgb * (0.22 + 0.16 * _fbm(rng, flat, 0.04, 2)[:, None])
        wet = np.clip(_fbm(rng, flat, 0.055, 3, aniso=RUNS) * 1.9 - 1.00, 0.0, 1.0)
        rgb = rgb * (1.0 - wet[:, None]) + BLOOD_OLD * wet[:, None]
        return rgb, alpha, {'darkened': 0.3,
                            'bloodied%': round(100.0 * (wet[covered] > 0.20).mean(), 1)}

    def face(flat, rgb, alpha, covered, rng):
        # Sunken sockets, placed from where the EYE BONES actually are. A
        # painted guess misses by centimetres and reads as a bruised cheek.
        d = np.minimum(np.linalg.norm(flat - np.array(eyeL, np.float32), axis=1),
                       np.linalg.norm(flat - np.array(eyeR, np.float32), axis=1))
        socket = np.clip(1.0 - d / 0.078, 0.0, 1.0) ** 0.6
        rgb = rgb * (1.0 - 0.97 * socket[:, None])
        # Drained first, gore second. Blood over a healthy complexion reads as
        # makeup; over ashen grey skin it reads as injury.
        rgb = (rgb * 0.15 + rgb.mean(axis=1, keepdims=True) * 0.85) * 0.50 + ASH * 0.12
        # Mottled, and veined: thin dark lines where a noise field crosses its
        # middle value, which is what blood stopped under the skin looks like.
        rgb = rgb * (0.85 + 0.30 * _fbm(rng, flat, 0.03, 3))[:, None]
        vein = np.clip(1.0 - np.abs(_fbm(rng, flat, 0.016, 2) - 0.5) / 0.012, 0.0, 1.0) * 0.30
        rgb = rgb * (1.0 - vein[:, None]) + np.array([0.05, 0.05, 0.08], np.float32) * vein[:, None]
        wet = np.clip(_soak(flat, rng, [mouth], [0.075], [0.38], [1.0]) * 1.3
                      + _runnels(flat, rng, [mouth], [9], [0.34], 0.009), 0.0, 1.0)
        rgb = rgb * (1.0 - wet[:, None]) + BLOOD * wet[:, None]
        dirt = _fbm(rng, flat, 0.055, 3, aniso=RUNS) * 0.45
        rgb = rgb * (1.0 - dirt[:, None]) + FILTH * dirt[:, None]
        return rgb, alpha, {'socket%': round(100.0 * (socket[covered] > 0.30).mean(), 1),
                            'bloodied%': round(100.0 * (wet[covered] > 0.15).mean(), 1)}

    def eyes(flat, rgb, alpha, covered, rng):
        # No iris, no catchlight, no white. The cheapest monster cue there is,
        # and the only one that survives both the fog and SILHOUETTE_DIM.
        return rgb * 0.02, alpha, {'crushed to': 0.02}

    for stem, recipe in (('okarin03', coat), ('okarin05', shirt), ('okarin06', trousers),
                         ('okarin07', hands), ('okarin02', hair), ('okarin01', face),
                         ('okarin04', eyes)):
        run(stem, recipe)
    return report
