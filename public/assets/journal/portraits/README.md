# Hand-drawn specimen portraits

Drop one PNG per specimen here, named after the specimen id in `data/specimens.js`:

```
public/assets/journal/portraits/<specimenId>.png
```

Examples: `lavalizard.png`, `marineiguana.png`, `floreanamockingbird.png`,
`largegroundfinch.png`, `floreanagianttortoise.png`, `cactus.png`, `sealion.png` …

These are used by `three-game/ui/expedition/SketchPortrait.jsx` in the journal
entry list thumbnails and on the journal page itself. Transparent or paper-white
backgrounds work best — the page renders them with `mix-blend-multiply` so white
disappears into the paper. If a file is missing, the UI automatically falls back
to the specimen photo with a sepia sketch filter, so you can add portraits
incrementally.
