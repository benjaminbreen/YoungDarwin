// Builds a student-submittable record of an expedition — places visited,
// specimens, journal, typed field actions, and the final assessment — and
// saves it as a plain text file or a print-formatted page (the browser's
// print dialog handles "Save as PDF", so no PDF library is needed).

import { getRegionDisplayName } from '../../game-core/regionMaps';
import { getSpecimenById } from '../../game-core/specimens';
import { expeditionDayLabel, formatExpeditionDate } from '../expeditionOutcomes';

function formatClock(timeOfDay) {
  const numeric = Number(timeOfDay);
  if (!Number.isFinite(numeric)) return null;
  const hours = ((Math.floor(numeric) % 24) + 24) % 24;
  const minutes = Math.round((numeric - Math.floor(numeric)) * 60);
  const clockHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${clockHours}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

function specimenDisplayName(specimenId) {
  const specimen = getSpecimenById(specimenId);
  if (!specimen) return specimenId;
  return specimen.latin ? `${specimen.name} (${specimen.latin})` : specimen.name;
}

function entryStamp(entry) {
  const parts = [];
  if (entry.day) parts.push(formatExpeditionDate(entry.day));
  const clock = formatClock(entry.timeOfDay);
  if (clock) parts.push(clock);
  if (entry.location) parts.push(entry.location);
  return parts.join(' · ');
}

export function buildExpeditionReport(state) {
  const collection = [...(state.shipCollection || []), ...(state.inventory || [])];
  const journal = (state.journal || []).slice();
  const transcript = (state.assessmentPlayerTranscript || []).slice();
  const profile = state.finalAssessment?.profile || null;

  return {
    generatedAt: new Date(),
    modeLabel: state.playableModeId && state.playableModeId !== 'darwin'
      ? `${state.playableModeId[0].toUpperCase()}${state.playableModeId.slice(1)} expedition`
      : 'Charles Darwin, naturalist',
    dayLabel: expeditionDayLabel(state.day),
    dateLabel: formatExpeditionDate(state.day),
    seed: state.seed || null,
    placesVisited: (state.visitedZoneIds || []).map(id => getRegionDisplayName(id) || id),
    collection: collection.map(item => ({
      name: item.name || item.sampleLabel || 'Specimen',
      latin: item.latin || null,
      condition: item.condition || null,
    })),
    documented: (state.documentedSpecimenIds || []).map(specimenDisplayName),
    journal: journal.map(entry => ({
      title: entry.title || entry.specimenName || (entry.kind === 'reading' ? 'Reading note' : 'Journal entry'),
      stamp: entryStamp(entry),
      method: entry.method || null,
      content: entry.content || '',
    })),
    transcript: transcript.map(turn => ({
      text: turn.text || '',
      stamp: entryStamp({ day: turn.day, timeOfDay: turn.timeOfDay, location: turn.locationName }),
    })),
    assessment: profile ? {
      overall: profile.overall,
      verdict: profile.verdict || null,
      recommendation: profile.recommendation || null,
      categories: (profile.categories || []).map(c => ({ label: c.label, score: c.score, note: c.note })),
      strengths: profile.strengths || [],
      gaps: profile.gaps || [],
      letter: state.finalAssessment?.assessment || null,
    } : null,
    outcome: state.expeditionOutcome ? {
      type: state.expeditionOutcome.type,
      cause: state.expeditionOutcome.cause || null,
    } : null,
  };
}

function reportAsText(report) {
  const lines = [];
  const rule = '='.repeat(64);
  const thin = '-'.repeat(64);
  lines.push(rule);
  lines.push('DARWIN — GALAPAGOS, 1835 · EXPEDITION RECORD');
  lines.push(rule);
  lines.push(`Role: ${report.modeLabel}`);
  lines.push(`Expedition reached: ${report.dateLabel} (${report.dayLabel})`);
  if (report.seed) lines.push(`Expedition seed: ${report.seed}`);
  lines.push(`Record generated: ${report.generatedAt.toLocaleString()}`);
  if (report.outcome) {
    lines.push('');
    lines.push(`Outcome: ${report.outcome.type === 'death' ? 'The expedition ended early.' : 'Darwin collapsed and required recovery.'}`);
    if (report.outcome.cause) lines.push(`Cause: ${report.outcome.cause}`);
  }

  if (report.assessment) {
    lines.push('');
    lines.push(rule);
    lines.push("HENSLOW'S ASSESSMENT");
    lines.push(rule);
    if (report.assessment.overall != null) lines.push(`Overall: ${report.assessment.overall} / 10`);
    if (report.assessment.verdict) lines.push(`Verdict: ${report.assessment.verdict}`);
    for (const category of report.assessment.categories) {
      lines.push(`  ${category.label}: ${category.score}${category.note ? ` — ${category.note}` : ''}`);
    }
    if (report.assessment.strengths.length) lines.push(`Strengths: ${report.assessment.strengths.join('; ')}`);
    if (report.assessment.gaps.length) lines.push(`Gaps: ${report.assessment.gaps.join('; ')}`);
    if (report.assessment.recommendation) lines.push(`Recommendation: ${report.assessment.recommendation}`);
    if (report.assessment.letter) {
      lines.push('');
      lines.push(thin);
      lines.push(report.assessment.letter);
      lines.push(thin);
    }
  }

  lines.push('');
  lines.push(`PLACES VISITED (${report.placesVisited.length})`);
  for (const place of report.placesVisited) lines.push(`  - ${place}`);

  lines.push('');
  lines.push(`SPECIMENS COLLECTED (${report.collection.length})`);
  for (const item of report.collection) {
    lines.push(`  - ${item.name}${item.latin ? ` (${item.latin})` : ''}${item.condition ? ` — ${item.condition}` : ''}`);
  }
  if (report.documented.length) {
    lines.push('');
    lines.push(`DOCUMENTED IN THE FIELD, NOT TAKEN (${report.documented.length})`);
    for (const name of report.documented) lines.push(`  - ${name}`);
  }

  lines.push('');
  lines.push(`FIELD JOURNAL (${report.journal.length} entries)`);
  for (const entry of report.journal) {
    lines.push('');
    lines.push(`  ${entry.title}${entry.stamp ? ` — ${entry.stamp}` : ''}`);
    if (entry.method) lines.push(`  Method: ${entry.method}`);
    for (const paragraph of String(entry.content).split(/\n+/)) {
      if (paragraph.trim()) lines.push(`  ${paragraph.trim()}`);
    }
  }

  if (report.transcript.length) {
    lines.push('');
    lines.push(`FIELD ACTIONS TYPED TO THE NARRATOR (last ${report.transcript.length})`);
    for (const turn of report.transcript) {
      lines.push(`  [${turn.stamp}] ${turn.text}`);
    }
  }

  lines.push('');
  lines.push(rule);
  lines.push('Generated by the Darwin expedition simulation.');
  return lines.join('\n');
}

export function downloadExpeditionText(state) {
  const report = buildExpeditionReport(state);
  const blob = new Blob([reportAsText(report)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `darwin-expedition-record-day${Math.round(Number(state.day) || 1)}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Deferred so the click can start the download before the URL dies.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function paragraphs(value) {
  return String(value || '')
    .split(/\n+/)
    .filter(part => part.trim())
    .map(part => `<p>${escapeHtml(part.trim())}</p>`)
    .join('');
}

export function openExpeditionPrintReport(state) {
  const report = buildExpeditionReport(state);
  const win = window.open('', '_blank');
  if (!win) return false;

  const assessment = report.assessment;
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Darwin Expedition Record</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1c1a15; margin: 2.5rem auto; max-width: 44rem; padding: 0 1.5rem; line-height: 1.55; }
  h1 { font-size: 1.5rem; letter-spacing: 0.06em; text-transform: uppercase; border-bottom: 2px solid #1c1a15; padding-bottom: 0.5rem; }
  h2 { font-size: 1.05rem; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 2rem; border-bottom: 1px solid #999; padding-bottom: 0.25rem; }
  .meta { color: #555; font-size: 0.95rem; }
  .letter { border-left: 3px solid #b08d3f; padding-left: 1rem; font-style: italic; }
  .entry { margin-top: 1rem; page-break-inside: avoid; }
  .entry .stamp { color: #666; font-size: 0.85rem; }
  .entry h3 { font-size: 1rem; margin: 0 0 0.15rem; }
  ul { padding-left: 1.25rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.5rem; }
  td, th { border: 1px solid #bbb; padding: 0.3rem 0.6rem; text-align: left; font-size: 0.92rem; }
  .transcript { font-size: 0.9rem; color: #333; }
  .footer { margin-top: 3rem; color: #777; font-size: 0.85rem; border-top: 1px solid #ccc; padding-top: 0.5rem; }
  @media print { body { margin: 0 auto; } }
</style>
</head>
<body>
<h1>Darwin — Galápagos, 1835<br>Expedition Record</h1>
<p class="meta">
  ${escapeHtml(report.modeLabel)}<br>
  Expedition reached ${escapeHtml(report.dateLabel)} (${escapeHtml(report.dayLabel)})<br>
  ${report.seed ? `Expedition seed: ${escapeHtml(report.seed)}<br>` : ''}
  Record generated ${escapeHtml(report.generatedAt.toLocaleString())}
</p>
${report.outcome ? `<p><strong>${report.outcome.type === 'death' ? 'The expedition ended early.' : 'Darwin collapsed and required recovery.'}</strong>${report.outcome.cause ? ` ${escapeHtml(report.outcome.cause)}` : ''}</p>` : ''}

${assessment ? `
<h2>Henslow's Assessment</h2>
${assessment.overall != null ? `<p><strong>Overall: ${escapeHtml(assessment.overall)} / 10</strong>${assessment.verdict ? ` — ${escapeHtml(assessment.verdict)}` : ''}</p>` : ''}
<table>
  <tr><th>Category</th><th>Score</th><th>Note</th></tr>
  ${assessment.categories.map(c => `<tr><td>${escapeHtml(c.label)}</td><td>${escapeHtml(c.score)}</td><td>${escapeHtml(c.note || '')}</td></tr>`).join('')}
</table>
${assessment.strengths.length ? `<p><strong>Strengths:</strong> ${escapeHtml(assessment.strengths.join('; '))}</p>` : ''}
${assessment.gaps.length ? `<p><strong>Gaps:</strong> ${escapeHtml(assessment.gaps.join('; '))}</p>` : ''}
${assessment.recommendation ? `<p><strong>Recommendation:</strong> ${escapeHtml(assessment.recommendation)}</p>` : ''}
${assessment.letter ? `<div class="letter">${paragraphs(assessment.letter)}</div>` : ''}
` : ''}

<h2>Places Visited (${report.placesVisited.length})</h2>
<ul>${report.placesVisited.map(place => `<li>${escapeHtml(place)}</li>`).join('')}</ul>

<h2>Specimens Collected (${report.collection.length})</h2>
<ul>${report.collection.map(item => `<li>${escapeHtml(item.name)}${item.latin ? ` <em>(${escapeHtml(item.latin)})</em>` : ''}${item.condition ? ` — ${escapeHtml(item.condition)}` : ''}</li>`).join('')}</ul>
${report.documented.length ? `
<h2>Documented in the Field, Not Taken (${report.documented.length})</h2>
<ul>${report.documented.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul>` : ''}

<h2>Field Journal (${report.journal.length} entries)</h2>
${report.journal.map(entry => `
<div class="entry">
  <h3>${escapeHtml(entry.title)}</h3>
  ${entry.stamp ? `<div class="stamp">${escapeHtml(entry.stamp)}${entry.method ? ` · ${escapeHtml(entry.method)}` : ''}</div>` : ''}
  ${paragraphs(entry.content)}
</div>`).join('')}

${report.transcript.length ? `
<h2>Field Actions (last ${report.transcript.length})</h2>
<div class="transcript">
${report.transcript.map(turn => `<p>[${escapeHtml(turn.stamp)}] ${escapeHtml(turn.text)}</p>`).join('')}
</div>` : ''}

<div class="footer">Generated by the Darwin expedition simulation. Use your browser's print dialog to save this page as a PDF.</div>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
