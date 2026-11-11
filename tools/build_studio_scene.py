"""Build one shared GLB. Its category positions also drive studio.js camera targets."""
import sys
from pathlib import Path

import bpy
sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_studio as art

target = Path(sys.argv[-1])
target.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
art.M = art.materials()
art.MODELS = True
for index, (key, build) in enumerate(art.compositions.items()):
    before = set(bpy.data.objects)
    art.rod((0, 0, -.07), (0, 0, .04), 1.06, 'ivory')
    build()
    category_materials = {}
    for obj in set(bpy.data.objects) - before:
        obj.location.x += (index - 3.5) * 2.35
        obj.name = key + '_' + obj.name
        for slot in obj.material_slots:
            original = slot.material
            if original.name not in category_materials:
                material = original.copy()
                material.name = key + '_' + original.name
                category_materials[original.name] = material
            slot.material = category_materials[original.name]
bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB',
                         export_apply=True, export_image_format='NONE')
