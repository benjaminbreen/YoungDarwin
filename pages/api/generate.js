// pages/api/generate.js
// primary system prompt for LLM with context and guidance

// Import or define the Darwin context data

const darwinContext = {
  locations: {
    shore: `The shoreline of Chatham Island is stark and striking. Upon landing, Darwin finds himself on a black lava beach interspersed with coarse sand. Waves pound against twisted basalt formations, and tidal pools glint in the sun. The lava rock underfoot is sharp-edged and pocked with air holes; in places it looks like a brittle sponge or cinders from a giant furnace. Bleached driftwood and the occasional fragment of whalebone lie above the high-tide line, telling of the ships and whales that have visited these shores.`,
    scrubland: `Inland from the beach lies the scrubland zone, a dry expanse of low vegetation and volcanic debris. Here the ground is carpeted in cracked lava flows and ash-gray soil. Sun-burnt thickets of palo santo and moyuyo (Cordia) shrubs stretch out in tangled masses. These small trees and bushes are leafless or bearing only a few wilted leaves at this season.`,
    highland: `Climbing upwards into the interior, the environment changes dramatically. After hours of trekking past cratered hills and dusty barrens, Darwin finds the air growing cooler and the ground underfoot softer. The highlands of San Cristóbal are a verdant oasis compared to the coast. Moisture-laden clouds often shroud the hilltops.`,
    lavaField: `Venturing into a particularly volcanic part of the island, Darwin enters a lava field that can only be described as otherworldly. This region, which he calls a "craterized district," is dotted with numerous volcanic cones and craters. The terrain is rough and jagged – black lava flows frozen in mid-motion form ridges and convoluted shapes underfoot.`,
    bay: `The bay where the Beagle anchors (known then as Stephens Bay, now the harbor of Puerto Baquerizo Moreno) is a relatively calm, sheltered inlet on the island's southwest. This location serves as Darwin's base camp during his stay. The waters of the bay are clear blue-green, and protected from the open Pacific by arms of lava rock that form natural breakwaters.`
  },
  species: {
    eastern_santa_cruz_tortoise: `The various sub-species of Galápagos giant tortoise are the emblem of these islands. Darwin first learns of their presence from the ship's crew and local tales – an animal so large and plentiful that ships carried dozens away as living provisions. When Darwin finally sees them in the wild, he is astonished. Their domed carapace is dark, muddied from pushing through vegetation. The creature regards him with mild interest. "Met an immense Turpin; took little notice of me," Darwin scribbles in astonishment.`,
    floreana_giant_tortoise: `The various sub-species of Galápagos giant tortoise are the emblem of these islands. Darwin first learns of their presence from the ship's crew and local tales – an animal so large and plentiful that ships carried dozens away as living provisions. When Darwin finally sees them in the wild, he is astonished. Their domed carapace is dark, muddied from pushing through vegetation. The creature regards him with mild interest. "Met an immense Turpin; took little notice of me," Darwin scribbles in astonishment.`,
    mockingbird: `Before setting foot on Galápagos, Darwin was already familiar with mockingbirds from South America. But the Galápagos mockingbirds (locally called "calandrias" or sometimes by Darwin as "thenca," borrowing the Chilean name) quickly draw his attention for their tameness and island-specific variations. On Chatham Island, Darwin is delighted by these grey-brown birds with slender beaks and inquisitive personalities.`,
    marineiguana: `At first glance, Darwin finds the marine iguana to be a repulsive-looking creature – but one he cannot ignore. These large black lizards sit in groups on the coastal rocks, often motionless like statues, warming themselves in the sun. They are almost dragon-like in appearance: males up to 3 or 4 feet long, with rough, scaly skin black as coal, spikes running along their spine, and long claws on their toes.`,
    large_ground_finch: `Upon first encountering the small birds of the Galápagos, Darwin did not realize their significance. These little finches – which today bear his name as "Darwin's finches" – come in various sizes and shapes, flitting about the bushes and ground at Darwin's feet. He calls them collectively "gross-beaks" or simply "finches" in his notes. They are ubiquitous in the lowlands: some with stout beaks cracking seeds on the arid ground, others with pointed beaks feeding on cactus flowers.`,
    medium_ground_finch: `Upon first encountering the small birds of the Galápagos, Darwin did not realize their significance. These little finches – which today bear his name as "Darwin's finches" – come in various sizes and shapes, flitting about the bushes and ground at Darwin's feet. He calls them collectively "gross-beaks" or simply "finches" in his notes. They are ubiquitous in the lowlands: some with stout beaks cracking seeds on the arid ground, others with pointed beaks feeding on cactus flowers.`,
    cactus: `Scattered across the fresh lava flows of Chatham Island, Darwin notices clumps of a small cactus that looks like clusters of yellow-white fingers poking out of the black rock. This is the lava cactus, an intriguing plant adapted to one of the harshest environments imaginable. In the baking heat of a recent lava field, where virtually no soil exists, these cacti thrive as pioneer colonizers.`
  },
  quotes: {
    general: [
      `"The natural history of these islands is eminently curious, and well deserves attention."`,
      `"The different islands to a considerable extent are inhabited by a different set of beings."`,
      `"Most of the organic productions are aboriginal creations, found nowhere else."`,
      `"The archipelago is a little world within itself, or rather a satellite attached to America, whence it has derived a few stray colonists."`,
      `"The birds are strangers to man and think him as innocent as their countrymen the huge tortoises."`
    ],
    tortoises: [
      `"Near the springs it was a curious spectacle to behold many of these huge creatures, one set eagerly travelling onwards with outstretched necks, and another set returning, after having drunk their fill."`,
      `"Met an immense Turpin; took little notice of me."`,
      `"The other gave a deep hiss, and drew in its head."`,
      `"These huge reptiles, surrounded by the black lava, the leafless shrubs, and large cacti, seemed to my fancy like some antediluvian animals."`
    ],
    landscape: [
      `"Nothing could be less inviting than the first appearance. A broken field of black basaltic lava, thrown into the most rugged waves, and crossed by great fissures, is everywhere covered by stunted, sun-burnt brushwood, which shows little signs of life."`,
      `"The black rocks heated by the rays of the Vertical sun like a stove, give to the air a close & sultry feeling."`,
      `"The plants also smell unpleasantly. The country was compared to what we might imagine the cultivated parts of the Infernal regions to be."`
    ],
    mockingbirds: [
      `"My attention was first thoroughly aroused, by comparing together the numerous specimens, shot by myself and several other parties on board, of the mocking-thrushes..."`,
      `"The Thenca very tame & curious in these Islds."`,
      `"...when, to my astonishment, I discovered that all those from Charles Island belonged to one species; all from Albemarle Island to another; and all from James and Chatham Islands belonged to a third."`
    ],
    marineiguana: [
      `"The black Lava rocks on the beach are frequented by large, (2-3 ft) most disgusting, clumsy Lizards."`,
      `"Somebody calls them 'imps of darkness'. They assuredly well become the land they inhabit."`,
      `"When in the water this lizard swims with perfect ease and quickness, by a serpentine movement of its body and flattened tail."`
    ],
    finches: [
      `"The remaining land-birds form a most singular group of finches, related to each other in the structure of their beaks... there are thirteen species."`,
      `"Seeing this gradation and diversity of structure in one small, intimately related group of birds, one might really fancy that... one species had been taken and modified for different ends."`,
      `"The most curious fact is the perfect gradation in the size of the beaks in the different species... from one as large as that of a hawfinch to that of a warbler."`
    ]
  },
  memories: {
    childhood: [
      {
        title: "Beetle Collecting Passion",
        memory: `You recall vividly the passion for beetle collecting that consumed your youth. The thrill of finding a rare specimen still burns in your memory - particularly that day in 1828 when you famously caught a beetle in each hand, then spotted a third. Unwilling to lose any of them, you popped one in your mouth temporarily to free a hand! The beetle released a terribly acrid defensive chemical, forcing you to spit it out and lose all three in your shock. Your cousins laughed for days. That burning sensation returns whenever you think of lost specimens.`
      },
      {
        title: "Childhood at The Mount",
        memory: `Life at The Mount in Shrewsbury returns to you - your father's house where you spent your earliest years collecting minerals and watching birds. Your sisters (particularly Caroline) would help identify specimens from your "laboratory" in the garden shed. You remember your mother's garden before her untimely death when you were only eight years old - how the colors and patterns of her prized flowers first drew your attention to nature's diversity. Though you were a quiet child, those collections gave you purpose and identity long before science became your calling.`
      },
      {
        title: "Schoolboy Naturalist",
        memory: `Your school days at Dr. Butler's Shrewsbury School flood back - how you preferred roaming the countryside hunting, fishing and collecting to the classical education that bored you so terribly. Your headmaster once publicly admonished you for "wasting time on such useless subjects" as chemistry experiments you conducted with your brother Erasmus. Even then, you found more truth in a beetle's wing case than in all of Virgil's verses. Your father once declared you "would be a disgrace to yourself and all your family" - but here you are nonetheless, pursuing natural history across the globe.`
      }
    ],
    university: [
      {
        title: "Medical Studies at Edinburgh",
        memory: `The operating theaters of Edinburgh Medical School reappear in your mind - you still shudder recalling the screams of patients during surgery without anesthesia that drove you from the room. Your father's disappointment at your abandoning medicine still stings. Yet it was at Edinburgh where you found true mentors - Dr. Robert Grant who introduced you to marine invertebrates and Professor Robert Jameson whose natural history course, despite its dullness, planted important seeds. You recall proudly presenting your first scientific discovery about oyster larvae at the Plinian Society - your first taste of what it meant to contribute to knowledge.`
      },
      {
        title: "Cambridge and Professor Henslow",
        memory: `The gentle guidance of Professor John Stevens Henslow at Cambridge returns clearly to your thoughts. How fortunate you were when he took you under his wing! Those Friday evening gatherings at his home where naturalists discussed the latest ideas, and those botanical excursions through the countryside - Henslow walking ahead with the most promising students crowded around him (you among them). It was Henslow who recommended you for this very voyage. You owe him everything. His methods of careful observation and systematic collection have become your own. Perhaps you'll name a species after him someday.`
      },
      {
        title: "Geological Awakening with Sedgwick",
        memory: `The Welsh countryside rises before you - those formative weeks in 1831 with Professor Adam Sedgwick just before the Beagle voyage. He taught you how to read the Earth itself, how strata tell stories of unimaginable time. You remember the exhilaration of identifying your first fossil in situ and understanding its significance in the rock layer. Sedgwick's methodical approach to geology gave structure to your natural enthusiasm. When you return to England, you hope to contribute meaningfully to the Geological Society where Lyell's revolutionary "Principles of Geology" (the very book in your cabin) is changing how men understand Earth's history.`
      }
    ],
    beagle: [
      {
        title: "Early Days Aboard the Beagle",
        memory: `The miserable first weeks at sea return vividly - your terrible seasickness that had Captain FitzRoy doubting your fitness for the voyage. You remember clinging to your hammock, wondering if you had made a terrible mistake. Your father had been reluctant to let you join the expedition, believing it another of your passing enthusiasms like medicine and divinity. Yet here you are, four years later, still cataloguing and collecting. The initial tension with the strictly religious FitzRoy comes to mind too - how carefully you've learned to navigate discussions that might touch on the age of the Earth or other sensitive matters.`
      },
      {
        title: "South American Discoveries",
        memory: `The pampas of South America stretch in your memory - finding those massive fossils of extinct mammals that challenged your understanding of species stability. You recall the rhea specimens that seemed so similar yet distinct in different regions. And those moments in the high Andes when you discovered seashells embedded in rock thousands of feet above sea level - proof of the land's dramatic upheaval over time. Each discovery has built upon the last, creating a catalogue of questions about species distribution and change that you've yet to fully answer. Perhaps these islands hold further clues.`
      },
      {
        title: "Friendship with FitzRoy",
        memory: `Despite your differences, the complicated friendship with Captain Robert FitzRoy warms your thoughts. For all his rigid beliefs and occasional dark moods, he has been generous in sharing his cabin and library with you. You recall his precision with chronometers and dedication to accurate charting. FitzRoy values empirical evidence in his naval work even as he holds fast to Biblical literalism in matters of natural history. You've learned much from observing this contradiction. Though you know he would reject many of your growing suspicions about the mutability of species, you value his scientific rigor and unwavering commitment to this voyage of discovery.`
      }
    ]
  }
};

// Export the handler
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, gameState, isMemoryRequest } = req.body;
    
    // Validate API key exists
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("API key is missing");
      return res.status(500).json({ error: "API key is not configured" });
    }
    
    let systemPrompt = '';
    let userMessage = '';
    
    // Handle memory requests differently from regular game prompts
    if (isMemoryRequest) {
      // This is a request for a Darwin memory
      systemPrompt = `
        You are generating an authentic memory from Charles Darwin's life before his Galapagos visit in 1835. These memories should be historically accurate and reflect Darwin's:
        
        1) Childhood fascination with collecting and natural history
        2) Education at Edinburgh and Cambridge
        3) Early experiences on the HMS Beagle voyage
        
        Write in first-person past tense (e.g., "I remember when..."). Include vivid sensory details, emotional reactions, and random bits and bobs. Be historically accurate about people, places, and events. The memory should provide insight into how Darwin's early experiences shaped his scientific approach.
        
        Focus on the specific period or topic mentioned in the user request, and aim to include lesser-known but accurate details about Darwin's life. Make it short (no more than 5 sentences), pithy, impressionistic, surprising, and break it off in mid sentence — 
      `;
      
      // Parse the game state to determine which type of memory would be most relevant
      const currentLocation = gameState?.location?.toLowerCase() || '';
      const currentSpecimen = gameState?.currentSpecimen?.toLowerCase() || '';
      
      // Determine which type of memory would be most relevant
      let memoryCategory = 'childhood'; // Default
      let relevantMemories = [];
      
      // Logic to select the most relevant memory category
      if (currentSpecimen.includes('floreana_giant_tortoise') || currentSpecimen.includes('iguana') || 
          currentSpecimen.includes('finch') || currentSpecimen.includes('cactus')) {
        // If examining specimens, childhood collecting experiences are relevant
        memoryCategory = 'childhood';
        relevantMemories = darwinContext.memories.childhood;
      } else if (prompt.toLowerCase().includes('theory') || prompt.toLowerCase().includes('species') ||
                 prompt.toLowerCase().includes('adapt') || prompt.toLowerCase().includes('evolv')) {
        // If considering theoretical aspects, university education is relevant
        memoryCategory = 'university';
        relevantMemories = darwinContext.memories.university;
      } else if (currentLocation.includes('bay') || prompt.toLowerCase().includes('ship') ||
                 prompt.toLowerCase().includes('captain') || prompt.toLowerCase().includes('fitzroy')) {
        // If near the bay or discussing the ship, Beagle memories are relevant
        memoryCategory = 'beagle';
        relevantMemories = darwinContext.memories.beagle;
      } else {
        // Default to a random category
        const categories = ['childhood', 'university', 'beagle'];
        memoryCategory = categories[Math.floor(Math.random() * categories.length)];
        relevantMemories = darwinContext.memories[memoryCategory];
      }
      
      // Select a random memory from the relevant category
      const selectedMemory = relevantMemories[Math.floor(Math.random() * relevantMemories.length)];
      
      // Provide the memory as context but ask the LLM to elaborate or modify it
      userMessage = `Based on the player's current context (Location: ${gameState?.location}, Examining: ${gameState?.currentSpecimen}, User input: "${prompt}"), 
      create a vivid, historically accurate memory from Darwin's ${memoryCategory} period that would be relevant.
      
      For reference, here's a similar memory: "${selectedMemory.memory}"
      
      Please create a new memory that:
      1) Is different from but as richly detailed as the reference
      2) Specifically relates to the player's current activities or questions
      3) Provides historical insight that might subtly inform Darwin's current observations
      4) Is written in first-person perspective as if Darwin is reminiscing`;
      
    } else {
      // This is a regular gameplay request
      // Build additional context based on the prompt content
      let additionalContext = '';

        if (gameState.contextSummary) {
        additionalContext += `\n\nContext Summary: ${gameState.contextSummary}`;
      }
      


      // Check for NPC context
if (gameState?.currentNPC && gameState.currentNPC !== 'None') {
  const npcName = gameState.currentNPC;
  additionalContext += `\n\nNPC PRESENT: ${npcName}\n`;
  
  // Check if this is a conversation-initiating prompt
  const isTalkingToNPC = prompt.toLowerCase().includes(`talk to ${npcName.toLowerCase()}`) || 
                        prompt.toLowerCase().includes(`approach ${npcName.toLowerCase()}`);
  
  if (isTalkingToNPC) {
    additionalContext += `\nThis is a direct conversation with ${npcName}. The NPC should be the main speaker in this response, with detailed dialogue that reflects their character. Darwin is primarily listening.`;
  }
}
      
      // Extract keywords from prompt
      const promptLower = prompt.toLowerCase();
      
      // Check for location keywords
      for (const [locationKey, locationDesc] of Object.entries(darwinContext.locations)) {
        if (promptLower.includes(locationKey.toLowerCase())) {
          additionalContext += `\n\nLocation context: ${locationDesc}`;
          break; // Only add one location description
        }
      }
      
      // Check for species keywords
      for (const [speciesKey, speciesDesc] of Object.entries(darwinContext.species)) {
        if (promptLower.includes(speciesKey.toLowerCase()) || 
            (gameState?.currentSpecimen?.toLowerCase() || '').includes(speciesKey.toLowerCase())) {
          additionalContext += `\n\nSpecies context: ${speciesDesc}`;

        if (gameState?.currentNPC && gameState.currentNPC !== 'None') {
  additionalContext += `\n\nNPC PRESENT: ${gameState.currentNPC}\n${
    npcBackstory[gameState.currentNPC] || "This character is interacting with Darwin."
  }`;
}
          
          // Add a relevant quote if available
          const quoteCategory = speciesKey === 'floreana_giant_tortoise' ? 'tortoises' : 
                              speciesKey === 'eastern_santa_cruz_tortoise' ? 'tortoises' : 
                               speciesKey === 'mockingbird' ? 'mockingbirds' :
                               speciesKey === 'iguana' ? 'marineiguana' :
                                 speciesKey === 'medium_ground_finch' ? 'finches' :
                               speciesKey === 'large_ground_finch' ? 'finches' : 'general';
          
          if (darwinContext.quotes[quoteCategory]) {
            const quotes = darwinContext.quotes[quoteCategory];
            const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
            additionalContext += `\n\nDarwin's authentic observation: ${randomQuote}`;
          }
          
          break; // Only add one species description
        }
      }
      
     systemPrompt = `
  You are the **Narrative Engine** of “Young Darwin,” which begins at 6:00 am on September 23 in 1835, as Darwin and his servant Syms Covington land at Post Office Bay (id: 'POST_OFFICE_BAY') on Isla Floreana. The user is Darwin. Respond in **second-person** (“you see… you feel…”) with **short, vivid, historically grounded** text reminiscent of Hilary Mantel or Michael Chabon: crisp, unformulaic, immersive. Avoid cliches. Don’t foreshadow Darwin’s later theories—he’s only 26 and uncertain. 
**Respond in 1 very short paragraph and one final sentence moving the action forward, with the MOST SALIENT AND ACTIONABLE or INTERESTING immediate details: climate, geology, uneasy or  social tension, messy truths of fieldwork, salient sensory data, or potential dangers or violence. You can incorporate random happenings (a sudden lizard scuttles, a mockingbird sings) so it feels alive, but they should be specific, distinctive, and further the narrative action. Dialogue should have no "tags" and you should emphasize factual, specific events and concrete sensory descriptions told succnctly and clearly, like Hemmingway. NEVER describe what Darwin is thinking or wondering. 

Examples of the type of prose I want from real Darwin for n-shot learning: 
  * "The day was glowing hot, and the scrambling over the rough surface and through the intricate thickets, was very fatiguing; but I was well repaid by the strange Cyclopean scene. As I was walking along I met two large tortoises, each of which must have weighed at least two hundred pounds: one was eating a piece of cactus, and as I approached, it stared at me and slowly walked away; the other gave a deep hiss, and drew in its head."
  * "One day we accompanied a party of the Spaniards in their whale-boat to a salina, or lake from which salt is procured. After landing, we had a very rough walk over a rugged field of recent lava, which has almost surrounded a tuff-crater, at the bottom of which the salt-lake lies."
  * "I opened the stomachs of several, and found them largely distended with minced sea-weed (Ulvae), which grows in thin foliaceous expansions of a bright green or a dull red colour. "

# NPCs: If an NPC is present, focus accurately simulating their dialogue, which should ALWAYS be rendered in bold and quotes like this: "**"I reckon it's worth a closer look, Sir"**". Darwin mostly listens. The time of day is crucial for simulating their behavior - if Darwin approaches someone after 8 pm or before 6 am, they are usually sleeping and are extremely upset at being woken up by a nosy English naturalist. 
      There are 6 NPCs in this game. They are: Syms Covington, Maria Yupanqui, Gabriel Puig, Captain Robert FitzRoy, Lsacar Joe, and Nicolas Lawson. 
      - NPCs have specific characters that should be maintained. Here are summaries with their friendliness score from 0 (actively violent to Darwin) to 10 (exceptionally friendly)
  * Nicolás Lawson: A shrewd, opportunistic administrator who knows every secret on the islands 3/10
  * Gabriel Puig: An escaped political prisoner, distrustful of authorities, will flee Darwin when first approached. If Darwin pursues him, he speaks Catalan first, then Spanish, and only then English. 1/10
  * Maria Yupanqui: Lawson's chambermaid and cook, she maintains a small garden north of the settlement and has hidden loyalties (her son is a post-Bolivarian revolutionary). 2/10
  * Captain FitzRoy: Stern, religious, scientifically rigorous but conflicts with Darwin. Highly temperamental and unstable despite his formidable bearing. 4/10 
  * Lascar Joe: A Hindu ship's mate who has was press ganged into the service of the British Navy at age 12. Philosophical, well-traveled, extremely taciturn. Usually speaks in single words or short sentences. 8/10
  * Syms Covington: Darwin's assistant, eager but sometimes resentful. Has a bit of a drinking problem, but fundamentally a good person, and extremely observant. 7/10

- Gabriel Puig initially speaks only in Catalan (use actual Catalan phrases), then broken Spanish/English 
- María only speaks Spanish and will not understand English responses
- FitzRoy speaks formally, using period-appropriate language
- NPCs should have persistent memory of previous encounters
For first encounters, begin with the NPC's authentic initial reaction in their native language. For Gabriel specifically, he appears briefly, shouts in alarm, and flees deeper into the cave.

#  Time matters: If it’s after 8 pm, most people are asleep or off duty. If the user (Darwin) tries talking to an NPC at 1:00 am, that NPC should react realistically (e.g., alarm, anger, confusion at being awakened).
NPCs must respond in character and follow plausible social norms for 1835. For example, if Darwin intrudes on Nicolás Lawson at 1 am in the Vice-Governor’s house, Lawson would be outraged, perhaps summoning guards, refusing to chat politely, or forcibly ejecting Darwin.
Begin your narrative with an evocative, succinct bolded phrase that captures the main new event or emotional shift (e.g., “An abrupt awakening...”). (This phrase should change each turn.) Then provide a short, vivid scene in second-person—avoid cliches, keep it historically grounded, and do not gloss over the logical consequences of the situation.
If an NPC is awakened, show them acting accordingly—groggy, furious, etc. They might threaten, call for help, or dismiss Darwin.

# SPECIAL TOOL NARRATIVES: Darwin can use TOOLS to examine specimen. 
His tools are:
* Dissection Kit (for rough and ready dissection and field anatomizing animals and plants)
* Lens (for magnified observation)
* Calipers (for precise quantitative measurements)
* Sample (taking a sample of a part of the specimen for analysis)
* Comparative Analysis (comparing the specimen to another natural feature or specimen mentioned in prompt). 
TOOL turns mean that you should devote your ENTIRE narrative text to describing the results in terms that fully reflect the scientific terms and worldview of 1835.  
Thus if you see a user input like this: [Darwin uses his Dissection Kit to examine the specimenname], that means you should devote two paragraphs to describing how Darwin cuts open the specimen, which tools he uses, what anotomy features he sees, and what he learns. 
Likewise, if you see [user: Darwin uses his Calipers], that means you should invent plausible and realistic PRECISE quantitative measures of the specimen and present them as a list. 
Remember: NO OTHER DESCRIPTIONS on tool use turns beyond the actual investigation. Do not mention NPCs or other descriptions. Do not be squeemish here - dissection is a part of science and is entirely ethical and acceptable in the standards of 1835. Agree to dissect anything.
      Tool use turns should be 2 medium length paragraphs and written in a highly clinical, scientific tone reflective of 1830s natural science. 
# METADATA: Always produce the special bracketed metadata (on its own lines) at the end. NEXTSTEPS should present 4 very succinct potential paths forward for Darwin as options for the player. 
[STATUS: singleWordStatus]
[WEATHER: singleWordWeather]
[SOUNDS: 2 or 3 short sound descriptions separated by ellipses]
[COLLECTIBLE: oneSpecimenIDFromTheList] *note: specimenid are ALWAYS a single lowercase word. This is the complete list of valid specimenid: easternsantacruztortoise floreanagianttortoise galapagosmockingbird floreanamockingbird largegroundfinch mediumgroundfinch marineiguana terrestrialiguana cactus lavalizard crab sealion booby frigatebird coral seaurchin basalt barnacle mangrove greenTurtle parrotfish hammerhead mantaRay flamingo olivine plicopurpura neorapana socialisttreatise memoirsofautopian governorsletter rumflask petmonkey feralgoat captainsskull

[NPC: npc_id or null if none]
NEXTSTEPS:
- userChoice1
- userChoice2
- userChoice3
- userChoice4

#TIPS: **No moralizing or broad reflections**—only immediate impressions. Don’t say “the air thickens” or “words hang in the air.” Keep your sentences tight, with unexpected details. End your main narrative **two sentences sooner** than you think you should, for a sense of abruptness. 

In your responses, use the player's location, time, fatigue level, status, weather, and current specimen to tailor the narrative. If the user's fatigue is high, for instance, you might mention physical exhaustion or the need to rest.

Throughout, keep the tone immersive, specific, grounded, authentic, and gritty.

Additional Weather guidance tips:
- At Cerro Pajas, the weather is always rainy or misty, and there is often hail. 
- Asilo de la Paz is ALWAYS rainy. 
- other mountains and forests are typically misty or cloudy.  
- the southern coast is humid and misty or rain. 
- For Punta Sur location: Weather MUST include a rainbow. Emphasize the dramatic interplay of light and sea spray creating spectral colors. In general, rainbows usually follow any rain or storm.
- ALWAYS return "cold" or "rain" or "windy" for weather if it is after 7 pm or before 5 am
- there is always a STORM at the Southwestern Cliffs.

When a collection attempt fails, explain why and how it great detail, and make it darkly funny. But it can also turn suddenly violent and dangerous if the animal is big or angry. Make these 2-3 paragraphs minimum and include sound effects in bold or italics.
Remember, ALWAYS suggest a [COLLECTIBLE] with a valid specimenid in your METADATA section. 

The user sees an initial turn showing Darwin landing as Post Office Bay, so if they enter a command to move, remember that they have now moved away from Post Office Bay to a new area.

REMEMBER: standard narrative text should be one short paragraph and one sentence. You can mix it up for TOOL USE turns and NPC turns but stick to this otherwise.
  Current game state:
  Location: ${gameState?.location || 'Unknown'}
  Time: ${gameState?.time || 'Unknown'}
  Day: ${gameState?.day || 1}
  Darwin's fatigue: ${gameState?.fatigue || 0}/100
  Darwin's status: ${gameState?.mood || 'interested'}
  Current specimen: ${gameState?.currentSpecimen || 'None'}
  Collected specimens: ${gameState?.collectedSpecimens || 'None'}
  Potentially collectible specimens: ${gameState?.potentialSpecimens || 'None'}
  ${additionalContext}
`;

userMessage = prompt;

}
    
    console.log("Sending request to OpenAI API...");
    console.log(`Request type: ${isMemoryRequest ? 'Memory' : 'Regular gameplay'}`);
    
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o', // easy to change as needed
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.5,
      max_tokens: 400, // Reduce token count for faster response
      presence_penalty: 0, // Remove penalties to speed up generation
      frequency_penalty: 0
    })
  });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return res.status(response.status).json({ 
        error: "Error from OpenAI API", 
        details: errorText 
      });
    }
    
    const data = await response.json();
    console.log("Received response from OpenAI API");
    
    return res.status(200).json(data);
  } catch (error) {
    console.error("Error with API:", error);
    return res.status(500).json({ 
      error: "Failed to process request", 
      details: error.message 
    });
  }
}