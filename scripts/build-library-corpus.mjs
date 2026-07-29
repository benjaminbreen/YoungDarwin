import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BOOK_CATALOG } from '../three-game/books/bookCatalog.js';
import { LIBRARY_MEMORY_TERMS } from '../three-game/library/memoryTerms.js';
import {
  normalizeLibraryText,
  searchLibraryCorpus,
  tokenizeLibraryText,
} from '../three-game/library/searchCore.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'public', 'assets', 'library');
const manifestPath = path.join(outputDirectory, 'manifest.json');
const budgetBytes = 120 * 1024 * 1024;
const pdfDecoderAssets = [
  'jbig2.wasm',
  'jbig2_nowasm_fallback.js',
  'openjpeg.wasm',
  'openjpeg_nowasm_fallback.js',
  'qcms_bg.wasm',
];
const targetWords = 180;
const maximumWords = 300;
const minimumWords = 55;

const htmlEntities = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
  nbsp: ' ',
};

function decodeHtml(value) {
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const radix = entity[1]?.toLowerCase() === 'x' ? 16 : 10;
      const number = Number.parseInt(entity.replace(/^#x?/i, ''), radix);
      return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    }
    return htmlEntities[entity.toLowerCase()] ?? match;
  });
}

function numberAttribute(tag, name) {
  const match = new RegExp(`${name}="([^"]+)"`).exec(tag);
  const value = Number(match?.[1]);
  return Number.isFinite(value) ? value : 0;
}

function roundCoordinate(value) {
  return Math.round(value * 100000) / 100000;
}

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function displayTextFromLines(lines) {
  let output = '';
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    if (/[\p{L}][-¬]$/u.test(output) && /^\p{Ll}/u.test(text)) {
      output = `${output.slice(0, -1)}${text}`;
    } else {
      output += `${output ? ' ' : ''}${text}`;
    }
  }
  return output.replace(/\s+/g, ' ').trim();
}

function printedPageLabel(lines, pageHeight) {
  const candidates = lines.filter(line => (
    (line.yMax < pageHeight * 0.14 || line.yMin > pageHeight * 0.88)
    && line.words.length <= 3
    && /^(?:\d{1,4}|[ivxlcdm]{1,8})$/i.test(line.text.replace(/\s+/g, ''))
  ));
  return candidates[0]?.text.replace(/\s+/g, '') || null;
}

function passageId(bookId, pdfPage, firstLine, lastLine) {
  const basis = `${bookId}\x1f${pdfPage}\x1f${firstLine.text}\x1f${lastLine.text}`;
  return `${bookId}-${crypto.createHash('sha1').update(basis).digest('hex').slice(0, 14)}`;
}

function passageFromLines(book, pdfPage, printedPage, pageWidth, pageHeight, lines) {
  const rawText = lines.map(line => line.text).join('\n');
  const displayText = displayTextFromLines(lines);
  const searchText = normalizeLibraryText(displayText);
  const highlightRects = lines.map(line => ({
    x: roundCoordinate(line.xMin / pageWidth),
    y: roundCoordinate(line.yMin / pageHeight),
    width: roundCoordinate((line.xMax - line.xMin) / pageWidth),
    height: roundCoordinate((line.yMax - line.yMin) / pageHeight),
  }));
  return {
    id: passageId(book.id, pdfPage, lines[0], lines.at(-1)),
    bookId: book.id,
    pdfPage,
    printedPage,
    rawText,
    displayText,
    searchText,
    wordCount: wordCount(displayText),
    sourceLanguage: book.sourceLanguage || 'English',
    citation: `${book.author}, ${book.shortTitle}, ${printedPage ? `p. ${printedPage}` : `scan p. ${pdfPage}`}`,
    provenance: book.provenance,
    anchor: {
      pdfPage,
      pageWidth,
      pageHeight,
      highlightRects,
      alignmentConfidence: 1,
      alignmentMethod: 'runtime-pdf-text-layer',
    },
  };
}

function passageizePage(book, pdfPage, page) {
  const printedPage = printedPageLabel(page.lines, page.height);
  const contentLines = page.lines.filter(line => {
    const marginal = line.yMax < page.height * 0.105 || line.yMin > page.height * 0.91;
    if (marginal && line.words.length <= 10) return false;
    return line.words.some(word => /\p{L}/u.test(word.text));
  });
  if (!contentLines.length) return [];

  const groups = [];
  let buffer = [];
  let bufferWords = 0;
  for (const line of contentLines) {
    buffer.push(line);
    bufferWords += line.words.length;
    const sentenceEnd = /[.!?]["'’”»)\]]*$/.test(line.text);
    if ((bufferWords >= targetWords && sentenceEnd) || bufferWords >= maximumWords) {
      groups.push(buffer);
      buffer = [];
      bufferWords = 0;
    }
  }
  if (buffer.length) groups.push(buffer);
  if (groups.length > 1 && wordCount(displayTextFromLines(groups.at(-1))) < minimumWords) {
    const merged = [...groups.at(-2), ...groups.at(-1)];
    if (wordCount(displayTextFromLines(merged)) <= 340) {
      groups.splice(groups.length - 2, 2, merged);
    }
  }
  return groups
    .filter(lines => wordCount(displayTextFromLines(lines)) >= 24)
    .map(lines => passageFromLines(
      book,
      pdfPage,
      printedPage,
      page.width,
      page.height,
      lines,
    ));
}

function extractPdfPages(pdfPath) {
  const xhtml = execFileSync('pdftotext', ['-bbox-layout', pdfPath, '-'], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  const pages = [];
  for (const pageMatch of xhtml.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g)) {
    const pageTag = pageMatch[1];
    const lines = [];
    for (const lineMatch of pageMatch[2].matchAll(/<line\b([^>]*)>([\s\S]*?)<\/line>/g)) {
      const words = [];
      for (const wordMatch of lineMatch[2].matchAll(/<word\b([^>]*)>([\s\S]*?)<\/word>/g)) {
        const text = decodeHtml(wordMatch[2]).replace(/<[^>]+>/g, '').trim();
        if (!text) continue;
        words.push({
          text,
          xMin: numberAttribute(wordMatch[1], 'xMin'),
          yMin: numberAttribute(wordMatch[1], 'yMin'),
          xMax: numberAttribute(wordMatch[1], 'xMax'),
          yMax: numberAttribute(wordMatch[1], 'yMax'),
        });
      }
      if (!words.length) continue;
      lines.push({
        text: words.map(word => word.text).join(' '),
        words,
        xMin: Math.min(...words.map(word => word.xMin)),
        yMin: Math.min(...words.map(word => word.yMin)),
        xMax: Math.max(...words.map(word => word.xMax)),
        yMax: Math.max(...words.map(word => word.yMax)),
      });
    }
    pages.push({
      width: numberAttribute(pageTag, 'width'),
      height: numberAttribute(pageTag, 'height'),
      lines,
    });
  }
  return pages;
}

function buildLexicalIndex(passages) {
  const postings = {};
  const documentLengths = [];
  passages.forEach((passage, documentIndex) => {
    const tokens = tokenizeLibraryText(passage.searchText);
    documentLengths.push(tokens.length);
    const frequencies = new Map();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
    for (const [token, frequency] of frequencies) {
      if (!postings[token]) postings[token] = [];
      postings[token].push(documentIndex, frequency);
    }
  });
  return {
    version: 1,
    documentCount: passages.length,
    averageDocumentLength: documentLengths.reduce((sum, length) => sum + length, 0) / Math.max(1, passages.length),
    documentLengths,
    postings,
  };
}

function byteSize(filePath) {
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
}

function libraryBooks() {
  return Object.values(BOOK_CATALOG).filter(book => book.pdfPath?.startsWith('/assets/books/'));
}

function runtimePdfPath(book) {
  return path.join(root, 'public', book.pdfPath.replace(/^\//, ''));
}

function auditManifest({ fail = true } = {}) {
  if (!fs.existsSync(manifestPath)) {
    if (fail) throw new Error('Library manifest is missing. Run npm run library:build first.');
    return null;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const pdfBytes = manifest.books.reduce((sum, book) => sum + byteSize(runtimePdfPath(book)), 0);
  const passageBytes = byteSize(path.join(outputDirectory, 'passages.json'));
  const lexicalBytes = byteSize(path.join(outputDirectory, 'lexical-index.json'));
  const termBytes = byteSize(path.join(outputDirectory, 'memory-terms.json'));
  const manifestBytes = byteSize(manifestPath);
  const decoderBytes = pdfDecoderAssets.reduce(
    (sum, filename) => sum + byteSize(path.join(root, 'public', 'vendor', filename)),
    0,
  );
  const totalBytes = pdfBytes + passageBytes + lexicalBytes + termBytes + manifestBytes + decoderBytes;
  const report = {
    budgetBytes,
    totalBytes,
    remainingBytes: budgetBytes - totalBytes,
    lineItems: {
      runtimePdfs: pdfBytes,
      passagesAndAnchors: passageBytes,
      lexicalIndex: lexicalBytes,
      vectors: 0,
      curatedTerms: termBytes,
      pdfDecoderRuntime: decoderBytes,
      manifest: manifestBytes,
    },
  };
  console.table(Object.entries(report.lineItems).map(([item, bytes]) => ({
    item,
    bytes,
    mebibytes: (bytes / 1024 / 1024).toFixed(2),
  })));
  console.log(`Library total: ${(totalBytes / 1024 / 1024).toFixed(2)} MiB / 120.00 MiB`);
  if (fail && totalBytes > budgetBytes) {
    throw new Error(`Library package exceeds its 120 MiB budget by ${((totalBytes - budgetBytes) / 1024 / 1024).toFixed(2)} MiB.`);
  }
  return report;
}

function build() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const books = libraryBooks();
  const passages = [];
  const manifestBooks = [];

  for (const book of books) {
    const pdfPath = runtimePdfPath(book);
    if (!fs.existsSync(pdfPath)) throw new Error(`Missing runtime PDF for ${book.id}: ${pdfPath}`);
    console.log(`Extracting ${book.shortTitle}...`);
    const pages = extractPdfPages(pdfPath);
    const bookPassages = pages.flatMap((page, index) => passageizePage(book, index + 1, page));
    passages.push(...bookPassages);
    manifestBooks.push({
      id: book.id,
      shortTitle: book.shortTitle,
      title: book.title,
      author: book.author,
      edition: book.edition,
      provenance: book.provenance,
      sourceLanguage: book.sourceLanguage,
      pdfPath: book.pdfPath,
      sourceUrl: book.sourceUrl,
      cover: book.cover,
      coverAccent: book.coverAccent,
      railLabel: book.railLabel,
      startPage: book.startPage,
      pageCount: pages.length,
      passageCount: bookPassages.length,
      pdfBytes: byteSize(pdfPath),
    });
  }

  const lexicalIndex = buildLexicalIndex(passages);
  const memoryTerms = LIBRARY_MEMORY_TERMS.map(term => {
    const results = searchLibraryCorpus({
      passages,
      index: lexicalIndex,
      query: term.searchQuery,
      limit: 6,
    });
    const categoryFallback = searchLibraryCorpus({
      passages,
      index: lexicalIndex,
      query: term.category === 'voyage'
        ? 'voyage travel navigation'
        : term.category === 'fieldwork'
          ? 'observation collection experiment'
          : term.category === 'geology'
            ? 'rock earth strata volcano'
            : 'natural history species nature',
      limit: 12,
    });
    const fallback = [...results];
    for (const candidate of categoryFallback) {
      if (!fallback.some(result => result.id === candidate.id)) fallback.push(candidate);
      if (fallback.length >= 6) break;
    }
    return {
      ...term,
      primaryPassageId: fallback[0]?.id || null,
      relatedPassageIds: fallback.slice(1, 6).map(result => result.id),
      reviewStatus: 'machine-ranked-needs-editor-review',
    };
  });

  const passagesPath = path.join(outputDirectory, 'passages.json');
  const lexicalPath = path.join(outputDirectory, 'lexical-index.json');
  const memoryTermsPath = path.join(outputDirectory, 'memory-terms.json');
  fs.writeFileSync(passagesPath, JSON.stringify({ version: 1, passages }));
  fs.writeFileSync(lexicalPath, JSON.stringify(lexicalIndex));
  fs.writeFileSync(memoryTermsPath, JSON.stringify({ version: 1, terms: memoryTerms }));
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    version: 1,
    books: manifestBooks,
    passageCount: passages.length,
    memoryTermCount: memoryTerms.length,
    artifacts: {
      passages: '/assets/library/passages.json',
      lexicalIndex: '/assets/library/lexical-index.json',
      memoryTerms: '/assets/library/memory-terms.json',
      pdfDecoderRuntime: pdfDecoderAssets.map(filename => `/vendor/${filename}`),
    },
  }, null, 2)}\n`);

  const invalidAnchors = passages.filter(passage => (
    !passage.anchor?.highlightRects?.length
    || passage.anchor.highlightRects.some(rect => (
      rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
      || rect.x + rect.width > 1.001 || rect.y + rect.height > 1.001
    ))
  ));
  if (invalidAnchors.length) throw new Error(`${invalidAnchors.length} passages have invalid scan anchors.`);
  if (memoryTerms.length !== 150) throw new Error(`Expected 150 memory terms, found ${memoryTerms.length}.`);
  if (memoryTerms.some(term => !term.primaryPassageId || term.relatedPassageIds.length < 5)) {
    throw new Error('Every memory term must resolve to one primary and five related passages.');
  }

  auditManifest();
  console.log(`Built ${passages.length} anchored passages across ${books.length} books.`);
}

if (process.argv.includes('--audit')) auditManifest();
else build();
