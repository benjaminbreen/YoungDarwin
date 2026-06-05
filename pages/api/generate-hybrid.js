// pages/api/generate-hybrid.js
import { generateLLMText } from '../../utils/server/llmProvider';
import { getRequestIdentity } from '../../utils/server/llmSafety';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { parent1, parent2, taxonomicGroup, hybridityMode = 'mild' } = req.body;
    
    // Validate request data
    if (!parent1 || !parent2 || !taxonomicGroup) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        required: ['parent1', 'parent2', 'taxonomicGroup']
      });
    }
    
    const isExtreme = hybridityMode === 'extreme';
    
    // Create appropriate prompt based on hybridity mode
    const prompt = isExtreme 
      ? `
        Create a fantastical hybrid species by combining features of two taxonomically distinct organisms.
        This is for an alternative history game where more extreme biological hybridization is possible.
        
        Parent 1: ${parent1.name} (${parent1.latin})
        Description: ${parent1.description || 'No description available'}
        Order: ${parent1.order || 'Unknown'}
        
        Parent 2: ${parent2.name} (${parent2.latin})
        Description: ${parent2.description || 'No description available'}
        Order: ${parent2.order || 'Unknown'}
        
        Even though in reality these organisms could never hybridize, in this fictional setting they have.
        The result should be scientifically creative but still feel biologically plausible within the game world.
        
        Please generate a hybrid species with:
        1. A creative name combining elements from both parent species
        2. A latinized scientific name in binomial nomenclature
        3. A detailed description of this unusual hybrid's appearance and behavior
        4. 4-5 notable features that distinguish this extraordinary hybrid
        5. A profound quote that Darwin might have written upon discovering this remarkable specimen
        6. A scientific value rating from 1-10 (higher due to extreme rarity)
        7. A danger rating from 1-10 (might be higher than either parent)
        
        Format your response as a JSON object with these fields:
        {
          "name": "Hybrid Species Name",
          "latin": "Genus species-hybridus",
          "description": "Three-sentence description of this extraordinary hybrid...",
          "details": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"],
          "memoryText": "Darwin's profound quote about the specimen...",
          "keywords": ["keyword1", "keyword2", "keyword3"],
          "scientificValue": 8,
          "danger": 5,
          "emoji": ["a single appropriate, creative emoji for hybrid"]
        }
      `
      : `
        Create a scientifically plausible hybrid species by combining features of two related organisms.
        
        Parent 1: ${parent1.name} (${parent1.latin})
        Description: ${parent1.description || 'No description available'}
        
        Parent 2: ${parent2.name} (${parent2.latin})
        Description: ${parent2.description || 'No description available'}
        
        Taxonomic Group: ${taxonomicGroup}
        
        Please generate a hybrid species with:
        1. A plausible hybrid name combining elements from both parent species
        2. A latinized scientific name in binomial nomenclature
        3. A description of the hybrid's appearance and behavior
        4. 3-4 notable features that distinguish this hybrid
        5. A brief quote that Darwin might have written upon discovering this specimen
        
        Format your response as a JSON object with these fields:
        {
          "name": "Hybrid Species Name",
          "latin": "Genus species-hybridus",
          "description": "Three-sentence description of the hybrid...",
          "details": ["Feature 1", "Feature 2", "Feature 3", "Feature 4"],
          "memoryText": "Darwin's hypothetical quote about the specimen...",
          "keywords": ["keyword1", "keyword2", "keyword3"]
           "emoji": ["a single appropriate, creative emoji for hybrid"]
        }
      `;
    
    const identity = getRequestIdentity({
      req,
      route: '/api/generate-hybrid',
      prompt,
      idempotencyKey: req.body?.idempotencyKey || `${parent1.id || parent1.name}:${parent2.id || parent2.name}:${taxonomicGroup}:${hybridityMode}`,
    });

    const llmResult = await generateLLMText({
      model: process.env.YOUNG_DARWIN_HYBRID_MODEL || process.env.YOUNG_DARWIN_DEFAULT_MODEL || 'gpt-5.4-nano',
      route: '/api/generate-hybrid',
      sessionId: identity.sessionId,
      idempotencyKey: identity.idempotencyKey,
      systemPrompt: `You are a scientific assistant specializing in evolutionary biology and taxonomy for a ${isExtreme ? 'creative alternative history' : 'realistic, educational historical'} simulation game.`,
      userPrompt: prompt,
      temperature: isExtreme ? 0.9 : 0.7,
      maxTokens: 800,
    });

    if (llmResult.blocked) {
      return res.status(200).json({
        hybrid: createFallbackHybrid(parent1, parent2, taxonomicGroup, hybridityMode),
        source: 'fallback',
        blocked: true,
        reason: llmResult.reason,
      });
    }
    
    const hybridContent = llmResult.text || '';
    
    // Extract JSON from the response
    let hybrid;
    try {
      // Find JSON in the response
      const jsonMatch = hybridContent.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        hybrid = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No valid JSON found in response');
      }
    } catch (error) {
      console.error('Error parsing hybrid JSON:', error);
      
      // Use fallback if JSON parsing fails
      hybrid = createFallbackHybrid(parent1, parent2, taxonomicGroup, hybridityMode);
    }

// Return the hybrid data as usual
return res.status(200).json({
  hybrid,
  source: hybridContent ? 'llm' : 'fallback',
  provider: llmResult.provider,
  model: llmResult.model,
  hybridityMode
});
    
  } catch (error) {
    console.error('Error generating hybrid:', error);

    if (String(error.message || '').includes('No configured LLM provider')) {
      return res.status(200).json({
        hybrid: createFallbackHybrid(req.body?.parent1, req.body?.parent2, req.body?.taxonomicGroup, req.body?.hybridityMode),
        source: 'fallback',
      });
    }

    return res.status(500).json({
      error: 'Error generating hybrid',
      details: error.message
    });
  }
}

// Fallback hybrid generator (updated for both modes)
function createFallbackHybrid(parent1, parent2, taxonomicGroup, hybridityMode = 'mild') {
  const isExtreme = hybridityMode === 'extreme';
  
  const hybridName = `${parent1.name.split(' ')[0]}-${parent2.name.split(' ')[1]} Hybrid`;
  const latinName = `${parent1.latin.split(' ')[0]} ${parent2.latin.split(' ')[1]} hybridus`;
  
  // Create appropriate description based on mode
  const description = isExtreme
    ? `This extraordinary specimen defies classification, appearing to combine traits of both ${parent1.name} and ${parent2.name} in ways that challenge our understanding of natural history. Its unique characteristics suggest an entirely new branch of life on these islands.`
    : `This unusual specimen appears to be a natural hybrid of ${parent1.name} and ${parent2.name}. It shows characteristics of both parent species.`;
  
  // Combine keywords
  const keywords = [
    ...new Set([
      ...(parent1.keywords || []),
      ...(parent2.keywords || []),
      'hybrid',
      'unusual',
      isExtreme ? 'extraordinary' : 'variation'
    ])
  ];
  
  // Base hybrid object
  const baseHybrid = {
    name: hybridName,
    latin: latinName,
    description: description,
    details: [
      `Shows ${parent1.name} characteristics in its appearance`,
      `Displays behavior similar to ${parent2.name}`,
      `An unusual specimen that warrants careful study`,
      `Could represent a new ${isExtreme ? 'taxon' : 'variety or species'}`
    ],
    scientificValue: isExtreme ? 
      Math.max((parent1.scientificValue || 3), (parent2.scientificValue || 3)) + 4 : 
      Math.max((parent1.scientificValue || 3), (parent2.scientificValue || 3)) + 2,
    danger: isExtreme ? 
      Math.max(parent1.danger || 1, parent2.danger || 1) + 2 : 
      Math.max(parent1.danger || 1, parent2.danger || 1),
    keywords: keywords,
    memoryText: isExtreme ? 
      `"This is the most extraordinary specimen I've ever encountered! It appears to combine traits of both ${parent1.name} and ${parent2.name} in ways I would have thought impossible."` :
      `"I've never seen such a specimen before. It appears to combine traits of both ${parent1.name} and ${parent2.name} in most peculiar ways."`
  };
  
  return baseHybrid;
}
