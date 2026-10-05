"""
Import the Okabe character and give it a MONSTER reading, as one shape key.

    D:\\Blender\\blender.exe --background --python blender/import_okabe.py

Writes src/assets/models/okabe.glb.

WHY THIS IS AN IMPORT SCRIPT AND NOT A MODEL. Every other character in this
repo is generated -- build_creature.py authors its mesh from tables, which is
why it can be measured, diffed and argued about. This one arrives as a 20,866
vertex FBX from a Unity package and nothing here authored it. What this script
owns is everything DONE TO it: the material merge, the monster morph and the
export. Re-running it from the same source is deterministic, so the .glb stays
a build artefact rather than a thing someone edited by hand once.

THE MONSTER IS A SHAPE KEY ON THE SAME MESH, which is the whole point. The
game's reveal rests on the claim that the thing in the corridor and the person
in the photograph are the same body; two models make that an assertion, one
mesh with a per-vertex delta makes it true by construction. src/systems/
Creature.js already drives exactly this shape with setCorrection(0..1).

THE SPLIT BETWEEN BONES AND THE KEY is borrowed from build_creature.py and is
not a style choice: a shape key moves vertices and cannot move a joint. Morph
an arm half again as long and the elbow stays where it was, so the limb creases
through the middle of the forearm. The key here bakes the lengthening as well
as the thickness so that a static render shows the real silhouette; the runtime
must apply the matching bone translations, read off the same STRETCH table.
"""
import bpy, sys, os, math   # noqa: E401
from mathutils import Vector   # noqa: E402

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import export_rigged_glb   # noqa: E402
from befoul import befoul   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source', 'okabe', 'Okabe.fbx')
OUT = os.path.join(HERE, '..', 'src', 'assets', 'models', 'okabe.glb')
# The same body before befoul() touches it: the man the player walks around as.
OUT_CLEAN = os.path.join(HERE, '..', 'src', 'assets', 'models', 'okabe_clean.glb')

# ---------------------------------------------------------------------------
# The monster
# ---------------------------------------------------------------------------

# How much longer each segment gets, and the height is SPREAD ACROSS THE WHOLE
# CHAIN rather than stacked into one segment. All of it in the legs gives a
# stilt-walker and all of it in the neck gives a giraffe; what the eye reads is
# the ratio between segments, not the total. The legs take about two thirds
# because they are much the longest bones (0.386 and 0.459 m), so a small ratio
# buys a lot of millimetres.
#
# Arms are the exception and they are the design: 1.50 / 1.63 / 1.90 is lifted
# from Creature.js's HUMAN/HOLLOW tables, where the hands hanging far below the
# coat hem is the single cue the whole silhouette is built on.
STRETCH = {
    'arm': 1.50, 'elbow': 1.63, 'wrist': 1.90,
    'neck': 1.85, 'spine': 1.20, 'chest': 1.20,
    'leg': 1.18, 'knee': 1.18, 'ankle': 1.00,
}

# How much thinner, radially about each bone's own axis.
#
# THESE ARE NOT AS LOW AS THEY WANT TO BE. A limb's apparent slenderness is its
# length over its width, so stretching and thinning the SAME bone compounds --
# at 0.60/0.64 the legs were both the thinnest thing on the figure and the
# longest, which reads as spindly rather than as gaunt. The legs now carry close
# to normal girth and take their wrongness from length alone; the arms stay the
# leanest of the limbs because they already have the longest reach.
#
# CLOTH IS ABSENT FROM THIS TABLE ON PURPOSE. The coat and belt keep the
# measurements they were made in while the body inside them wastes, which is the
# same reasoning that stopped the procedural creature's shoes shrinking along
# with its feet. It is also most of why the monster reads as a person something
# happened to rather than as a different species.
THIN = {
    'arm': 0.88, 'elbow': 0.86, 'wrist': 0.90, 'finger': 0.92, 'thumb': 0.92,
    'neck': 0.78, 'spine': 0.90, 'chest': 0.88, 'hips': 0.92,
    'leg': 0.82, 'knee': 0.80, 'ankle': 0.88,
    'head': 0.92, 'eye': 0.92, 'tongue': 0.92, 'fronthair': 0.94,
}
HEAD_STRETCH = 1.36        # skull, about the head bone's BASE -- see below
CLOTH = ('white clothes', 'belt')


def kind(name):
    """Which row of STRETCH/THIN a bone belongs to, or None to leave it alone."""
    n = name.lower()
    if any(c in n for c in CLOTH):
        return None
    # Ordered longest-first so 'fronthair' does not match 'hair', and 'elbow'
    # is tested before 'arm' -- the MMD rig names the forearm 'Right elbow'.
    for key in ('fronthair', 'elbow', 'wrist', 'shoulder', 'ankle', 'knee',
                'finger', 'thumb', 'neck', 'spine', 'chest', 'hips', 'head',
                'eye', 'tongue', 'arm', 'leg'):
        if key in n:
            return key
    return None


def build_monster_key(obj, rig):
    """One shape key, 'Monster'. Returns a dict of measurements for the gate."""
    me = obj.data
    bone = {b.name: b for b in rig.data.bones}
    M = rig.matrix_world

    def head_of(b):
        return M @ b.head_local

    def axis_of(b):
        v = (M @ b.tail_local) - (M @ b.head_local)
        return v.normalized() if v.length > 1e-6 else Vector((0.0, 0.0, 1.0))

    # CUMULATIVE OFFSET PER BONE. Lengthening a parent moves every child's
    # joint with it, and without carrying that forward the arm comes apart at
    # the elbow -- the forearm grows in place while its shoulder stays put.
    offset = {}

    def chain_offset(b):
        if b.name in offset:
            return offset[b.name]
        if b.parent is None:
            offset[b.name] = Vector((0.0, 0.0, 0.0))
        else:
            p = b.parent
            k = kind(p.name)
            grow = (STRETCH.get(k, 1.0) - 1.0) if k else 0.0
            seg = (M @ p.tail_local) - (M @ p.head_local)
            offset[b.name] = chain_offset(p) + seg * grow
        return offset[b.name]

    for b in rig.data.bones:
        chain_offset(b)

    group_name = {g.index: g.name for g in obj.vertex_groups}
    if me.shape_keys is None:
        obj.shape_key_add(name='Basis', from_mix=False)
    key = obj.shape_key_add(name='Monster', from_mix=False)

    head_base = head_of(bone['Head']) if 'Head' in bone else Vector((0, 0, 1.64))

    # ------------------------------------------------------------------ face
    # A SKULL UNDER THE SKIN, which is the part paint cannot do. The befoul
    # pass darkens the sockets, but a dark patch on a full cheek still reads as
    # a bruise -- the shape has to actually recede or the light keeps landing
    # where a healthy face would catch it. Three pits, all placed from the rig
    # rather than from eyeballed coordinates: the two eye BONES give the
    # sockets, and the cheek hollow sits below and outside each of them.
    #
    # Pulled along -Y as well as inward, because this model faces -Y: a purely
    # radial pull would suck the sides of the head in and leave the face flat.
    SOCKET_R, SOCKET_D = 0.052, 0.022
    CHEEK_R, CHEEK_D = 0.060, 0.016
    eye_l = head_of(bone['Eye_L']) if 'Eye_L' in bone else None
    eye_r = head_of(bone['Eye_R']) if 'Eye_R' in bone else None
    pits = []
    if eye_l and eye_r:
        for e in (eye_l, eye_r):
            pits.append((e, SOCKET_R, SOCKET_D))
            # Below and outboard: the hollow under a cheekbone.
            side = 1.0 if e.x > 0 else -1.0
            pits.append((Vector((e.x + 0.012 * side, e.y + 0.004, e.z - 0.055)),
                         CHEEK_R, CHEEK_D))

    def hollow_face(q):
        if not pits:
            return q
        best = 0.0
        push = Vector((0.0, 0.0, 0.0))
        for c, r, depth in pits:
            d = (q - c).length
            if d >= r:
                continue
            # smoothstep falloff, so the rim of the pit has no crease in it
            t = 1.0 - d / r
            w = t * t * (3.0 - 2.0 * t)
            if w > best:
                best = w
                n = (q - c)
                n.z *= 0.55            # flatten: hollow the face, not the brow
                if n.length < 1e-6:
                    n = Vector((0.0, -1.0, 0.0))
                n.normalize()
                # INTO the skull. The model faces -Y, so receding is +Y, and
                # -n adds a little pull toward the centre of the pit so it
                # reads as a socket rather than a flat dent. Getting these two
                # signs the other way round inflates the face into a bubble,
                # which is a much funnier result than it is a frightening one.
                push = (Vector((0.0, 1.0, 0.0)) * 0.80 - n * 0.20) * depth
        return q + push * best

    moved = 0
    for v in me.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        if best is None:
            continue
        b = bone.get(group_name.get(best.group))
        if b is None:
            continue
        k = kind(b.name)
        if k is None:
            continue
        p = v.co.copy()
        h, a = head_of(b), axis_of(b)
        along = (p - h).dot(a)
        on_axis = h + a * along

        if k in ('head', 'eye', 'tongue', 'fronthair'):
            # About the head bone's BASE, not the skull's centre: scaled about
            # its middle the head sinks into the chest instead of growing up
            # out of the collar.
            q = Vector((p.x * THIN[k], p.y * THIN[k],
                        head_base.z + (p.z - head_base.z) * HEAD_STRETCH))
        else:
            q = (h + a * (along * STRETCH.get(k, 1.0))
                 + (p - on_axis) * THIN.get(k, 1.0))
        q = q + chain_offset(b)
        q = hollow_face(q)
        if (q - p).length > 1e-6:
            moved += 1
        key.data[v.index].co = q

    key.value = 0.0            # ship at the HUMAN reading; the dial drives it
    hi = max(key.data[i].co.z for i in range(len(me.vertices)))
    lo = min(key.data[i].co.z for i in range(len(me.vertices)))
    return {
        'moved': moved,
        'verts': len(me.vertices),
        'human_h': max(v.co.z for v in me.vertices) - min(v.co.z for v in me.vertices),
        'monster_h': hi - lo,
    }


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def merge_materials(obj):
    """
    43 materials down to the number of distinct LOOKS, which is about 12.

    GLTFLoader splits a mesh into one primitive per material, and a primitive is
    a draw call. Twenty-four of the forty-three here are hair cards sampling the
    same okarin02.tga and differing in nothing at all -- that is twenty-three
    draw calls bought for no pixels.

    MERGED BY (IMAGE, BASE COLOUR), NOT BY IMAGE ALONE. MMD multiplies the base
    colour through the texture, and five materials share okarin03 while meaning
    different things: the lab coat is white, the ballpoint pen is grey and its
    cap is RED. Merging on the image alone turns Okabe's red pen white, which is
    a small thing that happens to be one of the few bits of colour on him.
    """
    me = obj.data

    def sig(m):
        if m is None:
            return ('none', None)
        img = None
        base = (1.0, 1.0, 1.0)
        if m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and n.image.size[0] > 0:
                    img = n.image.name
                elif n.type == 'BSDF_PRINCIPLED':
                    base = tuple(round(c, 2) for c in
                                 n.inputs['Base Color'].default_value[:3])
        return (img or 'none', base)

    keep, remap, sources = [], {}, []
    for i, m in enumerate(me.materials):
        s = sig(m)
        for j, (ks, _) in enumerate(keep):
            if ks == s:
                remap[i] = j
                sources[j].append(m.name if m else '-')
                break
        else:
            remap[i] = len(keep)
            keep.append((s, m))
            sources.append([m.name if m else '-'])

    # ORDER MATTERS AND IT COST A SILENT FAILURE. Remapping the polygons first
    # and then clearing the slots throws the remap away -- materials.clear()
    # invalidates every material_index, so all 19,999 faces collapsed onto slot
    # 0 and the GLB came out with ONE material and ONE embedded texture. It
    # exported cleanly and looked like the merge had worked perfectly.
    old = [p.material_index for p in me.polygons]

    before = len(me.materials)
    me.materials.clear()
    for idx, (s, m) in enumerate(keep):
        # Name by what it IS, so applyTextureByMaterialName-style lookups and
        # anything debugging a draw call have something readable to go on.
        m.name = 'Okabe_%02d_%s' % (idx, (s[0] or 'flat').split('.')[0])
        # Carry the ORIGINAL MMD names forward. Later passes need to know which
        # merged slot is the coat and which is the hair, and the merged name
        # cannot say: four different things share okarin03, and the index in
        # it shifts the moment the source gains or loses a material. The source
        # names do not move.
        m['mmd_sources'] = sources[idx]
        me.materials.append(m)

    for p, i in zip(me.polygons, old):
        p.material_index = remap[i]
    return before, len(keep)


def strip_face_keys(obj):
    """
    Drop the 30 inherited facial expressions, keep Basis and Monster.

    The MMD source ships a full viseme and emotion set -- Blink, Wink, Ah,
    'Be troubled', 'Anger right' and twenty-five more. Every one of them is a
    full-mesh position delta on 20,866 vertices that three.js uploads into the
    morph texture and evaluates per frame, and nothing in this game drives any
    of them: the player never sees their own face and the monster has no
    dialogue. Keeping them cost 30/31 of the morph budget for no pixels.

    If facial animation is ever wanted, the cheapest route back is to keep
    'Blink' here rather than to re-import.
    """
    me = obj.data
    if not me.shape_keys:
        return 0
    doomed = [k.name for k in me.shape_keys.key_blocks
              if k.name not in ('Basis', 'Monster')]
    for name in doomed:
        obj.shape_key_remove(me.shape_keys.key_blocks[name])
    return len(doomed)


def weld_source(obj, dist=1e-5):
    """
    Join the vertices the source left lying on top of each other.

    THE HANDS ARE THE WHOLE OF THIS. Counting what glTF is actually obliged to
    emit -- one vertex per distinct position, UV, normal and material, which is
    the most it can ever share -- the mesh needs 13,217 and the exporter was
    emitting 19,605. Of the 6,388 wasted, 6,223 are in okarin07: the hands ship
    as 2,778 completely disconnected triangles, 8,334 vertices sharing nothing
    with their neighbours, against a floor of 2,111. Every other material is
    already within a percent or two of its own floor, so this is one defect in
    one piece of the model and not a general tidy-up.

    SAFE BECAUSE BLENDER KEEPS UVs AND NORMALS PER LOOP. Welding two coincident
    vertices does not merge their UVs or their custom split normals -- those
    live on the corners -- so a UV seam or a hard edge survives the weld and
    the exporter splits it straight back out on the way to glTF. That is why
    the predicted result is the floor and not the welded count: 10,930 Blender
    vertices become about 13,217 glTF ones.

    AT 0.01 mm, which only takes vertices that are literally coincident. Hair
    cards sit close to each other and a looser distance would start stitching
    separate cards into one another.

    MUST RUN BEFORE build_monster_key. bmesh operations default to
    use_shapekey=False, so welding a mesh that already has shape keys silently
    desyncs the key from the base; doing it first means there is no key to
    desync.
    """
    import bmesh
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    loose = [v for v in bm.verts if not v.link_faces]
    n_loose = len(loose)
    if loose:
        # The exporter drops these anyway, but carrying 1,329 vertices that
        # belong to no face makes every count in every diagnostic a lie.
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    after = len(bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return before, after, n_loose


# MMD shades with a 1D toon ramp and a spherical environment map, neither of
# which glTF has any concept of. The Unity package shipped the colour textures
# and NOT these, so they resolve to files that do not exist.
DEAD_MAPS = ('toon', 'metal4', '.sph')

# Below this, a tint is not worth a node. See relink_base_colour.
TINT_EPS = 0.1


def relink_base_colour(obj, dead=DEAD_MAPS, eps=TINT_EPS):
    """
    Put the real texture on Base Color, because the FBX importer put a corpse there.

    THIS IS THE WHOLE TEXTURE BUG AND IT IS NOT force_opaque's DOING. Every MMD
    material arrives with TWO image nodes: the colour map (okarin01..07, which
    load fine) and a toon ramp or sphere map (toon01/04/05.bmp, metal4.sph),
    which were never in the Unity package and so load 0x0 EMPTY. The importer
    links the RAMP to Base Color and leaves the colour map dangling. The glTF
    exporter cannot embed a zero-byte image, drops it, and writes
    baseColorFactor [1,1,1,1] -- so eleven of fourteen materials shipped as
    FLAT WHITE while still being NAMED after the texture they were missing.

    Only three survived, and only by accident: okarin02 (hair), okarin04 (eyes)
    and okarin03 (pen) are the three materials whose second image node happened
    to be the colour map again rather than a ramp.

    IT ALSO EATS THE DIFFUSE COLOUR, which is the half that is easy to miss. A
    linked socket ignores its default_value, so the belt's (0,0,0) and the
    buckle's gold went out as white too -- the belt was rendering as a WHITE
    band. The proof that this is the mechanism is tooth and tongue: they have
    no image node at all, were therefore never linked, and are the only two
    materials whose colour came through correctly.

    So: drop the ramps, then link the colour map, and where there is no colour
    map leave the socket unlinked so the MMD diffuse survives as the colour.

    THE TINT IS ONLY WORTH A NODE WHEN IT SAYS SOMETHING. MMD multiplies the
    diffuse through the texture, and glTF expresses that exactly as
    baseColorFactor * baseColorTexture -- but only if the exporter recognises a
    multiply node, which is a narrower contract than a plain image link. Eleven
    of the tinted materials sit at 0.95, a uniform 5% that changes no
    relationship between garments, so they take the plain link. The two that
    mean something -- the pen cap at (1,0,0) and its barrel at 0.784 -- get the
    node. If the exporter ever stops recognising it they go white, which is why
    check-okabe asserts the red cap's factor rather than trusting this.
    """
    relinked = tinted = dropped = 0
    for m in obj.data.materials:
        if m is None or not m.use_nodes:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            continue
        base = bsdf.inputs['Base Color']
        # Read the tint BEFORE touching links: a socket keeps its default_value
        # while linked, and that stale value is where MMD left the diffuse.
        tint = tuple(base.default_value[:3])

        for n in [n for n in nt.nodes
                  if n.type == 'TEX_IMAGE'
                  and (n.image is None or n.image.size[0] == 0
                       or any(d in n.image.name.lower() for d in dead))]:
            nt.nodes.remove(n)       # also removes its links
            dropped += 1

        for link in list(base.links):
            nt.links.remove(link)

        # Whatever image node is left is now the colour map by construction,
        # which is also what makes force_opaque's "first image node" safe.
        img = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image), None)
        if img is None:
            base.default_value = (tint[0], tint[1], tint[2], 1.0)
            continue

        if max(abs(1.0 - c) for c in tint) <= eps:
            nt.links.new(img.outputs['Color'], base)
        else:
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.location = (bsdf.location.x - 240, bsdf.location.y - 120)
            # ShaderNodeMix carries one A/B pair PER DATA TYPE and they all
            # share the names 'A' and 'B', so inputs['A'] is whichever came
            # first -- a float. Pick by socket type, never by name.
            fac = next(s for s in mix.inputs
                       if s.name == 'Factor' and s.type == 'VALUE')
            fac.default_value = 1.0
            a, b = [s for s in mix.inputs if s.type == 'RGBA'][:2]
            b.default_value = (tint[0], tint[1], tint[2], 1.0)
            nt.links.new(img.outputs['Color'], a)
            nt.links.new(next(s for s in mix.outputs if s.type == 'RGBA'), base)
            tinted += 1
        relinked += 1
    return relinked, tinted, dropped


# The lab coat, by its ORIGINAL MMD material names -- the hem, the coat itself
# and its lining. See the two_sided note in force_opaque for why these three
# keep both faces when everything else is culled.
COAT_SOURCES = ('White 裾', 'White clothes', 'In white clothes')

# Textures whose ALPHA means something and must survive as a cutout.
#
# okarin02 is the hair, whose alpha has always been the shape of the cards.
# The other two are befoul()'s doing: it punches the tears into the coat and
# the trouser knees as holes in the alpha channel rather than by deleting
# triangles, so the rip has a ragged per-texel edge instead of following the
# topology, and nothing in the mesh, the skinning or the morph has to change.
# A material left OPAQUE ignores its alpha entirely, so the tears would simply
# not appear -- which is indistinguishable from befoul having done nothing.
ALPHA_CLIPPED = ('okarin02', 'okarin03', 'okarin06')


def force_opaque(obj, alpha_clip_images=('okarin02',)):
    """
    Make the character OPAQUE, which the source emphatically is not.

    Every material arrives from the MMD/FBX chain carrying alpha, so the glTF
    exporter writes alphaMode BLEND and three.js puts all fourteen meshes in
    the transparent pass with depthWrite off. Transparent objects are sorted
    per OBJECT and never per triangle, so the body, head and hands end up
    blended behind the coat in whatever order the sort happened to pick --
    which renders as a coat and some hair with nothing inside them.

    Three of them are worse than mis-sorted: the tongue, a tooth and the belt
    buckle came in at opacity 0.55, 0.12 and 0.0. The last is invisible.

    THE HAIR IS THE ONE REAL EXCEPTION. okarin02.tga is RGBA and its alpha is
    the shape of the hair cards -- forced fully opaque they render as solid
    rectangles. That one gets alpha CLIP instead of blend: it still writes
    depth, so it sorts correctly like any opaque surface, and the cutout comes
    from a threshold rather than from blending.
    """
    clipped = 0
    for m in obj.data.materials:
        if m is None or not m.use_nodes:
            continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            continue
        img = next((n for n in m.node_tree.nodes
                    if n.type == 'TEX_IMAGE' and n.image), None)
        wants_clip = bool(img and any(k in img.image.name for k in alpha_clip_images))

        alpha_in = bsdf.inputs['Alpha']
        for link in list(alpha_in.links):
            m.node_tree.links.remove(link)

        if wants_clip and img:
            m.node_tree.links.new(img.outputs['Alpha'], alpha_in)
            clipped += 1
        else:
            alpha_in.default_value = 1.0

        # The enum moved: 4.2 replaced blend_method with surface_render_method
        # and RNA under-reports which exists, so try both rather than branch on
        # a version number.
        for attr, value in (('blend_method', 'CLIP' if wants_clip else 'OPAQUE'),
                            ('surface_render_method', 'DITHERED')):
            try:
                setattr(m, attr, value)
            except (AttributeError, TypeError):
                pass
        if hasattr(m, 'alpha_threshold'):
            m.alpha_threshold = 0.5
        # CULL BACKFACES, which every one of the 19,999 triangles was skipping:
        # the body, head and trousers were each rasterising their own inside
        # for nothing, and a two-sided skinned mesh shadow-acnes against itself
        # under the torch.
        #
        # TWO THINGS KEEP BOTH SIDES, for different reasons.
        #
        # The hair is alpha-masked CARDS rather than a solid, so culling makes
        # every strand disappear when seen from behind.
        #
        # The coat is worn OPEN and that is the whole design -- the viewer
        # genuinely looks at the inside of both front panels -- so its back
        # faces are not waste, they are the garment. It is also where this
        # first went wrong: culling everything put two grey patches on the
        # chest, because MMD had modelled the coat as a sheet plus a flipped
        # duplicate to fake two-sidedness and weld_source collapsed each pair,
        # leaving some of it wound inward. Welding it and drawing it two-sided
        # costs 432 fewer triangles than the duplicate-sheet trick did.
        two_sided = wants_clip or any(s in COAT_SOURCES
                                      for s in m.get('mmd_sources', []))
        m.use_backface_culling = not two_sided
    return clipped


def set_alpha_mask(path, match=ALPHA_CLIPPED, cutoff=0.5):
    """
    Rewrite the exported GLB so the hair uses alphaMode MASK, not BLEND.

    WHY THIS IS A POST-PASS AND NOT A BLENDER SETTING. The exporter picks MASK
    off the material's blend_method = 'CLIP', and 4.2 removed blend_method in
    favour of surface_render_method -- which has no CLIP. Setting it inside a
    try/except therefore does nothing at all and reports success, which is
    exactly what happened: thirteen materials came out OPAQUE as intended and
    the hair silently stayed BLEND.

    MASK matters here because BLEND means no depth write, and seven thousand
    triangles of hair card blended against each other in object sort order is
    the difference between hair and a smear. A cutout threshold writes depth
    like any opaque surface and sorts itself for free.

    Editing the container is safe and dull: a GLB is a 12-byte header then
    length-prefixed chunks, and only the JSON chunk changes. It is padded back
    to a 4-byte boundary with spaces, which the spec requires, and the two
    length fields are rewritten.
    """
    import json
    import struct

    with open(path, 'rb') as f:
        blob = f.read()
    magic, version, _total = struct.unpack('<III', blob[:12])
    assert magic == 0x46546C67, 'not a GLB'
    jlen, jtype = struct.unpack('<II', blob[12:20])
    assert jtype == 0x4E4F534A, 'first chunk is not JSON'
    doc = json.loads(blob[20:20 + jlen].decode('utf-8'))
    rest = blob[20 + jlen:]

    hit = 0
    for mat in doc.get('materials', []):
        if any(k in mat.get('name', '') for k in match):
            mat['alphaMode'] = 'MASK'
            mat['alphaCutoff'] = cutoff
            hit += 1

    data = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    data += b' ' * ((4 - len(data) % 4) % 4)          # spec: pad JSON with spaces
    out = struct.pack('<III', magic, version, 12 + 8 + len(data) + len(rest))
    out += struct.pack('<II', len(data), jtype) + data + rest
    with open(path, 'wb') as f:
        f.write(out)
    return hit


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=SRC)

    obj = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    rig = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    obj.name, obj.data.name, rig.name = 'okabe_mesh', 'okabe_mesh', 'okabe_rig'

    before, after = merge_materials(obj)
    # AFTER the merge, never before. merge_materials' signature reads the image
    # node and the Base Color default_value, and both are still the MMD values
    # at this point -- it is only correct because the ramps are 0x0 and its
    # size[0] > 0 guard skips them. Relinking first would rewrite the very
    # values it keys on.
    relinked, tinted, dropped = relink_base_colour(obj)
    # BEFORE the shape key, which is built from the vertices this leaves.
    welded_from, welded_to, loose = weld_source(obj)
    # Monster key FIRST, then strip -- the key is built from the Basis, and
    # removing the others afterwards leaves its deltas untouched. Both exports
    # share this, because both are the same body: the clean file is not a
    # different character, it is the same mesh with the same dial on it.
    stats = build_monster_key(obj, rig)
    face_keys = strip_face_keys(obj)

    def pack_all():
        # Pack the images so the GLB is self-contained. The source textures are
        # BMP and TGA, neither of which a browser will load -- the glTF
        # exporter re-encodes whatever is packed, so this is also the format
        # conversion.
        for im in bpy.data.images:
            if im.size[0] > 0:
                im.pack()

    # --- the clean export, which is the PLAYER ------------------------------
    # TWO FILES, AND THE REASON IS THE TEXTURES. The monster is a shape KEY on
    # this mesh, so one file can hold both readings of its geometry -- that is
    # the whole twist and nothing here weakens it. But befoul() paints the
    # IMAGES, and a material has one base colour texture whichever way the dial
    # is turned. Shipping only the befouled file made the man you play as walk
    # around in a torn, blood-soaked coat with his eyes blacked out, which is
    # not a subtle wrongness: it is the ending shown to you in the first room.
    #
    # So the clean file goes out BEFORE befoul() is allowed near the images.
    # Same mesh, same skeleton, same morph, same UVs -- only the paint differs.
    force_opaque(obj)
    pack_all()
    export_rigged_glb(os.path.abspath(OUT_CLEAN), [rig, obj])
    set_alpha_mask(os.path.abspath(OUT_CLEAN), match=('okarin02',))
    kb_clean = os.path.getsize(os.path.abspath(OUT_CLEAN)) / 1024.0

    # --- and then the monster ----------------------------------------------
    # force_opaque runs AGAIN afterwards, because befoul swaps the image
    # datablocks out from under the alpha links it made the first time and the
    # tears need clipping that the clean pass had no reason to set up.
    filth = befoul(obj, rig)
    clipped = force_opaque(obj, alpha_clip_images=ALPHA_CLIPPED)
    pack_all()

    export_rigged_glb(os.path.abspath(OUT), [rig, obj])

    masked = set_alpha_mask(os.path.abspath(OUT))

    kb = os.path.getsize(os.path.abspath(OUT)) / 1024.0
    print('OKABE CLEAN (player) %.0f KB -> %s' % (kb_clean, os.path.basename(OUT_CLEAN)))
    print('OKABE materials %d -> %d (%d masked) | textures %d relinked '
          '(%d tinted, %d dead maps dropped) | welded %d -> %d verts '
          '(%d loose dropped) | dropped %d face keys | morph moved %d/%d verts '
          '| human %.3f m -> monster %.3f m | %.0f KB'
          % (before, after, masked, relinked, tinted, dropped,
             welded_from, welded_to, loose, face_keys,
             stats['moved'], stats['verts'],
             stats['human_h'], stats['monster_h'], kb))
    for stem in sorted(filth):
        print('   befouled %-10s %s' % (stem, filth[stem]))


# Guarded so a check or a diagnostic can import this module for its tables and
# helpers without running the whole pipeline as a side effect of the import.
if __name__ == '__main__':
    main()
