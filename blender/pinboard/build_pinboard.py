"""Create the Level 1 pinboard visual in the connected Blender scene."""
import bpy
import math

ROOT = r'C:\Users\Daniel\Desktop\Horror-Escape-Room'
TEX = ROOT + r'\src\assets\textures\pinboard'
BLEND = ROOT + r'\blender\pinboard\pinboard.blend'
GLB = ROOT + r'\src\assets\models\pinboard.glb'

# The user opened a fresh default Blender file. Keep only this new asset in it.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.name = 'Level1Pinboard_VisualOnly'
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

def textured_material(name, filename, roughness, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    image_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    image_node.image = bpy.data.images.load(TEX + '\\' + filename, check_existing=True)
    image_node.image.pack()
    mat.node_tree.links.new(image_node.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat

wood = textured_material('Pinboard_DarkDistressedWood', 'dark_antique_wood_grain_texture.png', .88)
cork = textured_material('Pinboard_StainedPittedCork', 'aged_weathered_corkboard_texture.png', 1.0)
brass = textured_material('Pinboard_TarnishedBrass', 'weathered_brass_patina_texture.png', .72, .6)

def panel(name, dimensions, location, material, mapping='horizontal', bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new('Worn beveled edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    obj.data.materials.append(material)
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='MeasuredUV')
    for face in obj.data.polygons:
        for loop in face.loop_indices:
            vertex = obj.data.vertices[obj.data.loops[loop].vertex_index].co
            x, z = vertex.x + location[0], vertex.z + location[2]
            # Wood grain runs along each rail; the cork uses one continuous
            # planar image rather than restarting at individual faces.
            if mapping == 'vertical':
                uv.data[loop].uv = ((z + .42) / .84, (x + .4) / .8)
            else:
                uv.data[loop].uv = ((x + .4) / .8, (z + .42) / .84)
    return obj

# X is board width, Z is height, and negative Blender Y faces into the room
# once exported to Three.js. Origin is at the center for the existing hinge.
panel('Pinboard_Backboard', (.80,.018,.84), (0,.012,0), wood, bevel=.002)
panel('Pinboard_AgedCork', (.695,.016,.735), (0,-.013,0), cork, bevel=.002)
for name, size, location, mapping in [
    ('Pinboard_FrameTop', (.80,.048,.055), (0,-.006,.3925), 'horizontal'),
    ('Pinboard_FrameBottom', (.80,.048,.055), (0,-.006,-.3925), 'horizontal'),
    ('Pinboard_FrameLeft', (.056,.048,.73), (-.372,-.006,0), 'vertical'),
    ('Pinboard_FrameRight', (.056,.048,.73), (.372,-.006,0), 'vertical'),
]:
    panel(name, size, location, wood, mapping, bevel=.006)

# A fine inset bead supplies the aged decorative relief without covering the
# photographs. These are the four small tarnished-brass trims.
for name, size, location, mapping in [
    ('Pinboard_InsetTop', (.69,.004,.004), (0,-.026,.365), 'horizontal'),
    ('Pinboard_InsetBottom', (.69,.004,.004), (0,-.026,-.365), 'horizontal'),
    ('Pinboard_InsetLeft', (.004,.004,.73), (-.347,-.026,0), 'vertical'),
    ('Pinboard_InsetRight', (.004,.004,.73), (.347,-.026,0), 'vertical'),
]:
    panel(name, size, location, brass, mapping, bevel=.001)

# Pin positions exactly match the game's four current photo slots. No photo
# image is baked into this asset; the existing game textures remain separate.
for name, x, z in [
    ('1984',-.20,.30), ('1985',.20,.30),
    ('1986',-.20,-.10), ('1987',.20,-.10),
    ('EmptyUpperLeft',-.31,.31), ('EmptyLowerRight',.30,-.30)
]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=1,
                                         location=(x,-.040,z))
    pin = bpy.context.object
    pin.name = 'Pinboard_BrassPin_' + name
    pin.scale = (.012,.007,.012)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    pin.data.materials.append(brass)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=.04)
    bpy.ops.object.mode_set(mode='OBJECT')

for obj in scene.objects:
    if obj.type == 'MESH':
        for polygon in obj.data.polygons:
            polygon.use_smooth = obj.name.startswith('Pinboard_BrassPin')

bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    obj.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB',
                          use_active_scene=True, export_apply=True, export_yup=True)
print('PINBOARD', BLEND, GLB, 'objects', len(scene.objects))
