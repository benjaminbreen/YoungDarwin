# Island character assets

| Character | Existing Tripo source | Runtime GLB |
| --- | --- | --- |
| Gabriel Puig i Ferrer | [Vintage worker](https://studio.tripo3d.ai/3d-model/man-in-vintage-work-attire-with-apron-and-suspenders-ed2be971-5eba-4797-9f47-129b1f5f7f59) | `npc-gabriel.glb` |
| María de la Concepción | [Woman in an apron and boots](https://studio.tripo3d.ai/3d-model/19th-century-woman-in-beige-dress-with-apron-brown-skirt-and-boots-s-f0b56674-be17-4714-9fa4-6c86e1fabc05) | `npc-maria.glb` |
| Boy at the Well | [Vintage sailor child](https://studio.tripo3d.ai/3d-model/young-child-in-a-navy-sailor-outfit-with-cap-double-breasted-jacket-6f6b701c-6225-42e7-98e9-3f09aa6aeee2) | `npc-well-boy.glb` |
| John Lort Stokes | [Gentleman in a brown coat](https://studio.tripo3d.ai/3d-model/19th-century-gentleman-figure-wearing-brown-coat-blue-waistcoat-beig-cdb23ec8-20cf-47c5-97a7-26a61215401e) | `npc-john-lort-stokes.glb` |

Original meshes were fit and weighted in Blender, with the standing idle as
the starting pose for the other actions. The local authoring files in this
directory are `gabriel.blend` and `maria.blend`. Gabriel is 1.73 m tall and
has 4,920 triangles; María is 1.61 m tall and has 9,611 triangles.

From the repository root, export the named `idle`, `walk`, `run`, `work`,
and `look` clips and compress the embedded textures to 1,024 px WebP:

```sh
blender -b assets-src/characters/gabriel.blend -P scripts/blender_animate_island_npcs.py -- public/assets/models/npc-gabriel.glb
blender -b assets-src/characters/maria.blend -P scripts/blender_animate_island_npcs.py -- public/assets/models/npc-maria.glb skirt
node scripts/optimize-npc-runtime-glb.mjs public/assets/models/npc-gabriel.glb
node scripts/optimize-npc-runtime-glb.mjs public/assets/models/npc-maria.glb
```

Use `npm run three:contact-sheet -- --asset gabriel --clip all` and the same
command for `maria` to review the poses after changing the rigs or clips.

The boy’s local `well-boy.blend` has the faded clothing texture and the
pail and stick. In `stokes.blend` the reduced mesh wears a slate coat and a
cap and carries a chart board with a pencil. Export with the same script,
passing `well-boy` or `stokes` as the final argument. The corresponding
manifest IDs for contact sheets are `wellBoy` and `stokes`.
