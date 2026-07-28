'use client';

import React from 'react';
import { CompassRoseIcon } from './expedition/icons';
import {
  ARCHIVES,
  CLASSROOM_NOTE,
  COLOPHON,
  HISTORICAL_RECORD,
  IN_GAME_LIBRARY,
  METHODS_NOTE,
  READING_SECTIONS,
  SOURCES_PAGE,
} from '../sources/sourcesCatalog';

const SPLASH_BACKGROUND = '/assets/ui/splash-background-1672.webp';

// Citations carry <i> for titles. The content is authored in this repo and
// never derived from player or model input, so the markup is trusted.
function Markup({ html, className = '' }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function BrassRule({ className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-expedition-brass/80 ${className}`}>
      <span className="h-px w-20 bg-gradient-to-r from-transparent to-expedition-brass/75" />
      <span className="h-1.5 w-1.5 rotate-45 border border-expedition-brass/80" />
      <span className="h-px w-20 bg-gradient-to-l from-transparent to-expedition-brass/75" />
    </div>
  );
}

// One gold frame and four corner ornaments — the panel treatment used across
// the expedition HUD. Deliberately a single hairline, not a stacked pair.
function Panel({ id, children, className = '' }) {
  return (
    <section
      id={id}
      className={`relative scroll-mt-8 rounded-md border border-expedition-brass/70 bg-[rgba(13,18,20,0.86)] px-5 py-6 shadow-[0_22px_42px_rgba(0,0,0,0.5)] backdrop-blur-sm sm:px-8 sm:py-8 ${className}`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-[3px] rounded-[3px] border border-expedition-gold/20" />
      <div aria-hidden="true" className="pointer-events-none absolute left-2 top-2 h-3 w-3 rounded-tl-[3px] border-l border-t border-expedition-gold/55" />
      <div aria-hidden="true" className="pointer-events-none absolute right-2 top-2 h-3 w-3 rounded-tr-[3px] border-r border-t border-expedition-gold/55" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-2 left-2 h-3 w-3 rounded-bl-[3px] border-b border-l border-expedition-gold/55" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 rounded-br-[3px] border-b border-r border-expedition-gold/55" />
      <div className="relative">{children}</div>
    </section>
  );
}

function SectionHeading({ children }) {
  return (
    <h2 className="text-[clamp(1.35rem,2.4vw,1.75rem)] leading-tight tracking-[0.06em] text-expedition-goldbright">
      {children}
    </h2>
  );
}

function Blurb({ children }) {
  return <p className="mt-3 text-[15px] leading-relaxed text-expedition-parchment/78">{children}</p>;
}

function ExternalLink({ href, children, className = '' }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-expedition-gold underline decoration-expedition-brass/50 underline-offset-[3px] transition-colors hover:text-expedition-goldbright hover:decoration-expedition-goldbright focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright ${className}`}
    >
      {children}
    </a>
  );
}

const NAV_ITEMS = [
  { id: 'library', label: 'In-Game Library' },
  { id: 'record', label: 'Documented / Invented' },
  { id: 'reading', label: 'Further Reading' },
  { id: 'archives', label: 'Archives' },
  { id: 'methods', label: 'Generated Text' },
  { id: 'classroom', label: 'For Instructors' },
];

export function SourcesView({ onBack, backLabel = 'Back' }) {
  return (
    <main className="relative min-h-[100dvh] w-full bg-[#0a0d0e] font-expedition text-expedition-parchment">
      {/* The splash image is held far back as paper texture, not as a picture:
          it must never compete with body copy on a page meant for reading. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0">
        <img
          src={SPLASH_BACKGROUND}
          alt=""
          className="h-full w-full select-none object-cover object-center opacity-[0.13]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,11,12,0.86),rgba(8,11,12,0.95))]" />
      </div>

      <div className="relative mx-auto w-full max-w-[52rem] px-4 py-10 sm:px-6 sm:py-14">
        <header className="text-center">
          <CompassRoseIcon className="mx-auto h-9 w-9 text-expedition-brass/75" />
          <h1 className="mt-5 text-[clamp(1.9rem,5.5vw,3rem)] leading-none tracking-[0.11em] text-expedition-parchment sm:tracking-[0.16em]">
            {SOURCES_PAGE.title}
          </h1>
          <p className="mt-4 text-[13px] uppercase tracking-[0.22em] text-expedition-gold/85">{SOURCES_PAGE.subtitle}</p>
          <BrassRule className="mt-6" />
          <p className="mx-auto mt-6 max-w-[38rem] text-left text-[16px] leading-relaxed text-expedition-parchment/88 sm:text-center">
            {SOURCES_PAGE.standfirst}
          </p>
        </header>

        <nav aria-label="Sections" className="mt-9 flex flex-wrap justify-center gap-x-3 gap-y-2">
          {NAV_ITEMS.map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="rounded-sm border border-expedition-brass/45 px-3 py-1.5 text-[12px] uppercase tracking-[0.13em] text-expedition-parchment/80 transition-colors hover:border-expedition-gold/70 hover:text-expedition-goldbright focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="mt-10 grid gap-7">
          {/* In-game library */}
          <Panel id="library">
            <SectionHeading>{IN_GAME_LIBRARY.heading}</SectionHeading>
            <Blurb>{IN_GAME_LIBRARY.blurb}</Blurb>
            <ul className="mt-6 grid gap-5">
              {IN_GAME_LIBRARY.entries.map(book => (
                <li key={book.id} className="border-l border-expedition-brass/45 pl-4">
                  <p className="text-[16px] leading-snug text-expedition-parchment">
                    <span className="text-expedition-goldbright">{book.author}</span>, <i>{book.title}</i>
                  </p>
                  <p className="mt-1 text-[13.5px] text-expedition-faded">{book.edition}</p>
                  <p className="mt-2 text-[14px] italic leading-relaxed text-expedition-parchment/72">{book.provenance}</p>
                  {book.sourceUrl && (
                    <p className="mt-2 text-[13px]">
                      <ExternalLink href={book.sourceUrl}>Scanned source</ExternalLink>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          {/* Documented / reconstructed / invented */}
          <Panel id="record">
            <SectionHeading>{HISTORICAL_RECORD.heading}</SectionHeading>
            <Blurb>{HISTORICAL_RECORD.blurb}</Blurb>
            <div className="mt-6 grid gap-5">
              {HISTORICAL_RECORD.columns.map(column => (
                <div key={column.id} className="rounded-sm border border-expedition-brass/40 bg-black/25 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-[13px] uppercase tracking-[0.18em] text-expedition-gold">{column.label}</h3>
                    <p className="text-[13px] italic text-expedition-faded">{column.caption}</p>
                  </div>
                  <ul className="mt-3 grid gap-2.5">
                    {column.items.map(item => (
                      <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed text-expedition-parchment/88">
                        <span aria-hidden="true" className="mt-[0.55em] h-1 w-1 shrink-0 rotate-45 bg-expedition-brass/80" />
                        <Markup html={item} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Panel>

          {/* Annotated bibliography */}
          <Panel id="reading">
            <SectionHeading>Further Reading</SectionHeading>
            <Blurb>
              Annotated for this project rather than for the field as a whole: each note says what the work contributes to
              the island you have been walking around in.
            </Blurb>
            <div className="mt-7 grid gap-8">
              {READING_SECTIONS.map(section => (
                <div key={section.id} id={section.id} className="scroll-mt-8">
                  <h3 className="text-[13px] uppercase tracking-[0.18em] text-expedition-gold">{section.heading}</h3>
                  <p className="mt-2 text-[14.5px] italic leading-relaxed text-expedition-parchment/72">{section.blurb}</p>
                  <ul className="mt-4 grid gap-4">
                    {section.entries.map(entry => (
                      <li key={entry.citation} className="border-l border-expedition-brass/40 pl-4">
                        {/* Hanging-indent feel without a real hanging indent:
                            the rule carries the eye down the list instead. */}
                        <Markup
                          html={entry.citation}
                          className="block text-[15.5px] leading-relaxed text-expedition-parchment"
                        />
                        <p className="mt-1.5 text-[14px] leading-relaxed text-expedition-parchment/70">{entry.note}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Panel>

          {/* Archives */}
          <Panel id="archives">
            <SectionHeading>{ARCHIVES.heading}</SectionHeading>
            <Blurb>{ARCHIVES.blurb}</Blurb>
            <ul className="mt-5 grid gap-4">
              {ARCHIVES.entries.map(archive => (
                <li key={archive.url} className="border-l border-expedition-brass/45 pl-4">
                  <ExternalLink href={archive.url} className="text-[16px]">
                    {archive.label}
                  </ExternalLink>
                  <p className="mt-1 text-[14px] leading-relaxed text-expedition-parchment/72">{archive.note}</p>
                </li>
              ))}
            </ul>
          </Panel>

          {/* Generated text */}
          <Panel id="methods">
            <SectionHeading>{METHODS_NOTE.heading}</SectionHeading>
            <div className="mt-4 grid gap-4">
              {METHODS_NOTE.paragraphs.map(paragraph => (
                <p key={paragraph} className="text-[15.5px] leading-relaxed text-expedition-parchment/88">
                  {paragraph}
                </p>
              ))}
            </div>
            <div className="mt-6 rounded-sm border border-expedition-gold/45 bg-expedition-gold/[0.07] px-4 py-4 sm:px-5">
              <h3 className="text-[13px] uppercase tracking-[0.18em] text-expedition-goldbright">
                {METHODS_NOTE.caution.heading}
              </h3>
              <p className="mt-2.5 text-[15.5px] leading-relaxed text-expedition-parchment/92">{METHODS_NOTE.caution.body}</p>
            </div>
          </Panel>

          {/* Classroom */}
          <Panel id="classroom">
            <SectionHeading>{CLASSROOM_NOTE.heading}</SectionHeading>
            <div className="mt-4 grid gap-4">
              {CLASSROOM_NOTE.paragraphs.map(paragraph => (
                <p key={paragraph} className="text-[15.5px] leading-relaxed text-expedition-parchment/88">
                  {paragraph}
                </p>
              ))}
            </div>
          </Panel>

          {/* Colophon */}
          <Panel id="colophon">
            <SectionHeading>{COLOPHON.heading}</SectionHeading>
            <div className="mt-4 grid gap-3">
              {COLOPHON.lines.map(line => (
                <p key={line} className="text-[15px] leading-relaxed text-expedition-parchment/82">
                  {line}
                </p>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
              {COLOPHON.links.map(link => (
                <ExternalLink key={link.url} href={link.url}>
                  {link.label}
                </ExternalLink>
              ))}
            </div>
          </Panel>
        </div>

        <footer className="mt-10 flex flex-col items-center gap-6">
          <BrassRule />
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-sm border border-expedition-brass/60 px-6 py-2.5 text-[15px] tracking-[0.08em] text-expedition-parchment transition-colors hover:border-expedition-gold/75 hover:text-expedition-goldbright focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright"
            >
              {backLabel}
            </button>
          ) : (
            <a
              href="/three"
              className="rounded-sm border border-expedition-brass/60 px-6 py-2.5 text-[15px] tracking-[0.08em] text-expedition-parchment transition-colors hover:border-expedition-gold/75 hover:text-expedition-goldbright focus:outline-none focus-visible:ring-1 focus-visible:ring-expedition-goldbright"
            >
              Return to the expedition
            </a>
          )}
        </footer>
      </div>
    </main>
  );
}
