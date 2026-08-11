# Source-Backed Library and Darwin Memory Links

Status: **four-book lexical foundation implemented; passage-result editorial
review remains**. Option B, the scan-first interface, is the selected direction.

This plan replaces player-visible generative prose with a compact library of
authentic historical passages. It extends the existing scanned-book reader
rather than adding a field guide, encyclopedia, quiz layer, or general dialogue
system.

## Decisions Locked Before Implementation

- The original scanned page remains the visual center of the Library.
- Release one is built and tested with Humboldt, Lyell, Juan and Ulloa, and
  Herschel. Grant is a later corpus addition and may not block the system.
- The first working search is local and lexical. Semantic retrieval is an
  optional enhancement with lexical fallback, not a dependency of the reader.
- Scan anchoring is part of the corpus schema from the first build. No published
  result may drop the player onto an unlocated wall of text.
- Public mode uses authored Syms replies, examination procedures, and the
  deterministic Henslow assessment. The deployed narrator demonstration is the
  one temporary exception: its composer and route are default-on but retain
  explicit client and server kill switches.

## Implemented Foundation

- `scripts/build-library-corpus.mjs` extracts paragraph-scale passages and
  normalized line rectangles from the embedded OCR in the exact runtime PDFs.
- The generated corpus contains 3,240 anchored passages, a compact BM25-style
  lexical index, and exactly 150 term records with one primary and five related
  source destinations.
- The measured package is 113.54 MiB: 93.62 MiB of source scans, 16.54 MiB of
  passages and anchor geometry, 2.31 MiB of lexical index, 0 MiB of vectors,
  0.07 MiB of curated term data, and 0.99 MiB of PDF image decoders.
- `BookReaderView.jsx` is now the scan-first Library: four-book rail, collapsible
  drawer, local search, exact-page navigation, PDF overlay highlights, source
  links, saved pages, and page-specific field notes.
- Authored narrator lines receive conservative memory links. Player writing and
  player dialogue are never modified.
- Public `/three` exposes the narrator composer and permits user-initiated calls
  to `three-narrate`. `YOUNG_DARWIN_ENABLE_NARRATOR=0` and
  `NEXT_PUBLIC_YOUNG_DARWIN_ENABLE_NARRATOR=0` restore the authored-only path.
  The other old prose endpoints remain unavailable unless the matching legacy
  generation flags are explicitly enabled.

The generated term rankings truthfully carry
`machine-ranked-needs-editor-review`. Ben's review of the 150 primary passages
is editorial QA, not a blocker for using or beta-testing the implemented
lexical Library.

## Product Contract

The player may search books in Darwin's intellectual world, click historically
meaningful phrases in authored game prose, read the retrieved passage, and open
the exact scanned page from which it came.

The system must:

- Show authored game prose or verbatim historical sources, never model-written
  historical explanation.
- Use embeddings only for retrieval. Search must not answer, summarize,
  translate, or synthesize.
- Preserve raw OCR, corrected display text, normalized search text, OCR word
  geometry, stable passage IDs, printed-page labels when known, exact PDF-page
  ranges, and compact passage highlight rectangles.
- Keep the complete library package—PDFs, passage metadata, lexical index,
  vectors, and term results—at or below **120 MiB**.
- Keep play primary. Historical links are invitations that the player may ignore,
  not compulsory lessons or quiz prompts.

## Initial Corpus

### Four-book foundation

1. Alexander von Humboldt and Aimé Bonpland, *Personal Narrative of Travels to
   the Equinoctial Regions*, vols. I–II, Helen Maria Williams translation, 1814.
   Provenance: documented voyage reading and Henslow's departure gift.
2. Charles Lyell, *Principles of Geology*, vol. I, 1830.
   Provenance: documented voyage reading and FitzRoy's gift.
3. Jorge Juan and Antonio de Ulloa, *Relación histórica del viaje a la América
   Meridional*, 1748.
   Provenance: Lawson/contextual reconstruction, not a documented Darwin
   possession.
4. John Herschel, *A Preliminary Discourse on the Study of Natural Philosophy*,
   1831.
   Provenance: documented Beagle-library reading and an important methodological
   influence.

Herschel is the only new text required for the first complete corpus. Add it as
a readable volume in the Beagle cabin.

### Corpus version two: Grant

Robert Edmond Grant, *Lectures on Comparative Anatomy and Animal Physiology*,
1833–34, is a valuable later addition. Build one local source PDF from the
original pages of Grant's sixty *Lancet* installments, excluding unrelated
journal pages. Label it as intellectual context: Grant was Darwin's former
mentor, but this publication is not a documented Beagle possession.

The sourcing, cropping, OCR review, compilation, and compression of those
installments is substantial editorial work. Grant must not block the four-book
reader, anchoring pipeline, search, memory links, beta release, or broad public
release.

### Retire from the runtime bundle

- Nathaniel Bowditch, *The New American Practical Navigator*.
- William Dampier, *A New Voyage Round the World*.

Remove their readable placements from Lawson's house. Retain Juan and Ulloa
there.

No Premodern Concordance text is imported in the first release. Its Humboldt
text is a different French edition, while its Buffon, Oken, and *Systema
Naturae* editions do not clear the historical-relevance threshold simply by
being available. The project should reuse Premodern Concordance's passage,
alignment, provenance, and hybrid-retrieval lessons without importing its
models, generated findings, or full schema.

## Asset Budget and PDF Preparation

The former five PDFs occupied approximately 177 MiB on disk; all library assets
must occupy no more than 120 MiB. The losslessly retained archival Herschel PDF
is 22.82 MiB. With Bowditch and Dampier retired, the four runtime scans total
93.62 MiB and the complete generated package totals 113.54 MiB, including the
PDF.js decoders required to render the archival scan encodings.

- Herschel PDF actual: 22.82 MiB. Its unmodified Internet Archive scan was kept
  because it is legible, carries the OCR used for exact geometry, and the full
package clears the hard budget.
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
  exceeds 120 MiB. It must report separate line items for runtime PDFs, passage
  and provenance metadata, scan-anchor geometry, lexical index, vectors, and
  curated term data so growth is attributable.

Source scans and intermediate OCR belong under `assets-src/`. Only optimized
runtime PDFs belong under `public/assets/books/`.

## Corpus Build

Create a Darwin-owned build script modeled on Premodern Concordance's
paragraph-first passage pipeline. Do not create a runtime dependency on the
sibling repository.

For each PDF:

1. Extract OCR page by page with word bounding boxes in hOCR, ALTO, or an
   equivalent deterministic format. Generate the runtime PDF text layer and
   passage anchors from the same OCR output.
2. Preserve immutable raw OCR separately from normalized search and corrected
   display text.
3. Deterministically normalize whitespace, line-break hyphenation, long-s,
   ligatures, and a small reviewed OCR correction table.
4. Form non-overlapping passages: merge fragments below about 80 words, target
   150–220 words, and split above 320 words near a sentence boundary.
5. Record book ID, stable passage ID, raw OCR token range, raw/display/search
   text, PDF-page start and end, printed-page labels when known, citation, and
   provenance.
6. Derive normalized line rectangles from the raw token geometry for every
   passage. Store passage rectangles rather than the complete word geometry in
   the runtime index.
7. Audit page alignment against the same OCR text layer used by the runtime PDF.
   A passage without a defensible locator must not publish.

Each published passage includes an anchor:

```ts
{
  passageId,
  pdfPage,
  pageWidth,
  pageHeight,
  rawTokenStart,
  rawTokenEnd,
  rawAnchorText,
  highlightRects: [{ x, y, width, height }], // normalized page coordinates
  alignmentConfidence
}
```

The build keeps the raw OCR-to-corrected-text mapping; the browser never attempts
to fuzzy-match corrected text against the PDF.js text layer. For a curated
memory link, the highlight may be narrowed to the editor-approved excerpt. For
an arbitrary free-text result, the overlay highlights the retrieved passage,
because semantic similarity does not imply a literal matching phrase. The UI
calls this a **highlighted passage**, not a matched phrase, and states that the
shading is a navigation overlay rather than part of the historical scan.

Build a compact OCR-aware lexical index first. It preserves inspectable exact
names, historical spellings, and noisy OCR matches while allowing the reader and
deep-link system to ship without a model endpoint.

When semantic retrieval is enabled, embed passage inputs once with
`text-embedding-3-small` at 512 dimensions. Normalize vectors, quantize them to
signed 8-bit values, and publish a compact binary matrix keyed by passage ID.
The artifact manifest records model, dimensions, exact input hashes, corpus
version, and checksums. Combine dense and lexical ranks with reciprocal-rank
fusion.

## Library Interface

Evolve `three-game/ui/BookReaderView.jsx` into a Library overlay while retaining
its PDF.js rendering, zoom, page turns, mobile single-page mode, last-page
memory, and page-specific field notes. Follow the selected scan-first Option B
mockup.

Desktop:

- A narrow, persistent book rail switches sources.
- A collapsible left drawer contains search, the selected passage, and five
  related passages.
- The main area gives the original scanned page or spread most of the screen.
- Selecting a passage opens its mapped PDF page immediately.
- A transparent overlay draws the stored highlight rectangles without modifying
  the scan.
- Results show verbatim passage text, author, title, edition, printed/PDF page,
  source language, and provenance.
- Use one clear gold frame or active edge. Use neutral separators elsewhere,
  no hover translation or lift, and no essential labels smaller than 11 px.

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
and drawer state. Preserve existing `bookLastPages` save data.

## Search Rollout

Release one searches the local OCR-aware lexical index in the browser and
returns six passages, diversified across books when other relevant books clear
the retrieval threshold. This first slice validates OCR, navigation, ranking
presentation, scan anchoring, and curated links without an API dependency.

Semantic search is an optional enhancement. When enabled, free-text search uses
one bounded embedding request:

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
- If embeddings are unavailable, disabled, rate-limited, or over budget, return
  lexical results without blocking the reader.
- Cache normalized queries for the session. Never send clicks on curated terms
  to the API.

Before measuring retrieval quality, Ben writes or approves forty representative
queries without seeing the system's rankings. Preserve those queries as a
versioned evaluation set. Generated queries may supplement diagnostics but may
not define the acceptance score.

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

Run each term through lexical retrieval at build time, with optional dense
reranking after semantic search exists. An editor confirms one primary passage;
retain the next five reviewed results. A term may not publish without a valid
primary passage, scan anchor, and page mapping.

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

## Implementation Milestones

Each milestone is testable and useful on its own. Do not allow the later corpus
or gameplay work to hold the reader plumbing hostage.

### 1. Four-book corpus and scan anchors

- Retire Bowditch and Dampier from the runtime package.
- Prepare Humboldt, Lyell, Juan and Ulloa, and Herschel from one OCR/geometry
  pipeline.
- Publish passage metadata, line rectangles, provenance, and the itemized size
  audit.

### 2. Scan-first Library and lexical search

- Implement the narrow book rail, collapsible results drawer, PDF overlay, and
  shared `openLibrary` action.
- Ship local lexical search and exact page navigation.
- Beta-test the feature without an embedding endpoint.

### 3. Darwin memory links

- Review the 150-term registry and its one-plus-five passage results.
- Link authored game prose conservatively and open curated passages without an
  API call.

### 4. Optional semantic retrieval

- Freeze the forty human-authored evaluation queries before tuning.
- Add the bounded embedding endpoint and hybrid ranking only if it materially
  improves the reviewed results.
- Preserve lexical-only operation as a first-class fallback and kill-switch
  state.

### 5. Generated-prose removal

- Treat narrator, Syms, examination, and assessment changes as a gameplay
  redesign with its own implementation and design review.
- This milestone does not block Library beta testing, but it must pass before a
  broad public release can claim the product contract in this document.

### 6. Grant corpus expansion

- Source, crop, OCR, review, compile, and compress Grant's sixty installments.
- Add Grant only after it independently clears provenance, anchor, retrieval,
  and budget checks.

## Generated-Prose Removal: Separate Public-Release Gate

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
- Every published passage has valid, in-bounds highlight rectangles derived from
  the OCR used by the runtime PDF.
- Sampled highlights cover the corresponding raw OCR on the mapped scan; no
  runtime fuzzy matching is required.
- The four-book reader, deep links, highlighting, and lexical search work without
  an API key.
- Hybrid retrieval equals or beats dense-only and lexical-only baselines and
  reaches at least 80% hit-at-6 on the forty versioned, human-authored
  natural-language queries before it becomes the default.
- All 150 memory terms have one primary and five valid related passages.
- Link tests cover longest matches, punctuation, plural aliases, overlaps,
  repeated terms, the two-link cap, and protected player text.
- Reader tests cover book switching, free search, lexical fallback, deep-linked
  pages, field notes, saved last pages, and the mobile drawer.
- Opening `/three` performs no PDF or embedding request. A memory-term click
  performs no model request. A typed search performs zero model requests in
  lexical-only mode and at most one in semantic mode.
- Production `/three` performs no generative-model calls, and disabled
  generative routes cannot contact a provider.
- The library package is at most 120 MiB and smaller than the current 177 MiB.
- The budget report names the byte cost of PDFs, passage metadata, anchor
  geometry, lexical index, vectors, and curated term data separately.

Run:

- `npm run check`
- `npm run three:e2e:smoke`
- `npm run asset:audit`
- targeted desktop and mobile screenshots
- `npm run build`

## Mockup References

- **Selected:** `mockups/library-scan-first.html`. Its narrow book rail,
  collapsible memory drawer, accessible labels, neutral separators, and
  scan-first layout are the implementation reference.
- **Superseded exploration:** `mockups/library-reader-first.html`. Its persistent
  wide sidebar remains useful for comparison but is not the implementation
  target.

The mockups are design probes, not runtime dependencies.
