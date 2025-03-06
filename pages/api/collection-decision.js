export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { specimenId, specimenName, location, narrativeContext, collectionMethod, playerNotes } = req.body;

      // Log the received request for debugging
      console.log('Collection decision request:', {
        specimenId,
        specimenName,
        location,
        collectionMethod,
        playerNotesLength: playerNotes ? playerNotes.length : 0
      });

      // Validate required fields
      if (!specimenId || !specimenName) {
        return res.status(400).json({ 
          success: false, 
          reason: 'Missing required specimen information' 
        });
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are determining whether a specimen collection attempt in 1835 Galapagos Islands will succeed, based on realistic factors. Give the result as a specific, vivid narrative that is happening in present tense, not a hypothetical. Collection attempts can lead to real danger and risk if they are particularly ill-conceived and the species or setting is risky - in fact, Darwin can be severely injured. In other cases, if the player has made a particularly strange choice, the results are embarassing. 
              However, sometimes it is quite easy, for instance finches and mockingbirds can always be collected with any method.  

              COLLECTION METHOD EFFECTIVENESS:
              - Shotgun: Effective for birds and larger animals at a distance, but can damage specimens and scare away other animals. Noisy and can lead to severe injuries. On especially bad attempts, there's a chance of Darwin misfiring and hitting nearby NPC if there is one in the immediate turn context. 
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
              - Minerals can ALWAYS be collected with the geologist's hammer and usually with hands. shooting it creates an interesting display of the inner minerals.
              - goats and other large fauna can usually be collected with shotgun 
              - documents like socialisttreatise can always be collected with hands or insect net, unless there is another person nearby who might intercept or take issue with it
              - barnacles and shells are always catchable by hands or geologist's hammer.
              - sharks may attack viciously if collected by hand or net, and could severely injure or even kill darwin. 
              - mysteriousflask and captainsskull can always be collected by hands, no matter what

              PLAYER TECHNIQUE:
              - Patient, careful approaches increase success chances
              - Reckless or loud approaches decrease success
              - Knowledge of animal behavior helps
              - Physically strenuous attempts should consider Darwin's current fatigue

              Consider the match between collection method and specimen type, the player's described approach, and environmental context.

              Respond with ONLY a JSON object: {"success": true/false, "reason": "Two sentence explanation of why the attempt succeeded or failed"}`
            },
            {
              role: 'user',
              content: `Collection attempt details:
              - Specimen: ${specimenName} (${specimenId})
              - Location: ${location || 'Unknown location'}
              - Collection Method: ${collectionMethod || 'Unspecified method'}
              - Player's Approach: "${playerNotes || 'No specific approach mentioned'}"
              - Context: "${narrativeContext ? narrativeContext.substring(0, 500) : 'No context provided'}${narrativeContext && narrativeContext.length > 500 ? '...' : ''}"
              
              Determine if this collection attempt succeeds or fails, and explain why in a brief, narrative way that would be interesting to the player.`
            }
          ],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('API error:', errorData);
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json();
      
      // Try to parse the response as JSON
      try {
        let result;
        
        // Check if content is already a parsed object or needs parsing
        if (typeof data.choices[0].message.content === 'string') {
          // Clean up the response to ensure it's valid JSON
          const cleanContent = data.choices[0].message.content.trim()
            .replace(/```json/g, '')
            .replace(/```/g, '');
            
          result = JSON.parse(cleanContent);
        } else {
          result = data.choices[0].message.content;
        }
        
        // Add some randomness to make gameplay more interesting
        // 10% chance to flip the result if the specimen is difficult
        const difficultSpecimens = ['floreana_giant_tortoise', 'eastern_santa_cruz_tortoise',  'frigatebird', 'seaLion', 'iguana'];
        const shouldRandomize = difficultSpecimens.includes(specimenId) && Math.random() < 0.1;
        
        if (shouldRandomize) {
          result.success = !result.success;
          if (result.success) {
            result.reason = "Through an incredible stroke of luck, you succeed despite the difficulty!";
          } else {
            result.reason = "Despite your perfect technique, unexpected circumstances foil your attempt.";
          }
        }
        
        res.status(200).json(result);
      } catch (error) {
        console.error('Error parsing LLM response:', error, data.choices[0].message.content);
        
        // Fallback to a default response
        const isEasySpecimen = ['cactus', 'volcanoRock', 'seashell', 'basalt','coralFragment', 'mangrove'].includes(specimenId);
        const defaultSuccess = isEasySpecimen || Math.random() < 0.5;
        
        res.status(200).json({
          success: defaultSuccess,
          reason: defaultSuccess 
            ? "Your collection attempt succeeds." 
            : "Your collection attempt fails."
        });
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