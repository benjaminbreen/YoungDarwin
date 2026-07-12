'use client';

import React, { useEffect, useRef, useState } from 'react';
import { setTypingMode } from '../input/typingMode';
import { getReadableBook } from '../books/bookCatalog';
import { useThreeGameStore } from '../store';

function PdfPage({ pdf, pageNumber, zoom, singlePage }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!pdf || !pageNumber || pageNumber > pdf.numPages) return undefined;
    let cancelled = false;
    let renderTask = null;
    const render = async () => {
      setStatus('loading');
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
        const viewport = page.getViewport({ scale: 1.08 * zoom * pixelRatio });
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;
        const context = canvas.getContext('2d', { alpha: false });
        renderTask = page.render({ canvasContext: context, viewport });
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
  return (
    <figure className={`relative flex min-h-0 ${singlePage ? 'w-full' : 'w-1/2'} items-center justify-center overflow-auto bg-[#e7dcc0] p-2 sm:p-4`}>
      {status === 'loading' && <div className="absolute inset-0 grid place-items-center font-expedition text-sm text-[#614c32]">Turning page...</div>}
      {status === 'error' && <div className="absolute inset-0 grid place-items-center font-expedition text-sm text-[#7b3026]">This leaf could not be rendered.</div>}
      <canvas
        ref={canvasRef}
        aria-label={`Scanned page ${pageNumber}`}
        className={`block max-h-full max-w-full shadow-[0_6px_18px_rgba(56,39,20,0.2)] transition-opacity duration-200 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
      />
      <figcaption className="absolute bottom-1 right-2 font-expedition text-[10px] text-[#756148]">{pageNumber}</figcaption>
    </figure>
  );
}

export function BookReaderView() {
  const session = useThreeGameStore(state => state.readableBookSession);
  const bookLastPages = useThreeGameStore(state => state.bookLastPages);
  const closeReadableBook = useThreeGameStore(state => state.closeReadableBook);
  const setReadableBookPage = useThreeGameStore(state => state.setReadableBookPage);
  const saveReadableBookNote = useThreeGameStore(state => state.saveReadableBookNote);
  const [pdf, setPdf] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [singlePage, setSinglePage] = useState(false);
  const [visible, setVisible] = useState(false);
  const book = session ? getReadableBook(session.bookId) : null;

  useEffect(() => () => setTypingMode(false), []);

  useEffect(() => {
    if (!book) return undefined;
    const initialPage = bookLastPages[book.id] || book.startPage || 1;
    setPage(initialPage);
    setZoom(1);
    setNote('');
    setNoteOpen(false);
    setVisible(false);
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [book?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!book) return undefined;
    let disposed = false;
    let loadingTask = null;
    setPdf(null);
    setError('');
    setLoading(true);
    import('pdfjs-dist/build/pdf.mjs')
      .then(pdfjs => {
        if (disposed) return null;
        pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
        loadingTask = pdfjs.getDocument({ url: book.pdfPath });
        return loadingTask.promise;
      })
      .then(documentProxy => {
        if (!documentProxy || disposed) return;
        setPdf(documentProxy);
        setLoading(false);
      })
      .catch(() => {
        if (disposed) return;
        setLoading(false);
        setError('The scanned volume could not be opened.');
      });
    return () => {
      disposed = true;
      loadingTask?.destroy?.();
    };
  }, [book]);

  useEffect(() => {
    const update = () => setSinglePage(window.matchMedia('(max-width: 760px)').matches);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!book) return undefined;
    const onKeyDown = event => {
      if (event.target?.tagName === 'TEXTAREA' || event.target?.tagName === 'INPUT') return;
      if (event.key === 'Escape') closeReadableBook();
      if (event.key === 'ArrowLeft') setPage(value => Math.max(1, value - (singlePage ? 1 : 2)));
      if (event.key === 'ArrowRight') setPage(value => Math.min(pdf?.numPages || value, value + (singlePage ? 1 : 2)));
      if (event.key === '+' || event.key === '=') setZoom(value => Math.min(1.75, value + 0.15));
      if (event.key === '-') setZoom(value => Math.max(0.7, value - 0.15));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [book, closeReadableBook, pdf?.numPages, singlePage]);

  useEffect(() => {
    if (book) setReadableBookPage(book.id, page);
  }, [book, page, setReadableBookPage]);

  if (!book || !session) return null;
  const pageStep = singlePage ? 1 : 2;
  const rightPage = singlePage ? null : page + 1;
  const totalPages = pdf?.numPages || 1;
  const turn = direction => setPage(value => Math.max(1, Math.min(totalPages, value + direction * pageStep)));
  const saveNote = () => {
    if (!note.trim()) return;
    saveReadableBookNote({ bookId: book.id, page, content: note });
    setNote('');
    setNoteOpen(false);
    setTypingMode(false);
  };

  return (
    <section
      className={`pointer-events-auto absolute inset-0 z-[80] flex flex-col overflow-hidden bg-[#16130f] font-expedition text-[#eadcb8] transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      aria-label={`Reading ${book.title}`}
    >
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[#b89353]/45 bg-[#201b14] px-3 py-2 sm:px-5">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-[#f0dfb3] sm:text-[18px]">{book.title}</h2>
          <p className="truncate text-[10px] text-[#b9a887] sm:text-[12px]">{book.author} | {book.edition}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(value => Math.max(0.7, value - 0.15))} className="h-9 w-9 border border-[#b89353]/55 bg-black/20 text-xl hover:bg-[#b89353]/15">-</button>
          <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(1.75, value + 0.15))} className="h-9 w-9 border border-[#b89353]/55 bg-black/20 text-xl hover:bg-[#b89353]/15">+</button>
          <button type="button" onClick={() => setNoteOpen(value => !value)} className="h-9 border border-[#b89353]/55 bg-black/20 px-3 text-xs font-semibold uppercase tracking-[0.08em] hover:bg-[#b89353]/15">Field note</button>
          <button type="button" title="Close book" aria-label="Close book" onClick={closeReadableBook} className="h-9 w-9 border border-[#b89353]/55 bg-black/20 text-lg hover:bg-[#b89353]/15">X</button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#463723_0%,#221b13_56%,#100e0b_100%)] p-2 sm:p-4">
        {loading && <div className="grid flex-1 place-items-center text-sm text-[#d5bf8b]">Opening the scanned volume...</div>}
        {error && <div className="grid flex-1 place-items-center text-sm text-[#e4b09c]">{error}</div>}
        {pdf && (
          <div className={`relative flex h-full min-h-0 w-full max-w-[106rem] overflow-hidden border border-[#8f7445]/70 bg-[#e7dcc0] shadow-[0_24px_70px_rgba(0,0,0,0.64)] ${singlePage ? '' : 'book-reader-spread'}`}>
            <PdfPage pdf={pdf} pageNumber={page} zoom={zoom} singlePage={singlePage} />
            {!singlePage && <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-10 w-px bg-[#7b6648]/35 shadow-[0_0_14px_4px_rgba(74,52,29,0.22)]" />}
            {!singlePage && <PdfPage pdf={pdf} pageNumber={rightPage} zoom={zoom} singlePage={false} />}
            <button type="button" aria-label="Previous page" title="Previous page" disabled={page <= 1} onClick={() => turn(-1)} className="absolute bottom-0 left-0 top-0 z-20 w-12 bg-gradient-to-r from-[#3e2d1b]/25 to-transparent text-4xl text-[#5c452c] opacity-35 transition hover:opacity-100 disabled:opacity-0">&lt;</button>
            <button type="button" aria-label="Next page" title="Next page" disabled={page >= totalPages} onClick={() => turn(1)} className="absolute bottom-0 right-0 top-0 z-20 w-12 bg-gradient-to-l from-[#3e2d1b]/25 to-transparent text-4xl text-[#5c452c] opacity-35 transition hover:opacity-100 disabled:opacity-0">&gt;</button>
          </div>
        )}
        {noteOpen && (
          <aside className="absolute bottom-4 right-4 top-4 z-40 flex w-[min(28rem,calc(100vw-2rem))] flex-col border border-[#b89353]/70 bg-[#f0e5c7] p-4 text-[#473621] shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#79603a]">Field journal | scanned page {page}</div>
            <textarea
              value={note}
              onChange={event => setNote(event.target.value)}
              onFocus={() => setTypingMode(true)}
              onBlur={() => setTypingMode(false)}
              autoFocus
              placeholder="Record what in this passage bears upon your observations..."
              className="mt-3 min-h-0 flex-1 resize-none border-y border-[#856e48]/30 bg-transparent py-3 font-expedition text-[16px] leading-relaxed outline-none placeholder:italic placeholder:text-[#846f52]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => { setNoteOpen(false); setTypingMode(false); }} className="border border-[#79603a]/50 px-3 py-2 text-xs font-semibold uppercase">Cancel</button>
              <button type="button" disabled={!note.trim()} onClick={saveNote} className="border border-[#5f492b] bg-[#5f492b] px-4 py-2 text-xs font-semibold uppercase text-[#f2e7c9] disabled:opacity-40">Enter in journal</button>
            </div>
          </aside>
        )}
      </div>

      <footer className="flex min-h-12 items-center gap-3 border-t border-[#b89353]/45 bg-[#201b14] px-3 sm:px-5">
        <span className="shrink-0 text-[11px] text-[#b9a887]">Pages {page}{rightPage && rightPage <= totalPages ? `-${rightPage}` : ''} of {totalPages}</span>
        <input
          type="range"
          min="1"
          max={totalPages}
          step={pageStep}
          value={Math.min(page, totalPages)}
          onChange={event => setPage(Number(event.target.value))}
          className="min-w-0 flex-1 accent-[#b89353]"
          aria-label="Book page"
        />
        <a href={book.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-[#cdb77f] underline decoration-[#cdb77f]/40 underline-offset-4">Source edition</a>
      </footer>
    </section>
  );
}
