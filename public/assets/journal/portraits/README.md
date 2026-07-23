# Hand-drawn specimen portraits

Drop one PNG per specimen here, named after the specimen id in `data/specimens.js`:

```
public/assets/journal/portraits/<specimenId>.png
```

Examples: `lavalizard.png`, `marineiguana.png`, `floreanamockingbird.png`,
`largegroundfinch.png`, `floreanagianttortoise.png`, `cactus.png`, `sealion.png` …

These are used by `three-game/ui/expedition/SketchPortrait.jsx` in the journal
entry list thumbnails and on the journal page itself. Portraits must use a soft
alpha channel: the dark ink remains visible while the surrounding paper is fully
transparent. Do not bake a white, cream, or paper-texture rectangle into the PNG;
`mix-blend-multiply` cannot hide that rectangle against every journal page tone.
Preserve faint construction lines as partial alpha rather than clipping them to
solid black. If a file is missing, the UI automatically falls back to the
specimen photo with a sepia sketch filter, so you can add portraits incrementally.
