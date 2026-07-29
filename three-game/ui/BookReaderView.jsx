'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getReadableBook, getReadableBooks } from '../books/bookCatalog';
import { setTypingMode } from '../input/typingMode';
import {
  loadLibraryData,
  resolveMemoryTerm,
  searchLoadedLibrary,
} from '../library/libraryData';
import { useThreeGameStore } from '../store';
import { useDismissableOverlay } from './useDismissableOverlay';

function PdfPage({ pdf, pageNumber, zoom, singlePage, highlightAnchor }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!pdf || !pageNumber || pageNumber > pdf.numPages) return undefined;
    let cancelled = false;
    let renderTask = null;
    const render = async () => {
      setStatus('loading');
      try {
        const pdfPage = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
        const viewport = pdfPage.getViewport({ scale: 1.08 * zoom * pixelRatio });
        const width = Math.floor(viewport.width / pixelRatio);
        const height = Math.floor(viewport.height / pixelRatio);
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        setDisplaySize({ width, height });
        const context = canvas.getContext('2d', { alpha: false });
        renderTask = pdfPage.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (!cancelled) setStatus('ready');
      } catch (error) {
        if (error?.name !== 'RenderingCancelledException' && !cancelled) setStatus('error');
      }
    };
    render();
    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [pageNumber, pdf, zoom]);

  if (!pageNumber || pageNumber > (pdf?.numPages || 0)) {
    return <div className="hidden min-h-0 flex-1 bg-[#e7dcc0] md:block" />;
  }

  const rects = highlightAnchor?.pdfPage === pageNumber
    ? highlightAnchor.highlightRects || []
    : [];
  return (
    <figure className={`relative flex min-h-0 ${singlePage ? 'w-full' : 'w-1/2'} justify-center overflow-auto bg-[#d9ccb0] p-2 sm:p-4`}>
      {status === 'loading' && <div className="absolute inset-0 grid place-items-center font-expedition text-sm text-[#614c32]">Turning page...</div>}
      {status === 'error' && <div className="absolute inset-0 grid place-items-center font-expedition text-sm text-[#7b3026]">This leaf could not be rendered.</div>}
      <div
        className="relative shrink-0 self-start shadow-[0_6px_18px_rgba(56,39,20,0.24)]"
        style={{ width: displaySize.width || undefined, height: displaySize.height || undefined }}
      >
        <canvas
          ref={canvasRef}
          aria-label={`Scanned page ${pageNumber}`}
          className={`block transition-opacity duration-200 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
        />
        {status === 'ready' && rects.length > 0 && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {rects.map((rect, index) => (
              <span
                key={`${rect.x}-${rect.y}-${index}`}
                data-testid="library-highlight"
                className="absolute border-b-2 border-[#9b3f27] bg-[#d9a936]/30 mix-blend-multiply"
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                }}
              />
            ))}
          </div>
        )}
      </div>
      <figcaption className="absolute bottom-1 right-2 font-expedition text-[11px] text-[#756148]">{pageNumber}</figcaption>
    </figure>
  );
}

function PassageResult({ passage, book, active, onSelect }) {
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
        {passage.displayText.slice(0, 245)}{passage.displayText.length > 245 ? '…' : ''}
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
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [activePassage, setActivePassage] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [singlePage, setSinglePage] = useState(false);
  const [visible, setVisible] = useState(false);
  const resolvedRequestRef = useRef('');
  const books = useMemo(() => getReadableBooks(), []);
  const book = session ? getReadableBook(session.bookId) || books[0] : null;

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
    setNote('');
    setNoteOpen(false);
    setDrawerOpen(session.drawerOpen !== false);
    setQuery(session.query || '');
    setResults([]);
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
        setResults(resolved.passages);
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
      setResults((session.resultIds || []).map(id => library.passagesById.get(id)).filter(Boolean));
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
        });
        return loadingTask.promise;
      })
      .then(documentProxy => {
        if (!documentProxy || disposed) return;
        setPdf(documentProxy);
        setPdfLoading(false);
      })
      .catch(() => {
        if (disposed) return;
        setPdfLoading(false);
        setError('The scanned volume could not be opened.');
      });
    return () => {
      disposed = true;
      loadingTask?.destroy?.();
    };
  }, [book?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const update = () => setSinglePage(window.matchMedia('(max-width: 900px)').matches);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const readerRef = useDismissableOverlay(Boolean(book), closeReadableBook, { autoFocus: false });

  useEffect(() => {
    if (!book) return undefined;
    const onKeyDown = event => {
      if (event.target?.tagName === 'TEXTAREA' || event.target?.tagName === 'INPUT') return;
      if (event.key === 'ArrowLeft') setPage(value => Math.max(1, value - (singlePage ? 1 : 2)));
      if (event.key === 'ArrowRight') setPage(value => Math.min(pdf?.numPages || value, value + (singlePage ? 1 : 2)));
      if (event.key === '+' || event.key === '=') setZoom(value => Math.min(1.75, value + 0.15));
      if (event.key === '-') setZoom(value => Math.max(0.7, value - 0.15));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [book, pdf?.numPages, singlePage]);

  useEffect(() => {
    if (book) setReadableBookPage(book.id, page);
  }, [book, page, setReadableBookPage]);

  if (!book || !session) return null;
  const pageStep = singlePage ? 1 : 2;
  const rightPage = singlePage ? null : page + 1;
  const totalPages = pdf?.numPages || 1;
  const turn = direction => {
    setActivePassage(null);
    setPage(value => Math.max(1, Math.min(totalPages, value + direction * pageStep)));
  };
  const selectBook = nextBook => {
    setActivePassage(null);
    setResults([]);
    setQuery('');
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
    const nextResults = searchLoadedLibrary(library, trimmed, 6);
    setResults(nextResults);
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
  const saveNote = () => {
    if (!note.trim()) return;
    saveReadableBookNote({ bookId: book.id, page, content: note });
    setNote('');
    setNoteOpen(false);
    setTypingMode(false);
  };

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
            <button
              key={item.id}
              type="button"
              onClick={() => selectBook(item)}
              title={`${item.author}: ${item.shortTitle}`}
              aria-label={`Read ${item.shortTitle}`}
              aria-current={item.id === book.id ? 'page' : undefined}
              className={`mx-auto mb-2 grid h-16 w-11 place-items-center border px-1 text-center text-[12px] font-semibold leading-tight transition-colors sm:h-[72px] sm:w-12 ${item.id === book.id ? 'border-[#d4b366] bg-[#d4b366]/18 text-[#f2dfae]' : 'border-[#84704a]/55 bg-black/20 text-[#ad9c79] hover:border-[#bca36c] hover:text-[#e3d1a5]'}`}
              style={{ boxShadow: `inset 4px 0 0 ${item.cover}` }}
            >
              {item.railLabel}
            </button>
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
            <p className="mt-2 text-[12px] leading-snug text-[#aa9b7f]">
              {libraryStatus === 'loading' ? 'Cataloguing the shelf…' : 'Searches transcribed OCR; every result opens its scanned page.'}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {results.length ? results.map(passage => (
              <PassageResult
                key={passage.id}
                passage={passage}
                book={getReadableBook(passage.bookId)}
                active={activePassage?.id === passage.id}
                onSelect={selectPassage}
              />
            )) : (
              <div className="px-4 py-5 text-[14px] leading-relaxed text-[#b8aa8e]">
                Search across the shelf, or follow an underlined memory from the field log. Results quote the historical source—not a modern answer.
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[#b89353]/40 bg-[#1b1b18] px-3 py-2 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-[#f0dfb3] sm:text-[18px]">{book.title}</h2>
            <p className="truncate text-[11px] text-[#b9a887] sm:text-[12px]">{book.author} · {book.edition}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(value => Math.max(0.7, value - 0.15))} className="h-9 w-9 border border-[#b89353]/50 bg-black/20 text-xl hover:bg-[#b89353]/15">−</button>
            <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(1.75, value + 0.15))} className="h-9 w-9 border border-[#b89353]/50 bg-black/20 text-xl hover:bg-[#b89353]/15">+</button>
            <button type="button" onClick={() => setNoteOpen(value => !value)} className="hidden h-9 border border-[#b89353]/50 bg-black/20 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-[#b89353]/15 sm:block">Field note</button>
            <button type="button" title="Close library" aria-label="Close library" onClick={closeReadableBook} className="h-9 w-9 border border-[#b89353]/50 bg-black/20 text-lg hover:bg-[#b89353]/15">×</button>
          </div>
        </header>

        {activePassage && (
          <div className="flex min-h-9 items-center justify-between gap-3 bg-[#efe2c1] px-3 py-1.5 text-[#4d3d27] shadow-[inset_0_-1px_0_rgba(90,68,36,0.22)] sm:px-5">
            <p className="min-w-0 truncate text-[12px] sm:text-[13px]">
              <span className="font-semibold">Matched passage:</span> {activePassage.citation}
            </p>
            <span className="hidden shrink-0 text-[11px] italic text-[#756044] sm:block">Underlining locates the OCR passage on the original scan.</span>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#463723_0%,#221b13_56%,#100e0b_100%)] p-2 sm:p-4">
          {pdfLoading && <div className="grid flex-1 place-items-center text-sm text-[#d5bf8b]">Opening the scanned volume…</div>}
          {error && <div className="grid flex-1 place-items-center px-6 text-center text-sm text-[#e4b09c]">{error}</div>}
          {pdf && (
            <div className={`relative flex h-full min-h-0 w-full max-w-[106rem] overflow-hidden border border-[#8f7445]/65 bg-[#e7dcc0] shadow-[0_24px_70px_rgba(0,0,0,0.64)] ${singlePage ? '' : 'book-reader-spread'}`}>
              <PdfPage pdf={pdf} pageNumber={page} zoom={zoom} singlePage={singlePage} highlightAnchor={activePassage?.anchor} />
              {!singlePage && <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-10 w-px bg-[#7b6648]/35 shadow-[0_0_14px_4px_rgba(74,52,29,0.22)]" />}
              {!singlePage && <PdfPage pdf={pdf} pageNumber={rightPage} zoom={zoom} singlePage={false} highlightAnchor={activePassage?.anchor} />}
              <button type="button" aria-label="Previous page" title="Previous page" disabled={page <= 1} onClick={() => turn(-1)} className="absolute bottom-0 left-0 top-0 z-20 w-12 bg-gradient-to-r from-[#3e2d1b]/25 to-transparent text-4xl text-[#5c452c] opacity-35 transition-opacity hover:opacity-100 disabled:opacity-0">&lt;</button>
              <button type="button" aria-label="Next page" title="Next page" disabled={page >= totalPages} onClick={() => turn(1)} className="absolute bottom-0 right-0 top-0 z-20 w-12 bg-gradient-to-l from-[#3e2d1b]/25 to-transparent text-4xl text-[#5c452c] opacity-35 transition-opacity hover:opacity-100 disabled:opacity-0">&gt;</button>
            </div>
          )}
          {noteOpen && (
            <aside className="absolute bottom-4 right-4 top-4 z-40 flex w-[min(28rem,calc(100vw-2rem))] flex-col border border-[#b89353]/70 bg-[#f0e5c7] p-4 text-[#473621] shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#79603a]">Field journal · scanned page {page}</div>
              <textarea value={note} onChange={event => setNote(event.target.value)} onFocus={() => setTypingMode(true)} onBlur={() => setTypingMode(false)} autoFocus placeholder="Record what in this passage bears upon your observations…" className="mt-3 min-h-0 flex-1 resize-none border-y border-[#856e48]/30 bg-transparent py-3 font-expedition text-[16px] leading-relaxed outline-none placeholder:italic placeholder:text-[#846f52]" />
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => { setNoteOpen(false); setTypingMode(false); }} className="border border-[#79603a]/50 px-3 py-2 text-xs font-semibold uppercase">Cancel</button>
                <button type="button" disabled={!note.trim()} onClick={saveNote} className="border border-[#5f492b] bg-[#5f492b] px-4 py-2 text-xs font-semibold uppercase text-[#f2e7c9] disabled:opacity-40">Enter in journal</button>
              </div>
            </aside>
          )}
        </div>

        <footer className="flex min-h-12 items-center gap-3 border-t border-[#b89353]/40 bg-[#1b1b18] px-3 sm:px-5">
          <span className="shrink-0 text-[11px] text-[#b9a887]">Scans {page}{rightPage && rightPage <= totalPages ? `–${rightPage}` : ''} of {totalPages}</span>
          <input type="range" min="1" max={totalPages} step={pageStep} value={Math.min(page, totalPages)} onChange={event => { setActivePassage(null); setPage(Number(event.target.value)); }} className="min-w-0 flex-1 accent-[#b89353]" aria-label="Book page" />
          <a href={book.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] uppercase tracking-[0.07em] text-[#cdb77f] underline decoration-[#cdb77f]/40 underline-offset-4">Source edition</a>
        </footer>
      </div>
    </section>
  );
}
