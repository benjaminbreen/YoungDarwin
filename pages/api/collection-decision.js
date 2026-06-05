import { generateLLMText } from '../../utils/server/llmProvider';
import { getRequestIdentity } from '../../utils/server/llmSafety';

function deterministicScore(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function fallbackCollectionResult({ specimenId, specimenName, collectionMethod, playerNotes, location }) {
  const id = String(specimenId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const method = String(collectionMethod || '').toLowerCase();
  const notes = String(playerNotes || '').toLowerCase();
  const easySpecimens = new Set(['cactus', 'volcanorock', 'seashell', 'basalt', 'coralfragment', 'mangrove', 'captainsskull', 'mysteriousflask']);
  const careful = /careful|slow|quiet|patient|observe|wait|gently/.test(notes);
  const reckless = /rush|grab|loud|chase|throw|hit|reckless/.test(notes);
  const goodMethod =
    easySpecimens.has(id) ||
    (/(finch|mockingbird)/.test(id) && /(hand|snare|shotgun)/.test(method)) ||
    (/(iguana|lizard)/.test(id) && /(snare|shotgun|net)/.test(method)) ||
    (/(basalt|olivine|rock|mineral|sulphur|coral)/.test(id) && /(hammer|hand|chisel)/.test(method)) ||
    (/(plant|cactus|mangrove)/.test(id) && /(hand|hammer|sketch)/.test(method));
  const risky = /(shark|mantaray|tortoise|sealion|frigatebird|booby|owl)/.test(id);
  const score = deterministicScore(`${specimenId}:${specimenName}:${collectionMethod}:${playerNotes}:${location}`);
  const threshold = (goodMethod ? 0.78 : 0.42) + (careful ? 0.12 : 0) - (reckless ? 0.2 : 0) - (risky ? 0.1 : 0);
  const success = easySpecimens.has(id) || score < threshold;

  return {
    success,
    reason: success
      ? `The attempt succeeds because the method and approach are suitable for ${specimenName}. Darwin secures the specimen while preserving enough context for later notes.`
      : `The attempt fails because the method or approach is poorly matched to ${specimenName}. The encounter still provides useful behavioral evidence if Darwin records it carefully.`,
  };
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { specimenId, specimenName, location, narrativeContext, collectionMethod, playerNotes } = req.body;

      // Validate required fields
      if (!specimenId || !specimenName) {
        return res.status(400).json({ 
          success: false, 
          reason: 'Missing required specimen information' 
        });
      }

      const systemPrompt = `You are determining whether a specimen collection attempt in 1835 Galapagos Islands will succeed, based on realistic factors. Give the result as a specific, vivid narrative that is happening in present tense, not a hypothetical. Collection attempts can lead to real danger and risk if they are particularly ill-conceived and the species or setting is risky - in fact, Darwin can be severely injured. In other cases, if the player has made a particularly strange choice, the results are embarassing. 
              However, sometimes it is quite easy, for instance finches and mockingbirds can always be collected with any method.  

              COLLECTION METHOD EFFECTIVENESS:
              - Shotgun: Effective for birds and larger animals at a distance, but can damage specimens and scare away other animals. Noisy and can lead to severe injuries. On especially bad attempts, there's a chance of Darwin misfiring and hitting nearby NPC if there is one in the immediate turn context. If fired at something small or breakable, it destroys it.
              - Insect Net: Excellent for flying insects, small birds if they're distracted. Requires skill and good timing.
              - Snare: Good for reptiles and small mammals. Requires patience and proper placement. Almost always works with lizards. 
              - Geologist's Hammer & Chisel: Perfect for mineral samples that are in situ, fossils, and plants growing on rocks. Useless for animals, and if the animal is potentially aggressive, it can lead to Darwin being injured. 
              - Hands: Works well for slow and tame creatures (any finch or mockingbird), plants, and objects like basalt or other freestanding rocks. High risk for fast or dangerous animals.

              SPECIMEN DIFFICULTY:
              - Tortoises ('eastern_santa_cruz_tortoise' and 'floreana_giant_tortoise': Slow but heavy and strong. Adults are easy to find but difficult to catch. Baby tortoises can always be caught by hand.
              - Birds: Mockingbirds and finches are ALWAYS collectible by hand, snare, or shot. Sea birds like the booby and frigatebird or harder to catch, and will fly away unless approached carefully or shot.
              - Lizards: Iguanas can ALWAYS be caught by snare and usually are collectible by being shot. 
              - Plants: Stationary but may require proper tools to extract without damage.
              - Marine creatures: Only collectible by shotgun or snare.
            
              - goats and other large fauna can usually be collected with shotgun 
              - documents like socialisttreatise can always be collected with hands or insect net, unless there is another person nearby who might intercept or take issue with it
              - barnacles and shells are always catchable by hands or geologist's hammer.
              - sharks may attack viciously if collected by hand or net, and could severely injure or even kill darwin. 
              - mysteriousflask and captainsskull can always be collected by hands, no matter what
              - minerals like basalt, olivine, and related hybrids can always be collected in any way, even without a method or technique specified

              PLAYER TECHNIQUE:
              - Patient, careful approaches increase success chances
              - Reckless or loud approaches decrease success
              - Knowledge of animal behavior helps
              - Physically strenuous attempts should consider Darwin's current fatigue

              Consider the match between collection method and specimen type, the player's described approach, and environmental context.

              Respond with ONLY a JSON object: {"success": true/false, "reason": "Two sentence explanation of why the attempt succeeded or failed"}`;
      const userPrompt = `Collection attempt details:
              - Specimen: ${specimenName} (${specimenId})
              - Location: ${location || 'Unknown location'}
              - Collection Method: ${collectionMethod || 'Unspecified method'}
              - Player's Approach: "${playerNotes || 'No specific approach mentioned'}"
              - Context: "${narrativeContext ? narrativeContext.substring(0, 500) : 'No context provided'}${narrativeContext && narrativeContext.length > 500 ? '...' : ''}"
              
              Determine if this collection attempt succeeds or fails, and explain why in a brief, narrative way that would be interesting to the player.`;
      const identity = getRequestIdentity({
        req,
        route: '/api/collection-decision',
        prompt: userPrompt,
        idempotencyKey: req.body?.idempotencyKey,
      });

      const llmResult = await generateLLMText({
        model: process.env.YOUNG_DARWIN_COLLECTION_MODEL || process.env.YOUNG_DARWIN_DEFAULT_MODEL || 'gpt-5.4-nano',
        route: '/api/collection-decision',
        sessionId: identity.sessionId,
        idempotencyKey: identity.idempotencyKey,
        systemPrompt,
        userPrompt,
        temperature: 0.45,
        maxTokens: 300,
      });

      if (llmResult.blocked) {
        return res.status(200).json(fallbackCollectionResult({ specimenId, specimenName, collectionMethod, playerNotes, location }));
      }

      // Try to parse the response as JSON
      try {
        let result;
        
        const cleanContent = llmResult.text.trim()
          .replace(/```json/g, '')
          .replace(/```/g, '');
        result = JSON.parse(cleanContent);
        
        res.status(200).json(result);
      } catch (error) {
        console.error('Error parsing LLM response:', error, llmResult.text);
        res.status(200).json(fallbackCollectionResult({ specimenId, specimenName, collectionMethod, playerNotes, location }));
      }
    } catch (error) {
      console.error('Collection decision error:', error);
      res.status(500).json({ 
        success: false, 
        reason: 'Error processing collection attempt: ' + error.message 
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
