'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { baseSpecimens } from '../data/specimens';
import { getThreeIslandLocation } from '../three-game/data';
import { setTypingMode } from '../three-game/input/typingMode';
import { useThreeGameStore } from '../three-game/store';
import { PanelTabs } from '../three-game/ui/expedition/ExpeditionPanel';
import { ExpeditionModal } from '../three-game/ui/expedition/ExpeditionModal';
import { SketchPortrait } from '../three-game/ui/expedition/SketchPortrait';

function expeditionDate(day) {
  const start = new Date(Date.UTC(1835, 8, 17));
  start.setUTCDate(start.getUTCDate() + Math.max(0, (day || 1) - 1));
  return start;
}

function formatJournalDate(day, short = false) {
  return new Intl.DateTimeFormat('en-US', {
    month: short ? 'short' : 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(expeditionDate(day));
}

function dayOrdinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
}

// "September 24th, 1835" with a superscript ordinal, as in the mockup.
function OrnateDate({ day }) {
  const date = expeditionDate(day);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(date);
  const dayNum = date.getUTCDate();
  return (
    <>
      {month} {dayNum}
      <sup className="text-[0.55em]">{dayOrdinal(dayNum)}</sup>, {date.getUTCFullYear()}
    </>
  );
}

function findSpecimen(id) {
  return id ? baseSpecimens.find(specimen => specimen.id === id) || null : null;
}

function normalizeEntry(entry, index) {
  const specimen = findSpecimen(entry.specimenId);
  const isLocation = entry.kind === 'location';
  return {
    ...entry,
    key: entry.id || `entry-${index}`,
    page: index + 1,
    title: specimen?.name || entry.title || entry.specimenName || (isLocation ? entry.location : 'Field Note'),
    subtitle: entry.location || 'Charles Island',
    date: formatJournalDate(entry.day, true),
    specimen,
    type: specimen ? 'specimen' : isLocation ? 'location' : 'note',
  };
}

function NotebookShell({ title, onClose, width = '28rem', children }) {
  return (
    <div
      className="pointer-events-auto fixed inset-x-3 bottom-3 top-16 z-30 overflow-hidden rounded-md border border-amber-200/40 bg-[#fff7df] text-stone-900 shadow-2xl md:left-auto"
      style={{ width: `min(${width}, calc(100vw - 1.5rem))` }}
    >
      <div className="flex items-center justify-between border-b border-amber-300/70 px-4 py-3">
        <h2 className="font-serif text-xl font-bold">{title}</h2>
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm font-semibold hover:bg-amber-100">Close</button>
      </div>
      <div className="h-full overflow-auto p-4 pb-20">
        {children}
      </div>
    </div>
  );
}

function EntryThumb({ entry }) {
  if (entry.specimen) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#d8c39a] p-1">
        <SketchPortrait specimen={entry.specimen} className="h-full w-full object-contain mix-blend-multiply" />
      </div>
    );
  }
  if (entry.type === 'location') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/maps/floreana-island-map.png" alt="" className="h-full w-full object-cover sepia" draggable={false} />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#d6c39f] text-[#2a2117]">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 4 h10 l4 4 v12 H5 Z" />
        <path d="M15 4 v4 h4 M8 13 h8 M8 16 h6" />
      </svg>
    </div>
  );
}

function EntryList({ entries, counts, selectedKey, filter, onFilter, onSelect, onNew, devCatalogue = false, className = '' }) {
  const tabs = devCatalogue
    ? [
        { id: 'all', label: 'All', count: counts.all },
        { id: 'specimen', label: 'Specimens', count: counts.specimen },
      ]
    : [
        { id: 'all', label: 'All', count: counts.all },
        { id: 'specimen', label: 'Specimens', count: counts.specimen },
        { id: 'location', label: 'Locations', count: counts.location },
        { id: 'note', label: 'Notes', count: counts.note },
      ];
  const visible = entries.filter(entry => filter === 'all' || entry.type === filter);
  const emptyCopy = entries.length === 0
    ? 'The pages await your observations.'
    : 'No entries in this section yet.';

  return (
    <aside
      className={`relative min-h-0 flex-col overflow-hidden rounded-[2px] border border-[#5a4327]/75 bg-[rgba(7,7,5,0.82)] shadow-[inset_0_0_28px_rgba(0,0,0,0.58)] ${className}`}
      style={{
        backgroundImage:
          'radial-gradient(circle at 42% 18%, rgba(115,84,43,0.11), transparent 34%), linear-gradient(180deg, rgba(24,20,14,0.72), rgba(5,6,5,0.86))',
      }}
    >
      <div className="p-2.5 pb-0">
        {devCatalogue ? (
          <div className="flex w-full items-center justify-between gap-3 rounded-[2px] border border-[#9b7040] bg-[#382614]/80 px-3 py-2 text-[#edcf99]">
            <span className="text-[12px] font-semibold uppercase tracking-[0.18em]">Dev Catalogue</span>
            <span className="text-[11px] text-[#c9aa76]">All {entries.length} specimens</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onNew}
            className="flex w-full items-center justify-center gap-2 rounded-[2px] border border-[#5a4327] bg-black/25 px-4 py-2 text-[15px] tracking-wide text-[#e0c79e] transition hover:border-[#8a6d3f] hover:bg-[#2a2117]"
          >
            <span className="text-[18px] leading-none">+</span>
            New Journal Entry
          </button>
        )}
      </div>
      <PanelTabs tabs={tabs} active={filter} onSelect={onFilter} className="mx-2.5 mt-2" />
      <div className="relative min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5 [scrollbar-width:thin] [scrollbar-color:#7a5d35_rgba(0,0,0,0.22)]">
        {visible.map(entry => (
          <button
            key={entry.key}
            type="button"
            onClick={() => onSelect(entry.key)}
            className={`grid w-full grid-cols-[3.5rem_1fr] gap-3 rounded-[2px] border px-2 py-2 text-left transition ${
              selectedKey === entry.key
                ? 'border-[#8a6d3f] bg-[#2a2117]/85'
                : 'border-[#2f271b] bg-black/10 hover:border-[#6b5130] hover:bg-[#1a1510]'
            }`}
          >
            <span className="h-[3.5rem] overflow-hidden rounded-[2px] border border-[#6b5130]/65 bg-[#201810]">
              <EntryThumb entry={entry} />
            </span>
            <span className="min-w-0 self-center">
              <span className="block truncate text-[15px] leading-tight text-[#ead3ae]">{entry.title}</span>
              <span className="mt-0.5 block truncate text-[12px] text-[#bea47c]">{entry.subtitle}</span>
              <span className="mt-0.5 block text-[11px] italic text-[#c3a474]">{entry.date}</span>
            </span>
          </button>
        ))}
        {visible.length === 0 && (
          <p className="px-2 py-7 text-center text-[13px] italic text-[#a88f68]">{emptyCopy}</p>
        )}
      </div>
    </aside>
  );
}

const PAGE_BUTTON_ICONS = {
  eye: (
    <>
      <path d="M2 12 C5 6.5 9 4.5 12 4.5 C15 4.5 19 6.5 22 12 C19 17.5 15 19.5 12 19.5 C9 19.5 5 17.5 2 12 Z" />
      <circle cx="12" cy="12" r="3.1" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21 C12 21 5.5 14.6 5.5 9.8 A6.5 6.5 0 0 1 18.5 9.8 C18.5 14.6 12 21 12 21 Z" />
      <circle cx="12" cy="9.8" r="2.4" />
    </>
  ),
};

// Dark pill button in the footer bar beneath the journal page.
function PageButton({ icon, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-[3px] border border-[#6d542f] bg-[#2a2117] px-4 py-2 text-[13px] tracking-[0.06em] text-[#ead3ae] shadow-[0_3px_8px_rgba(0,0,0,0.4)] transition hover:border-[#8a6d3f] hover:bg-[#3a2c1c] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" className="h-[1.1em] w-[1.1em]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {PAGE_BUTTON_ICONS[icon]}
      </svg>
      {children}
    </button>
  );
}

function PagerButton({ direction, onClick, disabled }) {
  const isPrev = direction === 'prev';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={isPrev ? 'Previous page' : 'Next page'}
      className="flex h-9 w-9 items-center justify-center rounded-[3px] border border-[#5a4327] bg-black/25 text-[#c9a35f] transition hover:border-[#8a6d3f] hover:text-[#e3c585] disabled:cursor-not-allowed disabled:opacity-30"
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-4 w-4 ${isPrev ? '' : 'rotate-180'}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14.5 5.5 L8 12 L14.5 18.5" />
      </svg>
    </button>
  );
}

// Shows a fade + chevron cue at the bottom of a scrollable page body while
// more text remains below the fold.
function useScrollFade(contentKey) {
  const ref = useRef(null);
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      setFaded(
        el.scrollHeight - el.clientHeight > 4 &&
        el.scrollTop + el.clientHeight < el.scrollHeight - 6,
      );
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [contentKey]);
  return [ref, faded];
}

function JournalPage({ entry, draft, onDraftChange }) {
  const [bodyRef, showScrollCue] = useScrollFade(entry.key);
  const location = entry.location || entry.subtitle || 'Charles Island';
  const specimen = entry.specimen;
  const isDraft = entry.type === 'draft';

  return (
    <section
      key={entry.key}
      className="journal-page-turn journal-parchment text-[#3c2f1e]"
      // Aspect floats between ~portrait (tall screens) and ~4:3 landscape
      // (wide screens); the slack vs 100cq* leaves room for the page-stack
      // shadows on the right/bottom edges.
      style={{ width: 'min(98cqw, 136cqh)', height: 'min(96cqh, 140cqw)' }}
    >
      <div
        className="relative flex h-full min-h-0 flex-col"
        style={{
          padding:
            'clamp(1.1rem, 4.5cqh, 2.4rem) clamp(1.2rem, 4cqw, 2.8rem) clamp(0.9rem, 3cqh, 1.9rem) clamp(1.7rem, 6cqw, 3.6rem)',
        }}
      >
        {entry.page ? (
          <div className="absolute right-[4.5%] top-[3.5%] font-handwriting text-[clamp(11px,1.9cqh,15px)] italic text-[#6a583f]/80">
            {entry.page}
          </div>
        ) : null}

        <div className="shrink-0">
          <div className="inline-block max-w-full rotate-[-0.4deg] border-b border-[#3c2f1e]/40 pb-1.5 pr-[clamp(1.5rem,7cqw,5rem)]">
            <div className="whitespace-nowrap font-handwriting text-[clamp(17px,3.4cqh,26px)] leading-tight">
              <OrnateDate day={entry.day || 1} />
            </div>
            <div className="mt-1 truncate font-handwriting text-[clamp(13px,2.6cqh,19px)] leading-tight text-[#4a3a24]">
              {location}
            </div>
          </div>
        </div>

        <div className="relative mt-[2.5cqh] min-h-0 flex-1">
          {isDraft ? (
            <textarea
              value={draft}
              onChange={event => onDraftChange(event.target.value)}
              onFocus={() => setTypingMode(true)}
              onBlur={() => setTypingMode(false)}
              aria-label="Write journal entry"
              placeholder="Write observations here..."
              className="journal-ruled block h-full w-full resize-none bg-transparent font-journal text-[clamp(19px,3cqh,24px)] font-medium leading-[1.55] tracking-[0.008em] text-[#302616] outline-none placeholder:italic placeholder:text-[#6f604b]/45"
              spellCheck
            />
          ) : (
            <>
              <div
                ref={bodyRef}
                className="h-full overflow-y-auto overflow-x-hidden pr-2 [scrollbar-width:thin] [scrollbar-color:#8a7351_transparent]"
              >
                <div className="w-full whitespace-pre-wrap break-words pb-3 font-journal text-[clamp(19px,3cqh,24px)] font-medium leading-[1.55] tracking-[0.008em] text-[#302616] [overflow-wrap:anywhere]">
                  {specimen && (
                    <figure
                      className="float-right mb-[2.5cqh] ml-[clamp(1.5rem,4cqw,3rem)] flex h-[clamp(11rem,38cqh,18rem)] w-[clamp(18rem,44cqw,34rem)] max-w-[55%] rotate-[0.7deg] flex-col items-center mix-blend-multiply"
                      style={{ filter: 'sepia(0.5) contrast(1.04)' }}
                    >
                      <SketchPortrait specimen={specimen} className="min-h-0 w-full flex-1 object-contain object-right" />
                      {specimen.latin && (
                        <figcaption className="mt-1 whitespace-normal text-center font-handwriting text-[clamp(10px,1.8cqh,13px)] leading-snug text-[#5c4a2e]">
                          {specimen.latin}
                        </figcaption>
                      )}
                    </figure>
                  )}
                  {entry.content}
                </div>
              </div>
              {showScrollCue && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-[linear-gradient(to_top,rgba(238,226,193,0.95),rgba(238,226,193,0))] pb-0.5 text-[13px] text-[#6a583f]">
                  ▾
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function DevSpecimenCataloguePage({ entry }) {
  const specimen = entry.specimen;
  const taxonomy = [specimen.ontology, specimen.order, specimen.sub_order].filter(Boolean);

  return (
    <section
      key={entry.key}
      className="journal-page-turn journal-parchment text-[#3c2f1e]"
      style={{ width: 'min(98cqw, 136cqh)', height: 'min(96cqh, 140cqw)' }}
    >
      <div className="relative flex h-full min-h-0 flex-col px-[clamp(1.8rem,6cqw,4rem)] py-[clamp(1.25rem,4.5cqh,2.8rem)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[#59462c]/35 pb-[1.5cqh] font-expedition text-[clamp(9px,1.5cqh,12px)] font-semibold uppercase tracking-[0.2em] text-[#765e3b]">
          <span>Development specimen catalogue</span>
          <span>{entry.page} / {entry.totalPages}</span>
        </div>

        <header className="shrink-0 pt-[2.5cqh] text-center">
          <h2 className="font-handwriting text-[clamp(24px,5.2cqh,42px)] leading-tight text-[#302416]">
            {specimen.name}
          </h2>
          {specimen.latin && (
            <div className="mt-[0.7cqh] font-expedition text-[clamp(12px,2.2cqh,17px)] italic tracking-wide text-[#655036]">
              {specimen.latin}
            </div>
          )}
        </header>

        <figure className="my-[2cqh] flex min-h-0 flex-1 items-center justify-center overflow-hidden mix-blend-multiply">
          <SketchPortrait
            specimen={specimen}
            alt={`Development catalogue sketch of ${specimen.name}`}
            className="h-full w-full object-contain"
          />
        </figure>

        <footer className="grid shrink-0 gap-1 border-t border-[#59462c]/35 pt-[1.5cqh] text-center text-[#655036]">
          {taxonomy.length > 0 && (
            <div className="font-expedition text-[clamp(10px,1.7cqh,13px)] tracking-[0.08em]">
              {taxonomy.join('  ·  ')}
            </div>
          )}
          <div className="font-mono text-[clamp(8px,1.35cqh,10px)] uppercase tracking-[0.14em] text-[#806b4c]">
            {specimen.id}
          </div>
        </footer>
      </div>
    </section>
  );
}

const JOURNAL_DEV_CATALOGUE_AVAILABLE = process.env.NODE_ENV !== 'production';

function makeDevCatalogueEntries() {
  const specimens = [...baseSpecimens].sort((a, b) => a.name.localeCompare(b.name));
  return specimens.map((specimen, index) => ({
    key: `dev-catalogue-${specimen.id}`,
    type: 'specimen',
    title: specimen.name,
    subtitle: specimen.latin || specimen.ontology || 'Specimen',
    date: `${index + 1} of ${specimens.length}`,
    specimen,
    page: index + 1,
    totalPages: specimens.length,
    devCatalogue: true,
  }));
}

function JournalPanel({ onClose, onOpenMap }) {
  const journal = useThreeGameStore(state => state.journal);
  const day = useThreeGameStore(state => state.day);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const addUserJournalEntry = useThreeGameStore(state => state.addUserJournalEntry);
  const openSpecimenDetail = useThreeGameStore(state => state.openSpecimenDetail);
  const draft = useThreeGameStore(state => state.journalDraft);
  const setJournalDraft = useThreeGameStore(state => state.setJournalDraft);
  const [filter, setFilter] = useState('all');
  const [selectedKey, setSelectedKey] = useState(() => journal.at(-1)?.id || 'draft');
  const [devCatalogue, setDevCatalogue] = useState(false);
  const regularSelectionRef = useRef(selectedKey);
  // Below lg the list and page trade places (drill-in) instead of stacking.
  const [mobileView, setMobileView] = useState('list');

  const journalEntries = useMemo(() => journal.map(normalizeEntry).reverse(), [journal]);
  const devCatalogueEntries = useMemo(makeDevCatalogueEntries, []);
  const entries = devCatalogue ? devCatalogueEntries : journalEntries;
  const counts = useMemo(
    () => entries.reduce(
      (acc, entry) => {
        acc.all += 1;
        acc[entry.type] = (acc[entry.type] || 0) + 1;
        return acc;
      },
      { all: 0, specimen: 0, location: 0, note: 0 },
    ),
    [entries],
  );
  const currentLocation = getThreeIslandLocation(currentZoneId);
  const selectedEntry = devCatalogue
    ? entries.find(entry => entry.key === selectedKey) || entries[0] || null
    : selectedKey === 'draft'
      ? {
        key: 'draft',
        type: 'draft',
        title: 'New Journal Entry',
        subtitle: currentLocation.name,
        location: currentLocation.name,
        day,
        page: journal.length + 1,
        content: '',
      }
      : entries.find(entry => entry.key === selectedKey) || entries[0] || null;
  const isDraft = selectedEntry?.type === 'draft';

  // Book order: oldest entry first, the blank draft as the final page.
  const pageKeys = useMemo(
    () => devCatalogue
      ? devCatalogueEntries.map(entry => entry.key)
      : journalEntries.map(entry => entry.key).reverse().concat('draft'),
    [devCatalogue, devCatalogueEntries, journalEntries],
  );
  const pageIndex = Math.max(0, pageKeys.indexOf(selectedKey));

  const goToPage = index => {
    const key = pageKeys[Math.min(pageKeys.length - 1, Math.max(0, index))];
    if (!key || key === selectedKey) return;
    setSelectedKey(key);
    setMobileView('page');
  };

  useEffect(() => {
    if (devCatalogue) {
      if (!devCatalogueEntries.some(entry => entry.key === selectedKey)) {
        setSelectedKey(devCatalogueEntries[0]?.key || 'draft');
      }
      return;
    }
    if (selectedKey !== 'draft' && !entries.some(entry => entry.key === selectedKey)) {
      setSelectedKey(entries[0]?.key || 'draft');
    }
  }, [devCatalogue, devCatalogueEntries, entries, selectedKey]);

  const toggleDevCatalogue = () => {
    if (!JOURNAL_DEV_CATALOGUE_AVAILABLE) return;
    if (devCatalogue) {
      setDevCatalogue(false);
      setSelectedKey(regularSelectionRef.current || journalEntries[0]?.key || 'draft');
    } else {
      regularSelectionRef.current = selectedKey;
      setDevCatalogue(true);
      setFilter('all');
      setSelectedKey(devCatalogueEntries[0]?.key || 'draft');
      setMobileView('page');
    }
  };

  useEffect(() => {
    const onKeyDown = event => {
      if (
        JOURNAL_DEV_CATALOGUE_AVAILABLE &&
        event.altKey &&
        event.shiftKey &&
        event.code === 'KeyJ'
      ) {
        event.preventDefault();
        toggleDevCatalogue();
        return;
      }
      if (event.defaultPrevented) return;
      const tag = event.target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || event.target?.isContentEditable) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPage(pageIndex - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToPage(pageIndex + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleSaveDraft = () => {
    if (!draft.trim()) return;
    addUserJournalEntry(draft);
    setJournalDraft('');
    window.setTimeout(() => setSelectedKey(useThreeGameStore.getState().journal.at(-1)?.id || 'draft'), 0);
  };

  const handleViewSpecimen = () => {
    if (!selectedEntry?.specimen) return;
    openSpecimenDetail([selectedEntry.specimen], 0);
  };

  return (
    <ExpeditionModal title="Journal" subtitle="My observations and notes" onClose={onClose} width="min(100rem, 98vw)">
      <div className="relative grid min-h-0 grid-rows-[minmax(0,1fr)] gap-3 px-4 pb-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <EntryList
          className={mobileView === 'page' ? 'hidden lg:flex' : 'flex'}
          entries={entries}
          counts={counts}
          selectedKey={selectedKey}
          filter={filter}
          onFilter={setFilter}
          onSelect={key => {
            setSelectedKey(key);
            setMobileView('page');
          }}
          onNew={() => {
            setSelectedKey('draft');
            setMobileView('page');
          }}
          devCatalogue={devCatalogue}
        />
        <div className={`relative min-h-0 flex-col ${mobileView === 'list' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden [container-type:size]">
            {selectedEntry && (
              selectedEntry.devCatalogue
                ? <DevSpecimenCataloguePage entry={selectedEntry} />
                : <JournalPage entry={selectedEntry} draft={draft} onDraftChange={setJournalDraft} />
            )}
          </div>
          <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileView('list')}
              className="flex items-center gap-1.5 rounded-[3px] border border-[#5a4327] bg-black/25 px-3 py-2 text-[13px] text-[#c9a35f] transition hover:border-[#8a6d3f] hover:text-[#e3c585] lg:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.5 5.5 L8 12 L14.5 18.5" />
              </svg>
              Entries
            </button>
            <div className="hidden w-40 items-center lg:flex">
              {JOURNAL_DEV_CATALOGUE_AVAILABLE && (
                <button
                  type="button"
                  onClick={toggleDevCatalogue}
                  className={`rounded-[3px] border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] transition ${
                    devCatalogue
                      ? 'border-[#a97d45] bg-[#4a3219] text-[#f0ce94]'
                      : 'border-[#4f3d25] bg-black/15 text-[#8f7856] hover:border-[#755b35] hover:text-[#c3a474]'
                  }`}
                  title="Toggle the development specimen catalogue (Alt/Option + Shift + J)"
                >
                  {devCatalogue ? 'Exit dev catalogue' : 'Dev: Alt + Shift + J'}
                </button>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-2.5">
              {isDraft && (
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={!draft.trim()}
                  className="flex items-center gap-2 rounded-[3px] border border-expedition-gold bg-expedition-gold px-5 py-2 text-[13px] font-bold tracking-[0.06em] text-expedition-ink shadow-[0_3px_8px_rgba(0,0,0,0.4)] transition hover:bg-expedition-goldbright disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Save Entry
                </button>
              )}
              <PageButton icon="eye" onClick={handleViewSpecimen} disabled={!selectedEntry?.specimen}>
                View Specimen
              </PageButton>
              <PageButton icon="pin" onClick={onOpenMap} disabled={devCatalogue}>View Location</PageButton>
            </div>
            <div className="flex w-36 items-center justify-end gap-1.5">
              <PagerButton direction="prev" onClick={() => goToPage(pageIndex - 1)} disabled={pageIndex === 0} />
              <span className="min-w-[3.4rem] text-center text-[12px] tracking-[0.1em] text-[#bea47c]">
                {pageIndex + 1} / {pageKeys.length}
              </span>
              <PagerButton direction="next" onClick={() => goToPage(pageIndex + 1)} disabled={pageIndex === pageKeys.length - 1} />
            </div>
          </div>
        </div>
      </div>
    </ExpeditionModal>
  );
}

function InventoryPanel({ onClose }) {
  const inventory = useThreeGameStore(state => state.inventory);
  return (
    <NotebookShell title="Specimen Case" onClose={onClose} width="24rem">
      {inventory.length === 0 ? (
        <p className="italic text-stone-600">No physical specimens collected yet.</p>
      ) : inventory.map(item => (
        <div key={item.id} className="mb-2 rounded border border-amber-200 bg-white/70 p-3">
          <div className="font-serif font-bold">{item.name}</div>
          <div className="text-xs italic text-stone-600">{item.latin}</div>
          <div className="mt-1 text-xs text-amber-800">Condition: {item.condition.replace(/_/g, ' ')}</div>
        </div>
      ))}
    </NotebookShell>
  );
}

export function FieldNotebook({ panel, onClose, onOpenMap }) {
  if (panel === 'journal') return <JournalPanel onClose={onClose} onOpenMap={onOpenMap} />;
  if (panel === 'inventory') return <InventoryPanel onClose={onClose} />;
  return null;
}
