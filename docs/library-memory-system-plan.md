# Source-Backed Library and Darwin Memory Links

Status: **next major product goal**.

This plan replaces player-visible generative prose with a compact library of
authentic historical passages. It extends the existing scanned-book reader
rather than adding a field guide, encyclopedia, quiz layer, or general dialogue
system.

## Product Contract

The player may search books in Darwin's intellectual world, click historically
meaningful phrases in authored game prose, read the retrieved passage, and open
the exact scanned page from which it came.

The system must:

- Show authored game prose or verbatim historical sources, never model-written
  historical explanation.
- Use embeddings only for retrieval. Search must not answer, summarize,
  translate, or synthesize.
- Preserve raw OCR, corrected display text, normalized search text, stable
  passage IDs, printed-page labels when known, and exact PDF-page ranges.
- Keep the complete library package—PDFs, passage metadata, lexical index,
  vectors, and term results—at or below **120 MiB**.
- Keep play primary. Historical links are invitations that the player may ignore,
  not compulsory lessons or quiz prompts.

## Initial Corpus

### Retain

1. Alexander von Humboldt and Aimé Bonpland, *Personal Narrative of Travels to
   the Equinoctial Regions*, vols. I–II, Helen Maria Williams translation, 1814.
   Provenance: documented voyage reading and Henslow's departure gift.
2. Charles Lyell, *Principles of Geology*, vol. I, 1830.
   Provenance: documented voyage reading and FitzRoy's gift.
3. Jorge Juan and Antonio de Ulloa, *Relación histórica del viaje a la América
   Meridional*, 1748.
   Provenance: Lawson/contextual reconstruction, not a documented Darwin
   possession.

### Add

4. John Herschel, *A Preliminary Discourse on the Study of Natural Philosophy*,
   1831.
   Provenance: documented Beagle-library reading and an important methodological
   influence.
5. Robert Edmond Grant, *Lectures on Comparative Anatomy and Animal Physiology*,
   1833–34.
   Build one local source PDF from the original pages of Grant's sixty *Lancet*
   installments, excluding unrelated journal pages. Label it as intellectual
   context: Grant was Darwin's former mentor, but this publication is not a
   documented Beagle possession.

### Retire from the runtime bundle

- Nathaniel Bowditch, *The New American Practical Navigator*.
- William Dampier, *A New Voyage Round the World*.

Remove their readable placements from Lawson's house. Retain Juan and Ulloa
there; add Herschel and Grant as readable volumes in the Beagle cabin.

No Premodern Concordance text is imported in the first release. Its Humboldt
text is a different French edition, while its Buffon, Oken, and *Systema
Naturae* editions do not clear the historical-relevance threshold simply by
being available. The project should reuse Premodern Concordance's passage,
alignment, provenance, and hybrid-retrieval lessons without importing its
models, generated findings, or full schema.

## Asset Budget and PDF Preparation

The five current PDFs occupy approximately 178 MiB; all library assets after
this work must occupy no more than 120 MiB.

- Herschel PDF target: at most 12 MiB.
- Grant-only compiled PDF target: at most 24 MiB.
- Preserve original scanned leaves and an invisible OCR layer.
- For new scans, permit 120–144 DPI grayscale MRC/JBIG2 encoding when the
  smallest comfortable reader zoom remains legible.
- Do not use a generic Ghostscript `/ebook` conversion. A feasibility test
  expanded the existing 46 MiB Lyell file to roughly 160 MiB because its source
  images were already efficiently encoded.
- Load no PDF when `/three` starts or when the library sidebar merely opens.
  Fetch only the selected book, and retain HTTP range-request behavior.
- Add a deterministic budget audit that fails when the full library package
  exceeds 120 MiB.

Source scans and intermediate OCR belong under `assets-src/`. Only optimized
runtime PDFs belong under `public/assets/books/`.

## Corpus Build

Create a Darwin-owned build script modeled on Premodern Concordance's
paragraph-first passage pipeline. Do not create a runtime dependency on the
sibling repository.

For each PDF:

1. Extract OCR page by page.
2. Preserve immutable raw OCR separately from normalized search and corrected
   display text.
3. Deterministically normalize whitespace, line-break hyphenation, long-s,
   ligatures, and a small reviewed OCR correction table.
4. Form non-overlapping passages: merge fragments below about 80 words, target
   150–220 words, and split above 320 words near a sentence boundary.
5. Record book ID, stable passage ID, offsets, raw/display/search text, PDF-page
   start and end, printed-page labels when known, citation, and provenance.
6. Audit page alignment with normalized phrase overlap against the mapped PDF
   page. A passage without a defensible locator must not publish.

Embed passage inputs once with `text-embedding-3-small` at 512 dimensions.
Normalize vectors, quantize them to signed 8-bit values, and publish a compact
binary matrix keyed by passage ID. The artifact manifest records model,
dimensions, exact input hashes, corpus version, and checksums.

Build a compact OCR-aware lexical index as a second retrieval channel. Dense
similarity proposes conceptually related passages; lexical retrieval preserves
inspectable exact names, historical spellings, and noisy OCR matches. Combine
their ranks with reciprocal-rank fusion.

## Library Interface

Evolve `three-game/ui/BookReaderView.jsx` into a Library overlay while retaining
its PDF.js rendering, zoom, page turns, mobile single-page mode, last-page
memory, and page-specific field notes.

Desktop:

- A left sidebar contains search, `Books` and `Results` tabs, the selected
  passage, and five related passages.
- The main area renders the original scanned page or spread.
- Selecting a passage opens its mapped PDF page immediately.
- Results show verbatim passage text, author, title, edition, printed/PDF page,
  source language, and provenance.

Mobile:

- Keep single-page PDF rendering.
- Collapse the sidebar into a drawer.
- A historical link opens the primary passage first; the drawer exposes the
  remaining five.

Add a global Library button to the HUD. Physical book interactions and text
links use the same store action:

```ts
openLibrary({
  bookId?: string,
  pdfPage?: number,
  passageId?: string,
  termId?: string,
  query?: string
})
```

Extend the reader session with selected passage, six result IDs, query label,
and sidebar tab. Preserve existing `bookLastPages` save data.

## Search

Free-text search uses one bounded embedding request:

```text
POST /api/library-query
{ "query": "short natural-language question or phrase" }

200
{ "model": "text-embedding-3-small", "dimensions": 512, "vector": [...] }
```

- Limit queries to 160 characters and validate same-origin requests.
- Apply a best-effort limit of 30 queries per IP per ten minutes, a deployment
  kill switch, and an OpenAI project spending cap.
- Search the lazy-loaded local vector and lexical indexes in the browser.
- Return six passages, diversified across books when other relevant books clear
  the retrieval threshold.
- If embeddings are unavailable or disabled, return lexical results without
  blocking the reader.
- Cache normalized queries for the session. Never send clicks on curated terms
  to the API.

## Darwin Memory Terms

Launch with exactly 150 manually curated concepts:

- 30 geology and earth-process terms.
- 30 organisms, anatomy, classification, and species terms.
- 25 ecology, climate, vegetation, and geography terms.
- 20 observation, collecting, preservation, navigation, and field-method terms.
- 15 voyage, settlement, and colonial-encounter terms.
- 30 people, books, scientific concepts, and intellectual influences.

Each registry entry contains:

```ts
{
  id,
  label,
  aliases,
  searchQuery,
  primaryPassageId,
  relatedPassageIds, // exactly five
  provenanceNote,
  priority
}
```

Run each term through hybrid retrieval at build time. An editor confirms one
primary passage; retain the next five reviewed results. A term may not publish
without a valid primary passage and page mapping.

A shared linked-text renderer:

- Matches aliases case-insensitively with Unicode-aware word boundaries.
- Prefers the longest alias, then registry priority.
- Links only the first occurrence of a term and at most two terms per prose
  block.
- Runs on narrator lines, authored NPC lines, examination facts,
  location/travel prose, and selected system-authored journal material.
- Never modifies player input, player journal writing, controls, inventory
  labels, or citation text.

Clicking a term opens its primary scanned page and lists the five related
passages. It makes no API request.

## Remove Player-Visible Generative Prose

For the active `/three` runtime:

- Remove the narrator composer. Retain an authored field log with historical
  links and a Library button.
- Replace narrator-input dilemmas with two to four authored action choices and
  deterministic existing resolvers.
- Replace Syms's free-text conversation with a small set of authored,
  state-sensitive choices using existing trust flags. Do not build a general
  dialogue-tree engine.
- Replace free-text specimen examination with authored observation,
  measurement, and comparison actions using existing specimen data.
- Always use the existing deterministic local Henslow assessment.
- Remove active calls to `three-narrate`, `three-encounter`, `three-examine`, and
  `end-game-assessment`.
- Make every generative API unavailable by default in production before request
  parsing. Development-only generation requires an explicit local flag.
- Keep `/api/library-query` as the sole production model endpoint. It returns
  numeric embeddings, never prose.
- Update Sources and launch copy to describe authored narration, retrieval,
  provenance, OCR limitations, and the absence of generated historical claims.

## Verification and Acceptance

- Every published passage resolves to an existing book and valid PDF page.
- Sampled normalized passage text occurs on the mapped page.
- Hybrid retrieval equals or beats dense-only and lexical-only baselines and
  reaches at least 80% hit-at-6 on 40 reviewed natural-language queries.
- All 150 memory terms have one primary and five valid related passages.
- Link tests cover longest matches, punctuation, plural aliases, overlaps,
  repeated terms, the two-link cap, and protected player text.
- Reader tests cover book switching, free search, lexical fallback, deep-linked
  pages, field notes, saved last pages, and the mobile drawer.
- Opening `/three` performs no PDF or embedding request. A memory-term click
  performs no model request. A typed search performs exactly one embedding
  request.
- Production `/three` performs no generative-model calls, and disabled
  generative routes cannot contact a provider.
- The library package is at most 120 MiB and smaller than the current 178 MiB.

Run:

- `npm run check`
- `npm run three:e2e:smoke`
- `npm run asset:audit`
- targeted desktop and mobile screenshots
- `npm run build`

## Mockup References

- `mockups/library-reader-first.html`: persistent search/results sidebar with
  the existing book spread as the dominant workspace.
- `mockups/library-scan-first.html`: narrow book rail plus a collapsible memory
  drawer that gives more space to the scan.

The mockups are design probes, not runtime dependencies.
