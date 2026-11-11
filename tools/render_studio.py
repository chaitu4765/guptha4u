"""Render the storefront's original, unbranded category artwork in Blender."""
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector

OUT = Path(sys.argv[-1])
if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
MODELS = '--models' in sys.argv
rng = random.Random(408)
C = {
    'ivory': '#EDE2CF', 'paper': '#F9EED9', 'wood': '#B27B4F',
    'walnut': '#614430', 'canvas': '#DAC8AC', 'black': '#292822',
    'steel': '#A5A5A0', 'red': '#9C402E', 'green': '#536B59',
    'blue': '#2E4A66', 'gold': '#CF8D42', 'pink': '#B76F5F',
}
PALETTE = ('blue', 'red', 'gold', 'green', 'pink')


def rgb(hex_value):
    values = [int(hex_value[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)


def materials():
    result = {}
    for name, color in C.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nodes = m.node_tree.nodes
        links = m.node_tree.links
        shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        shader.inputs['Base Color'].default_value = (*rgb(color), 1)
        shader.inputs['Roughness'].default_value = .31 if name == 'steel' else .58
        shader.inputs['Metallic'].default_value = .73 if name == 'steel' else 0
        if name in {'wood', 'walnut', 'paper', 'canvas', 'ivory'}:
            noise = nodes.new('ShaderNodeTexNoise')
            noise.inputs['Scale'].default_value = 125 if name in {'paper', 'canvas'} else 16
            bump = nodes.new('ShaderNodeBump')
            bump.inputs['Strength'].default_value = .20
            bump.inputs['Distance'].default_value = .025
            links.new(noise.outputs['Fac'], bump.inputs['Height'])
            links.new(bump.outputs[0], shader.inputs['Normal'])
        result[name] = m
    return result


def finish(o, color, bevel):
    o.data.materials.append(M[color])
    if bevel:
        modifier = o.modifiers.new('Soft edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 1 if MODELS else 3
        o.modifiers.new('Normals', 'WEIGHTED_NORMAL')
    return o


def box(location, size, color, bevel=.025, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    o = bpy.context.object
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.rotation_euler = rotation
    return finish(o, color, bevel)


def rod(a, b, radius, color, tip=None):
    start, end = Vector(a), Vector(b)
    delta = end - start
    bpy.ops.mesh.primitive_cone_add(vertices=48 if radius > .5 else 32, radius1=radius, radius2=radius if tip is None else tip,
                                    depth=delta.length, location=(start + end) / 2)
    o = bpy.context.object
    o.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    for poly in o.data.polygons:
        poly.use_smooth = len(poly.vertices) == 4
    return finish(o, color, min(.025, radius / 4))


def brush(a, b, color, radius=.038):
    start, end = Vector(a), Vector(b)
    shaft = start.lerp(end, .74)
    ferrule = start.lerp(end, .86)
    rod(start, shaft, radius*.72, color, radius)
    rod(shaft, ferrule, radius*1.04, 'steel')
    tip = (ferrule + end) / 2
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=tip)
    head = bpy.context.object
    head.scale = (radius*1.14, radius*1.14, (end-ferrule).length*.62)
    head.rotation_euler = (end-ferrule).to_track_quat('Z','Y').to_euler()
    finish(head, 'walnut', 0)
    for polygon in head.data.polygons:
        polygon.use_smooth = True


def brushes(x=0, y=0, s=1):
    rod((x, y, .03), (x, y, .61*s), .35*s, 'ivory', .39*s)
    rod((x, y, .60*s), (x, y, .625*s), .35*s, 'walnut')
    for i in range(9):
        angle = i * 2.39996
        dx, dy = math.cos(angle), math.sin(angle)
        brush((x+.16*s*dx, y+.16*s*dy, .55*s), (x+.54*s*dx, y+.50*s*dy, s*rng.uniform(1.33, 2.15)),
              ('black', 'wood', 'red', 'blue')[i % 4], s*rng.uniform(.032, .063))
    for sign in (-1, 1):
        rod((x+sign*.12*s,y,.4*s),(x+sign*.47*s,y,1.5*s),.035*s,'wood')
        rod((x+sign*.47*s,y,1.5*s),(x+sign*.52*s,y,1.72*s),.025*s,'steel')
        box((x+sign*.53*s,y,1.88*s),(.15*s,.025*s,.36*s),'steel',.06,
            (0,math.radians(sign*12),0))


def tubes(x=0, y=0, s=1):
    for i, color in enumerate(PALETTE[:4]):
        px = x+s*(i*.33-.53)
        py = y+s*(.21 if i % 2 else 0)
        h = s*(1.02 if i % 2 else .76)
        top = (px+s*.09*(-1)**i, py, h)
        base = (px, py, .11*s)
        rod((px, py, 0), base, .102*s, 'black')
        rod(base, top, .128*s, 'paper', .113*s)
        a, b = Vector(base).lerp(top,.27), Vector(base).lerp(top,.53)
        rod(a, b, .131*s, color, .123*s)
        box(top, (.21*s,.072*s,.054*s), 'steel', .012)
    rod((x+.5*s,y-.38*s,.02),(x+.5*s,y-.38*s,.48*s),.21*s,'walnut')
    rod((x+.5*s,y-.38*s,.46*s),(x+.5*s,y-.38*s,.55*s),.215*s,'black')


def canvases(x=0, y=0, s=1, painted=False):
    for i, (w, h) in enumerate(((1.03,1.34),(.91,1.11),(.87,.71))):
        a = x+s*(-.18+i*.18)
        b = y+s*(.28-i*.22)
        box((a,b,s*h*.50), (s*w,.092*s,s*h), 'paper' if i != 2 or not painted else 'canvas',
            .026, rotation=(math.radians(-8),0,math.radians(-6+i*5)))
        if i == 2 and painted:
            for j,color in enumerate(('blue','green','gold','red','pink')):
                box((a+s*(j*.125-.25),b-.052*s,s*(.16+j*.089)),(.38*s,.012*s,.089*s),color,
                    .007, rotation=(math.radians(-8),0,math.radians(-6+i*5)))


def easel(x=0, y=0, s=1, board=False):
    def beam(a,b,r=.041):
        rod((x+s*a[0],y+s*a[1],s*a[2]),(x+s*b[0],y+s*b[1],s*b[2]),r*s,'wood')
    beam((-.55,0,0),(-.08,.14,1.91))
    beam((.55,0,0),(.08,.14,1.91))
    beam((.02,.76,0),(.02,.16,1.82))
    beam((-.40,.015,.53),(.40,.015,.53),.052)
    beam((0,-.025,.34),(0,.06,2.02),.048)
    box((x,y-.10*s,.56*s), (1.04*s,.19*s,.08*s), 'wood')
    if board:
        box((x,y-.12*s,1.09*s),(1.02*s,.07*s,1.0*s),'paper',.018,rotation=(math.radians(-5),0,0))


def drawing(x=0, y=0, s=1):
    rod((x, y, .02), (x, y, .59*s), .36*s, 'steel', .38*s)
    rod((x, y, .58*s), (x, y, .601*s), .35*s, 'walnut')
    for i in range(11):
        angle = i*2.39996
        dx, dy = math.cos(angle), math.sin(angle)
        a = Vector((x+.19*s*dx, y+.19*s*dy, .54*s))
        b = Vector((x+.44*s*dx, y+.47*s*dy, s*rng.uniform(1.02,1.66)))
        shaft = a.lerp(b,.88)
        rod(a, shaft, .034*s, PALETTE[i%5])
        rod(shaft,b,.034*s,'wood',.006*s)
        rod(shaft.lerp(b,.83),b,.013*s,'black',.004*s)


def papers(x=0, y=0, s=1):
    for i, color in enumerate(('green','red','blue')):
        center = (x+i*.085*s,y,.09*s+i*.12*s)
        angle = (0,0,math.radians(7-i*11))
        box(center,(1.38*s,1.06*s,.10*s),'paper',.012,angle)
        for sign in (-1,1):
            box((center[0],y,center[2]+sign*.057*s),(1.42*s,1.10*s,.027*s),color,.014,angle)
    box((x-.10*s,y+.38*s,.82*s),(.95*s,.085*s,1.24*s),'walnut',.022,
        (math.radians(-13),0,math.radians(-9)))
    box((x-.10*s,y+.33*s,.81*s),(.91*s,.03*s,1.18*s),'paper',.012,
        (math.radians(-13),0,math.radians(-9)))


def accessories(x=0, y=0, s=1):
    for i,color in enumerate(('steel','ivory','wood')):
        bpy.ops.mesh.primitive_torus_add(location=(x+s*(i*.26-.35),y+i*.06*s,(.30+i*.11)*s),
            major_radius=.23*s,minor_radius=.076*s,rotation=(math.radians(65+i*12),0,math.radians(i*19)))
        finish(bpy.context.object,color,0)
    box((x+.14*s,y-.3*s,.07*s),(.49*s,.24*s,.14*s),'pink',.038,(0,0,.21))
    rod((x+.1*s,y+.28*s,0),(x+.1*s,y+.28*s,.76*s),.21*s,'walnut')
    rod((x+.1*s,y+.28*s,.69*s),(x+.1*s,y+.28*s,.8*s),.22*s,'black')


def brands():
    papers(.39,.32,.83)
    tubes(-.56,-.32,.75)


def studio():
    easel(.55,.40,1.40,True)
    canvases(.85,.22,.72,True)
    brushes(-.96,.02,1.0)
    drawing(1.58,.27,.76)
    tubes(-.31,-.77,.73)
    papers(.65,-.78,.77)
    brush((-.65,-1.07,.06),(.67,-1.32,.12),'wood',.067)


def light(name, location, target, watts, size, color):
    data = bpy.data.lights.new(name,'AREA')
    data.energy, data.shape, data.size, data.color = watts, 'DISK', size, color
    obj = bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def render(name, build, hero=False):
    global M
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M = materials()
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 22 if hero else 13
    scene.cycles.use_denoising = True
    scene.world = bpy.data.worlds.new('Studio ambient')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.72,.76,.83,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .32
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = .48
    box((0,0,-.18),(200,200,.36),'ivory',0)
    if not hero:
        rod((0,0,-.035),(0,0,.035),1.09,'wood')
    build()
    light('Window',(-3.9,-2.5,5.7),(0,0,.3),690,3.2,(1,.88,.73))
    light('Fill',(3,-1.3,3),(0,0,.7),105,3.6,(.76,.87,1))
    light('Bounce',(-.5,3.7,4),(0,0,.2),255,3,(1,.94,.83))
    bpy.ops.object.camera_add(location=(3.9,-7.1,3.2) if hero else (2.65,-6,2.8))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0,0,1.09 if hero else .81))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 5.27 if hero else (3.34 if name == 'brushes' else 3.08)
    scene.camera = camera
    scene.render.resolution_x = 1400 if hero else 560
    scene.render.resolution_y = 1080 if hero else 452
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(OUT / (name+'.png'))
    bpy.ops.render.render(write_still=True)


compositions = {
    'paints': tubes, 'brushes': brushes, 'canvas': lambda: canvases(painted=True),
    'easels': lambda: easel(board=True), 'drawing': drawing, 'papers': papers,
    'accessories': accessories, 'brands': brands,
}

if __name__ != '__main__':
    pass
elif MODELS:
    for key, build in compositions.items():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        M = materials()
        rod((0,0,-.035),(0,0,.035),1.09,'wood')
        build()
        bpy.ops.export_scene.gltf(filepath=str(OUT / (key + '.glb')), export_format='GLB',
                                 export_apply=True, export_image_format='NONE')
else:
    render('studio', studio, True)
    for key, build in compositions.items():
        render(key, build)
