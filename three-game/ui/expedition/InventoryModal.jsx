'use client';

import React, { useEffect, useState } from 'react';
import {
  CASE_CAPACITY,
  SUPPLY_DEFS,
  getInventoryItem,
  inventoryItems,
} from '../../../data/inventoryItems';
import { useThreeGameStore } from '../../store';
import {
  ExpeditionPanel,
  PanelTabs,
  GOLD_BUTTON,
  GOLD_BUTTON_SOLID,
  GOLD_LABEL,
  GoldDivider,
} from './ExpeditionPanel';
import { TOOL_ICONS } from './icons';

// ---------------------------------------------------------------------------
// Small line icons for the supplies ledger (mockup uses fine glyphs, not art).

function supplyGlyph(id) {
  const paths = {
    labels: <path d="M4 8 L12 8 L20 12 L12 16 L4 16 Z M7 12 h0.01" />,
    pins: <path d="M12 4 L12 16 M9 7 a3 3 0 1 1 6 0 M10 20 L12 16 L14 20" />,
    spareJars: <path d="M8 4 h8 M9 4 v2 a5 5 0 0 1 -2 4 v8 a2 2 0 0 0 2 2 h6 a2 2 0 0 0 2 -2 v-8 a5 5 0 0 1 -2 -4 v-2" />,
    twine: <path d="M12 5 a7 7 0 1 0 0 14 a7 7 0 1 0 0 -14 M12 8 a4 4 0 1 0 0 8 a4 4 0 1 0 0 -8" />,
    food: <path d="M5 14 a7 4 0 0 1 14 0 Z M4 17 h16 M8 11 v-1 M12 10 v-1 M16 11 v-1" />,
    water: <path d="M12 4 C8 10 6 12.5 6 15.5 a6 6 0 0 0 12 0 C18 12.5 16 10 12 4 Z" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      {paths[id] || <circle cx="12" cy="12" r="7" />}
    </svg>
  );
}

function CaseIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={className}>
      <rect x="3" y="8" width="18" height="12" rx="1.5" />
      <path d="M3 12 h18 M9 8 V6 a1.5 1.5 0 0 1 1.5 -1.5 h3 A1.5 1.5 0 0 1 15 6 v2 M10.5 12 v2.5 h3 V12" />
    </svg>
  );
}

function ItemThumb({ item, className = 'h-9 w-9', iconClassName = 'h-6 w-6' }) {
  const Icon = TOOL_ICONS[item.id];
  return (
    <span className={`flex shrink-0 items-center justify-center ${className}`}>
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt={item.name} className="h-full w-full object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]" draggable={false} />
      ) : Icon ? (
        <Icon className={`${iconClassName} text-expedition-gold`} />
      ) : (
        <span className="text-base">{item.icon}</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Right-hand column: supplies ledger, case status, Syms.

function SuppliesLedger() {
  const supplies = useThreeGameStore(state => state.supplies);
  return (
    <div>
      <div className={`${GOLD_LABEL} mb-1.5 text-center`}>Supplies</div>
      <div className="grid divide-y divide-expedition-brass/25 rounded-sm border border-expedition-brass/40 bg-black/20 px-2.5">
        {SUPPLY_DEFS.map(def => (
          <div key={def.id} className="flex items-center gap-2.5 py-1.5">
            <span className="text-expedition-gold/85">{supplyGlyph(def.id)}</span>
            <span className="min-w-0 flex-1 truncate font-expedition text-[12.5px] text-expedition-parchment">{def.name}</span>
            <span className={`font-expedition text-[12.5px] font-semibold ${supplies[def.id] === 0 ? 'text-rose-300/90' : 'text-expedition-gold'}`}>
              × {supplies[def.id]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CaseStatus() {
  const inventoryCount = useThreeGameStore(state => state.inventory.length);
  const caseCapacity = useThreeGameStore(state => state.caseCapacity);
  const spareJars = useThreeGameStore(state => state.supplies.spareJars);
  return (
    <div>
      <div className={`${GOLD_LABEL} mb-1.5 text-center`}>Case Status</div>
      <div className="flex items-center gap-3 rounded-sm border border-expedition-brass/40 bg-black/20 px-2.5 py-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-expedition-brass/50 bg-expedition-gold/10">
          <CaseIcon className="h-6 w-6 text-expedition-gold" />
        </span>
        <div className="grid flex-1 gap-1 font-expedition text-[12.5px] text-expedition-parchment">
          <div className="flex items-baseline justify-between">
            <span>Case Space</span>
            <span className="font-semibold text-expedition-gold">{inventoryCount} / {caseCapacity}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span>Jar Space</span>
            <span className="font-semibold text-expedition-gold">{spareJars}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SymsCard() {
  return (
    <div className="overflow-hidden rounded-sm border border-expedition-brass/40 bg-black/20">
      <div className="flex gap-2.5 p-2.5">
        <div className="h-16 w-14 shrink-0 overflow-hidden rounded-sm border border-expedition-brass/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/portraits/syms_covington.jpg" alt="Syms Covington" className="h-full w-full object-cover sepia-[0.3]" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-expedition-gold">Syms Covington</div>
          <div className="font-expedition text-[11.5px] italic text-expedition-faded">Nearby</div>
          <p className="mt-1 font-expedition text-[11.5px] leading-snug text-expedition-parchment/90">
            Carrying spare labels and one empty jar.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tools tab

function ToolDetail({ item }) {
  const rows = [
    ['Use', item.use],
    ['Best for', item.bestFor],
    ['Note', item.note],
  ].filter(([, value]) => value);

  return (
    <div className="flex min-h-0 flex-col px-1 sm:px-4">
      <h3 className="text-center font-expedition text-[19px] font-semibold tracking-[0.06em] text-expedition-parchment">{item.name}</h3>
      <div className="mx-auto my-2 flex h-36 items-center justify-center sm:h-44">
        <ItemThumb item={item} className="h-full w-44" iconClassName="h-20 w-20" />
      </div>
      <GoldDivider />
      <p className="mt-2.5 text-center font-expedition text-[12.5px] italic leading-relaxed text-expedition-faded">
        {item.flavor || item.detailedDescription}
      </p>
      <div className="mt-3 grid gap-px overflow-hidden rounded-sm border border-expedition-brass/40 bg-expedition-brass/25">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[4.5rem_1fr] gap-2 bg-[rgba(14,16,16,0.82)] px-3 py-2">
            <span className="pt-px text-[10px] font-semibold uppercase tracking-[0.16em] text-expedition-gold">{label}</span>
            <span className="font-expedition text-[12.5px] leading-snug text-expedition-parchment">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolbarPreview() {
  const toolbarOrder = useThreeGameStore(state => state.toolbarOrder);
  const moveToolbarSlot = useThreeGameStore(state => state.moveToolbarSlot);
  const [reordering, setReordering] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  return (
    <div className="mt-3 border-t border-expedition-brass/40 pt-2.5">
      <div className={`${GOLD_LABEL} mb-2`}>Quick Bar Preview</div>
      <div className="flex flex-wrap items-center gap-2">
        {toolbarOrder.map((toolId, index) => {
          const item = getInventoryItem(toolId);
          if (!item) return null;
          return (
            <div
              key={toolId}
              draggable={reordering}
              onDragStart={() => setDragIndex(index)}
              onDragOver={event => event.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) moveToolbarSlot(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              title={item.name}
              className={`relative flex h-14 w-14 items-center justify-center rounded-sm border bg-black/30 p-1.5 transition ${
                reordering
                  ? `cursor-grab border-expedition-gold/80 shadow-[0_0_10px_rgba(227,197,133,0.25)] ${dragIndex === index ? 'opacity-40' : ''}`
                  : 'border-expedition-brass/50'
              }`}
            >
              <ItemThumb item={item} className="h-full w-full" iconClassName="h-7 w-7" />
              <span className="pointer-events-none absolute left-1 top-0.5 font-expedition text-[10px] font-semibold text-expedition-gold/90">{index + 1}</span>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setReordering(value => !value)}
          className={`${reordering ? GOLD_BUTTON_SOLID : GOLD_BUTTON} ml-1`}
        >
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-3.5 w-3.5">
              <path d="M8 5 L8 19 M8 5 L5.5 7.5 M8 5 L10.5 7.5 M16 19 L16 5 M16 19 L13.5 16.5 M16 19 L18.5 16.5" />
            </svg>
            {reordering ? 'Done Reordering' : 'Reorder Toolbar'}
          </span>
        </button>
      </div>
      {reordering && (
        <p className="mt-1.5 font-expedition text-[11px] italic text-expedition-faded">
          Drag a slot onto another to reorder. Keys 1–{toolbarOrder.length} follow this order.
        </p>
      )}
    </div>
  );
}

function ToolsTab() {
  const activeToolId = useThreeGameStore(state => state.activeToolId);
  const setActiveTool = useThreeGameStore(state => state.setActiveTool);
  const [selectedId, setSelectedId] = useState(inventoryItems[0]?.id);
  const selected = getInventoryItem(selectedId) || inventoryItems[0];

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-[12.5rem_1fr_14.5rem]">
        <div>
          <div className={`${GOLD_LABEL} mb-1.5 text-center`}>Equipped Tools</div>
          <div className="grid max-h-[24rem] gap-1 overflow-y-auto pr-0.5 [scrollbar-width:thin] [scrollbar-color:rgba(201,163,95,0.65)_rgba(0,0,0,0.18)]">
            {inventoryItems.map(item => {
              const isSelected = item.id === selectedId;
              const isActive = item.id === activeToolId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  onDoubleClick={() => setActiveTool(item.id)}
                  className={`flex items-center gap-2.5 rounded-sm border px-2.5 py-1.5 text-left transition ${
                    isSelected
                      ? 'border-expedition-gold bg-expedition-gold/15 shadow-[inset_0_1px_0_rgba(227,197,133,0.2)]'
                      : 'border-expedition-brass/40 bg-black/20 hover:border-expedition-gold/70 hover:bg-expedition-gold/8'
                  }`}
                >
                  <ItemThumb item={item} className="h-8 w-8" iconClassName="h-5 w-5" />
                  <span className="min-w-0 flex-1 truncate font-expedition text-[12.5px] font-medium text-expedition-parchment">{item.name}</span>
                  {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-expedition-goldbright shadow-[0_0_6px_rgba(227,197,133,0.8)]" title="In hand" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-expedition-brass/30 lg:border-x lg:px-2">
          {selected && <ToolDetail item={selected} />}
        </div>

        <div className="grid content-start gap-3">
          <SuppliesLedger />
          <CaseStatus />
          <SymsCard />
        </div>
      </div>
      <ToolbarPreview />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supplies tab

function SuppliesTab() {
  const supplies = useThreeGameStore(state => state.supplies);
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {SUPPLY_DEFS.map(def => (
        <div key={def.id} className="flex gap-3 rounded-sm border border-expedition-brass/40 bg-black/20 p-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm border border-expedition-brass/40 bg-black/25 p-1.5">
            {def.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={def.image} alt={def.name} className="h-full w-full object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]" draggable={false} />
            ) : (
              <span className="text-expedition-gold [&>svg]:h-7 [&>svg]:w-7">{supplyGlyph(def.id)}</span>
            )}
          </span>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-expedition text-[13.5px] font-semibold text-expedition-parchment">{def.name}</span>
              <span className={`font-expedition text-[13px] font-semibold ${supplies[def.id] === 0 ? 'text-rose-300/90' : 'text-expedition-gold'}`}>× {supplies[def.id]}</span>
            </div>
            <p className="mt-0.5 font-expedition text-[11.5px] leading-snug text-expedition-faded">{def.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Specimen case tab

const CONDITION_STYLES = {
  pristine: 'border-emerald-300/45 bg-emerald-300/10 text-emerald-200',
  documented: 'border-sky-300/45 bg-sky-300/10 text-sky-200',
};

function SpecimenCaseTab() {
  const inventory = useThreeGameStore(state => state.inventory);
  const caseCapacity = useThreeGameStore(state => state.caseCapacity);
  const openSpecimenDetail = useThreeGameStore(state => state.openSpecimenDetail);
  const slots = Array.from({ length: Math.max(caseCapacity, inventory.length) }, (_, index) => inventory[index] || null);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className={GOLD_LABEL}>Specimen Case</div>
        <div className="font-expedition text-[12px] text-expedition-faded">{inventory.length} of {caseCapacity} slots filled</div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {slots.map((specimen, index) => specimen ? (
          <button
            key={`${specimen.id}-${index}`}
            type="button"
            onClick={() => openSpecimenDetail(inventory, index)}
            className="overflow-hidden rounded-sm border border-expedition-brass/50 bg-black/25 text-left transition hover:border-expedition-gold hover:shadow-[0_0_12px_rgba(227,197,133,0.25)] focus:outline-none focus:ring-1 focus:ring-expedition-gold/60"
          >
            <div className="aspect-square w-full overflow-hidden border-b border-expedition-brass/40 bg-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={specimen.image || `/specimens/${specimen.id}.jpg`} alt={specimen.name} className="h-full w-full object-cover sepia-[0.25]" draggable={false} />
            </div>
            <div className="p-1.5">
              <div className="truncate font-expedition text-[11.5px] font-medium text-expedition-parchment">{specimen.name}</div>
              <div className="truncate font-expedition text-[10px] italic text-expedition-faded">{specimen.latin}</div>
              <span className={`mt-1 inline-block rounded-full border px-1.5 py-0.5 text-[7.5px] uppercase tracking-[0.1em] ${CONDITION_STYLES[specimen.condition] || 'border-expedition-brass/40 text-expedition-gold/85'}`}>
                {(specimen.condition || 'cased').replace(/_/g, ' ')}
              </span>
            </div>
          </button>
        ) : (
          <div key={`empty-${index}`} className="flex aspect-[3/4] items-center justify-center rounded-sm border border-dashed border-expedition-brass/30 bg-black/10">
            <span className="font-expedition text-[10px] uppercase tracking-[0.14em] text-expedition-faded/60">Empty</span>
          </div>
        ))}
      </div>
      {inventory.length === 0 && (
        <p className="mt-3 text-center font-expedition text-[12px] italic text-expedition-faded">
          The case stands empty. Everything ahead of you is still uncollected.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function InventoryModal({ open, onClose, initialTab = 'tools' }) {
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [initialTab, open]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-expedition-ink/60 p-3 backdrop-blur-[2px] sm:p-6"
      onClick={onClose}
      onKeyDown={event => event.stopPropagation()}
    >
      <ExpeditionPanel variant="modal" className="max-h-full w-[min(58rem,100%)] overflow-y-auto" innerClassName="p-3 sm:p-5">
        <div onClick={event => event.stopPropagation()}>
          <div className="relative text-center">
            <h2 className="font-expedition text-[22px] font-semibold uppercase tracking-[0.18em] text-expedition-parchment">
              Inventory <span className="text-expedition-gold">&amp;</span> Tools
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inventory"
              className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-sm border border-expedition-brass/60 font-expedition text-sm text-expedition-faded transition hover:border-expedition-gold hover:text-expedition-goldbright"
            >
              ✕
            </button>
          </div>

          <PanelTabs
            className="mx-auto mt-3 w-[22rem] max-w-full"
            tabs={[
              { id: 'tools', label: 'Tools' },
              { id: 'supplies', label: 'Supplies' },
              { id: 'case', label: 'Specimen Case' },
            ]}
            active={tab}
            onSelect={setTab}
          />

          <div className="pt-3.5">
            {tab === 'tools' && <ToolsTab />}
            {tab === 'supplies' && <SuppliesTab />}
            {tab === 'case' && <SpecimenCaseTab />}
          </div>

          <div className="mt-4 flex justify-end border-t border-expedition-brass/40 pt-3">
            <button type="button" onClick={onClose} className={`${GOLD_BUTTON_SOLID} min-w-[6rem] uppercase`}>
              Done
            </button>
          </div>
        </div>
      </ExpeditionPanel>
    </div>
  );
}
