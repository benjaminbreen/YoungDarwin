'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useThreeGameStore } from '../../store';
import { SpecimenShape } from '../../components/world/SpecimenActor';

// ---------------------------------------------------------------------------
// Derivations — the mockup shows fields the data doesn't store directly.

function expeditionDate(day) {
  const start = new Date(Date.UTC(1835, 8, 17));
  start.setUTCDate(start.getUTCDate() + Math.max(0, (day || 1) - 1));
  return start;
}

function formatExpeditionDate(day) {
  if (!day) return 'Not yet collected';
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(expeditionDate(day));
}

function timeOfDayWord(timeOfDay) {
  if (timeOfDay == null) return 'Unrecorded';
  const hour = timeOfDay ?? 9;
  if (hour < 5) return 'Before dawn';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  if (hour < 20) return 'Evening';
  return 'Night';
}

function catalogueNumber(day, index) {
  const date = expeditionDate(day);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `FLO‑1835‑${mm}‑${dd}‑${String(index + 1).padStart(2, '0')}`;
}

const CONDITION_WORDS = {
  pristine: 'Excellent', intact: 'Excellent', clean_specimen: 'Excellent',
  documented: 'Documented only', minor_damage: 'Good', damaged: 'Fair',
  partial: 'Partial', destroyed: 'Ruined',
};

const CONDITION_CONFIDENCE = {
  pristine: 95, intact: 92, clean_specimen: 90, minor_damage: 82, damaged: 64, partial: 48, destroyed: 20,
};

function taxonomyTrail(specimen) {
  return [specimen.ontology, specimen.order, specimen.sub_order].filter(Boolean);
}

const PRESERVATION_BY_ORDER = {
  Bird: 'Dry specimen (skin)',
  Reptile: 'Dry specimen (skin)',
  Mammal: 'Dry specimen (skin)',
  Insect: 'Pinned, papered',
  Fish: 'Preserved in spirits',
  Amphibian: 'Preserved in spirits',
  Plant: 'Pressed and dried',
  Mineral: 'Wrapped, crated',
};

const SYMS_COMMENTS = {
  Reptile: '“Ugly brute. Nearly bit my boot.”',
  Bird: '“A clean skin, sir. The Society will be pleased.”',
  Insect: '“Fiddly work, the pins. Don’t sneeze.”',
  Fish: '“Smells worse in spirits than out of them.”',
  Plant: '“Pressed flat as the Captain’s humor, sir.”',
  Mineral: '“Heavy. Of course it’s heavy. It’s a rock, sir.”',
  Mammal: '“Held still better than most, this one.”',
};

function habitatLines(specimen) {
  const parts = String(specimen.habitat || '').split(',').map(part => part.trim()).filter(Boolean);
  const pretty = {
    scrubland: 'Scrubland', coastalTrail: 'Coastal trail', coastallava: 'Coastal lava',
    lavafield: 'Lava field', highland: 'Highland', forest: 'Forest', wetland: 'Wetland',
    beach: 'Shoreline', bay: 'Bay', reef: 'Reef & shallows', cliff: 'Sea cliffs',
  };
  return parts.map(part => pretty[part] || part.charAt(0).toUpperCase() + part.slice(1));
}

// Typography constants tuned to the mockup: spaced small-cap labels in dim
// gold, serif values in parchment, italics for anything spoken or quoted.
const LABEL = 'text-[11px] font-semibold uppercase tracking-[0.24em] text-expedition-gold/90';
const SECTION = 'font-expedition text-[15px] font-semibold tracking-[0.1em] text-expedition-gold [font-variant-caps:small-caps]';
const VALUE = 'font-expedition text-[15.5px] leading-snug text-expedition-parchment';
const SUBVALUE = 'font-expedition text-[12.5px] text-expedition-faded';

function MetaIcon({ kind }) {
  const paths = {
    calendar: <path d="M5 6 h14 v14 H5 Z M5 10 h14 M9 4 v4 M15 4 v4" />,
    pin: <path d="M12 21 C8 15.5 6 13 6 10 a6 6 0 1 1 12 0 c0 3 -2 5.5 -6 11 Z M12 10 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0" />,
    waves: <path d="M3 9 c3 -2.5 6 -2.5 9 0 s6 2.5 9 0 M3 15 c3 -2.5 6 -2.5 9 0 s6 2.5 9 0" />,
    person: <path d="M12 11 a3.5 3.5 0 1 0 0 -7 a3.5 3.5 0 0 0 0 7 Z M5 20 a7 7 0 0 1 14 0" />,
    case: <path d="M4 9 h16 v10 H4 Z M4 12.5 h16 M9.5 9 V7 a1.5 1.5 0 0 1 1.5 -1.5 h2 A1.5 1.5 0 0 1 14.5 7 v2" />,
    star: <path d="M12 4 l2.2 4.9 5.3 0.6 -4 3.6 1.1 5.2 -4.6 -2.7 -4.6 2.7 1.1 -5.2 -4 -3.6 5.3 -0.6 Z" />,
    box: <path d="M12 3 L20 7.5 v9 L12 21 L4 16.5 v-9 Z M4 7.5 L12 12 L20 7.5 M12 12 V21" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0 text-expedition-gold/80">
      {paths[kind]}
    </svg>
  );
}

function MetaRow({ icon, label, value, sub }) {
  return (
    <div className="flex gap-3 py-2.5">
      <span className="pt-0.5"><MetaIcon kind={icon} /></span>
      <div className="min-w-0">
        <div className={`${LABEL} mb-1`}>{label}</div>
        <div className={VALUE}>{value}</div>
        {sub && <div className={`${SUBVALUE} mt-0.5`}>{sub}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Specimen plate: photograph when one exists, the live in-game 3D model when
// it doesn't.

function Specimen3DPlate({ specimen }) {
  return (
    <Canvas
      className="absolute inset-0"
      camera={{ position: [2.1, 1.5, 2.6], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'radial-gradient(circle at 50% 62%, #23211c 0%, #121110 52%, #070707 100%)' }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 5, 2]} intensity={1.4} color="#f3e2b5" />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#7a86a0" />
      <Suspense fallback={null}>
        <SlowTurntable>
          <SpecimenShape specimen={specimen} />
        </SlowTurntable>
      </Suspense>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[2.2, 48]} />
        <meshStandardMaterial color="#171511" />
      </mesh>
    </Canvas>
  );
}

function SlowTurntable({ children }) {
  const [group, setGroup] = useState(null);
  useEffect(() => {
    if (!group) return undefined;
    let frame;
    const tick = () => {
      group.rotation.y += 0.004;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [group]);
  return <group ref={setGroup}>{children}</group>;
}

function SpecimenPlate({ specimen }) {
  const [failed, setFailed] = useState(false);
  const src = specimen.image || `/specimens/${specimen.id}.jpg`;

  useEffect(() => setFailed(false), [specimen.id]);

  if (failed) return <Specimen3DPlate specimen={specimen} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={specimen.name}
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover"
      draggable={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Tabs

function SummaryTab({ specimen, entry }) {
  const habitat = habitatLines(specimen);
  const condition = CONDITION_WORDS[specimen.condition] || (specimen.condition || 'Cased').replace(/_/g, ' ');
  const confidence = CONDITION_CONFIDENCE[specimen.condition] ?? 75;
  const traits = (specimen.details || []).slice(0, 5);
  const symsComment = SYMS_COMMENTS[specimen.order] || '“Labeled and stowed, sir.”';
  const hasRecord = Boolean(entry?.id);

  return (
    <div>
      {/* Meta grid */}
      <div className="grid grid-cols-2 border-b border-expedition-brass/30 pb-3">
        <div className="grid content-start divide-y divide-expedition-brass/20 pr-5">
          <MetaRow icon="calendar" label="Collected" value={formatExpeditionDate(entry?.day)} sub={timeOfDayWord(entry?.timeOfDay)} />
          <MetaRow icon="pin" label="Location" value={entry?.location || 'Unrecorded'} sub="Isla Floreana" />
          <MetaRow icon="waves" label="Habitat" value={habitat[0] || 'Unrecorded'} sub={habitat[1]} />
        </div>
        <div className="grid content-start divide-y divide-expedition-brass/20 border-l border-expedition-brass/25 pl-5">
          <MetaRow icon="person" label={hasRecord ? 'Collected by' : 'Observer'} value="Charles Darwin" />
          <MetaRow icon="person" label={hasRecord ? 'Assisted by' : 'Assistant'} value="Syms Covington" />
          <MetaRow icon="case" label="Condition" value={condition} />
          <MetaRow icon="star" label="Confidence" value={`${confidence}%`} />
        </div>
      </div>

      {/* Field notes */}
      <div className="border-b border-expedition-brass/30 py-4">
        <div className={`${SECTION} mb-2.5`}>Field Notes</div>
        <div className="grid gap-4 sm:grid-cols-[1fr_15rem]">
          <div className="flex gap-2.5">
            <span className="-mt-1 select-none font-expedition text-[30px] leading-none text-expedition-gold/60">&ldquo;</span>
            <p className="font-expedition text-[15.5px] italic leading-[1.75] text-expedition-parchment/95">
              {hasRecord ? entry.content : specimen.description}
            </p>
          </div>
          <div className="relative hidden min-h-[9rem] overflow-hidden rounded-[2px] border border-expedition-brass/30 sm:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={specimen.image || `/specimens/${specimen.id}.jpg`}
              alt=""
              onError={event => { event.currentTarget.style.display = 'none'; }}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ filter: 'sepia(0.95) contrast(1.25) brightness(0.62)' }}
              draggable={false}
            />
            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(10,9,7,0.35),transparent_60%)]" />
          </div>
        </div>
      </div>

      {/* Traits + Syms */}
      <div className="grid gap-5 border-b border-expedition-brass/30 py-4 sm:grid-cols-[1fr_17rem]">
        <div>
          <div className={`${SECTION} mb-2.5`}>Observed Traits</div>
          <ul className="grid gap-1.5">
            {traits.length > 0 ? traits.map(trait => (
              <li key={trait} className="flex gap-2.5 font-expedition text-[14.5px] leading-snug text-expedition-parchment/95">
                <span className="mt-[9px] h-[3.5px] w-[3.5px] shrink-0 rounded-full bg-expedition-gold/85" />
                <span>{trait}</span>
              </li>
            )) : (
              <li className="font-expedition text-[13.5px] italic text-expedition-faded">No traits recorded in the field.</li>
            )}
          </ul>
        </div>
        <div className="self-start rounded-[2px] border border-expedition-brass/40 bg-black/15 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-expedition-brass/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/portraits/syms_covington.jpg" alt="Syms Covington" className="h-full w-full object-cover sepia-[0.4]" />
            </div>
            <div className={LABEL}>Syms&rsquo;s Comment</div>
          </div>
          <p className="mt-2 font-expedition text-[14px] italic leading-relaxed text-expedition-parchment/95">{symsComment}</p>
        </div>
      </div>

      {/* Collection info */}
      <div className="pt-4">
        <div className="mb-2.5 flex items-center gap-2.5">
          <MetaIcon kind="box" />
          <span className={SECTION}>Collection Info</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            ['Catalogue Number', catalogueNumber(entry?.day, entry?.caseIndex ?? 0)],
            ['Method', hasRecord && entry?.method ? `Captured with ${entry.method.toLowerCase()}` : 'Not yet collected'],
            ['Preservation', specimen.condition === 'documented' ? 'Field record only' : PRESERVATION_BY_ORDER[specimen.order] || 'Wrapped, crated'],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="font-expedition text-[14px] italic text-expedition-gold/90">{label}</div>
              <div className={`${VALUE} mt-1`}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SketchesTab({ specimen }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [specimen.id]);
  return (
    <div className="grid gap-3">
      <div className="relative min-h-[20rem] overflow-hidden rounded-[2px] border border-expedition-brass/40 bg-black/30">
        {failed ? (
          <Specimen3DPlate specimen={specimen} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={specimen.image || `/specimens/${specimen.id}.jpg`}
            alt={`Field sketch of ${specimen.name}`}
            onError={() => setFailed(true)}
            className="max-h-[28rem] w-full object-cover"
            style={{ filter: 'sepia(0.85) contrast(1.25) brightness(0.85)' }}
            draggable={false}
          />
        )}
      </div>
      <p className="text-center font-expedition text-[13px] italic text-expedition-faded">
        Field sketch, pencil and wash &mdash; drawn at the point of collection.
      </p>
    </div>
  );
}

function NotesTab({ specimen, entries }) {
  return (
    <div className="grid content-start gap-2.5">
      {entries.length > 0 ? entries.map(entry => (
        <div key={entry.id} className="rounded-[2px] border border-expedition-brass/40 bg-black/15 px-4 py-3">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className={LABEL}>{formatExpeditionDate(entry.day)} &middot; {timeOfDayWord(entry.timeOfDay)}</span>
            <span className="font-expedition text-[12px] text-expedition-faded">{entry.location}</span>
          </div>
          <p className="font-expedition text-[14.5px] italic leading-relaxed text-expedition-parchment/95">{entry.content}</p>
        </div>
      )) : (
        <p className="py-8 text-center font-expedition text-[14px] italic text-expedition-faded">
          No journal entries mention the {specimen.name} yet.
        </p>
      )}
      {specimen.contents && (
        <div className="rounded-[2px] border border-expedition-brass/40 bg-black/15 px-4 py-3">
          <div className={`${LABEL} mb-1.5`}>On Dissection</div>
          <p className="font-expedition text-[14.5px] italic leading-relaxed text-expedition-parchment/95">{specimen.contents}</p>
        </div>
      )}
    </div>
  );
}

function SpecimenTab({ specimen, entry }) {
  const condition = CONDITION_WORDS[specimen.condition] || (specimen.condition || 'Cased').replace(/_/g, ' ');
  return (
    <div className="grid content-start gap-4">
      <p className="font-expedition text-[15px] leading-[1.75] text-expedition-parchment/95">{specimen.description}</p>
      {specimen.scientificValue && (
        <div>
          <div className={`${SECTION} mb-1.5`}>Scientific Value</div>
          <p className="font-expedition text-[14px] italic leading-relaxed text-expedition-parchment/90">{specimen.scientificValue}</p>
        </div>
      )}
      <div className="h-px bg-[linear-gradient(90deg,transparent,rgba(201,163,95,0.5),transparent)]" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {[
          ['Condition', condition],
          ['Method', entry?.method || 'Unrecorded'],
          ['Danger', specimen.danger || 'Low'],
          ['Best sought', specimen.timeofday || 'Any hour'],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="font-expedition text-[14px] italic text-expedition-gold/90">{label}</div>
            <div className={`${VALUE} mt-0.5`}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'sketches', label: 'Sketches' },
  { id: 'notes', label: 'Notes' },
  { id: 'specimen', label: 'Specimen' },
];

export function SpecimenDetailModal() {
  const detail = useThreeGameStore(state => state.specimenDetail);
  const navigate = useThreeGameStore(state => state.navigateSpecimenDetail);
  const onClose = useThreeGameStore(state => state.closeSpecimenDetail);
  const journal = useThreeGameStore(state => state.journal);
  const favorites = useThreeGameStore(state => state.favoriteSpecimenIds);
  const toggleFavorite = useThreeGameStore(state => state.toggleFavoriteSpecimen);
  const [tab, setTab] = useState('summary');

  const specimens = detail?.specimens || [];
  const index = detail?.index ?? 0;
  const specimen = specimens[index];

  useEffect(() => {
    if (!detail) return undefined;
    const onKeyDown = event => {
      event.stopPropagation();
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigate(index - 1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigate(index + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detail, index, navigate, onClose]);

  if (!detail || !specimen) return null;

  const entries = journal.filter(item => item.specimenId === specimen.id);
  const entry = entries.length > 0 ? { ...entries[0], caseIndex: index } : { caseIndex: index };
  const isFavorite = favorites.includes(specimen.id);
  const trail = taxonomyTrail(specimen);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#070604]/80 p-2 backdrop-blur-[3px] sm:p-5"
      onClick={onClose}
    >
      <div
        onClick={event => event.stopPropagation()}
        className="relative grid h-[min(58rem,94vh)] w-[min(96rem,97vw)] overflow-hidden rounded-[4px] border border-expedition-brass/70 font-expedition text-expedition-parchment shadow-[0_30px_90px_rgba(0,0,0,0.8)] lg:grid-cols-[minmax(0,46%)_1fr]"
        style={{ background: 'linear-gradient(150deg, #11100e, #0a0908 55%, #060505)' }}
      >
        <div className="pointer-events-none absolute inset-[5px] z-30 rounded-[2px] border border-expedition-gold/18" />

        {/* ------------------------------------------------ Left: the plate */}
        <div className="relative hidden lg:block">
          <SpecimenPlate specimen={specimen} />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,5,4,0.82)_0%,rgba(6,5,4,0.25)_26%,transparent_45%,transparent_60%,rgba(6,5,4,0.88)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_72%,rgba(6,5,4,0.5)_100%)]" />

          <button
            type="button"
            onClick={() => toggleFavorite(specimen.id)}
            aria-label={isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
            className={`absolute left-6 top-6 z-20 flex h-10 w-10 items-center justify-center rounded-[2px] border transition ${
              isFavorite
                ? 'border-expedition-gold bg-expedition-gold/25 text-expedition-goldbright'
                : 'border-expedition-brass/50 bg-black/35 text-expedition-parchment/65 hover:border-expedition-gold hover:text-expedition-gold'
            }`}
          >
            <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]">
              <path d="M12 20 C7 15.5 4 12.8 4 9.6 A4.1 4.1 0 0 1 12 8 a4.1 4.1 0 0 1 8 1.6 c0 3.2 -3 5.9 -8 10.4 Z" />
            </svg>
          </button>

          <div className="absolute left-0 right-0 top-[4.5rem] z-20 px-9">
            <h2 className="text-[42px] font-medium leading-tight tracking-[0.08em] text-[#efe6d2] [font-variant-caps:small-caps] [text-shadow:0_3px_14px_rgba(0,0,0,0.95)]">
              {specimen.name.toLowerCase()}
            </h2>
            <div className="mt-1 text-[19px] italic tracking-wide text-[#d8cdb4]/95 [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]">
              {specimen.latin}
            </div>
            {/* Rule with center diamond, per mockup */}
            <div className="mt-4 flex max-w-[21rem] items-center gap-2">
              <span className="h-px flex-1 bg-gradient-to-r from-expedition-gold/0 via-expedition-gold/55 to-expedition-gold/55" />
              <span className="h-[5px] w-[5px] rotate-45 border border-expedition-gold/75" />
              <span className="h-px flex-1 bg-gradient-to-r from-expedition-gold/55 via-expedition-gold/55 to-expedition-gold/0" />
            </div>
            {trail.length > 0 && (
              <div className="mt-3.5 flex flex-wrap items-center gap-2.5 text-[15px] tracking-wide text-[#d8cdb4]/95 [text-shadow:0_1px_5px_rgba(0,0,0,0.95)]">
                {trail.map((step, stepIndex) => (
                  <React.Fragment key={step}>
                    {stepIndex > 0 && <span className="text-[11px] text-expedition-gold/80">&#9656;</span>}
                    <span>{step}</span>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-7 pb-6 text-[11px] font-semibold uppercase tracking-[0.22em]">
            <button
              type="button"
              onClick={() => navigate(index - 1)}
              disabled={index <= 0}
              className="flex items-center gap-2 text-[#d8cdb4]/90 transition enabled:hover:text-expedition-goldbright disabled:opacity-30"
            >
              <span className="text-expedition-gold">&#9666;</span> Previous Specimen
            </button>
            <div className="flex gap-2">
              {specimens.map((item, dotIndex) => (
                <button
                  key={`${item.id}-${dotIndex}`}
                  type="button"
                  onClick={() => navigate(dotIndex)}
                  aria-label={`Specimen ${dotIndex + 1}`}
                  className={`h-[7px] w-[7px] rounded-full transition ${dotIndex === index ? 'bg-expedition-goldbright' : 'bg-[#d8cdb4]/25 hover:bg-[#d8cdb4]/55'}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => navigate(index + 1)}
              disabled={index >= specimens.length - 1}
              className="flex items-center gap-2 text-[#d8cdb4]/90 transition enabled:hover:text-expedition-goldbright disabled:opacity-30"
            >
              Next Specimen <span className="text-expedition-gold">&#9656;</span>
            </button>
          </div>
        </div>

        {/* ------------------------------------------------ Right: the record */}
        <div className="relative z-20 flex min-h-0 flex-col lg:border-l lg:border-expedition-brass/40">
          <div className="flex shrink-0 items-stretch border-b border-expedition-brass/40">
            {TABS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative px-7 py-4 text-[12.5px] font-semibold uppercase tracking-[0.22em] transition ${
                  tab === item.id
                    ? 'bg-[#1a1814] text-[#efe6d2] before:absolute before:inset-x-0 before:bottom-0 before:h-[2px] before:bg-expedition-gold/85'
                    : 'text-expedition-faded hover:text-expedition-parchment'
                }`}
              >
                {item.label}
              </button>
            ))}
            <div className="flex flex-1 items-center justify-end pr-3">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close specimen record"
                className="flex h-9 w-9 items-center justify-center rounded-[2px] border border-expedition-brass/45 text-[15px] text-expedition-faded transition hover:border-expedition-gold hover:text-expedition-goldbright"
              >
                &#10005;
              </button>
            </div>
          </div>

          {/* Compact header for small screens, where the plate column is hidden */}
          <div className="border-b border-expedition-brass/40 px-5 py-3 lg:hidden">
            <div className="text-[22px] font-medium tracking-[0.08em] [font-variant-caps:small-caps]">{specimen.name.toLowerCase()}</div>
            <div className="text-[13px] italic text-expedition-faded">{specimen.latin}</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:thin] [scrollbar-color:rgba(201,163,95,0.65)_rgba(0,0,0,0.18)] sm:px-8">
            {tab === 'summary' && <SummaryTab specimen={specimen} entry={entry} />}
            {tab === 'sketches' && <SketchesTab specimen={specimen} />}
            {tab === 'notes' && <NotesTab specimen={specimen} entries={entries} />}
            {tab === 'specimen' && <SpecimenTab specimen={specimen} entry={entry} />}
          </div>
        </div>
      </div>
    </div>
  );
}
