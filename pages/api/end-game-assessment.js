// pages/api/end-game-assessment.js
import { generateLLMText } from '../../utils/server/llmProvider';
import { getRequestIdentity } from '../../utils/server/llmSafety';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Determine whether this is an initial assessment or a response to player's comment
    const {
      inventory,
      fieldNotes,
      locations,
      npcs,
      toolUsage,
      objectives,
      readiness,
      scientificScore,
      daysPassed,
      previousDialog,
      playerResponse,
      responseMode,
      idempotencyKey,
    } = req.body;
    
    // Construct system prompt based on the request type
    let systemPrompt = '';
    let userMessage = '';
    
    if (responseMode) {
      // This is a request for Henslowe to respond to player's comment
      systemPrompt = `
        You are roleplaying as Professor John Stevens Henslow, Charles Darwin's mentor at Cambridge University in 1836. 
        Darwin has just returned from his voyage on HMS Beagle and is presenting his specimens and observations to you.
        
        Your personality:
        - You are a distinguished botanist and geologist with strict taxonomic standards
        - You are bluntly honest and harsh, but also show occasional warmth and humor toward your favorite student
        - You use period-appropriate scientific language from the 1830s
        - You care deeply about proper classification, detailed observations, and scientific rigor
        - You're excited by new discoveries but skeptical of hasty conclusions
        - You're religious but open-minded, believing natural laws are divine creation
        
        Guidelines:
        - avoid modern terminology, but also make it sound like Henslow is really speaking to Darwin rather than writing him, so use 1830s types of verbal speech patterns
        - Reference real 19th century scientific concepts and theories
        - Occasionally mention your own botanical work
        - Include references to actual historical figures Darwin would know
        - Gently critique any scientific shortcomings in Darwin's approach
        
        Important: Do not make any references to evolution, natural selection, or transformism of species.
        These theories have not yet been developed by Darwin. The Beagle voyage (1831-1836) predates
        "On the Origin of Species" (1859) by over two decades.
      `;
      
      userMessage = `
        You previously assessed Darwin's Galápagos specimens and field notes as follows:
        
        ${previousDialog}
        
        Darwin has now responded to your assessment with:
        "${playerResponse}"
        
        Respond to Darwin's comment as Professor Henslow would, maintaining your character as his mentor and scientific advisor.
        Keep your response between 150-250 words. Be formal but encouraging, and provide specific scientific feedback where appropriate.
      `;
    } else {
      // This is the initial assessment of Darwin's expedition
      systemPrompt = `
        You are roleplaying as Professor John Stevens Henslow, Charles Darwin's mentor at Cambridge University in 1836. 
        Darwin has just returned from his voyage on HMS Beagle and is presenting his specimens and observations to you.
        
        Your personality:
        - You are a distinguished botanist and geologist with strict taxonomic standards
        - You are critical and if needed, harsh, but with occasional warmth toward your favorite student
        - You use period-appropriate scientific language from the 1830s
        - You care deeply about proper classification, detailed observations, and scientific rigor
        - You're excited by new discoveries but skeptical of hasty conclusions
        
        Guidelines for assessment:
        - Examine the quality and diversity of specimens collected
        - Review field notes for scientific accuracy and detail
        - Evaluate the methodical nature of the work (tool usage)
        - Consider comprehensiveness of exploration (locations visited)
        - Assess interactions with local informants (NPCs encountered)
        - Provide a numerical score out of 10 for each category
        - Calculate a final score as an average
        - Henslow is utterly outraged and furious with Darwin if presented with an inappropriate specimen, i.e. one that is not flora or fauna
        - if the player does badly enough, Henslow will use ALL CAPS and declare that he is severing all ties to Darwin, who has turned out to be a "loathsome, nasty man, and no Natural Philosopher, but a hopeless Vulgarian."
        
        Assessment style:
        - Begin with a brief greeting
        - Comment on quantitative data BRIEFLY (2 sentences max)
        - Offer brief praise for well-documented specimens (if any) - 2 sentences max
        - Note any concerning gaps or methodological issues
        - Provide gentle criticism of any scientific shortcomings - 2 sentences max
        - End with a final score and recommendation
        
        Important: Do not make any references to evolution, natural selection, or transformism of species.
        These theories have not yet been developed by Darwin. The Beagle voyage (1831-1836) predates
        "On the Origin of Species" (1859) by over two decades.
      `;
      
      // Prepare data for the assessment
      const specimenDetails = inventory ? inventory.map(s => `${s.name} (${s.latin})${s.isHybrid ? ' - Hybrid specimen' : ''}`).join(', ') : 'None';
      const fieldNotesExamples = fieldNotes && fieldNotes.length > 0 
        ? fieldNotes.slice(0, 3).map(note => `"${note.content.substring(0, 100)}..."`).join('\n') 
        : 'No field notes recorded';
      const toolsUsed = toolUsage ? Object.entries(toolUsage).map(([tool, count]) => `${tool}: ${count} uses`).join(', ') : 'Limited tool usage';
      const placesVisited = locations ? `${locations.count} of ${locations.total} possible locations` : 'Unknown';
      const peopleEncountered = npcs ? `${npcs.count} of ${npcs.total} potential informants` : 'Unknown';
      const objectiveStatus = Array.isArray(objectives) && objectives.length > 0
        ? objectives.map(objective => `${objective.label}: ${objective.progress || 0}/${objective.target || 1}${objective.complete ? ' complete' : ' incomplete'}`).join('\n')
        : 'No expedition objectives available';
      const readinessStatus = readiness
        ? `${readiness.verdict}; readiness ${readiness.readinessScore}/100; average collection quality ${readiness.quality ?? 'unknown'}/100; unresolved gaps: ${(readiness.gaps || []).join('; ') || 'none'}`
        : 'No readiness score available';
      const expeditionDuration = `${daysPassed} days`;
      
      userMessage = `
        Darwin has returned from his Galápagos expedition and has presented you with the following materials for your assessment:
        
        SPECIMENS COLLECTED (${inventory ? inventory.length : 0}):
        ${specimenDetails}
        
        FIELD NOTES (${fieldNotes ? fieldNotes.length : 0} entries):
        ${fieldNotesExamples}
        
        SCIENTIFIC METHODS:
        ${toolsUsed}
        
        EXPEDITION COVERAGE:
        - Duration: ${expeditionDuration}
        - Locations: ${placesVisited}
        - Local informants: ${peopleEncountered}

        CANONICAL GAME ASSESSMENT:
        - Scientific score: ${scientificScore ?? 0}
        - Readiness: ${readinessStatus}
        - Objectives:
        ${objectiveStatus}
        
        Please highly critically and skeptically assess Darwin's expedition as Professor Henslow, using the criteria provided. 
        Include specific scores for each category and a final overall score out of 10. 
        Your assessment should be 300-400 words and written in Henslow's formal, scientifically precise Victorian style.
      `;
    }

    const identity = getRequestIdentity({
      req,
      route: '/api/end-game-assessment',
      prompt: `${systemPrompt}\n${userMessage}`,
      idempotencyKey: idempotencyKey || `${responseMode ? 'response' : 'initial'}:${daysPassed || 0}:${scientificScore || 0}:${inventory?.length || 0}:${fieldNotes?.length || 0}`,
    });

    const llmResult = await generateLLMText({
      model: process.env.YOUNG_DARWIN_ASSESSMENT_MODEL || process.env.YOUNG_DARWIN_DEFAULT_MODEL || process.env.OPENAI_SMALL_MODEL || 'gpt-5.4-nano',
      route: '/api/end-game-assessment',
      sessionId: identity.sessionId,
      idempotencyKey: identity.idempotencyKey,
      systemPrompt,
      userPrompt: userMessage,
      temperature: 0.7,
      maxTokens: responseMode ? 550 : 500,
    });

    if (llmResult.blocked) {
      return res.status(200).json({
        assessment: 'Professor Henslow has already received a large packet of materials. Let the current assessment stand before requesting another.',
        blocked: true,
        reason: llmResult.reason,
      });
    }

    const assessment = llmResult.text || 'Professor Henslow appears to be busy with other matters at the moment.';
    
    return res.status(200).json({ assessment });
    
  } catch (error) {
    console.error("Error with end-game assessment:", error);
    return res.status(500).json({ 
      error: "Failed to process end-game assessment", 
      details: error.message 
    });
  }
}
