'use client';

import React, { useEffect, useState } from 'react';
import styles from './ReadableDocument.module.css';

// The Document tab of the examine notebook: a paper transcribed as Darwin
// sees it, page by page, with his English rendering of anything in Catalan
// or Spanish. The authored line markup is deliberately small:
//   '# '  heading            '## ' subheading
//   '> '  a later hand added to the sheet
//   '[…]' an editorial note (what is broken off, what the stick holds)
//   _x_   italic             ~x~  struck through

const FORM_LABELS = {
  broadside: 'Printed broadside',
  forme: 'Type in the forme',
  slip: 'Working note',
  book: 'Bound book',
  chalk: 'Chalked on oilcloth',
  map: 'Map legend',
  tally: 'Scratched in the rock',
  letter: 'Letter',
  journal: 'Daybook',
  board: 'Burned into a board',
  list: 'Folded list',
  slate: 'Chalked on slate',
  kegs: 'Chalked on the keg heads',
};

const RENDERING_NOTES = {
  Catalan: 'Darwin’s rendering, by way of Spanish and his Latin',
  Spanish: 'Darwin’s rendering',
};

function renderInline(text) {
  const parts = [];
  const pattern = /(_[^_]+_|~[^~]+~)/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const inner = token.slice(1, -1);
    parts.push(token[0] === '_'
      ? <em key={match.index}>{inner}</em>
      : <s key={match.index} className={styles.struck}>{inner}</s>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function DocumentLine({ line }) {
  if (line.startsWith('## ')) return <p className={styles.subheading}>{renderInline(line.slice(3))}</p>;
  if (line.startsWith('# ')) return <p className={styles.heading}>{renderInline(line.slice(2))}</p>;
  if (line.startsWith('> ')) return <p className={styles.addition}>{renderInline(line.slice(2))}</p>;
  if (line.startsWith('[') && line.endsWith(']')) return <p className={styles.editorial}>{line.slice(1, -1)}</p>;
  return <p className={styles.line}>{renderInline(line)}</p>;
}

export function ReadableDocument({ readable, typeId }) {
  const pages = readable?.pages || [];
  const [pageIndex, setPageIndex] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [inGlass, setInGlass] = useState(false);

  useEffect(() => {
    setPageIndex(0);
    setRendering(false);
    setInGlass(false);
  }, [typeId]);

  if (!pages.length) return null;
  const page = pages[Math.min(pageIndex, pages.length - 1)];
  const translatable = Boolean(page.translation?.length);
  const showRendering = translatable && rendering;
  const lines = showRendering ? page.translation : page.lines;
  const mirrored = page.hand === 'mirror' && !showRendering && !inGlass;
  const languageLabel = showRendering ? 'English' : page.language;

  return (
    <div className={styles.reader} data-testid="examine-document">
      <div className={styles.toolbar}>
        <span className={styles.formLabel}>
          {FORM_LABELS[readable.form] || 'Document'}
          {languageLabel && <span className={styles.language}> · {languageLabel}</span>}
        </span>
        {translatable && (
          <div className={styles.toggle} role="group" aria-label="Text shown">
            <button type="button" aria-pressed={!rendering} onClick={() => setRendering(false)}>Original</button>
            <button type="button" aria-pressed={rendering} onClick={() => setRendering(true)}>English</button>
          </div>
        )}
      </div>

      {page.caption && <div className={styles.caption}>{page.caption}</div>}

      <article
        className={`${styles.paper} ${styles[`hand_${page.hand}`] || styles.hand_print}`}
        lang={showRendering ? 'en' : ({ Catalan: 'ca', Spanish: 'es', English: 'en' }[page.language] || undefined)}
      >
        <div className={mirrored ? styles.mirrored : undefined}>
          {lines.map((line, index) => <DocumentLine key={`${pageIndex}-${index}`} line={line} />)}
        </div>
      </article>

      {page.hand === 'mirror' && !showRendering && (
        <button type="button" className={styles.glassButton} onClick={() => setInGlass(value => !value)}>
          {inGlass ? 'Show the type as it stands' : 'Read it as in a looking-glass'}
        </button>
      )}
      {showRendering && RENDERING_NOTES[page.language] && (
        <p className={styles.renderingNote}>{RENDERING_NOTES[page.language]}</p>
      )}

      {pages.length > 1 && (
        <nav className={styles.pager} aria-label="Pages">
          <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex(index => Math.max(0, index - 1))} aria-label="Previous page">‹</button>
          <span>{pageIndex + 1} of {pages.length}</span>
          <button type="button" disabled={pageIndex >= pages.length - 1} onClick={() => setPageIndex(index => Math.min(pages.length - 1, index + 1))} aria-label="Next page">›</button>
        </nav>
      )}

      {readable.gloss && (
        <aside className={styles.gloss}>
          <span className={styles.glossLabel}>What Darwin makes of it</span>
          <p>{readable.gloss}</p>
        </aside>
      )}
    </div>
  );
}
