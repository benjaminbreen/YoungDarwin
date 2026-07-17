const SCORE_MAX = 10;

function clamp(value, min = 0, max = SCORE_MAX) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function roundedScore(value) {
  return Math.round(clamp(value) * 10) / 10;
}

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))];
}

function uniqueSpecimens(specimens = []) {
  const seen = new Set();
  return specimens.filter(specimen => {
    const key = specimen?.id || specimen?.specimenId || specimen?.name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isAssessableJournalEntry(entry) {
  if (!entry || entry.assessmentEligible === false || entry.authorship === 'reference') return false;
  return !/^seed(?:-|_)/i.test(String(entry.id || ''));
}

function journalAuthorship(entry) {
  if (entry?.authorship) return entry.authorship;
  const id = String(entry?.id || '');
  if (/-(?:examination|field-note|reading)(?:-|$)/i.test(id)) return 'player';
  return 'field-record';
}

function authoredText(entry) {
  return String(entry?.content || '').split(/\n\s*\nRecorded facts:/i)[0].trim();
}

function noteRigor(entry) {
  const text = authoredText(entry);
  const words = text.match(/[A-Za-zÀ-ÿ0-9]+(?:['’\-][A-Za-zÀ-ÿ0-9]+)*/g) || [];
  let score = words.length < 5
    ? 0
    : words.length < 10
      ? 0.3
      : words.length < 20
        ? 1
        : words.length < 40
          ? 2
          : words.length < 70 ? 2.8 : 3.4;
  const signals = [
    /\b(?:colour|color|marking|stripe|spot|wing|antenna|beak|bill|leaf|flower|spine|shell|scale|feather|fur|skin|surface|texture|grain|vesicle|crystal|shape|length|width|height|diameter)\w*\b/i,
    /\b(?:fly|flies|flight|feed|feeds|feeding|eat|graz|walk|run|swim|bask|rest|call|sound|move|movement|burrow|nest|visit|approach|avoid)\w*\b/i,
    /\b(?:habitat|shore|beach|scrub|forest|rock|lava|sand|soil|water|flower|cactus|slope|shade|sun|wind|tide|substrate|locality)\w*\b/i,
    /\b(?:fresh|worn|damaged|healthy|dry|wet|hard|soft|rough|smooth|dark|pale|yellow|orange|black|brown|green|red|white|metallic)\w*\b/i,
    /\b(?:compare|comparison|unlike|similar|differ|larger|smaller|more|less|second|another|whereas)\w*\b/i,
    /\b(?:perhaps|possibly|uncertain|unclear|appears|seems|may|might|question|suppose|infer|cannot determine)\w*\b/i,
  ];
  score += signals.filter(pattern => pattern.test(text)).length * 0.8;
  if (/\b\d+(?:\.\d+)?\s*(?:mm|cm|m|inch|inches|ft|feet|ounces?|oz|lb|pounds?)\b/i.test(text)) score += 0.8;
  if (/[?;]/.test(text)) score += 0.3;
  return {
    score: roundedScore(score),
    words: words.length,
    text,
    trivial: words.length < 8 || score < 1.5,
  };
}

function scoreLabel(score) {
  if (score >= 8.5) return {
    verdict: 'An exceptional field packet',
    recommendation: 'Fit for immediate circulation among Cambridge naturalists.',
  };
  if (score >= 7.5) return {
    verdict: 'A sound and useful collection',
    recommendation: 'Preserve the localities and prepare the strongest observations for circulation.',
  };
  if (score >= 6) return {
    verdict: 'Promising, but incomplete',
    recommendation: 'Retain the best evidence and strengthen the missing localities before publication.',
  };
  if (score >= 4) return {
    verdict: 'A fragmentary return',
    recommendation: 'Rework the labels and field notes extensively before asking another naturalist to rely upon them.',
  };
  if (score >= 2) return {
    verdict: 'A deeply inadequate performance',
    recommendation: 'Withhold the packet; its present contents would damage rather than advance your scientific reputation.',
  };
  return {
    verdict: 'A mortifying failure of fieldwork',
    recommendation: 'Consider whether some other line of work may be better suited to your habits of mind.',
  };
}

function categoryNote(categoryId, context) {
  const { evidenceCount, examinedCount, collectedCount, documentedCount, noteCount, locationCount, averageNoteRigor, trivialNoteCount } = context;
  if (categoryId === 'observation') {
    if (!evidenceCount) return 'No examined or documented natural object accompanied the return.';
    return `${examinedCount} examined type${examinedCount === 1 ? '' : 's'} produced ${evidenceCount} distinct line${evidenceCount === 1 ? '' : 's'} of evidence; written rigor averaged ${averageNoteRigor.toFixed(1)}/10.`;
  }
  if (categoryId === 'specimenCare') {
    if (!evidenceCount) return 'The case and field record contain no assessable specimen evidence.';
    if (!collectedCount && !documentedCount) return 'Mere examination produced no preserved or field-documented specimen evidence.';
    return `${collectedCount} retained, ${documentedCount} documented in place; restraint counts alongside preservation.`;
  }
  if (categoryId === 'fieldRecord') {
    if (!noteCount) return 'No field notes were entered for scrutiny.';
    return `${noteCount} player-authored entr${noteCount === 1 ? 'y' : 'ies'}; ${trivialNoteCount} ${trivialNoteCount === 1 ? 'was' : 'were'} too slight to support a scientific claim.`;
  }
  if (categoryId === 'coverage') {
    return `${locationCount} distinct field station${locationCount === 1 ? '' : 's'} entered in the route record.`;
  }
  return 'Balances evidence, physical condition, restraint, and conduct in the field.';
}

export function isEndGameNarratorCommand(input) {
  return /^(?:end game|end the game|end expedition|end the expedition|conclude expedition)[.!?]*$/i.test(String(input || '').trim());
}

export function buildPlayerNarratorTranscript(entries = [], maxCharacters = 8000) {
  const turns = (Array.isArray(entries) ? entries : [])
    .map(entry => ({
      text: String(entry?.text || '').trim(),
      day: Math.max(1, Number(entry?.day) || 1),
      timeOfDay: Number.isFinite(Number(entry?.timeOfDay)) ? Number(entry.timeOfDay) : null,
      locationName: String(entry?.locationName || '').trim(),
      specimenName: String(entry?.specimenName || '').trim(),
      symsNearby: Boolean(entry?.symsNearby),
    }))
    .filter(entry => entry.text)
    .map(entry => {
      const context = [
        `day ${entry.day}`,
        entry.locationName || null,
        entry.specimenName ? `near ${entry.specimenName}` : null,
        entry.symsNearby ? 'Syms nearby' : null,
      ].filter(Boolean).join('; ');
      return `[${context}] Darwin: ${entry.text.slice(0, 1000)}`;
    });
  const fullText = turns.join('\n');
  const safeLimit = Math.max(1000, Number(maxCharacters) || 8000);
  if (fullText.length <= safeLimit) {
    return {
      text: fullText,
      turnCount: turns.length,
      truncated: false,
      characterCount: fullText.length,
    };
  }
  const omission = '\n[…middle narrator-panel turns omitted for length…]\n';
  const remaining = Math.max(0, safeLimit - omission.length);
  const firstLength = Math.floor(remaining * 0.45);
  const lastLength = remaining - firstLength;
  return {
    text: `${fullText.slice(0, firstLength)}${omission}${fullText.slice(-lastLength)}`,
    turnCount: turns.length,
    truncated: true,
    characterCount: fullText.length,
  };
}

export function applyTranscriptEvaluation(profile, evaluation = null) {
  if (!profile || !evaluation || typeof evaluation !== 'object') return profile;
  const classifications = new Set(['exemplary', 'constructive', 'neutral', 'dismissive', 'egregious']);
  const classification = classifications.has(String(evaluation.classification || '').toLowerCase())
    ? String(evaluation.classification).toLowerCase()
    : 'neutral';
  const adjustment = Math.round(clamp(Number(evaluation.adjustment) || 0, -3, 1.5) * 10) / 10;
  const proposedCap = Number(evaluation.conductCap);
  const conductCap = classification === 'egregious' && Number.isFinite(proposedCap)
    ? Math.round(clamp(proposedCap, 0, 10) * 10) / 10
    : null;
  const adjustedBeforeCap = clamp((Number(profile.overall) || 0) + adjustment, 0, 10);
  const overall = roundedScore(conductCap === null ? adjustedBeforeCap : Math.min(adjustedBeforeCap, conductCap));
  const label = scoreLabel(overall);
  const summary = String(evaluation.summary || '').trim().slice(0, 320);
  const quotedEvidence = (Array.isArray(evaluation.quotedEvidence) ? evaluation.quotedEvidence : [])
    .map(quote => String(quote || '').trim().slice(0, 180))
    .filter(Boolean)
    .slice(0, 3);
  const interactionAudit = {
    ...(profile.interactionAudit || {}),
    status: 'assessed',
    adjustment,
    classification,
    conductCap,
    summary,
    quotedEvidence,
  };
  const strengths = [...(profile.strengths || [])];
  const gaps = [...(profile.gaps || [])];
  if (adjustment > 0 && summary) strengths.unshift(`Narrator-panel inquiry: ${summary}`);
  if ((adjustment < 0 || conductCap !== null) && summary) gaps.unshift(`Narrator-panel conduct: ${summary}`);

  return {
    ...profile,
    baseOverall: Number(profile.baseOverall ?? profile.overall) || 0,
    overall,
    verdict: label.verdict,
    recommendation: label.recommendation,
    strengths: strengths.slice(0, 3),
    gaps: gaps.slice(0, 3),
    interactionAudit,
  };
}

export function evaluateFinalAssessment(state = {}) {
  const inventory = uniqueSpecimens(Array.isArray(state.inventory) ? state.inventory : []);
  const allNotes = Array.isArray(state.journal) ? state.journal : [];
  const notes = allNotes.filter(isAssessableJournalEntry);
  const playerNotes = notes.filter(note => journalAuthorship(note) === 'player');
  const fieldRecordNotes = notes.filter(note => journalAuthorship(note) !== 'player');
  const noteAudits = playerNotes.map(note => ({
    id: note.id || null,
    specimenId: note.specimenId || null,
    specimenName: note.specimenName || note.title || 'Untitled field note',
    ...noteRigor(note),
  }));
  const averageNoteRigor = noteAudits.length
    ? noteAudits.reduce((sum, audit) => sum + audit.score, 0) / noteAudits.length
    : 0;
  const trivialNoteCount = noteAudits.filter(audit => audit.trivial).length;
  const collectedIds = uniqueValues([
    ...(state.collectedSpecimenIds || []),
    ...inventory.map(specimen => specimen.id || specimen.specimenId || specimen.name),
  ]);
  const documentedIds = uniqueValues(state.documentedSpecimenIds || []);
  const examinedIds = uniqueValues(state.examinedTypeIds || []);
  const evidenceIds = uniqueValues([...collectedIds, ...documentedIds, ...examinedIds]);
  const visitedIds = uniqueValues([...(state.visitedZoneIds || []), state.currentZoneId]);
  const methods = uniqueValues(notes.map(note => note?.method));
  const playerMethods = uniqueValues(playerNotes.map(note => note?.method));
  const locatedNotes = playerNotes.filter(note => String(note?.location || '').trim()).length;
  const detailedNotes = noteAudits.filter(audit => audit.score >= 5).length;
  const documentedOrObserved = uniqueValues([...documentedIds, ...examinedIds]).length;

  const observation = evidenceIds.length === 0
    ? 0
    : Math.min(2.2, evidenceIds.length * 0.65)
      + averageNoteRigor * 0.55
      + Math.min(1.2, Math.max(0, evidenceIds.length - 1) * 0.4)
      + Math.min(1, documentedIds.length * 0.25);
  const specimenCare = evidenceIds.length === 0
    ? 0
    : 0.5
      + Math.min(2.4, evidenceIds.length * 0.6)
      + Math.min(2.5, documentedIds.length * 0.5)
      + Math.min(1.5, collectedIds.length * 0.35)
      + Math.min(1.5, methods.length * 0.3)
      + averageNoteRigor * 0.15;
  const fieldRecord = playerNotes.length === 0
    ? 0
    : Math.min(2, playerNotes.length * 0.4)
      + averageNoteRigor * 0.7
      + (locatedNotes / playerNotes.length) * 0.5
      + Math.min(0.8, playerMethods.length * 0.2);
  const coverage = Math.min(10, Math.max(0.4, (visitedIds.length - 1) * 1.4));
  const standing = clamp(state.localStanding ?? 50, 0, 100);
  const health = clamp(state.health ?? 100, 0, 100);
  const fatigue = clamp(state.fatigue ?? 0, 0, 100);
  const evidenceRestraint = collectedIds.length
    ? Math.min(1, documentedOrObserved / collectedIds.length)
    : (documentedIds.length ? 1 : 0);
  const judgment = 1
    + (standing - 50) / 20
    + health / 200
    + (100 - fatigue) / 200
    + (evidenceIds.length ? evidenceRestraint * 1.5 : 0)
    + averageNoteRigor * 0.2;

  const context = {
    evidenceCount: evidenceIds.length,
    examinedCount: examinedIds.length,
    collectedCount: collectedIds.length,
    documentedCount: documentedIds.length,
    noteCount: playerNotes.length,
    locationCount: visitedIds.length,
    averageNoteRigor,
    trivialNoteCount,
  };
  const categories = [
    { id: 'observation', label: 'Observation', score: roundedScore(observation) },
    { id: 'specimenCare', label: 'Specimen care', score: roundedScore(specimenCare) },
    { id: 'fieldRecord', label: 'Field record', score: roundedScore(fieldRecord) },
    { id: 'coverage', label: 'Island coverage', score: roundedScore(coverage) },
    { id: 'judgment', label: 'Field judgment', score: roundedScore(judgment) },
  ].map(category => ({ ...category, note: categoryNote(category.id, context) }));
  const categoryMap = Object.fromEntries(categories.map(category => [category.id, category.score]));
  const overall = roundedScore(
    categoryMap.observation * 0.3
    + categoryMap.specimenCare * 0.2
    + categoryMap.fieldRecord * 0.25
    + categoryMap.coverage * 0.1
    + categoryMap.judgment * 0.15,
  );
  const label = scoreLabel(overall);

  const strengths = [];
  if (documentedIds.length && averageNoteRigor >= 4) strengths.push('Living subjects were documented without requiring every example to be removed.');
  if (detailedNotes) strengths.push('Several entries preserve enough detail to be compared after the voyage.');
  if (methods.length >= 3 && averageNoteRigor >= 4) strengths.push('The record distinguishes multiple methods of observation or collection.');
  if (visitedIds.length >= 5 && evidenceIds.length >= 3) strengths.push('The route provides useful comparison across distinct island stations.');
  if (!strengths.length && overall >= 4 && evidenceIds.length) strengths.push('The packet contains the beginnings of a usable comparative record.');

  const gaps = [];
  if (!evidenceIds.length) gaps.push('No specimen or documented natural object can be assessed.');
  if (!playerNotes.length) gaps.push('No player-authored field note can be assessed; inherited reference entries do not count as expedition work.');
  if (trivialNoteCount) gaps.push(`${trivialNoteCount} field entr${trivialNoteCount === 1 ? 'y is' : 'ies are'} too cursory to qualify as serious observation.`);
  if (playerNotes.length > 0 && playerNotes.length < 3) gaps.push('Too few player-authored field entries survive to establish a dependable pattern.');
  if (locatedNotes < playerNotes.length) gaps.push('Some player-authored observations lack an explicit locality.');
  if (!playerMethods.length && playerNotes.length) gaps.push('Methods are not named consistently in the player’s field record.');
  if (visitedIds.length < 3) gaps.push('The island comparison rests on very limited geographic coverage.');
  if ((state.localStanding ?? 50) < 35) gaps.push('The expedition record suggests poor judgment in dealings with companions or residents.');
  if (!gaps.length) gaps.push('The strongest claims should still distinguish direct observation from inference.');

  const evidenceSummaries = evidenceIds.map(id => {
    const metadata = state.specimenMetadata?.[id] || {};
    const note = notes.find(entry => entry.specimenId === id);
    return {
      id,
      name: metadata.name || note?.specimenName || id,
      scientificValue: Number(metadata.scientificValue) || null,
      ordinary: Number(metadata.scientificValue) > 0 && Number(metadata.scientificValue) <= 3,
    };
  });
  const worstNote = [...noteAudits].sort((a, b) => a.score - b.score)[0] || null;

  return {
    overall,
    verdict: label.verdict,
    recommendation: label.recommendation,
    categories,
    strengths: strengths.slice(0, 3),
    gaps: gaps.slice(0, 3),
    stats: {
      collected: collectedIds.length,
      documented: documentedIds.length,
      examined: examinedIds.length,
      evidence: evidenceIds.length,
      notes: playerNotes.length,
      fieldRecords: fieldRecordNotes.length,
      excludedReferenceNotes: allNotes.length - notes.length,
      locations: visitedIds.length,
      methods: methods.length,
      day: Math.max(1, Number(state.day) || 1),
      curiosity: clamp(state.curiosity ?? 0, 0, 100),
      health: clamp(state.health ?? 0, 0, 100),
      fatigue: clamp(state.fatigue ?? 0, 0, 100),
      locationName: String(state.currentLocationName || state.locationName || 'Floreana Island'),
    },
    noteAudit: {
      averageRigor: roundedScore(averageNoteRigor),
      trivialCount: trivialNoteCount,
      entries: noteAudits,
      worstNote,
    },
    evidence: evidenceSummaries,
  };
}

export function buildLocalHenslowAssessment(profile) {
  const strongest = [...profile.categories].sort((a, b) => b.score - a.score)[0];
  const weakest = [...profile.categories].sort((a, b) => a.score - b.score)[0];
  const strength = profile.strengths[0];
  const gap = profile.gaps[0];

  if (profile.overall < 2) {
    const worstNote = profile.noteAudit?.worstNote;
    const ordinaryEvidence = profile.evidence?.find(item => item.id === worstNote?.specimenId)?.ordinary;
    const noteRebuke = worstNote
      ? `Your field note upon ${worstNote.specimenName}—“${worstNote.text.slice(0, 110)}${worstNote.text.length > 110 ? '…' : ''}”—is more redolent of a small child's first encounter with a curiosity cabinet than of a trained naturalist.${ordinaryEvidence ? ' The subject is common and unremarkable, which makes precision more necessary, not less.' : ''}`
      : 'You have submitted no field note of your own at all. The handsome marine-iguana entry already present in the book is reference material, not your labour, and I shall not pretend otherwise.';
    const methodRebuke = worstNote
      ? 'Mere recognition is not observation; a child may name a butterfly, while a naturalist must describe the characters, behavior, locality, comparison, and uncertainty by which the statement acquires value.'
      : 'A blank field record is not caution, modesty, or restraint; it is simply the absence of scientific work. A naturalist must leave characters, behavior, locality, comparison, and uncertainty by which an observation acquires value.';
    return [
      'My dear Darwin,—',
      `I must confess my utter perplexity and profound disappointment. After such uncommon opportunity and expense, you return with ${profile.stats.evidence} assessable line${profile.stats.evidence === 1 ? '' : 's'} of evidence and ${profile.stats.notes} note${profile.stats.notes === 1 ? '' : 's'} of your own composition. This is not a field packet so much as an accusation against the use you made of your time.`,
      noteRebuke,
      `${gap} ${methodRebuke} Your ${weakest.label.toLowerCase()} is especially indefensible.`,
      `Based upon these results, after such long and strenuous efforts on the part of the ship, her officers, and your instructors, I must advise you to take up some other line of work—preferably one in which incuriosity and imprecision are less immediately fatal to the enterprise.`,
      'J. S. Henslow',
    ].join('\n\n');
  }

  if (profile.overall < 4) {
    return [
      'My dear Darwin,—',
      `I have examined your packet twice, chiefly because I could not believe the first inspection had disclosed the whole of it. Regrettably, it had. ${profile.stats.evidence} line${profile.stats.evidence === 1 ? '' : 's'} of evidence and ${profile.stats.notes} note${profile.stats.notes === 1 ? '' : 's'} do not constitute a serious return from so extraordinary a voyage.`,
      `${gap} What you offer is recognition without discrimination, movement without method, and labels without the patient particulars that make a specimen scientifically useful. Your strongest category, ${strongest.label.toLowerCase()}, reaches only ${strongest.score.toFixed(1)} out of 10; that is less a distinction than the least damaged part of a wreck.`,
      `${profile.recommendation} Until the record is substantially repaired, I could not place it before a Cambridge naturalist without embarrassment to us both.`,
      'J. S. Henslow',
    ].join('\n\n');
  }

  return [
    'My dear Darwin,—',
    `I have examined the packet you have placed before me: ${profile.stats.evidence} distinct line${profile.stats.evidence === 1 ? '' : 's'} of natural-history evidence, ${profile.stats.notes} field entr${profile.stats.notes === 1 ? 'y' : 'ies'}, and observations from ${profile.stats.locations} station${profile.stats.locations === 1 ? '' : 's'}. Quantity alone is no proof of merit; a locality faithfully preserved and an uncertainty honestly stated are often worth more than a crowded case.`,
    `${strength || 'There is at least enough here to identify where the work failed.'} Your strongest department is ${strongest.label.toLowerCase()}. ${gap} The weakest is ${weakest.label.toLowerCase()}, and it is there that another naturalist would have the greatest difficulty testing what you report.`,
    `My judgment is therefore: ${profile.verdict.toLowerCase()}. ${profile.recommendation} Continue to separate what you saw from what you suppose, and let every label preserve the place, circumstance, and method by which the fact was obtained.`,
    'J. S. Henslow',
  ].join('\n\n');
}

export function buildFinalAssessmentRecord(state = {}, options = {}) {
  const createdAt = Number(options.createdAt) || Date.now();
  const transcript = buildPlayerNarratorTranscript(state.assessmentPlayerTranscript);
  const baseProfile = evaluateFinalAssessment(state);
  const profile = {
    ...baseProfile,
    baseOverall: baseProfile.overall,
    interactionAudit: {
      status: transcript.turnCount ? 'pending' : 'none',
      turnCount: transcript.turnCount,
      adjustment: 0,
      classification: transcript.turnCount ? 'pending' : 'neutral',
      conductCap: null,
      summary: '',
      quotedEvidence: [],
      truncated: transcript.truncated,
    },
  };
  const inventory = uniqueSpecimens(Array.isArray(state.inventory) ? state.inventory : []).map(specimen => ({
    id: specimen.id || specimen.specimenId || specimen.name,
    name: specimen.name || specimen.specimenName || 'Unnamed specimen',
    latin: specimen.latin || '',
    ontology: specimen.ontology || specimen.type || '',
    condition: specimen.condition || 'not recorded',
  }));
  const fieldNotes = (Array.isArray(state.journal) ? state.journal : [])
    .filter(isAssessableJournalEntry)
    .map(note => {
      const rigor = noteRigor(note);
      return {
        id: note.id,
        content: String(note.content || '').slice(0, 800),
        location: note.location || '',
        method: note.method || '',
        specimenId: note.specimenId || '',
        specimenName: note.specimenName || '',
        condition: note.condition || '',
        authorship: journalAuthorship(note),
        rigorScore: rigor.score,
        wordCount: rigor.words,
        trivial: rigor.trivial,
      };
    });
  const toolUsage = fieldNotes.reduce((counts, note) => {
    if (note.method) counts[note.method] = (counts[note.method] || 0) + 1;
    return counts;
  }, {});
  const encounteredPeople = Object.entries(state.npcEncounterState || {})
    .filter(([, relation]) => (relation?.flags || []).length > 0 || Number(relation?.trust) !== 50)
    .map(([id]) => id);

  return {
    id: `final-assessment-${createdAt}`,
    createdAt,
    phase: 'loading',
    source: null,
    assessment: null,
    error: null,
    profile,
    request: {
      inventory,
      fieldNotes,
      locations: {
        count: profile.stats.locations,
        total: options.totalLocations || null,
        list: uniqueValues([...(state.visitedZoneIds || []), state.currentZoneId]),
      },
      npcs: { count: encounteredPeople.length, total: null, list: encounteredPeople },
      toolUsage,
      objectives: [
        { label: 'Specimen evidence', progress: profile.stats.evidence, target: 3, complete: profile.stats.evidence >= 3 },
        { label: 'Field record', progress: profile.stats.notes, target: 5, complete: profile.stats.notes >= 5 },
        { label: 'Island coverage', progress: profile.stats.locations, target: 4, complete: profile.stats.locations >= 4 },
      ],
      readiness: {
        verdict: profile.verdict,
        readinessScore: Math.round(profile.overall * 10),
        quality: Math.round(((profile.categories.find(category => category.id === 'specimenCare')?.score || 0) * 10)),
        gaps: profile.gaps,
      },
      scientificScore: Math.round(profile.overall * 10),
      daysPassed: profile.stats.day,
      assessmentProfile: profile,
      narratorTranscript: transcript,
    },
  };
}
