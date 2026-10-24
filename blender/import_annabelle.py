"""
Import Annabelle -- the girl hiding in the study's corner.

    D:\\Blender\\blender.exe --background --python blender/import_annabelle.py

Writes src/assets/models/annabelle.glb: the rigged, textured figure at rest
(an A-pose), with no animation clips.

THE SOURCE. "Casual NPC Woman | Free Low-Poly 3D Model" by Stan
(Stas_SayHallo) on Sketchfab, CC BY 4.0: a 6.5k-triangle flat-colour figure
on a stock Mixamo skeleton (65 `mixamorig:` bones). She was picked over a
57k-triangle Character Creator model because that one looked a console
generation newer than everything round her; this one sits with Okabe and the
props. The FBX and its one palette texture are in blender/source/annabelle/.
Wherever she ends up in the game, the credits must name the source as above.

WHAT THIS SCRIPT OWNS is everything done to her, so the .glb stays a build
artefact rather than a thing someone edited by hand once:

  * The shoulder bag comes off. It is its own mesh, and a girl who has been
    hiding in a locked house for months has not kept her handbag on.
  * She is made 12-16 rather than twenty-something: 1.55 m instead of 1.81,
    the head a little larger (a teenager's head is a bigger share of her
    height), the adult chest eased back towards the line of the torso, the
    hips drawn in and the lipstick taken off.
  * She has been chased through the woods: brown hair, a faded flannel
    shirt, worn jeans, mud, rips, scratches and a tired face, painted onto a
    fresh unwrap by annabelle_wear.py (which also joins the three meshes into
    one).

The skeleton is Mixamo's, names and all, so any Mixamo clip plays on her.
"""
import bpy, sys, os, math   # noqa: E401
from mathutils import Matrix   # noqa: E402

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import export_rigged_glb   # noqa: E402
from annabelle_wear import wear   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source', 'annabelle', 'CasualNPCWoman.fbx')
TEX = os.path.join(HERE, 'source', 'annabelle', 'textures', '6_Characters_Texture.jpeg')
OUT = os.path.join(HERE, '..', 'src', 'assets', 'models', 'annabelle.glb')

# The source mesh names. The bag is the only part not worn on the body.
BAG = 'Cube.012'
HAIR = 'femaleBasemesh01.007'

# Standing height after the import. The source is 1.81 m.
HEIGHT = 1.55
# How much bigger the head gets, about the base of the skull.
HEAD_SCALE = 1.08
# How much of the chest's lead over the torso line is kept (1 = all of it).
CHEST_KEEP = 0.4
# How much narrower the hips get at their widest, a share of their width.
HIP_NARROW = 0.08
# The palette is a generic 16x16 swatch grid, so a feature's colour is just
# which cell its UVs sit in. The lips sit on a salmon lipstick cell; the one
# above it is the soft pink the body's own shading uses.
LIPS_CELL, LIPS_TO = (0.875, 0.75), (0.875, 0.8125)


def strip_bag():
    bag = bpy.data.objects[BAG]
    bpy.data.objects.remove(bag, do_unlink=True)


def bake_object_transforms(meshes):
    """
    The FBX parents every mesh to the rig through a 10-degree turn about Z
    (and a parent inverse to match), which the Armature modifier quietly
    undoes. Everything below edits vertices by where they are on the BODY, in
    the rig's own space, so put the turn into the vertices and leave each
    mesh object sitting exactly on the rig. Nothing moves in the world.
    """
    for obj in meshes:
        obj.data.transform(obj.matrix_local)
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = Matrix.Identity(4)


def relink_texture(meshes):
    """
    The FBX names "C:\\3D\\6 characters\\textures\\Hero Texture.png", which is
    the author's disk, so every image node loads as 0x0 and would export flat
    white. The archive ships the same palette as a jpeg; point at that.
    """
    img = bpy.data.images.load(TEX)
    img.pack()
    seen = set()
    for obj in meshes:
        for mat in obj.data.materials:
            if mat is None or mat in seen or mat.node_tree is None:
                continue
            seen.add(mat)
            nt = mat.node_tree
            bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
            tex = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None) or nt.nodes.new('ShaderNodeTexImage')
            tex.image = img
            nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
            # Painted cloth and skin have no business being glossy, and the
            # study's warm point lights put a sheen on anything below ~0.8.
            bsdf.inputs['Metallic'].default_value = 0.0
            bsdf.inputs['Roughness'].default_value = 0.9
            for link in list(bsdf.inputs['Normal'].links):
                nt.links.remove(link)
    return img


def ease_chest(meshes):
    """
    Pull the front of the chest back towards the line from the front of the
    waist to the front of the collarbones, keeping CHEST_KEEP of its lead.
    Low-poly, the bust is one forward mass rather than two, so a single line
    down the front of the torso is the honest reference. Faded in and out at
    the band's edges so nothing creases where it stops.
    """
    body = max((o for o in meshes if o.name != HAIR), key=lambda o: len(o.data.vertices))

    def front_at(z):
        ys = [v.co.y for v in body.data.vertices if abs(v.co.x) < 0.03 and abs(v.co.z - z) < 0.025]
        return min(ys)

    z0, z1 = 1.10, 1.43
    y0, y1 = front_at(z0), front_at(z1)
    moved = 0
    for obj in meshes:
        if obj.name == HAIR:
            continue
        for v in obj.data.vertices:
            x, y, z = v.co
            if not (z0 < z < z1) or abs(x) > 0.17:
                continue
            t = (z - z0) / (z1 - z0)
            line = y0 + (y1 - y0) * t
            if y >= line:
                continue
            fade = math.sin(math.pi * t) ** 0.5 * min(1.0, (0.17 - abs(x)) / 0.05)
            v.co.y = line + (y - line) * (1 - (1 - CHEST_KEEP) * fade)
            moved += 1
    return moved


def ease_hips(meshes):
    """
    Take the hourglass out: draw the hips in towards the centre line, most at
    their widest and nothing at the waist or mid-thigh. Vertices that belong
    mostly to an arm are left alone -- in the A-pose rest the hands hang right
    beside the hips, at the same height.
    """
    z0, z1, peak = 0.70, 1.10, 0.92
    moved = 0
    for obj in meshes:
        if obj.name == HAIR:
            continue
        arm_groups = {g.index for g in obj.vertex_groups if 'Arm' in g.name or 'Hand' in g.name}
        for v in obj.data.vertices:
            if not (z0 < v.co.z < z1):
                continue
            if sum(g.weight for g in v.groups if g.group in arm_groups) > 0.3:
                continue
            t = (v.co.z - z0) / (peak - z0) if v.co.z < peak else (z1 - v.co.z) / (z1 - peak)
            v.co.x *= 1 - HIP_NARROW * math.sin(math.pi / 2 * t) ** 2
            moved += 1
    return moved


def soften_lips(meshes):
    moved = 0
    du, dv = LIPS_TO[0] - LIPS_CELL[0], LIPS_TO[1] - LIPS_CELL[1]
    for obj in meshes:
        uv = obj.data.uv_layers.active.data
        for p in obj.data.polygons:
            u = sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total
            v = sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total
            if abs(u - LIPS_CELL[0]) < 1 / 32 and abs(v - LIPS_CELL[1]) < 1 / 32:
                for i in p.loop_indices:
                    uv[i].uv.x += du
                    uv[i].uv.y += dv
                moved += 1
    return moved


def enlarge_head(rig, meshes):
    """
    Scale the head about the base of the skull, each vertex by how much it
    belongs to the Head bone, so the neck blends rather than steps. The mesh
    moves and the bone does not: the vertices stay weighted to the same joint,
    which still turns about the same point.
    """
    pivot = rig.data.bones['mixamorig:Head'].head_local
    for obj in meshes:
        group = obj.vertex_groups.get('mixamorig:Head')
        if group is None:
            continue
        for v in obj.data.vertices:
            w = next((g.weight for g in v.groups if g.group == group.index), 0.0)
            if w > 0:
                v.co = pivot + (v.co - pivot) * (1 + (HEAD_SCALE - 1) * w)


def rescale(rig, meshes):
    factor = HEIGHT / max(v.co.z for v in max(meshes, key=lambda o: len(o.data.vertices)).data.vertices)
    rig.scale = (factor,) * 3
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [rig] + meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return factor


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=SRC)

    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    rig.name = 'annabelle_rig'
    strip_bag()
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    bake_object_transforms(meshes)
    palette = relink_texture(meshes)

    # The source arrives posed in its own standing action, and ships two more.
    # The edits below are made to the rest mesh and she leaves with none of
    # them, so drop them all and take the rig to rest.
    rig.animation_data.action = None
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    eased = ease_chest(meshes)
    narrowed = ease_hips(meshes)
    lips = soften_lips(meshes)
    enlarge_head(rig, meshes)
    factor = rescale(rig, meshes)
    # The three meshes become one, on a fresh unwrap, painted: see
    # annabelle_wear.py.
    body, texture = wear(rig, meshes, palette)

    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    export_rigged_glb(os.path.abspath(OUT), [rig, body])
    print('ANNABELLE %d tris | chest eased on %d verts, hips on %d, lips %d faces '
          '| scaled x%.3f to %.2f m | texture %.0f KB | %.0f KB'
          % (tris, eased, narrowed, lips, factor, HEIGHT,
             os.path.getsize(texture) / 1024.0,
             os.path.getsize(os.path.abspath(OUT)) / 1024.0))


if __name__ == '__main__':
    main()
