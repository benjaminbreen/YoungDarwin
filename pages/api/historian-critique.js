// pages/api/historian-critique.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("API key is missing");
      return res.status(500).json({ error: "API key is not configured" });
    }

    // Get the latest narrative from the request
    const cookie = req.headers.cookie || '';
    const lastNarrativeTextMatch = cookie.match(/lastNarrativeText=([^;]+)/);
    
    let lastNarrativeText = 'No narrative text available.';
    if (lastNarrativeTextMatch && lastNarrativeTextMatch[1]) {
      lastNarrativeText = decodeURIComponent(lastNarrativeTextMatch[1]);
    } else if (req.body.narrativeText) {
      lastNarrativeText = req.body.narrativeText;
    } else if (req.body.rawResponse) {
      lastNarrativeText = req.body.rawResponse;
    }

    const systemPrompt = `
      You are an acerbic but highly knowledgeable historian specializing in 19th century natural history, the Galapagos islands, and Charles Darwin's voyage on the Beagle. 
      
      Critique the following AI-generated narrative "turn" in an educational simulation game called Young Darwin that simulates Charles Darwin's experiences in the Galapagos in 1835; he is gathering specimen on Charles Island/Isla Floreana with Syms Covington, his servant, in September 1835. 
      
      Here is some ground truth from a page of Janet Browne's VOYAGING: "It was an entirely Cyclopean scene, Darwin fantasised. “Surrounded by the black lava, the leafless shrubs & large cacti, they appeared most old-fashioned antediluvian animals; or rather inhabitants of some other planet.” Unlike most tortoises, they did not withdraw into their shell. Like the birds, they showed little fear of human beings.

FitzRoy soon moved the Beagle to Charles Island, where there was a small Ecuadorian penal colony under the eye of Nicholas Lawson, the official British resident. Darwin only managed to ascend the central mountain in the four days that FitzRoy stayed there. Yet he found evidence confirming that the lava forming this island originally erupted under water, although so long ago that it presented a much smoother surface than on the other islets, and had weathered into soil supporting a more copious plant life. Not since Brazil, he remarked, had he seen such tropical vegetation. But there were notable differences in the way the trees were draped with long wispy lichens instead of lianas and an odd lack of insects.

The sensation of isolation up on the mountain was overwhelming. “The inhabitants here live a sort of Robinson Crusoe life,” he remarked; “the houses are very simple, built of poles & thatched with grass,—part of their time is employed in hunting the wild pigs & goats with which the woods abound; from the climate, agriculture requires but a small portion.” It was interesting to hear that this island once had had a Robinson Crusoe of its own, one Patrick Watkins from Ireland, a refugee from civilisation who had arrived early in the nineteenth century before any of the Ecuadorian settlers. Watkins built a crude hut and managed to grow crops of potatoes and other vegetables, which he exchanged for rum with passing ships, mainly whalers. His appearance was wretched, reported Captain Porter of the United States Navy in 1815: his red hair and beard were matted, his skin burnt, and he was so wild and savage he filled everyone with horror. He once abducted a Negro sailor from an American ship to serve as a Man Friday, although the sailor got the better of him and escaped.

Darwin was alert to the evocative imagery such a tale of privation and isolation could convey. The account of Crusoe’s shipwreck and his meagre existence had struck many chords as the Beagle passed through the harshest regions of South America. During the first voyage of the Beagle, FitzRoy had even briefly been to Juan Fernández, the Pacific island where Alexander Selkirk, the original castaway on whom Defoe based his book, had lived alone for five years. "
     And here is some information on how Lawson met the Beagle crew: "Nicolai was in the harbour to greet a regular customer, an American whaling ship, when captain FitzRoy and Charles Darwin accidentally met him. They were invited to the settlement and served a grand dinner, along with one of Nicolai's speeches on the flora and fauna of the islands."

      Your task is to:
      1. BRIEFLY historical inaccuracies, anachronisms, or implausibilities
      2. Briefly critique any issues with the portrayal of Darwin, his scientific methods, and the setting
      3. Provide 1 specific correction with historical evidence (briefly)
      4. Suggest two key academic sources for further reading and understanding of the SPECIFIC events and context of this turn of Young Darwin.
      
      Be direct, incisive, and unsparing in your criticism, but also be fair. Acknowledge any elements that are historically plausible or accurate.
      
      Format your response with bold headings and bullet points for readability. Your tone should be that of a demanding but brilliant academic reviewer. Keep it quite short but extremely information rich and pithy. 
    `;

    // Log what we received
    console.log("Received narrative text length:", lastNarrativeText ? lastNarrativeText.length : 0);
    
    // Clean the narrative text of any metadata markers
    if (lastNarrativeText) {
      lastNarrativeText = lastNarrativeText
        .replace(/\[MOOD:.*?\]/g, '')
        .replace(/\[FATIGUE:.*?\]/g, '')
        .replace(/\[SCIENTIFIC_INSIGHT:.*?\]/g, '')
        .replace(/\[COLLECTIBLE:.*?\]/g, '')
        .replace(/\[NPC:.*?\]/g, '')
        .replace(/NEXTSTEPS:[\s\S]*?(?=\[|$)/g, '')
        .trim();
    }
    
    // If we have no narrative text, use a sample for testing
    if (!lastNarrativeText || lastNarrativeText === 'No narrative text available.') {
      const sampleText = `
        You carefully examine the marine iguana with your hand lens. The creature's black scales appear almost metallic in the harsh sunlight, adapted to absorb heat quickly after its cold swimming ventures. Each scale has a subtle pattern of ridges, likely evolved to shed water efficiently after emerging from the sea. The iguana's powerful claws grip the volcanic rock with impressive strength, specially adapted for clinging to slippery surfaces. Its snout shows signs of wear, evidence of its unique feeding behavior - scraping algae from rocks beneath the water's surface. This adaptation to marine feeding is unlike any lizard you've previously encountered.
      `;
      lastNarrativeText = sampleText;
    }

    // Call the OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Please critique this narrative from a historian's perspective:\n\n${lastNarrativeText}` }
        ],
        temperature: 0.7,
        max_tokens: 650
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`API returned status ${response.status}`);
    }

    const data = await response.json();

    // Return the historian's critique
    return res.status(200).json(data);
  } catch (error) {
    console.error("Error generating historian critique:", error);
    return res.status(500).json({ 
      error: "Failed to generate critique", 
      details: error.message 
    });
  }
}