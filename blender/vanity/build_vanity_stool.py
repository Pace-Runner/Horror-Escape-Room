"""Build the standalone, textured Level 1 vanity stool in the connected Blender."""
import bpy
import math
from mathutils import Vector

ROOT = r'C:\Users\Daniel\Desktop\Horror-Escape-Room'
TEXTURES = ROOT + r'\src\assets\textures\vanity'
BLEND_PATH = ROOT + r'\blender\vanity\vanity_stool.blend'
GLB_PATH = ROOT + r'\src\assets\models\vanity\vanity_stool.glb'

# A new scene is used instead of clearing or saving over the user's open scene.
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('VanityStool_Standalone')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

def material(name, filename, roughness, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    image = nodes.new('ShaderNodeTexImage')
    image.image = bpy.data.images.load(TEXTURES + '\\' + filename, check_existing=True)
    image.image.pack()
    mat.node_tree.links.new(image.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return mat

wood = material('Stool_AgedDarkWood_UV', 'wood_texture_stool.png', 0.83)
metal = material('Stool_TarnishedGilding_UV', 'rust_texture_stool.png', 0.68, 0.62)
fabric = material('Stool_BurgundyTapestry_UV', 'cushion_texture_stool.png', 0.97)

def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj

def smart_uv(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=0.025)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)

def block(name, center, size, mat, bevel=0.003):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Soft worn edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    finish(obj, name, mat)
    smart_uv(obj)
    return obj

def lathe(name, x, y, profile, mat, sides=16, flutes=0):
    verts, faces = [], []
    for ring, (z, radius) in enumerate(profile):
        for side in range(sides):
            a = 2 * math.pi * side / sides
            r = radius * (1 + (0.035 * math.cos(a * flutes) if flutes else 0))
            verts.append((x + r * math.cos(a), y + r * math.sin(a), z))
    for ring in range(len(profile) - 1):
        for side in range(sides):
            a = ring * sides + side
            b = ring * sides + (side + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(reversed(range(sides))), tuple((len(profile)-1)*sides+i for i in range(sides))])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    finish(obj, name, mat)
    uv = mesh.uv_layers.new(name='CylindricalUV')
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            vi = mesh.loops[loop_index].vertex_index
            ring, side = divmod(vi, sides)
            uv.data[loop_index].uv = (side / sides, profile[ring][0] / 0.49)
    return obj

def curve_trim(name, points, mat, thickness=0.003, resolution=0):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = 2
    data.bevel_depth = thickness
    data.bevel_resolution = resolution
    spline = data.splines.new('POLY')
    spline.points.add(len(points)-1)
    for p, xyz in zip(spline.points, points):
        p.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj

# Turned and subtly fluted legs with a tapered lower section and rounded collars.
leg_profile = [
    (0, .011), (.025, .012), (.038, .018), (.049, .020),
    (.058, .014), (.073, .015), (.085, .021), (.097, .021),
    (.108, .017), (.125, .019), (.145, .024), (.17, .027),
    (.245, .034), (.285, .038), (.296, .033), (.309, .030),
    (.318, .035), (.334, .036), (.347, .032), (.37, .032)
]
for label, x, y in [('FL', -.254, -.204), ('FR', .254, -.204),
                    ('BL', -.254, .204), ('BR', .254, .204)]:
    lathe('StoolLeg_' + label, x, y, leg_profile, wood, sides=16, flutes=8)
    for z, r in [(0.047, .020), (.093, .022), (.310, .034), (.340, .035)]:
        lathe('StoolLeg_GildedCollar_' + label, x, y,
              [(z-.003, r-.002), (z, r), (z+.003, r-.002)], metal, sides=16)

# Square upholstered platform, stout corner blocks, and four scalloped aprons.
block('Stool_SeatPlatform', (0, 0, .376), (.55, .45, .025), wood, .004)
for label, x, y in [('FL', -.254, -.204), ('FR', .254, -.204),
                    ('BL', -.254, .204), ('BR', .254, .204)]:
    block('Stool_CarvedCorner_' + label, (x, y, .358), (.070, .070, .079), wood, .004)
for label, y in [('Front', -.205), ('Back', .205)]:
    block('Stool_Apron_' + label, (0, y, .352), (.447, .029, .072), wood, .004)
    points = []
    for i in range(25):
        x = -.222 + .444 * i / 24
        z = .324 - .013 * (1 - abs(x/.222)) + .007 * math.cos(4*math.pi*x/.444)
        points.append((x, y + (-.018 if y < 0 else .018), z))
    curve_trim('Stool_ApronScallop_' + label, points, metal, .0024)
for label, x in [('Left', -.254), ('Right', .254)]:
    block('Stool_Apron_' + label, (x, 0, .352), (.029, .350, .072), wood, .004)
    points = []
    for i in range(21):
        y = -.175 + .35 * i / 20
        z = .324 - .012 * (1 - abs(y/.175)) + .006*math.cos(4*math.pi*y/.35)
        points.append((x + (-.018 if x < 0 else .018), y, z))
    curve_trim('Stool_ApronScallop_' + label, points, metal, .0024)

# A modest raised scroll and floral rosette on the front apron, using curves
# rather than a dense sculpt. The coppery rust atlas is confined to these
# decorative highlights and the metal collars.
for sign in (-1, 1):
    points = []
    for i in range(17):
        t = i / 16
        x = sign * (.013 + .105*t)
        z = .354 + .011*math.sin(t*math.pi*1.5)
        points.append((x, -.223, z))
    curve_trim('Stool_FrontScroll_' + str(sign), points, metal, .0027)
for petal in range(6):
    a = petal * math.tau / 6
    x, z = .011*math.cos(a), .358 + .011*math.sin(a)
    lathe('Stool_FloralBoss_%02d' % petal, x, -.225,
          [(z-.003, .004), (z, .006), (z+.003, .003)], metal, sides=8)

# The cushion has a continuous sculpted top. Six actual depressions shape the
# diamond-tufted silhouette; seams and covered buttons reinforce them.
nx, ny = 32, 28
verts, faces, uvs = [], [], []
button_xy = [(x, y) for y in (-.075, .075) for x in (-.17, 0, .17)]
def cushion_height(x, y):
    dimple = sum(.039*math.exp(-(((x-bx)/.043)**2 + ((y-by)/.043)**2)) for bx, by in button_xy)
    crown = .012 * (1 - (x/.30)**2) * (1 - (y/.25)**2)
    return .478 + crown - dimple
for j in range(ny+1):
    y = -.232 + .464*j/ny
    for i in range(nx+1):
        x = -.282 + .564*i/nx
        verts.append((x, y, cushion_height(x, y)))
for j in range(ny):
    for i in range(nx):
        a = j*(nx+1)+i
        faces.append((a, a+1, a+nx+2, a+nx+1))
mesh = bpy.data.meshes.new('Stool_TuftedCushion_Mesh')
mesh.from_pydata(verts, [], faces)
mesh.update()
obj = bpy.data.objects.new('Stool_TuftedCushion', mesh)
scene.collection.objects.link(obj)
finish(obj, obj.name, fabric)
uv = mesh.uv_layers.new(name='PlanarUpholsteryUV')
for poly in mesh.polygons:
    for li in poly.loop_indices:
        x, y, _ = mesh.vertices[mesh.loops[li].vertex_index].co
        uv.data[li].uv = ((x+.282)/.564, (y+.232)/.464)

# Thick upholstered skirt and a rolled edge hide the rigid base cleanly.
for label, center, size in [
    ('Front', (0,-.236,.425), (.558,.028,.071)),
    ('Back', (0,.236,.425), (.558,.028,.071)),
    ('Left', (-.286,0,.425), (.028,.448,.071)),
    ('Right', (.286,0,.425), (.028,.448,.071))]:
    side = block('Stool_CushionSide_' + label, center, size, fabric, .014)
    # Keep the fabric's motif at the same physical scale as the top. A full
    # 0..1 UV over a 7 cm skirt would squeeze the flowers into vertical bars.
    side_uv = side.data.uv_layers.active
    for polygon in side.data.polygons:
        for loop_index in polygon.loop_indices:
            x, y, z = side.data.vertices[side.data.loops[loop_index].vertex_index].co
            horizontal = x + center[0] if label in ('Front', 'Back') else y + center[1]
            side_uv.data[loop_index].uv = (horizontal / .60 + .5, (z + center[2] - .40) / .60 + .45)
for label, points in [
    ('Front', [(-.282+i*.564/20,-.244,.461) for i in range(21)]),
    ('Back', [(-.282+i*.564/20,.244,.461) for i in range(21)]),
    ('Left', [(-.294,-.232+i*.464/20,.461) for i in range(21)]),
    ('Right',[(.294,-.232+i*.464/20,.461) for i in range(21)])]:
    curve_trim('Stool_UpholsteryPiping_' + label, points, fabric, .0042)

# Sewn channels converge into each of the six recessed, fabric-covered buttons.
for row, y in enumerate((-.075, .075)):
    for col, x in enumerate((-.17, 0, .17)):
        z = cushion_height(x, y) + .003
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=1,
                                             location=(x,y,z))
        button = bpy.context.object
        button.scale = (.009,.009,.004)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        finish(button, 'Stool_FabricButton_%d_%d' % (row+1,col+1), fabric)
        smart_uv(button)
        for dx, dy in ((-.060,-.066), (.060,-.066), (-.060,.066), (.060,.066)):
            # Adjacent buttons share a stitched channel; avoid duplicate runs.
            if (dx < 0 and col > 0) or (dy < 0 and row > 0):
                continue
            points = []
            for i in range(8):
                t = i/7
                px, py = x+dx*t, y+dy*t
                points.append((px,py,cushion_height(px,py)+.0015))
            curve_trim('Stool_TuftSeam_%d_%d_%d_%d' % (row,col,int(dx>0),int(dy>0)),
                       points, fabric, .0018, 1)

# Export only the new scene, not the pre-existing live vanity scene.
deps = {scene}
bpy.data.libraries.write(BLEND_PATH, deps, fake_user=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format='GLB',
                          use_active_scene=True, export_apply=True,
                          export_yup=True)

objects = [o for o in scene.objects if o.type == 'MESH']
triangles = sum(sum(max(0,len(p.vertices)-2) for p in o.data.polygons) for o in objects)
print('SCENE', scene.name, 'PREVIOUS_SCENE_UNMODIFIED', previous_scene.name)
print('OBJECTS', len(scene.objects), 'MESHES', len(objects), 'TRIANGLES', triangles)
print('NAMES', ', '.join(o.name for o in scene.objects))
print('BLEND', BLEND_PATH)
print('GLB', GLB_PATH)
