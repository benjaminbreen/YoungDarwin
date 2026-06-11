'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { baseSpecimens } from '../data/specimens';
import { getThreeIslandLocation } from '../three-game/data';
import { setTypingMode } from '../three-game/input/typingMode';
import { useThreeGameStore } from '../three-game/store';
import { GOLD_BUTTON_SOLID, PanelTabs } from '../three-game/ui/expedition/ExpeditionPanel';
import { ExpeditionModal } from '../three-game/ui/expedition/ExpeditionModal';
import { SketchPortrait } from '../three-game/ui/expedition/SketchPortrait';

const PAGE_ASSET = '/assets/ui/blank-journal-page.png';

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
  const isNote = entry.kind === 'note' || !entry.specimenId;
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
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 4 h10 l4 4 v12 H5 Z" />
        <path d="M15 4 v4 h4 M8 13 h8 M8 16 h6" />
      </svg>
    </div>
  );
}

function EntryList({ entries, selectedKey, filter, onFilter, onSelect, onNew }) {
  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'specimen', label: 'Specimens' },
    { id: 'location', label: 'Locations' },
    { id: 'note', label: 'Notes' },
  ];
  const visible = entries.filter(entry => filter === 'all' || entry.type === filter);

  return (
    <aside
      className="relative flex min-h-0 flex-col overflow-hidden rounded-[2px] border border-[#5a4327]/75 bg-[rgba(7,7,5,0.82)] shadow-[inset_0_0_28px_rgba(0,0,0,0.58)]"
      style={{
        backgroundImage:
          'radial-gradient(circle at 42% 18%, rgba(115,84,43,0.11), transparent 34%), linear-gradient(180deg, rgba(24,20,14,0.72), rgba(5,6,5,0.86))',
      }}
    >
      <div className="pointer-events-none absolute inset-[6px] border border-[#5a4327]/45" />
      <PanelTabs tabs={tabs} active={filter} onSelect={onFilter} className="px-2 pt-1.5" />
      <div className="relative min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 [scrollbar-width:thin] [scrollbar-color:#7a5d35_rgba(0,0,0,0.22)]">
        {visible.map(entry => (
          <button
            key={entry.key}
            type="button"
            onClick={() => onSelect(entry.key)}
            className={`grid w-full grid-cols-[4.5rem_1fr] gap-3.5 rounded-[2px] border px-2.5 py-2.5 text-left transition duration-200 hover:-translate-y-0.5 ${
              selectedKey === entry.key
                ? 'border-[#7a5d35] bg-[#2a2117]/80 shadow-[inset_0_0_0_1px_rgba(218,181,111,0.14)]'
                : 'border-[#2f271b] bg-black/10 hover:border-[#6b5130] hover:bg-[#1a1510]'
            }`}
          >
            <span className="h-[4.5rem] overflow-hidden rounded-[2px] border border-[#6b5130]/65 bg-[#201810]">
              <EntryThumb entry={entry} />
            </span>
            <span className="min-w-0 self-center">
              <span className="block truncate text-[17px] leading-tight text-[#ead3ae]">{entry.title}</span>
              <span className="mt-1 block truncate text-[13px] text-[#bea47c]">{entry.subtitle}</span>
              <span className="mt-1 block text-[12px] italic text-[#c3a474]">{entry.date}</span>
            </span>
          </button>
        ))}
        {visible.length === 0 && (
          <p className="px-2 py-7 text-center text-[13px] italic text-[#a88f68]">No entries in this section yet.</p>
        )}
      </div>
      <div className="relative border-t border-[#4a3822] p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2.5 rounded-[2px] border border-[#5a4327] bg-black/25 px-4 py-2.5 text-[16px] tracking-wide text-[#e0c79e] transition hover:border-[#8a6d3f] hover:bg-[#2a2117]"
        >
          <span className="text-[20px] leading-none">+</span>
          New Journal Entry
        </button>
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

// Dark pill button anchored to the journal page footer, as in the mockup.
function PageButton({ icon, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2.5 rounded-[3px] border border-[#6d542f] bg-[#2a2117] px-[clamp(1rem,1.6vw,1.6rem)] py-[clamp(0.5rem,0.85vw,0.8rem)] text-[clamp(12px,1.15vw,16px)] tracking-[0.06em] text-[#ead3ae] shadow-[0_3px_8px_rgba(0,0,0,0.4)] transition hover:border-[#8a6d3f] hover:bg-[#3a2c1c] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" className="h-[1.1em] w-[1.1em]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {PAGE_BUTTON_ICONS[icon]}
      </svg>
      {children}
    </button>
  );
}

function JournalPage({ entry, draft, onDraftChange, onSaveDraft, onViewSpecimen, onViewLocation }) {
  const pageNumber = entry.page || '';
  const location = entry.location || entry.subtitle || 'Charles Island';
  const specimen = entry.specimen;

  return (
    <section
      key={entry.key}
      className="journal-page-turn relative"
      style={{ width: 'min(100cqw, 133.33cqh)', height: 'min(100cqh, 75cqw)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={PAGE_ASSET}
        alt=""
        className="absolute inset-0 h-full w-full object-contain"
        style={{ filter: 'sepia(0.3) saturate(1.12) brightness(0.985)' }}
        draggable={false}
      />
      <div className="absolute inset-[6.5%_9%_5%_13.2%] text-[#3c2f1e]">
        {pageNumber && (
          <div className="absolute right-[1%] top-0 text-[clamp(11px,1.2vw,16px)] italic text-[#6a583f]/80 font-handwriting">{pageNumber}</div>
        )}

        <div className="flex h-full min-h-0 flex-col pl-[2%] pr-[2%] pt-[2.5%]">
          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(8rem,34%)] gap-[3%] pr-[2%]">
            <div className="min-w-0 rotate-[-0.6deg]">
              <div className="inline-block max-w-full whitespace-nowrap border-b border-[#3c2f1e]/45 pb-1 text-[clamp(13px,1.5vw,22px)] leading-none font-handwriting">
                <OrnateDate day={entry.day || 1} />
              </div>
              <div className="mt-[2.2%] block min-w-0">
                <span className="inline-block max-w-full truncate border-b border-[#3c2f1e]/35 pb-1 text-[clamp(12px,1.35vw,20px)] leading-tight font-handwriting">
                  {location}
                </span>
              </div>
            </div>
            {specimen ? (
              <div className="flex h-[clamp(6rem,19cqh,12.5rem)] min-w-0 rotate-[0.7deg] items-center justify-center justify-self-end self-start mix-blend-multiply" style={{ filter: 'sepia(0.5) contrast(1.04)' }}>
                <SketchPortrait specimen={specimen} className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <div aria-hidden="true" />
            )}
          </div>

          <div className="mt-[2.4%] min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-[3%] [scrollbar-width:thin] [scrollbar-color:#8a7351_transparent]">
            {entry.type === 'draft' ? (
              <textarea
                value={draft}
                onChange={event => onDraftChange(event.target.value)}
                onFocus={() => setTypingMode(true)}
                onBlur={() => setTypingMode(false)}
                aria-label="Write journal entry"
                placeholder="Write observations here..."
                className="block h-full w-full resize-none bg-transparent text-[clamp(11px,1.18vw,17px)] leading-[1.8] text-[#3c2f1e] outline-none placeholder:text-[#6f604b]/45 font-handwriting"
                spellCheck
              />
            ) : (
              <div className="max-w-[78ch] whitespace-pre-wrap break-words pb-[2%] text-[clamp(11px,1.18vw,17px)] leading-[1.82] font-handwriting [overflow-wrap:anywhere]">
                {entry.content}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-center gap-[clamp(0.75rem,1.6vw,1.5rem)] pb-[1.5%] pt-[1.5%]">
            {entry.type === 'draft' && (
              <button
                type="button"
                onClick={onSaveDraft}
                disabled={!draft.trim()}
                className={`${GOLD_BUTTON_SOLID} border-[#6d542f] bg-[#2a2117] text-[#ead3ae] shadow-[0_3px_8px_rgba(0,0,0,0.4)] hover:bg-[#3a2c1c] disabled:cursor-not-allowed disabled:opacity-40`}
              >
                Save Entry
              </button>
            )}
            <PageButton onClick={onViewSpecimen} disabled={!specimen} icon="eye">View Specimen</PageButton>
            <PageButton onClick={onViewLocation} icon="pin">View Location</PageButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function JournalPanel({ onClose, onOpenMap }) {
  const journal = useThreeGameStore(state => state.journal);
  const day = useThreeGameStore(state => state.day);
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const addUserJournalEntry = useThreeGameStore(state => state.addUserJournalEntry);
  const openSpecimenDetail = useThreeGameStore(state => state.openSpecimenDetail);
  const [filter, setFilter] = useState('all');
  const [selectedKey, setSelectedKey] = useState(() => journal.at(-1)?.id || 'draft');
  const [draft, setDraft] = useState('');

  const entries = useMemo(() => journal.map(normalizeEntry).reverse(), [journal]);
  const currentLocation = getThreeIslandLocation(currentZoneId);
  const selectedEntry = selectedKey === 'draft'
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

  useEffect(() => {
    if (selectedKey !== 'draft' && !entries.some(entry => entry.key === selectedKey)) {
      setSelectedKey(entries[0]?.key || 'draft');
    }
  }, [entries, selectedKey]);

  const handleSaveDraft = () => {
    if (!draft.trim()) return;
    addUserJournalEntry(draft);
    setDraft('');
    window.setTimeout(() => setSelectedKey(useThreeGameStore.getState().journal.at(-1)?.id || 'draft'), 0);
  };

  const handleViewSpecimen = () => {
    if (!selectedEntry?.specimen) return;
    openSpecimenDetail([selectedEntry.specimen], 0);
  };

  return (
    <ExpeditionModal title="Journal" subtitle="My observations and notes" onClose={onClose}>
      <div className="relative grid min-h-0 gap-3 px-4 pb-4 lg:grid-cols-[26rem_minmax(0,1fr)]">
        <EntryList
          entries={entries}
          selectedKey={selectedKey}
          filter={filter}
          onFilter={setFilter}
          onSelect={setSelectedKey}
          onNew={() => setSelectedKey('draft')}
        />
        <div className="relative flex min-h-0 items-center justify-center overflow-hidden [container-type:size]">
          {selectedEntry && (
            <JournalPage
              entry={selectedEntry}
              draft={draft}
              onDraftChange={setDraft}
              onSaveDraft={handleSaveDraft}
              onViewSpecimen={handleViewSpecimen}
              onViewLocation={onOpenMap}
            />
          )}
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
