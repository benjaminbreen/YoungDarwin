'use client';

import React, { useMemo, useState } from 'react';
import { useThreeGameStore } from '../../../store';
import { getZone } from '../../../world/floreanaZones';
import { ExpeditionPanel, PanelTabs, GOLD_BUTTON_SOLID, GOLD_LABEL, GoldDivider } from '../ExpeditionPanel';
import { CompassRoseIcon, NorthArrowIcon } from '../icons';
import { useTerrainChart } from '../TerrainMinimap';
import {
  ZoomablePane,
  MapMarker,
  LegendList,
  LegendRow,
  LocationDetailCard,
  MapScaleBar,
  ZoomControls,
} from './MapKit';
import {
  islandMapLocations,
  getIslandMapLocation,
  ISLAND_MAP_IMAGE,
  ISLAND_MAP_ASPECT,
  ISLAND_MAP_WIDTH_KM,
} from './islandLocations';

function formatExpeditionDate(day) {
  const start = new Date(Date.UTC(1835, 8, 17));
  start.setUTCDate(start.getUTCDate() + Math.max(0, (day || 1) - 1));
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(start);
}

const TYPE_LABELS = {
  bay: 'Anchorage & bay',
  beach: 'Shoreline survey',
  beagle: 'Ship of the survey',
  reef: 'Reef & shallows',
  ocean: 'Open water',
  coastallava: 'Coastal lava',
  coastalTrail: 'Coastal trail',
  lavafield: 'Lava field',
  scrubland: 'Scrubland',
  highland: 'Highland',
  forest: 'Forest',
  wetland: 'Wetland',
  cliff: 'Sea cliffs',
  promontory: 'Promontory',
  settlement: 'Settlement',
  clearing: 'Clearing',
  grassland: 'Grass test field',
  camp: 'Camp',
  shipwreck: 'Wreck site',
  hut: 'Dwelling',
  shipInterior: 'Shipboard interior',
};

const LEGEND_ICONS = {
  current: (
    <span className="relative flex h-4 w-4 items-center justify-center">
      <span className="absolute h-4 w-4 rounded-full border border-expedition-goldbright/70" />
      <span className="h-2 w-2 rounded-full bg-expedition-goldbright" />
    </span>
  ),
  surveyed: <span className="h-2.5 w-2.5 rounded-full border border-expedition-ink bg-expedition-goldbright shadow-[0_0_6px_rgba(227,197,133,0.6)]" />,
  uncharted: <span className="h-2 w-2 rotate-45 border border-expedition-gold/85 bg-transparent" />,
  anchorage: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
      <circle cx="12" cy="5" r="2.4" />
      <path d="M12 7.5 V20 M5 13 c0 4 3.2 7 7 7 s7 -3 7 -7 M8.5 10.5 h7" />
    </svg>
  ),
  water: <span className="h-2 w-2 rotate-45 border border-expedition-parchment/60 bg-transparent" />,
  test: <span className="h-2.5 w-2.5 rotate-45 border border-expedition-faded bg-expedition-ink/70" />,
};

// ---------------------------------------------------------------------------

function IslandTab({ selectedId, onSelectLocation, onRequestClose }) {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const [filters, setFilters] = useState({ land: true, anchorage: true, water: true, test: false });

  const toggle = key => setFilters(prev => ({ ...prev, [key]: !prev[key] }));

  const visibleLocations = useMemo(() => islandMapLocations.filter(location => {
    if (location.id === currentZoneId) return true;
    if (location.isTest) return filters.test;
    if (location.kind === 'anchorage' || location.kind === 'shipInterior') return filters.anchorage;
    if (location.kind === 'water') return filters.water;
    return filters.land;
  }), [filters, currentZoneId]);

  const handleBackgroundClick = (point, event) => {
    if (event.shiftKey && process.env.NODE_ENV !== 'production') {
      // Dev affordance for tuning marker placement in islandLocations.js.
      console.log(`island map coords: [${point.x.toFixed(3)}, ${point.y.toFixed(3)}]`);
    } else {
      onSelectLocation(null);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_15.5rem]">
      <div className="relative overflow-hidden rounded-sm border border-expedition-brass/60 bg-[#27505d] shadow-[inset_0_0_24px_rgba(0,0,0,0.55)]">
        <ZoomablePane
          imageUrl={ISLAND_MAP_IMAGE}
          aspect={ISLAND_MAP_ASPECT}
          maxZoom={4.5}
          className="max-h-[62vh] w-full"
          onBackgroundClick={handleBackgroundClick}
          overlay={({ zoom, paneWidth, zoomIn, zoomOut }) => (
            <>
              <CompassRoseIcon className="pointer-events-none absolute left-4 top-4 h-14 w-14 text-expedition-parchment/70 drop-shadow-[0_2px_3px_rgba(0,0,0,0.7)]" />
              <span className="pointer-events-none absolute right-3 top-3 flex items-center text-expedition-parchment/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">
                <NorthArrowIcon className="h-4 w-4" />
                <span className="font-expedition text-[11px] font-semibold">N</span>
              </span>
              <MapScaleBar zoom={zoom} paneWidth={paneWidth} mapWidthKm={ISLAND_MAP_WIDTH_KM} className="absolute bottom-3 left-3" />
              <ZoomControls zoomIn={zoomIn} zoomOut={zoomOut} className="absolute bottom-3 right-3" />
            </>
          )}
        >
          {zoom => visibleLocations.map(location => (
            <MapMarker
              key={location.id}
              location={location}
              zoom={zoom}
              selected={selectedId === location.id}
              isCurrent={currentZoneId === location.id}
              onSelect={loc => onSelectLocation(loc.id)}
            />
          ))}
        </ZoomablePane>
      </div>

      <IslandSidebar
        filters={filters}
        onToggle={toggle}
        selectedId={selectedId}
        currentZoneId={currentZoneId}
        onSelectLocation={onSelectLocation}
        onRequestClose={onRequestClose}
      />
    </div>
  );
}

function SelectedLocationCard({ location, isCurrent, onRequestClose }) {
  const beginZoneTransition = useThreeGameStore(state => state.beginZoneTransition);
  const live = location.status === 'available';

  const action = isCurrent ? (
    <div className="flex items-center justify-center gap-1.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-expedition-gold/90">
      <span className="h-1.5 w-1.5 rounded-full bg-expedition-goldbright shadow-[0_0_6px_rgba(227,197,133,0.7)]" />
      You are here
    </div>
  ) : live ? (
    <button
      type="button"
      onClick={() => {
        beginZoneTransition(location.id, { entryEdge: null });
        onRequestClose?.();
      }}
      className={`${GOLD_BUTTON_SOLID} w-full uppercase`}
    >
      Set as Destination
    </button>
  ) : (
    <div className="rounded-sm border border-expedition-brass/50 bg-black/30 px-2.5 py-1.5 text-center text-[10.5px] uppercase tracking-[0.16em] text-expedition-faded">
      Uncharted — travel not yet possible
    </div>
  );

  return (
    <LocationDetailCard
      title={location.name}
      subtitle={TYPE_LABELS[location.type] || location.type}
      thumbnail={(
        // Zoomed crop of the island painting centred on the location — keeps
        // the card inside the chart's aesthetic for stubs and live maps alike.
        <div
          className="h-full w-full"
          style={{
            backgroundImage: `url(${ISLAND_MAP_IMAGE})`,
            backgroundSize: '420%',
            backgroundPosition: `${location.at.x * 100}% ${location.at.y * 100}%`,
          }}
        />
      )}
      lines={[location.description].filter(Boolean)}
      note={location.notableFeatures.length > 0 ? location.notableFeatures.join(' · ') : null}
      action={action}
    />
  );
}

function IslandSidebar({ filters, onToggle, selectedId, currentZoneId, onSelectLocation, onRequestClose }) {
  const selected = getIslandMapLocation(selectedId) || getIslandMapLocation(currentZoneId);

  return (
    <div className="grid content-start gap-3">
      <LegendList>
        <LegendRow icon={LEGEND_ICONS.current} label="Current Location" active />
        <LegendRow icon={LEGEND_ICONS.surveyed} label="Map areas" active={filters.land} onToggle={() => onToggle('land')} />
        <LegendRow icon={LEGEND_ICONS.anchorage} label="Anchorages" active={filters.anchorage} onToggle={() => onToggle('anchorage')} />
        <LegendRow icon={LEGEND_ICONS.water} label="Surf & offshore" active={filters.water} onToggle={() => onToggle('water')} />
        <LegendRow icon={LEGEND_ICONS.test} label="Test maps" active={filters.test} onToggle={() => onToggle('test')} />
      </LegendList>
      <GoldDivider />
      {selected ? (
        <SelectedLocationCard location={selected} isCurrent={selected.id === currentZoneId} onRequestClose={onRequestClose} />
      ) : (
        <p className="px-1 font-expedition text-[12px] italic text-expedition-faded">
          Select a marker to read the survey notes for that ground.
        </p>
      )}
      {selectedId && selectedId !== currentZoneId && (
        <button
          type="button"
          onClick={() => onSelectLocation(null)}
          className="justify-self-start text-[10px] uppercase tracking-[0.14em] text-expedition-faded transition hover:text-expedition-gold"
        >
          Clear selection
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local tab: large rendition of the current zone's hillshaded survey chart.

function LocalTab() {
  const currentZoneId = useThreeGameStore(state => state.currentZoneId);
  const playerPose = useThreeGameStore(state => state.playerPose);
  const zone = getZone(currentZoneId);
  const chartUrl = useTerrainChart(zone);

  const width = zone.terrainWidth || zone.terrainSize || (zone.bounds ? zone.bounds * 2 : 100);
  const depth = zone.terrainDepth || zone.terrainSize || (zone.bounds ? zone.bounds * 2 : width);
  const position = playerPose.position || { x: 0, z: 0 };
  const player = {
    x: Math.max(0.03, Math.min(0.97, ((position.x || 0) + width / 2) / width)),
    y: Math.max(0.03, Math.min(0.97, ((position.z || 0) + depth / 2) / depth)),
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_15.5rem]">
      <div className="relative overflow-hidden rounded-sm border border-expedition-brass/60 bg-[#27505d] shadow-[inset_0_0_24px_rgba(0,0,0,0.55)]">
        {chartUrl ? (
          <ZoomablePane
            imageUrl={chartUrl}
            aspect={1}
            maxZoom={3}
            className="max-h-[62vh] w-full"
            overlay={({ zoom, paneWidth, zoomIn, zoomOut }) => (
              <>
                <MapScaleBar zoom={zoom} paneWidth={paneWidth} mapWidthKm={width / 1000} className="absolute bottom-3 left-3" />
                <ZoomControls zoomIn={zoomIn} zoomOut={zoomOut} className="absolute bottom-3 right-3" />
                <span className="pointer-events-none absolute right-3 top-3 flex items-center text-expedition-parchment/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">
                  <NorthArrowIcon className="h-4 w-4" />
                  <span className="font-expedition text-[11px] font-semibold">N</span>
                </span>
              </>
            )}
          >
            {zoom => (
              <span
                className="absolute flex h-5 w-5 items-center justify-center rounded-full border border-expedition-goldbright/90 bg-expedition-ink/68 shadow-lg"
                style={{
                  left: `${player.x * 100}%`,
                  top: `${player.y * 100}%`,
                  transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                }}
                title="Darwin"
              >
                <span className="h-0 w-0 border-b-[7px] border-l-[3.5px] border-r-[3.5px] border-b-expedition-goldbright border-l-transparent border-r-transparent" />
              </span>
            )}
          </ZoomablePane>
        ) : (
          <div className="flex aspect-square items-center justify-center font-expedition text-sm italic text-expedition-faded">
            Drafting survey chart…
          </div>
        )}
      </div>
      <div className="grid content-start gap-3">
        <div>
          <div className={GOLD_LABEL}>Survey Area</div>
          <div className="mt-1 font-expedition text-[15px] font-semibold text-expedition-parchment">{zone.name}</div>
          {zone.subtitle && <div className="mt-0.5 font-expedition text-[11px] italic text-expedition-faded">{zone.subtitle}</div>}
        </div>
        <GoldDivider />
        {zone.neighbors?.length > 0 && (
          <div>
            <div className={`${GOLD_LABEL} mb-1.5`}>Routes Out</div>
            <div className="grid gap-1">
              {zone.neighbors.map(route => (
                <div key={`${route.zoneId}-${route.edge}`} className="flex items-center gap-2 rounded-sm border border-expedition-brass/45 bg-black/20 px-2.5 py-1.5">
                  <CompassRoseIcon className="h-4 w-4 shrink-0 text-expedition-gold/80" />
                  <span className="min-w-0">
                    <span className="block truncate font-expedition text-[12px] font-medium text-expedition-parchment">{route.label}</span>
                    <span className="text-[10px] text-expedition-faded">{route.minutes || 0}m · +{route.fatigue || 0} fatigue</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function IslandMapModal({ open, onClose }) {
  const [tab, setTab] = useState('island');
  const [selectedId, setSelectedId] = useState(null);
  const day = useThreeGameStore(state => state.day);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-expedition-ink/60 p-3 backdrop-blur-[2px] sm:p-6"
      onClick={onClose}
    >
      <ExpeditionPanel
        variant="modal"
        className="max-h-full w-[min(64rem,100%)] overflow-y-auto"
        innerClassName="p-3 sm:p-4"
      >
        <div onClick={event => event.stopPropagation()}>
          <div className="relative">
            <PanelTabs
              className="mx-auto w-56"
              tabs={[
                { id: 'island', label: 'Island' },
                { id: 'local', label: 'Local' },
              ]}
              active={tab}
              onSelect={setTab}
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close map"
              className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-sm border border-expedition-brass/60 font-expedition text-sm text-expedition-faded transition hover:border-expedition-gold hover:text-expedition-goldbright"
            >
              ✕
            </button>
          </div>

          <div className="my-3 text-center">
            <h2 className="font-expedition text-[22px] font-semibold tracking-wide text-expedition-parchment">
              Charles Island <span className="italic text-expedition-gold">(Floreana)</span>
            </h2>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.2em] text-expedition-faded">
              also called Santa Maria · {formatExpeditionDate(day)}
            </p>
          </div>

          {tab === 'island' ? (
            <IslandTab selectedId={selectedId} onSelectLocation={setSelectedId} onRequestClose={onClose} />
          ) : (
            <LocalTab />
          )}

          <GoldDivider className="mt-3" />
          <p className="mt-2 text-center font-expedition text-[11px] italic text-expedition-faded">
            Visited by HMS Beagle, September 1835 — soundings and interior detail after the Admiralty survey.
          </p>
        </div>
      </ExpeditionPanel>
    </div>
  );
}
