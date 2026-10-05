"""
The glass cartridge fuse, shared by build_fuse.py (the loose fuses the
player picks from) and build_fuse_box.py (the three that never leave the
box), so all six are the same object down to the millimetre.

After a photo of automotive glass fuses: a clear glass tube between two
nickel end caps, the rating stamped into the caps, and inside, a blue
sleeve at each end joined by a thin S-shaped element -- the part that
melts. Scaled up to toilet-roll-tube size (4.8 cm across, 10 cm long) so it
reads in a dim room.

Built along Z and centred on the origin, so after the glTF Y-up conversion
it stands along Y, the same way a THREE.CylinderGeometry does.

The level's FUSE_* constants mirror the dimensions below.
"""

import math
import bmesh
import common

FUSE_LENGTH = 0.10
CAP_LENGTH = 0.022
CAP_RADIUS = 0.024
GLASS_RADIUS = 0.0205
GLASS_INTO_CAP = 0.004   # the tube runs on inside each cap, so no seam shows

# How far either way the glass shows between the caps.
GLASS_VISIBLE_HALF = FUSE_LENGTH / 2 - CAP_LENGTH

CAP_METAL = (0.62, 0.62, 0.64)
GLASS = (0.9, 0.95, 0.95)
ELEMENT_BLUE = (0.04, 0.16, 0.6)
ELEMENT_WIRE = (0.85, 0.86, 0.88)


def make_materials():
    glass = common.make_material('FuseGlass', GLASS, roughness=0.05)
    glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = 0.18
    return {
        'cap': common.make_material('FuseCapMetal', CAP_METAL, roughness=0.28, metallic=1.0),
        'glass': glass,
        'end': common.make_material('FuseElementEnd', ELEMENT_BLUE, roughness=0.5),
        'wire': common.make_material('FuseElementWire', ELEMENT_WIRE, roughness=0.35, metallic=0.6),
    }


def _wrap_cap_uvs(bm, faces, centre_x, centre_y, z_bottom):
    """
    Cylindrical UVs for one cap: u runs once round it and v along it, so a
    canvas stamp can be wrapped on without the stretching a box projection
    puts on a cylinder. A face straddling the seam gets its wrapped corners
    pushed past 1 rather than smeared back across the whole texture.
    """
    uv_layer = bm.loops.layers.uv.verify()
    for f in faces:
        if abs(f.normal.z) > 0.5:
            for loop in f.loops:
                co = loop.vert.co
                loop[uv_layer].uv = (0.5 + (co.x - centre_x) * 4, 0.5 + (co.y - centre_y) * 4)
            continue
        us = []
        for loop in f.loops:
            co = loop.vert.co
            us.append(math.atan2(co.y - centre_y, co.x - centre_x) / (2 * math.pi) + 0.5)
        if max(us) - min(us) > 0.5:
            us = [u + 1 if u < 0.5 else u for u in us]
        for loop, u in zip(f.loops, us):
            loop[uv_layer].uv = (u, (loop.vert.co.z - z_bottom) / CAP_LENGTH)


def _wire_points(t_from, t_to, droop=0.0):
    """Points along the S-shaped element, from t_from to t_to of its length."""
    half = GLASS_VISIBLE_HALF - 0.012
    points = []
    steps = max(3, round(8 * (t_to - t_from)))
    for i in range(steps + 1):
        t = t_from + (t_to - t_from) * i / steps
        x = 0.006 * math.sin(t * 3 * math.pi)
        z = -half + 2 * half * t
        points.append((x, 0.0, z))
    if droop:
        # A snapped element: the loose end curls away from where it broke.
        end = points[-1] if t_to < 0.5 else points[0]
        i = -1 if t_to < 0.5 else 0
        points[i] = (end[0] + droop, 0.004, end[2])
    return points


def add_glass_fuse(parts, centre, broken=False):
    """
    Adds one fuse standing at `centre` into the per-material bmeshes in
    `parts` (keys: cap, glass, end, wire). With `broken`, the element is
    built snapped in two -- what the level shows once a fuse has blown.
    """
    cx, cy, cz = centre
    cap_bm = parts['cap']
    for end in (-1, 1):
        cap_z = cz + end * (FUSE_LENGTH - CAP_LENGTH) / 2
        before = set(cap_bm.faces)
        common.add_cylinder(cap_bm, (cx, cy, cap_z), CAP_RADIUS, CAP_LENGTH, 'Z', 16)
        # The crimped lip where the cap closes on the glass.
        lip_z = cz + end * (FUSE_LENGTH / 2 - CAP_LENGTH + 0.0015)
        common.add_cylinder(cap_bm, (cx, cy, lip_z), CAP_RADIUS + 0.0006, 0.003, 'Z', 16)
        cap_bm.normal_update()
        new_faces = [f for f in cap_bm.faces if f not in before]
        _wrap_cap_uvs(cap_bm, new_faces, cx, cy, cap_z - CAP_LENGTH / 2)

    common.add_cylinder(
        parts['glass'], (cx, cy, cz), GLASS_RADIUS,
        2 * (GLASS_VISIBLE_HALF + GLASS_INTO_CAP), 'Z', 24
    )

    # The blue sleeves, tapering in toward the element.
    for end in (-1, 1):
        sleeve_z = cz + end * (GLASS_VISIBLE_HALF - 0.006)
        wide, narrow = 0.0095, 0.0065
        common.add_cylinder(
            parts['end'], (cx, cy, sleeve_z), wide if end < 0 else narrow, 0.012, 'Z', 12,
            radius2=narrow if end < 0 else wide
        )

    offset = lambda pts: [(cx + x, cy + y, cz + z) for (x, y, z) in pts]  # noqa: E731
    if broken:
        common.add_tube(parts['wire'], offset(_wire_points(0.0, 0.42, droop=0.004)), 0.0016, 6)
        common.add_tube(parts['wire'], offset(_wire_points(0.58, 1.0, droop=-0.004)), 0.0016, 6)
    else:
        common.add_tube(parts['wire'], offset(_wire_points(0.0, 1.0)), 0.0016, 6)


def finish_objects(prefix, parts, materials, wire_name=None):
    """
    Turns the per-material bmeshes into objects. The caps keep their own
    cylindrical UVs; the rest get the usual box projection.
    """
    caps = common.object_keeping_uvs(f'{prefix}Caps', parts['cap'], materials['cap'], smooth=True)
    bevel = caps.modifiers.new('Bevel', type='BEVEL')
    bevel.width = 0.0015
    bevel.segments = 1
    bevel.limit_method = 'ANGLE'
    objects = [caps]
    for key, suffix in (('glass', 'Glass'), ('end', 'ElementEnds'), ('wire', wire_name or 'ElementWire')):
        obj = common.new_object(f'{prefix}{suffix}', parts[key], materials[key])
        for p in obj.data.polygons:
            p.use_smooth = True
        objects.append(obj)
    return objects


def new_parts():
    return {key: bmesh.new() for key in ('cap', 'glass', 'end', 'wire')}
