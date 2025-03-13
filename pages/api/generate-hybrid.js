// pages/api/generate-hybrid.js
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
    
    // Validate API key exists
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("API key is missing - using fallback hybrid generation");
      // Return a fallback hybrid since we can't call the LLM
      return res.status(200).json({ 
        hybrid: createFallbackHybrid(parent1, parent2, taxonomicGroup, hybridityMode),
        source: 'fallback'
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
    
    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a scientific assistant specializing in evolutionary biology and taxonomy for a ${isExtreme ? 'creative alternative history' : 'realistic, educational historical'} simulation game.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: isExtreme ? 0.9 : 0.7, // More creativity for extreme mode
        max_tokens: 800 // Increased token limit for more detailed responses
      })
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('API error:', errorData);
      throw new Error(`API returned status ${response.status}`);
    }
    
    const data = await response.json();
    const hybridContent = data.choices[0].message.content;
    
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
      console.log('Raw response:', hybridContent);
      
      // Use fallback if JSON parsing fails
      hybrid = createFallbackHybrid(parent1, parent2, taxonomicGroup, hybridityMode);
    }
    
    if (hybrid) {
  try {
    
    
    // We don't wait for the image to be ready - just initiate the process
    // The image URL will be retrieved later when needed
    console.log(`Initiated image generation for hybrid: ${hybrid.name}`);
    
  } catch (error) {
    // Don't block the hybrid creation if image generation fails
    console.error('Error initiating hybrid image generation:', error);
  }
}

// Return the hybrid data as usual
return res.status(200).json({
  hybrid,
  source: 'llm',
  hybridityMode
});
    
  } catch (error) {
    console.error('Error generating hybrid:', error);
    
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