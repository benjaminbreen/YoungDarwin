# Flora Asset Review

This is a visual and runtime-readiness audit of the GLB flora under
`public/assets/models/nature/`. It is not a taxonomic determination from a
model alone. Species names are used only where the silhouette, source context,
and Floreana distribution support them; otherwise the runtime should expose an
honest generic or `proxy` identity.

Generate the current normalized, material-aware review sheet with:

```sh
npm run three:flora-contact-sheet
```

The output is `test-results/flora-sheets/flora-contact-sheet.png`. Each asset is
grounded and normalized independently, so the sheet compares form rather than
world scale. The accompanying JSON records source bounds and render results.

## Current decisions

| Runtime asset | Assessment | Recommended use |
| --- | --- | --- |
| `runtime-animated-dry-grass.glb` | Good dry grass clump | Keep; vary tint and scale through ecology layers. |
| `runtime-big-opuntia.glb` | Strong tree-Opuntia silhouette | Use for mature *Opuntia megasperma* in mixed-age procedural stands. |
| `runtime-candelabra-cactus.glb` | Convincing columnar cactus | Keep as the preferred candelabra cactus asset. |
| `runtime-croton.glb` | Plausible fine-leaved round shrub | Keep as the current chala / *Croton scouleri* proxy. |
| `runtime-darwiniothamnus.glb` | Nine good life-stage forms | Keep as prepared variants; scatter forms independently. |
| `runtime-galapagos-bushes.glb` | Multiple usable shrubs stored as one enormous collection | Extract individual variants before any further ecology placement. |
| `runtime-galapagos-cotton.glb` | Strong yellow-flowered shrub form | Keep as *Gossypium darwinii*. |
| `runtime-galapagos-fern.glb` | Good compact fern rosette | Keep as Floreana resurrection fern, *Pleopeltis polypodioides*, in sheltered humid patches. |
| `runtime-grass-patch-1.glb` | Usable multi-clump field with large source bounds | Candidate only; split or crop before modular scatter use. |
| `runtime-grass-patch-2.glb` | Usable multi-clump field with large source bounds | Candidate only; split or crop before modular scatter use. |
| `runtime-grass-patch-3.glb` | Usable multi-clump field with large source bounds | Candidate only; split or crop before modular scatter use. |
| `runtime-ground-plants.glb` | Mixed grass and clover-like ground-cover collection | Keep generic; do not assign a species identity. |
| `runtime-jasminocereus-1.glb` | Source meshes identify an unrelated *Euphorbia* model | Retire; the candelabra-cactus asset is the better proxy. |
| `runtime-jasminocereus-2.glb` | Source meshes identify an unrelated *Euphorbia* model | Retire; the candelabra-cactus asset is the better proxy. |
| `runtime-mangrove-lowpoly.glb` | Coarse but readable mangrove silhouette | Keep for distant coastal-mangrove walls only. |
| `runtime-mangrove-tree.glb` | Strong prop-root silhouette | Keep as red mangrove / *Rhizophora mangle*. |
| `runtime-manzanillo.glb` | Plausible generic broadleaf tree | Keep as the current manzanillo proxy. |
| `runtime-opuntia.glb` | Four separated forms behave like a study sheet, not one plant | Replace static ecology uses with the large Opuntia study or prepared individual variants. |
| `runtime-palo-santo.glb` | Not palo santo, but reads acceptably as a small thorny shrub after scaling | Keep as the current bitterbush / *Castela galapageia* visual proxy; retain the legacy filename only for compatibility. |
| `runtime-purple-shrub.glb` | Excellent flowering shrub model, but *Miconia robinsoniana* is not recorded from Floreana | Keep as an unidentified Floreana highland flowering shrub until a defensible species match exists. |
| `runtime-saltbush-1.glb` | Plausible low rounded coastal shrub | Keep as monte salado / *Cryptocarpus pyriformis* proxy. |
| `runtime-saltbush-2.glb` | Plausible low rounded coastal shrub | Keep as a monte salado form. |
| `runtime-saltbush-3.glb` | Plausible larger rounded coastal shrub | Keep as a monte salado form. |
| `runtime-saltgrass.glb` | Useful dense grass strip, but rectangular at repeated scales | Relabel as seashore dropseed / *Sporobolus virginicus* proxy and use as shoreline bands, not isolated repeated plots. |
| `runtime-scalesia-pedunculata-tree.glb` | Plausible single broadleaf tree | Keep as *Scalesia pedunculata*. |
| `runtime-scalesia-pedunculata.glb` | Three separated trees stored as one large collection | Extract individual tree variants before further placement. |
| `runtime-scalesia.glb` | Plausible gray-green scrub form | Keep as *Scalesia villosa*, but restrict it to exposed Floreana cinder/lava habitat rather than wet forest canopy. |
| `runtime-sesuvium.glb` | Low spreading Galapagos carpetweed study | Keep in its existing littoral and pioneer placements. |

The broken generated *Castela galapageia* study, Beach Morning Glory, tall red
*Sesuvium edmonstonei* study, flat cactus study, drybrush plane, and two Rocky
Clearing alpha-card shrubs have been removed. The accepted bitterbush proxy is
`runtime-palo-santo.glb`, not the rejected generated study.

## Highest-value follow-up

1. Replace the four-form `runtime-opuntia.glb` placements with a prepared mature
   Opuntia asset while keeping the breakable young cactus ecology overlay.
2. Extract the Galapagos bush collection and the three-tree Scalesia collection
   into independently scatterable variants, using the Darwiniothamnus pipeline.
3. Keep the unidentified purple flowering shrub restricted to plausible humid
   highland habitat and avoid assigning it a non-Floreana species name.

## Botanical references

- Charles Darwin Foundation Datazone: [*Scalesia villosa*](https://datazone.darwinfoundation.org/en/checklist/?species=356)
- Charles Darwin Foundation Datazone: [*Scalesia pedunculata*](https://datazone.darwinfoundation.org/en/checklist/?species=353)
- Charles Darwin Foundation Datazone: [*Rhizophora mangle*](https://datazone.darwinfoundation.org/en/checklist/?species=697)
- Charles Darwin Foundation Datazone: [*Sesuvium edmonstonei*](https://datazone.darwinfoundation.org/en/checklist/?species=132)
- Charles Darwin Foundation Datazone: [*Gossypium darwinii*](https://datazone.darwinfoundation.org/en/checklist/?species=573)
- Charles Darwin Foundation Datazone: [*Sporobolus virginicus*](https://datazone.darwinfoundation.org/es/checklist/?species=982)
- Charles Darwin Foundation: [Galapagos pteridophyte checklist](https://datazone.darwinfoundation.org/media/pdf/checklist/2017Aug29_Jaramillo-Diaz_et_al_Galapagos_Pteridophyta_Checklist.pdf)
