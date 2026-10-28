"""
The shared kit for the study hide-and-seek's models (blender/study/build_*.py).

Every model here replaces a placeholder box in src/levels/studyHideProps.js or
src/levels/studyBlackout.js, and the placeholder's SIZE IS THE CONTRACT: the
colliders, cover heights and hide-spot volumes stay exactly as they are (so
`npm run check:seeker` and the mirror-route check keep meaning what they
mean), and each model is built to fit them. See docs/LEVEL3_HIDE_AND_SEEK.md.

CONVENTIONS, so the models sit with Daniel's (blender/study/*.blend):
  * Metres; the origin on the floor at the footprint's centre; the FRONT
    faces +Y in Blender, which the glTF exporter turns into -Z, the way the
    game wants it -- no rotation in code.
  * Material names drive the in-game look -- studySurfaces.harmoniseAsset():
    a name containing "walnut" is re-surfaced with the room's own shared wood
    (UVs re-projected), so it is exported with NO image and costs nothing to
    download; "brass", "oxblood", "painted steel" and "cream" are tuned.
  * Textures are GENERATED here, from a fixed seed, never painted by hand
    (blender/befoul.py says why): numpy into bpy.data.images, 512 px.
  * No normal maps: a new map type is a new shader variant (CLAUDE.md).
  * At least 5 mm between parallel visible faces: no z-fighting.

Run a build script in a live Blender session (the MCP execute tool):
    exec(open(r'<repo>/blender/study/build_wardrobe.py').read(),
         {'__file__': r'<repo>/blender/study/build_wardrobe.py', '__name__': '__main__'})
or headless:
    blender --background --python blender/study/build_wardrobe.py
Each writes blender/study/<name>.blend (a copy; the session's own file is left
alone) and src/assets/models/study/<name>.glb. Run `npm run compress:assets`
afterwards: it re-encodes the embedded textures as WebP.
"""

import bpy
import bmesh
import math
import os
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
GLB_DIR = os.path.join(REPO, 'src', 'assets', 'models', 'study')


# ------------------------------------------------------------------ the scene

def clear_scene():
    """Everything out: objects, then whatever they left with no users."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.curves):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


# ------------------------------------------------------------------ materials

def principled(mat):
    """The material's Principled BSDF, looked up by TYPE: node names are localised."""
    return next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def material(name, color, roughness=0.7, metallic=0.0, image=None, roughness_image=None, double_sided=False):
    """
    A plain Principled material. `image` (and `roughness_image`) are images
    from painted_image(); without them the colour and roughness are constants,
    which is all a "walnut" material needs -- the game replaces its surface.
    """
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = principled(mat)
    for node in [n for n in nodes if n.type == 'TEX_IMAGE']:
        nodes.remove(node)
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if image is not None:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = image
        tex.location = (-420, 260)
        links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if roughness_image is not None:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = roughness_image
        roughness_image.colorspace_settings.name = 'Non-Color'
        tex.location = (-420, -40)
        links.new(tex.outputs['Color'], bsdf.inputs['Roughness'])
    # The glTF exporter writes doubleSided from this.
    mat.use_backface_culling = not double_sided
    return mat


def painted_image(name, rgba):
    """
    An image from a float array, rows from the TOP down (as you would draw it),
    shape (height, width, 3 or 4), values 0..1. Packed into the .blend, so the
    file carries it and the GLB export embeds it.
    """
    rgba = np.asarray(rgba, dtype=np.float32)
    h, w = rgba.shape[:2]
    if rgba.shape[2] == 3:
        rgba = np.concatenate([rgba, np.ones((h, w, 1), np.float32)], axis=2)
    old = bpy.data.images.get(name)
    if old is not None:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    # Blender's pixel rows run from the BOTTOM up.
    img.pixels.foreach_set(np.clip(rgba[::-1], 0, 1).ravel())
    img.pack()
    return img


def value_noise(rng, h, w, cells):
    """Smooth noise, 0..1: a coarse random grid, bilinearly upsampled. Tiles cleanly."""
    grid = rng.random((cells + 1, cells + 1))
    grid[-1, :] = grid[0, :]
    grid[:, -1] = grid[:, 0]
    ys = np.linspace(0, cells, h, endpoint=False)
    xs = np.linspace(0, cells, w, endpoint=False)
    y0, x0 = ys.astype(int), xs.astype(int)
    fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a = grid[y0][:, x0]
    b = grid[y0][:, x0 + 1]
    c = grid[y0 + 1][:, x0]
    d = grid[y0 + 1][:, x0 + 1]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy


def fbm(rng, h, w, octaves=4, base=4):
    out = np.zeros((h, w))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        out += value_noise(rng, h, w, base * 2 ** o) * amp
        total += amp
        amp *= 0.5
    return out / total


# ------------------------------------------------------------------ geometry

def box_into(bm, lo, hi, mat_index=0):
    """An axis-aligned box from corner `lo` to corner `hi`, into an existing bmesh."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [bm.verts.new(p) for p in (
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
    faces = [bm.faces.new([v[i] for i in quad]) for quad in (
        (0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7))]
    for f in faces:
        f.material_index = mat_index
    return faces


def box_uvs(bm, density=2.0):
    """Per-face planar projection (blender/common.py's box_project_uvs): every mesh needs a UV map."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                u, v = co.x, co.y
            elif ay >= ax and ay >= az:
                u, v = co.x, co.z
            else:
                u, v = co.y, co.z
            loop[uv].uv = (u * density, v * density)


def mesh_object(name, bm, materials, uvs=True, smooth=False):
    """
    A new object from a bmesh, its faces' material_index into `materials`.
    `smooth` None keeps each face's own shading (an imported model's).
    """
    bm.normal_update()
    if uvs:
        box_uvs(bm)
    mesh = bpy.data.meshes.new(name + '_mesh')
    bm.to_mesh(mesh)
    bm.free()
    for mat in materials:
        mesh.materials.append(mat)
    if smooth is not None:
        for poly in mesh.polygons:
            poly.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def bevel(obj, width=0.003, segments=1, angle_deg=35):
    """A small bevel that catches the light on edges, as Daniel's furniture has."""
    mod = obj.modifiers.new('Bevel', type='BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle_deg)
    mod.harden_normals = False
    return mod


def set_origin(obj, point):
    """Moves the object's origin to `point` (object space) without moving the mesh."""
    offset = Vector(point)
    obj.data.transform(Matrix.Translation(-offset))
    obj.location = obj.location + offset


def parent_keep(child, parent):
    """Parents `child` to `parent`, keeping where the child is in the world."""
    # matrix_world is only recomputed on an update: after set_origin() moved
    # the location it still holds the OLD placement, and the child would be
    # parented onto the parent's origin instead.
    bpy.context.view_layer.update()
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world


def triangles(obj):
    """Triangles after modifiers: what the exporter will write."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    count = len(mesh.loop_triangles)
    evaluated.to_mesh_clear()
    return count


def report(objects):
    total = 0
    for obj in objects:
        if obj.type != 'MESH':
            continue
        n = triangles(obj)
        total += n
        print(f'  {obj.name}: {n} tris')
    print(f'  TOTAL: {total} tris')
    return total


# ------------------------------------------------------------------ library models

def append_objects(path, names):
    """Objects from a source .blend (blender/source/...), linked into the scene."""
    with bpy.data.libraries.load(path, link=False) as (source, into):
        into.objects = [name for name in source.objects if name in names]
    for obj in into.objects:
        bpy.context.scene.collection.objects.link(obj)
    return list(into.objects)


def joined_bmesh(objects):
    """One bmesh from several objects, each with its own transform applied."""
    bm = bmesh.new()
    for obj in objects:
        mesh = obj.data.copy()
        mesh.transform(obj.matrix_world)
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    return bm


def image_in(material, part):
    """The material's image whose name contains `part` ('diff', 'rough'), or None."""
    for node in material.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image and part in node.image.name.lower():
            return node.image
    return None


def downscaled(image, size, name):
    """A packed copy of `image` at size x size: the game's maps are 512 px or less."""
    copy = image.copy()
    copy.name = name
    copy.scale(size, size)
    copy.pack()
    return copy


def floor_and_centre(bm):
    """Moves the mesh so it stands on z = 0 with its footprint centred on the origin."""
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    bmesh.ops.translate(bm, vec=(-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs)), verts=bm.verts)


# ------------------------------------------------------------------ out

def save_and_export(name, objects):
    """
    Writes blender/study/<name>.blend (a COPY: the live session keeps its own
    file) and src/assets/models/study/<name>.glb with only `objects` in it.
    """
    for img in bpy.data.images:
        if img.has_data and not img.packed_file and img.source == 'GENERATED':
            img.pack()
    blend_path = os.path.join(HERE, f'{name}.blend')
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, copy=True)
    for obj in bpy.data.objects:
        obj.select_set(False)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    glb_path = os.path.join(GLB_DIR, f'{name}.glb')
    os.makedirs(GLB_DIR, exist_ok=True)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    options = dict(filepath=glb_path, export_format='GLB', use_selection=True, export_apply=True,
                   export_yup=True, export_image_format='AUTO', export_animations=False,
                   export_cameras=False, export_lights=False, export_extras=False)
    bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k == 'filepath' or k in props})
    print(f'Saved {blend_path}')
    print(f'Exported {glb_path} ({os.path.getsize(glb_path) // 1024} KB)')
    return glb_path
