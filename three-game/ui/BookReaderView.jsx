'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getReadableBook, getReadableBooks } from '../books/bookCatalog';
import { setTypingMode } from '../input/typingMode';
import {
  loadLibraryData,
  resolveMemoryTerm,
  searchLoadedLibrary,
} from '../library/libraryData';
import { tokenizeLibraryText } from '../library/searchCore';
import { useThreeGameStore } from '../store';
import { useDismissableOverlay } from './useDismissableOverlay';

// Used only until the spread has been measured; every book then renders at the
// scale that fits its own leaf into the space available. The old fixed 1.08 took
// no account of page size, so Herschel's 311pt leaf drew 336px wide inside a
// 453px slot — half the room, and 30% of a 600 ppi scan — while Lyell's 592pt
// leaf overflowed the same slot into a scrollbar.
const FALLBACK_FIT_SCALE = 1.08;
// Slack for the leaf's own padding and drop shadow. Kept small: every pixel here
// is a pixel not spent on the type.
const LEAF_MARGIN_PX = 16;
const MIN_ZOOM = 0.7;
// Zoom now multiplies the fitted scale rather than a fixed one, so a high
// ceiling is what makes the 300-600 ppi scans worth having.
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.2;
// Rasterizing on every zoom press re-ran pdf.js for both leaves and flashed
// "Turning page..." mid-gesture. Instead each leaf is rasterized at one of these
// levels and CSS-scaled between them, so zooming is instant and only crosses a
// re-render when it passes a level boundary.
const RASTER_LEVELS = [1, 1.5, 2.25, MAX_ZOOM];
// Budgeted in pixels rather than pages: at full zoom on a large leaf one canvas
// is over 40 MB of backing store, so counting pages would let a handful of them
// hold a few hundred megabytes.
const PAGE_CACHE_PIXEL_BUDGET = 26e6;

function rasterLevelForZoom(zoom) {
  return RASTER_LEVELS.find(level => zoom <= level + 0.001) || RASTER_LEVELS.at(-1);
}

function rasterPixelRatio() {
  if (typeof window === 'undefined') return 1;
  return Math.min(window.devicePixelRatio || 1, 2);
}

function createPageCache() {
  return { entries: new Map(), pending: new Map() };
}

// The scanned area actually worth showing, in page-normalized coordinates. The
// builder measures it from each volume's text layer; a null means show it whole.
function cropKey(crop) {
  return crop ? `${crop.x},${crop.y},${crop.width},${crop.height}` : 'full';
}

function pageCacheKey(pageNumber, rasterZoom, fitScale, crop) {
  return `${pageNumber}:${rasterZoom}:${fitScale}:${cropKey(crop)}:${rasterPixelRatio()}`;
}

function peekRenderedPage(cache, pageNumber, rasterZoom, fitScale, crop) {
  return cache.entries.get(pageCacheKey(pageNumber, rasterZoom, fitScale, crop)) || null;
}

// Highlight rects arrive normalized to the whole leaf; once the leaf is cropped
// they have to be restated against the visible window or they land in the wrong
// place — the underline is the reader's proof that a result is really on the page.
function rectWithinCrop([x, y, width, height], crop) {
  if (!crop) return [x, y, width, height];
  return [
    (x - crop.x) / crop.width,
    (y - crop.y) / crop.height,
    width / crop.width,
    height / crop.height,
  ];
}

function releasePageCache(cache) {
  for (const entry of cache.entries.values()) {
    entry.canvas.width = 0;
    entry.canvas.height = 0;
  }
  cache.entries.clear();
  cache.pending.clear();
}

// Renders a leaf once and keeps the canvas element itself, so turning back to a
// page already read re-attaches a bitmap instead of rasterizing it again.
function loadRenderedPage(cache, pdf, pageNumber, rasterZoom, fitScale, crop) {
  const key = pageCacheKey(pageNumber, rasterZoom, fitScale, crop);
  const cached = cache.entries.get(key);
  if (cached) {
    cache.entries.delete(key);
    cache.entries.set(key, cached);
    return Promise.resolve(cached);
  }
  const inFlight = cache.pending.get(key);
  if (inFlight) return inFlight;

  const pixelRatio = rasterPixelRatio();
  const task = (async () => {
    const pdfPage = await pdf.getPage(pageNumber);
    const scale = fitScale * rasterZoom * pixelRatio;
    const full = pdfPage.getViewport({ scale });
    // Render the cropped window by sizing the canvas to it and shifting the page
    // transform, rather than drawing the whole leaf and scaling it away.
    const offsetX = crop ? crop.x * full.width : 0;
    const offsetY = crop ? crop.y * full.height : 0;
    const cropWidth = crop ? crop.width * full.width : full.width;
    const cropHeight = crop ? crop.height * full.height : full.height;
    const viewport = crop
      ? pdfPage.getViewport({ scale, offsetX: -offsetX, offsetY: -offsetY })
      : full;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(cropWidth));
    canvas.height = Math.max(1, Math.floor(cropHeight));
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('aria-label', `Scanned page ${pageNumber}`);
    const context = canvas.getContext('2d', { alpha: false });
    await pdfPage.render({ canvasContext: context, viewport }).promise;
    const entry = {
      canvas,
      mounted: false,
      // Size at zoom 1, independent of which raster level produced it.
      unitWidth: cropWidth / (pixelRatio * rasterZoom),
      unitHeight: cropHeight / (pixelRatio * rasterZoom),
    };
    cache.entries.set(key, entry);
    let bytesInCache = 0;
    for (const candidate of cache.entries.values()) {
      bytesInCache += candidate.canvas.width * candidate.canvas.height;
    }
    for (const [candidateKey, candidate] of cache.entries) {
      if (bytesInCache <= PAGE_CACHE_PIXEL_BUDGET) break;
      if (candidate.mounted) continue;
      bytesInCache -= candidate.canvas.width * candidate.canvas.height;
      // Zeroing the canvas hands the backing store back; dropping the map entry
      // alone leaves tens of megabytes to the whim of the GC.
      candidate.canvas.width = 0;
      candidate.canvas.height = 0;
      cache.entries.delete(candidateKey);
    }
    return entry;
  })();
  cache.pending.set(key, task);
  task.catch(() => {}).then(() => cache.pending.delete(key));
  return task;
}

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Marks the searched words inside a result snippet: without it the player gets
// 245 characters of OCR with no visual account of why it matched.
function highlightSnippet(text, tokens) {
  if (!tokens.length) return text;
  const pattern = new RegExp(`(${tokens.map(escapeForRegExp).join('|')})`, 'gi');
  const parts = text.split(pattern);
  return parts.map((part, index) => (
    index % 2 === 1
      ? <mark key={`${part}-${index}`} className="bg-[#c7a35d]/38 text-[#fbf1d8]">{part}</mark>
      : part
  ));
}

function PdfPage({ cache, pdf, pageNumber, zoom, rasterZoom, fitScale, crop, singlePage, highlightAnchor }) {
  const holderRef = useRef(null);
  const entryRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [unitSize, setUnitSize] = useState({ width: 0, height: 0 });
  const renderable = Boolean(pdf && pageNumber && pageNumber <= (pdf.numPages || 0));

  useEffect(() => {
    if (!cache || !renderable) return undefined;
    let cancelled = false;
    const apply = entry => {
      if (cancelled || !holderRef.current) return;
      if (entryRef.current && entryRef.current !== entry) entryRef.current.mounted = false;
      entry.mounted = true;
      entryRef.current = entry;
      holderRef.current.replaceChildren(entry.canvas);
      setUnitSize({ width: entry.unitWidth, height: entry.unitHeight });
      setStatus('ready');
    };
    const cached = peekRenderedPage(cache, pageNumber, rasterZoom, fitScale, crop);
    if (cached) {
      apply(cached);
      return () => { cancelled = true; };
    }
    setStatus('loading');
    loadRenderedPage(cache, pdf, pageNumber, rasterZoom, fitScale, crop)
      .then(apply)
      .catch(error => {
        if (cancelled || error?.name === 'RenderingCancelledException') return;
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [cache, pdf, pageNumber, rasterZoom, fitScale, crop, renderable]);

  useEffect(() => () => {
    if (entryRef.current) entryRef.current.mounted = false;
  }, []);

  if (!renderable) {
    return <div className={`min-h-0 grow basis-1/2 bg-[#e7dcc0] ${singlePage ? 'hidden' : ''}`} />;
  }

  const rects = highlightAnchor?.pdfPage === pageNumber
    ? highlightAnchor.highlightRects || []
    : [];
  return (
    <figure className={`relative flex min-h-0 shrink-0 grow items-start justify-center bg-[#d9ccb0] p-1 sm:p-1.5 ${singlePage ? 'w-full' : 'basis-1/2'}`}>
      {status === 'loading' && <div className="absolute inset-0 grid place-items-center font-expedition text-sm text-[#614c32]">Turning page...</div>}
      {status === 'error' && <div className="absolute inset-0 grid place-items-center font-expedition text-sm text-[#7b3026]">This leaf could not be rendered.</div>}
      <div
        data-scan-status={status}
        className={`relative shrink-0 self-start shadow-[0_6px_18px_rgba(56,39,20,0.24)] transition-opacity duration-200 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
        style={{
          width: unitSize.width ? Math.round(unitSize.width * zoom) : undefined,
          height: unitSize.height ? Math.round(unitSize.height * zoom) : undefined,
        }}
      >
        <div ref={holderRef} className="h-full w-full" />
        {status === 'ready' && rects.length > 0 && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {rects.map((rect, index) => {
              const [x, y, width, height] = rectWithinCrop(rect, crop);
              if (x + width <= 0 || y + height <= 0 || x >= 1 || y >= 1) return null;
              return (
                <span
                  key={`${x}-${y}-${index}`}
                  data-testid="library-highlight"
                  className="absolute border-b-2 border-[#9b3f27] bg-[#d9a936]/30 mix-blend-multiply"
                  style={{
                    left: `${x * 100}%`,
                    top: `${y * 100}%`,
                    width: `${width * 100}%`,
                    height: `${height * 100}%`,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
      <figcaption className="absolute bottom-1 right-2 font-expedition text-[11px] text-[#756148]">{pageNumber}</figcaption>
    </figure>
  );
}

// Lighten (positive) or darken (negative) a hex colour, so each volume's leather
// can be lit and shaded from the one cover colour the catalogue gives us.
function shadeHex(hex, amount) {
  const raw = String(hex || '').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map(character => character + character).join('') : raw;
  if (full.length !== 6) return hex;
  const channels = [0, 2, 4].map(offset => {
    const value = Number.parseInt(full.slice(offset, offset + 2), 16);
    const shifted = amount >= 0
      ? value + (255 - value) * amount
      : value * (1 + amount);
    return Math.round(Math.min(255, Math.max(0, shifted)));
  });
  return `rgb(${channels.join(', ')})`;
}

// A bound volume standing in the rail, but built out of the panel's own navy
// rather than a picture of leather.
//
// Three passes to get here. Full skeuomorphism — tooled morocco, raised bands, a
// paper fore-edge — was noise at 44 pixels, and showing a spine and a front cover
// at once made no sense as an object. Retreating to a flat labelled card was just
// the original again. What carries the object is depth rather than texture: a
// rounded binding down the fore side, two bands catching the light, one gilt rule,
// a sheen across the boards, and a shadow that puts the book above the rail. The
// boards keep the navy, tinted only enough to tell the volumes apart.
function BookCard({ book, active, onSelect }) {
  const gold = book.coverAccent || '#d7bd78';
  const cloth = book.cover || '#4e3d28';
  return (
    <button
      type="button"
      onClick={() => onSelect(book)}
      title={`${book.author}: ${book.shortTitle}`}
      aria-label={`Read ${book.shortTitle}`}
      aria-current={active ? 'page' : undefined}
      className="relative mx-auto mb-2.5 block h-[68px] w-12 rounded-[2px_4px_4px_2px] transition-[filter] duration-150 hover:brightness-[1.12] focus-visible:outline-none focus-visible:brightness-[1.12] sm:h-[76px] sm:w-[52px]"
      style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' }}
    >
      {/* Boards: the panel's navy, lit from the upper left, with a whisper of the
          volume's own colour so four books are not four identical cards. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-[2px_4px_4px_2px]"
        style={{
          background: [
            'linear-gradient(122deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.03) 26%, rgba(0,0,0,0) 54%, rgba(0,0,0,0.26) 100%)',
            `linear-gradient(180deg, ${shadeHex(cloth, -0.55)} 0%, ${shadeHex(cloth, -0.68)} 100%)`,
            'linear-gradient(0deg, rgba(8,13,23,0.78), rgba(8,13,23,0.78))',
          ].join(', '),
          boxShadow: active
            ? `inset 0 0 0 1px #d4b366, inset 0 1px 0 rgba(255,255,255,0.16), 0 0 10px ${gold}33`
            : 'inset 0 0 0 1px rgba(132,112,74,0.6), inset 0 1px 0 rgba(255,255,255,0.10)',
        }}
      />
      {/* The binding, rounded off towards the joint. */}
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 top-0 w-[8px] rounded-l-[2px]"
        style={{
          background: `linear-gradient(90deg, ${shadeHex(cloth, -0.28)} 0%, ${shadeHex(cloth, 0.12)} 38%, ${cloth} 62%, ${shadeHex(cloth, -0.52)} 100%)`,
        }}
      />
      {/* Two bands, catching the same light as the boards. */}
      {[0.26, 0.68].map(position => (
        <span
          key={position}
          aria-hidden="true"
          className="absolute left-0 h-[5px] w-[8px]"
          style={{
            top: `${position * 100}%`,
            background: `linear-gradient(180deg, rgba(255,255,255,0.26) 0%, ${shadeHex(cloth, 0.06)} 42%, rgba(0,0,0,0.44) 100%)`,
          }}
        />
      ))}
      {/* One gilt rule, blind-tooled on the front board. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-[4px] left-[12px] right-[4px] rounded-[1px]"
        style={{ boxShadow: `inset 0 0 0 1px ${gold}${active ? '99' : '4d'}` }}
      />
      <span
        className="absolute inset-y-0 left-[8px] right-0 grid place-items-center font-expedition text-[13px] font-semibold leading-none sm:text-[14px]"
        style={{
          color: active ? '#f6e6ba' : shadeHex(gold, -0.14),
          letterSpacing: '0.05em',
          textShadow: '0 1px 0 rgba(0,0,0,0.72), 0 -1px 0 rgba(255,255,255,0.12)',
        }}
      >
        {book.railLabel}
      </span>
    </button>
  );
}

function PassageResult({ passage, book, active, queryTokens, onSelect }) {
  const snippet = passage.displayText.slice(0, 245);
  return (
    <button
      type="button"
      onClick={() => onSelect(passage)}
      className={`w-full border-b border-[#8b795c]/25 px-3 py-3 text-left transition-colors hover:bg-[#d2c29e]/22 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#c7a35d] ${active ? 'bg-[#c7a35d]/14 shadow-[-3px_0_0_#c7a35d_inset]' : ''}`}
    >
      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c9a866]">
        {book?.shortTitle || passage.bookId} · {passage.printedPage ? `p. ${passage.printedPage}` : `scan ${passage.pdfPage}`}
      </span>
      <span className="mt-1.5 block font-expedition text-[15px] leading-[1.38] text-[#e7dcc2]">
        {highlightSnippet(snippet, queryTokens)}{passage.displayText.length > 245 ? '…' : ''}
      </span>
      {active && book && (
        <span className="mt-2 block text-[12px] leading-snug text-[#a99a7d]">
          {book.author} · {book.edition}<br />{book.provenance}
        </span>
      )}
    </button>
  );
}

export function BookReaderView() {
  const session = useThreeGameStore(state => state.readableBookSession);
  const bookLastPages = useThreeGameStore(state => state.bookLastPages);
  const closeReadableBook = useThreeGameStore(state => state.closeReadableBook);
  const setReadableBookPage = useThreeGameStore(state => state.setReadableBookPage);
  const saveReadableBookNote = useThreeGameStore(state => state.saveReadableBookNote);
  const updateLibrarySession = useThreeGameStore(state => state.updateLibrarySession);
  const [library, setLibrary] = useState(null);
  const [libraryStatus, setLibraryStatus] = useState('idle');
  const [pdf, setPdf] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfAttempt, setPdfAttempt] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rasterZoom, setRasterZoom] = useState(1);
  const [query, setQuery] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [results, setResults] = useState([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [searched, setSearched] = useState(false);
  const [scopeToBook, setScopeToBook] = useState(false);
  const [activePassage, setActivePassage] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [printedPageInput, setPrintedPageInput] = useState('');
  const [jumpNotice, setJumpNotice] = useState('');
  const [singlePage, setSinglePage] = useState(false);
  const [visible, setVisible] = useState(false);
  const [spreadSize, setSpreadSize] = useState({ width: 0, height: 0 });
  const [pageSize, setPageSize] = useState(null);
  const paneRef = useRef(null);
  const resolvedRequestRef = useRef('');
  const books = useMemo(() => getReadableBooks(), []);
  const book = session ? getReadableBook(session.bookId) || books[0] : null;
  // One cache per volume: the canvases belong to that document, and switching
  // books must hand their backing stores back.
  const pageCache = useMemo(() => (pdf ? createPageCache() : null), [pdf]);

  useEffect(() => {
    if (!pageCache) return undefined;
    return () => releasePageCache(pageCache);
  }, [pageCache]);

  // Text inputs inside the reader flip typing mode so WASD types instead of
  // walking. Closing the library removes the focused input from the DOM, which
  // fires no blur in Chrome — without this the flag stuck on and gameplay keys
  // stayed dead after the player put the book down.
  useEffect(() => {
    if (!session) setTypingMode(false);
  }, [session]);
  useEffect(() => () => setTypingMode(false), []);

  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    setLibraryStatus('loading');
    loadLibraryData()
      .then(payload => {
        if (cancelled) return;
        setLibrary(payload);
        setLibraryStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setLibraryStatus('error');
        setError('The searchable catalogue could not be opened.');
      });
    return () => {
      cancelled = true;
    };
  }, [session?.openedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!book || !session) return undefined;
    const initialPage = session.pdfPage || bookLastPages[book.id] || book.startPage || 1;
    setPage(initialPage);
    setZoom(1);
    setRasterZoom(1);
    setNote('');
    setNoteOpen(false);
    setDrawerOpen(session.drawerOpen !== false);
    setQuery(session.query || '');
    setSearchedQuery(session.query || '');
    setResults([]);
    setResultTotal(0);
    setSearched(false);
    setScopeToBook(false);
    setPrintedPageInput('');
    setJumpNotice('');
    setActivePassage(null);
    setVisible(false);
    resolvedRequestRef.current = '';
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [session?.openedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!library || !session) return;
    const requestKey = `${session.openedAt}:${session.termId || ''}:${session.passageId || ''}`;
    if (resolvedRequestRef.current === requestKey) return;
    resolvedRequestRef.current = requestKey;

    if (session.termId) {
      const resolved = resolveMemoryTerm(library, session.termId);
      if (resolved?.passages.length) {
        setQuery(resolved.term.label);
        setSearchedQuery(resolved.term.label);
        setResults(resolved.passages);
        setResultTotal(resolved.passages.length);
        setSearched(true);
        setActivePassage(resolved.passages[0]);
        setPage(resolved.passages[0].pdfPage);
        updateLibrarySession?.({
          bookId: resolved.passages[0].bookId,
          pdfPage: resolved.passages[0].pdfPage,
          passageId: resolved.passages[0].id,
          resultIds: resolved.passages.map(passage => passage.id),
          query: resolved.term.label,
        });
      }
      return;
    }
    const passage = session.passageId ? library.passagesById.get(session.passageId) : null;
    if (passage) {
      setActivePassage(passage);
      setPage(passage.pdfPage);
      // This branch also fires straight after a search, because searching writes
      // the chosen passage back to the session. Only genuinely empty state gets
      // restored from resultIds — otherwise it would overwrite the match count
      // with the six results on screen and report "6 of 6" for a shelf-wide hit.
      const restored = (session.resultIds || []).map(id => library.passagesById.get(id)).filter(Boolean);
      setResults(previous => (previous.length ? previous : restored));
      setResultTotal(previous => (previous || restored.length));
      setSearched(previous => previous || restored.length > 0);
    }
  }, [library, session, updateLibrarySession]);

  useEffect(() => {
    if (!book) return undefined;
    let disposed = false;
    let loadingTask = null;
    setPdf(null);
    setError('');
    setPdfLoading(true);
    import('pdfjs-dist/build/pdf.mjs')
      .then(pdfjs => {
        if (disposed) return null;
        pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
        loadingTask = pdfjs.getDocument({
          url: book.pdfPath,
          wasmUrl: '/vendor/',
          // The scans run to 48 MB. Left to itself pdf.js range-fetches the first
          // chunk and then quietly pulls the whole file down in the background;
          // these two keep it to the leaves actually being read.
          disableAutoFetch: true,
          rangeChunkSize: 262144,
        });
        return loadingTask.promise;
      })
      .then(documentProxy => {
        if (!documentProxy || disposed) return;
        setPdf(documentProxy);
        setPdfLoading(false);
      })
      .catch(error_ => {
        if (disposed) return;
        setPdfLoading(false);
        // These volumes are 24-48 MB read over range requests, so a dropped
        // connection, a restarted dev server, or a sleeping laptop all land here.
        // It used to be a dead end until the player switched books.
        setError(
          error_?.name === 'MissingPDFException'
            ? 'The scanned volume is missing from this build.'
            : 'The scanned volume could not be opened — the connection to the scan failed.',
        );
      });
    return () => {
      disposed = true;
      loadingTask?.destroy?.();
    };
  }, [book?.id, pdfAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // The leaf's natural size in points, taken from the volume's first page. Books
  // in this shelf run from a 311pt Herschel octavo to a 592pt Lyell quarto, which
  // is why one fixed render scale could not serve them.
  useEffect(() => {
    if (!pdf) {
      setPageSize(null);
      return undefined;
    }
    let cancelled = false;
    pdf.getPage(1)
      .then(page => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        setPageSize({ width: viewport.width, height: viewport.height });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pdf]);

  // Measure the pane, never the book block. The block is sized by the leaves and
  // the leaves are sized from this measurement, so observing the block would feed
  // the fit its own output.
  useEffect(() => {
    const element = paneRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSpreadSize({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
    // The pane only exists while the reader is open, so this has to re-attach
    // each time it opens; with an empty dependency list the ref was still null
    // and every book silently rendered at the fallback scale.
  }, [session?.openedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom responds immediately in CSS; crossing a raster level settles after the
  // gesture stops so a run of + presses rasterizes once, not five times.
  useEffect(() => {
    const target = rasterLevelForZoom(zoom);
    if (target === rasterZoom) return undefined;
    const timer = window.setTimeout(() => setRasterZoom(target), 220);
    return () => window.clearTimeout(timer);
  }, [zoom, rasterZoom]);

  useEffect(() => {
    const update = () => setSinglePage(window.matchMedia('(max-width: 900px)').matches);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Escape must put down an open field note before it closes the whole library,
  // otherwise the draft disappears with no warning.
  const dismiss = useCallback(() => {
    if (noteOpen) {
      setNoteOpen(false);
      setTypingMode(false);
      return;
    }
    closeReadableBook();
  }, [closeReadableBook, noteOpen]);
  const readerRef = useDismissableOverlay(Boolean(book), dismiss, { autoFocus: false });

  const manifestBook = useMemo(
    () => library?.manifest?.books?.find(entry => entry.id === book?.id) || null,
    [library, book?.id],
  );
  // Trim the cradle, gutter, and blank margins the scanner captured. Measured per
  // volume by the corpus builder from where the type actually falls, and per
  // verso/recto because the gutter changes sides between them.
  const cropForPage = useCallback(pageNumber => {
    if (!manifestBook) return null;
    const byParity = manifestBook.contentCropByParity;
    if (byParity) return byParity[pageNumber % 2] || manifestBook.contentCrop || null;
    return manifestBook.contentCrop || null;
  }, [manifestBook]);
  // The fit has to satisfy whichever leaf needs the most room, or the wider of
  // the two would overflow its slot.
  const fitCrop = useMemo(() => {
    const crops = [manifestBook?.contentCropByParity?.[0], manifestBook?.contentCropByParity?.[1], manifestBook?.contentCrop]
      .filter(Boolean);
    if (!crops.length) return null;
    return {
      width: Math.max(...crops.map(crop => crop.width)),
      height: Math.max(...crops.map(crop => crop.height)),
    };
  }, [manifestBook]);
  // The cropped leaf, filling whatever room the spread has at zoom 1. Rounded so
  // that dragging a window edge does not mint a new cache key — and a new raster
  // — for every intermediate pixel.
  const fitScale = useMemo(() => {
    if (!pageSize?.width || !spreadSize.width) return FALLBACK_FIT_SCALE;
    const leaves = singlePage ? 1 : 2;
    const visibleWidth = pageSize.width * (fitCrop?.width || 1);
    const visibleHeight = pageSize.height * (fitCrop?.height || 1);
    const slotWidth = Math.max(80, spreadSize.width / leaves - LEAF_MARGIN_PX);
    const slotHeight = Math.max(80, spreadSize.height - LEAF_MARGIN_PX);
    const fit = Math.min(slotWidth / visibleWidth, slotHeight / visibleHeight);
    return Math.round(Math.min(6, Math.max(0.25, fit)) * 100) / 100;
  }, [pageSize, spreadSize, singlePage, fitCrop]);
  const totalPages = pdf?.numPages || 1;
  const pageStep = singlePage ? 1 : 2;
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  // A spread has to face the leaves the binder faced: `spreadLeftParity` records
  // which scan parity carries the even (verso) printed numbers.
  const leftParity = singlePage ? null : manifestBook?.spreadLeftParity;
  const leftPage = Number.isInteger(leftParity) && clampedPage % 2 !== leftParity
    ? Math.max(1, clampedPage - 1)
    : clampedPage;
  const rightPage = singlePage ? null : leftPage + 1;

  useEffect(() => {
    if (!pdf || !pageCache) return undefined;
    // Warm the spread either side while the player reads this one, so a turn
    // re-attaches a bitmap instead of waiting on pdf.js.
    const targets = [leftPage + pageStep, rightPage ? rightPage + pageStep : null, leftPage - pageStep]
      .filter(target => Number.isInteger(target) && target >= 1 && target <= totalPages);
    const schedule = window.requestIdleCallback || (callback => window.setTimeout(callback, 260));
    const cancel = window.cancelIdleCallback || window.clearTimeout;
    const handle = schedule(() => {
      for (const target of targets) {
        loadRenderedPage(pageCache, pdf, target, rasterZoom, fitScale, cropForPage(target)).catch(() => {});
      }
    });
    return () => cancel(handle);
  }, [pdf, pageCache, leftPage, rightPage, pageStep, rasterZoom, totalPages]);

  useEffect(() => {
    if (!book) return undefined;
    const onKeyDown = event => {
      if (event.target?.tagName === 'TEXTAREA' || event.target?.tagName === 'INPUT') return;
      if (event.key === 'ArrowLeft') setPage(value => Math.max(1, value - (singlePage ? 1 : 2)));
      if (event.key === 'ArrowRight') setPage(value => Math.min(pdf?.numPages || value, value + (singlePage ? 1 : 2)));
      if (event.key === '+' || event.key === '=') setZoom(value => Math.min(MAX_ZOOM, value + ZOOM_STEP));
      if (event.key === '-') setZoom(value => Math.max(MIN_ZOOM, value - ZOOM_STEP));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [book, pdf?.numPages, singlePage]);

  useEffect(() => {
    if (book) setReadableBookPage(book.id, page);
  }, [book, page, setReadableBookPage]);

  if (!book || !session) return null;
  const queryTokens = tokenizeLibraryText(searchedQuery || '');
  const turn = direction => {
    setActivePassage(null);
    setPage(Math.max(1, Math.min(totalPages, leftPage + direction * pageStep)));
  };
  const selectBook = nextBook => {
    setActivePassage(null);
    setResults([]);
    setResultTotal(0);
    setSearched(false);
    setQuery('');
    setSearchedQuery('');
    setJumpNotice('');
    setPage(bookLastPages[nextBook.id] || nextBook.startPage || 1);
    updateLibrarySession?.({
      bookId: nextBook.id,
      pdfPage: null,
      passageId: null,
      termId: null,
      query: '',
      resultIds: [],
    });
  };
  const selectPassage = passage => {
    setActivePassage(passage);
    setPage(passage.pdfPage);
    updateLibrarySession?.({
      bookId: passage.bookId,
      pdfPage: passage.pdfPage,
      passageId: passage.id,
      termId: null,
      resultIds: results.map(result => result.id),
    });
  };
  const submitSearch = event => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || !library) return;
    const { results: nextResults, total } = searchLoadedLibrary(library, trimmed, {
      limit: 6,
      bookId: scopeToBook ? book.id : null,
    });
    setResults(nextResults);
    setResultTotal(total);
    setSearched(true);
    setSearchedQuery(trimmed);
    setDrawerOpen(true);
    setActivePassage(nextResults[0] || null);
    if (nextResults[0]) setPage(nextResults[0].pdfPage);
    updateLibrarySession?.({
      bookId: nextResults[0]?.bookId || book.id,
      pdfPage: nextResults[0]?.pdfPage || null,
      passageId: nextResults[0]?.id || null,
      termId: null,
      query: trimmed,
      resultIds: nextResults.map(result => result.id),
      drawerOpen: true,
    });
  };
  const printedPageMap = manifestBook?.printedPageMap || null;
  const jumpToPrintedPage = event => {
    event.preventDefault();
    const label = printedPageInput.trim();
    if (!label) return;
    const target = printedPageMap?.[label]
      ?? printedPageMap?.[String(Number(label))]
      ?? printedPageMap?.[label.toLowerCase()];
    if (!target) {
      setJumpNotice(`No leaf in this volume is numbered ${label}.`);
      return;
    }
    setJumpNotice('');
    setActivePassage(null);
    setPage(target);
    setPrintedPageInput('');
  };
  const saveNote = () => {
    if (!note.trim()) return;
    saveReadableBookNote({
      bookId: book.id,
      page: leftPage,
      content: note,
      // The journal used to file every reading note under its scan number, so a
      // note from Lyell p. 214 was recorded as "page 231".
      printedPage: activePassage?.printedPage || null,
      citation: activePassage?.citation || null,
    });
    setNote('');
    setNoteOpen(false);
    setTypingMode(false);
  };
  const scopeLabel = scopeToBook ? book.shortTitle : 'the shelf';

  return (
    <section
      ref={readerRef}
      data-testid="library-view"
      tabIndex={-1}
      className={`pointer-events-auto absolute inset-0 z-[1000] flex overflow-hidden bg-[#0d131f] font-expedition text-[#eadcb8] transition-opacity duration-300 focus:outline-none ${visible ? 'opacity-100' : 'opacity-0'}`}
      aria-label={`Darwin's library; reading ${book.title}`}
    >
      <nav className="z-50 flex w-[58px] shrink-0 flex-col border-r border-[#b89353]/55 bg-[#131b29] py-2 sm:w-[68px]" aria-label="Library books">
        <div className="mb-2 px-1 text-center text-[11px] font-semibold uppercase tracking-[0.11em] text-[#d6ba79]">Lib.</div>
        <button
          type="button"
          onClick={() => setDrawerOpen(value => !value)}
          aria-label={drawerOpen ? 'Hide catalogue drawer' : 'Show catalogue drawer'}
          aria-expanded={drawerOpen}
          className="mx-auto mb-2 h-9 w-10 border border-[#9a8155]/55 text-lg text-[#d6ba79] hover:bg-[#d6ba79]/10 lg:hidden"
        >
          {drawerOpen ? '‹' : '›'}
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {books.map(item => (
            <BookCard
              key={item.id}
              book={item}
              active={item.id === book.id}
              onSelect={selectBook}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(value => !value)}
          aria-label={drawerOpen ? 'Hide catalogue drawer' : 'Show catalogue drawer'}
          aria-expanded={drawerOpen}
          className="mx-auto mb-2 hidden h-10 w-10 border border-[#9a8155]/55 text-lg text-[#d6ba79] hover:bg-[#d6ba79]/10 lg:block"
        >
          {drawerOpen ? '‹' : '›'}
        </button>
      </nav>

      <aside className={`${drawerOpen ? 'w-[min(370px,calc(100vw-58px))]' : 'w-0'} absolute bottom-0 left-[58px] top-0 z-40 overflow-hidden border-r border-[#8f7445]/55 bg-[#172131] shadow-[12px_0_32px_rgba(0,0,0,0.42)] transition-[width] duration-200 sm:left-[68px] lg:relative lg:left-auto lg:shadow-none`}>
        <div className="flex h-full w-[min(370px,calc(100vw-58px))] flex-col sm:w-[370px]">
          <div className="border-b border-[#8b795c]/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#c8a762]">Search the original texts</div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="grid h-8 w-8 shrink-0 place-items-center border border-[#9a8155]/45 text-lg text-[#d6ba79] hover:bg-[#d6ba79]/10 lg:hidden" aria-label="Show scanned page">×</button>
            </div>
            <form onSubmit={submitSearch} className="mt-2 flex">
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                onFocus={() => setTypingMode(true)}
                onBlur={() => setTypingMode(false)}
                placeholder="coral reefs, extinction, observation…"
                aria-label="Search Darwin's library"
                className="h-11 min-w-0 flex-1 border border-r-0 border-[#9a8155]/55 bg-[#eee2c5] px-3 text-[15px] text-[#302719] outline-none placeholder:italic placeholder:text-[#7c6b50] focus:border-[#d0aa5e]"
              />
              <button type="submit" disabled={libraryStatus !== 'ready' || !query.trim()} className="h-11 border border-[#9a8155]/65 bg-[#796139] px-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#f0e3c6] disabled:opacity-45">Find</button>
            </form>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-[#b3a284]">
              <input
                type="checkbox"
                checked={scopeToBook}
                onChange={event => setScopeToBook(event.target.checked)}
                className="h-3.5 w-3.5 accent-[#b89353]"
              />
              This volume only
            </label>
            <p className="mt-2 text-[12px] leading-snug text-[#aa9b7f]">
              {libraryStatus === 'loading'
                ? 'Cataloguing the shelf…'
                : searched && results.length
                  ? `Showing ${results.length} of ${resultTotal} matching passage${resultTotal === 1 ? '' : 's'} in ${scopeLabel}.`
                  : 'Searches transcribed OCR; every result opens its scanned page.'}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {results.length ? results.map(passage => (
              <PassageResult
                key={passage.id}
                passage={passage}
                book={getReadableBook(passage.bookId)}
                active={activePassage?.id === passage.id}
                queryTokens={queryTokens}
                onSelect={selectPassage}
              />
            )) : searched ? (
              <div className="px-4 py-5 text-[14px] leading-relaxed text-[#b8aa8e]">
                No passage in {scopeLabel} matches <span className="italic text-[#e2d3ad]">{searchedQuery}</span>.
                {scopeToBook && ' Try clearing “This volume only”,'} {scopeToBook ? 'or search' : 'Search'} for a plainer word — the scans are period spelling, transcribed by machine.
              </div>
            ) : (
              <div className="px-4 py-5 text-[14px] leading-relaxed text-[#b8aa8e]">
                Search across the shelf, or follow an underlined memory from the field log. Results quote the historical source—not a modern answer.
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-10 items-center justify-between gap-3 border-b border-[#b89353]/40 bg-[#1b1b18] px-3 py-1 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-semibold leading-tight text-[#f0dfb3] sm:text-[16px]">{book.title}</h2>
            <p className="truncate text-[10px] leading-tight text-[#b9a887] sm:text-[11px]">{book.author} · {book.edition}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(value => Math.max(MIN_ZOOM, value - ZOOM_STEP))} className="h-7 w-7 border border-[#b89353]/50 bg-black/20 text-lg leading-none hover:bg-[#b89353]/15">−</button>
            <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(MAX_ZOOM, value + ZOOM_STEP))} className="h-7 w-7 border border-[#b89353]/50 bg-black/20 text-lg leading-none hover:bg-[#b89353]/15">+</button>
            <button type="button" onClick={() => setNoteOpen(value => !value)} className="hidden h-7 border border-[#b89353]/50 bg-black/20 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] hover:bg-[#b89353]/15 sm:block">Field note</button>
            <button type="button" title="Close library" aria-label="Close library" onClick={closeReadableBook} className="h-7 w-7 border border-[#b89353]/50 bg-black/20 text-base leading-none hover:bg-[#b89353]/15">×</button>
          </div>
        </header>

        {activePassage && (
          <div className="flex min-h-7 items-center justify-between gap-3 bg-[#efe2c1] px-3 py-1 text-[#4d3d27] shadow-[inset_0_-1px_0_rgba(90,68,36,0.22)] sm:px-5">
            <p className="min-w-0 truncate text-[12px] sm:text-[13px]">
              <span className="font-semibold">Matched passage:</span> {activePassage.citation}
            </p>
            <span className="hidden shrink-0 text-[11px] italic text-[#756044] sm:block">Underlining locates the OCR passage on the original scan.</span>
          </div>
        )}

        <div ref={paneRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#463723_0%,#221b13_56%,#100e0b_100%)] p-1 sm:p-2">
          {pdfLoading && <div className="grid flex-1 place-items-center text-sm text-[#d5bf8b]">Opening the scanned volume…</div>}
          {error && (
            <div className="grid flex-1 place-items-center px-6 text-center text-sm text-[#e4b09c]">
              <div>
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => { setError(''); setPdfAttempt(value => value + 1); }}
                  className="mt-3 border border-[#b89353]/60 bg-black/25 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-[#eadcb8] hover:bg-[#b89353]/15"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
          {pdf && (
            <div className={`relative flex max-h-full min-h-0 max-w-full overflow-hidden border border-[#8f7445]/65 bg-[#e7dcc0] shadow-[0_24px_70px_rgba(0,0,0,0.64)] ${singlePage ? '' : 'book-reader-spread'}`}>
              {/* One scroll container for the whole spread: a leaf that owned its
                  own scrollbar drifted out of step with the facing page. */}
              <div className="flex max-h-full max-w-full items-start overflow-auto">
                <PdfPage cache={pageCache} pdf={pdf} pageNumber={leftPage} zoom={zoom} rasterZoom={rasterZoom} fitScale={fitScale} crop={cropForPage(leftPage)} singlePage={singlePage} highlightAnchor={activePassage?.anchor} />
                {!singlePage && <PdfPage cache={pageCache} pdf={pdf} pageNumber={rightPage} zoom={zoom} rasterZoom={rasterZoom} fitScale={fitScale} crop={rightPage ? cropForPage(rightPage) : null} singlePage={false} highlightAnchor={activePassage?.anchor} />}
              </div>
              {!singlePage && <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-10 w-px bg-[#7b6648]/35 shadow-[0_0_14px_4px_rgba(74,52,29,0.22)]" />}
              <button type="button" aria-label="Previous page" title="Previous page" disabled={leftPage <= 1} onClick={() => turn(-1)} className="absolute bottom-0 left-0 top-0 z-20 w-12 bg-gradient-to-r from-[#3e2d1b]/25 to-transparent text-4xl text-[#5c452c] opacity-35 transition-opacity hover:opacity-100 disabled:opacity-0">&lt;</button>
              <button type="button" aria-label="Next page" title="Next page" disabled={leftPage >= totalPages} onClick={() => turn(1)} className="absolute bottom-0 right-0 top-0 z-20 w-12 bg-gradient-to-l from-[#3e2d1b]/25 to-transparent text-4xl text-[#5c452c] opacity-35 transition-opacity hover:opacity-100 disabled:opacity-0">&gt;</button>
            </div>
          )}
          {noteOpen && (
            <aside className="absolute bottom-4 right-4 top-4 z-40 flex w-[min(28rem,calc(100vw-2rem))] flex-col border border-[#b89353]/70 bg-[#f0e5c7] p-4 text-[#473621] shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#79603a]">
                Field journal · {activePassage?.printedPage ? `printed p. ${activePassage.printedPage}` : `scanned page ${leftPage}`}
              </div>
              {activePassage && (
                <div className="mt-1 text-[12px] italic leading-snug text-[#7a6543]">{activePassage.citation}</div>
              )}
              <textarea value={note} onChange={event => setNote(event.target.value)} onFocus={() => setTypingMode(true)} onBlur={() => setTypingMode(false)} autoFocus placeholder="Record what in this passage bears upon your observations…" className="mt-3 min-h-0 flex-1 resize-none border-y border-[#856e48]/30 bg-transparent py-3 font-expedition text-[16px] leading-relaxed outline-none placeholder:italic placeholder:text-[#846f52]" />
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => { setNoteOpen(false); setTypingMode(false); }} className="border border-[#79603a]/50 px-3 py-2 text-xs font-semibold uppercase">Cancel</button>
                <button type="button" disabled={!note.trim()} onClick={saveNote} className="border border-[#5f492b] bg-[#5f492b] px-4 py-2 text-xs font-semibold uppercase text-[#f2e7c9] disabled:opacity-40">Enter in journal</button>
              </div>
            </aside>
          )}
        </div>

        <footer className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-[#b89353]/40 bg-[#1b1b18] px-3 py-1 sm:px-5">
          <span className="shrink-0 text-[11px] text-[#b9a887]">Scans {leftPage}{rightPage && rightPage <= totalPages ? `–${rightPage}` : ''} of {totalPages}</span>
          <input type="range" min="1" max={totalPages} step={1} value={leftPage} onChange={event => { setActivePassage(null); setPage(Number(event.target.value)); }} className="min-w-[8rem] flex-1 accent-[#b89353]" aria-label="Book page" />
          {printedPageMap && (
            <form onSubmit={jumpToPrintedPage} className="flex shrink-0 items-center gap-1" title={jumpNotice || 'Jump to a printed page number'}>
              <label htmlFor="library-printed-page" className="text-[11px] uppercase tracking-[0.07em] text-[#b9a887]">p.</label>
              <input
                id="library-printed-page"
                value={printedPageInput}
                onChange={event => { setPrintedPageInput(event.target.value); setJumpNotice(''); }}
                onFocus={() => setTypingMode(true)}
                onBlur={() => setTypingMode(false)}
                inputMode="numeric"
                placeholder="214"
                aria-label="Go to printed page"
                className={`h-7 w-16 border bg-[#eee2c5] px-2 text-[13px] text-[#302719] outline-none ${jumpNotice ? 'border-[#a4553f]' : 'border-[#9a8155]/55'}`}
              />
              <button type="submit" className="h-7 border border-[#9a8155]/65 bg-[#796139] px-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#f0e3c6]">Go</button>
            </form>
          )}
          <a href={book.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] uppercase tracking-[0.07em] text-[#cdb77f] underline decoration-[#cdb77f]/40 underline-offset-4">Source edition</a>
          {jumpNotice && <span className="w-full text-[11px] text-[#e0a58f] sm:w-auto">{jumpNotice}</span>}
        </footer>
      </div>
    </section>
  );
}
