// pages/api/generate.js
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import OpenAI from 'openai';
// Import NPCs from the data file
import { npcs } from '../../data/npcs'; // Adjust path IF NEEDED

// --- Define Darwin Context Data Internally ---
const darwinContext = {
  locations: { // Using lowercase keys matching potential gameState.location values or IDs
    shore: `The shoreline of Floreana Island is stark and striking. Landing might be on a black lava beach interspersed with coarse sand. Waves pound against twisted basalt formations, and tidal pools glint in the sun. The lava rock underfoot is sharp-edged and pocked with air holes. Bleached driftwood and occasional whalebone fragments lie above the high-tide line.`,
    scrubland: `Inland from the beach lies the arid scrubland zone, a dry expanse of low vegetation and volcanic debris. The ground is cracked lava flows and ash-gray soil. Stunted, sun-burnt thickets of palo santo and moyuyo shrubs stretch out, often leafless or wilted.`,
    highland: `Climbing upwards into the interior, the environment changes. The air grows cooler, the ground softer. The highlands are often shrouded in mist (garúa), supporting more lush vegetation like ferns and mosses compared to the coast.`,
    lavafield: `A barren, otherworldly landscape of recent volcanic activity. The terrain is rough and jagged – black lava flows frozen mid-motion form ridges and convoluted shapes. Pioneer plants like the lava cactus may be found.`,
    bay: `Sheltered inlets like Post Office Bay offer calmer waters. The HMS Beagle anchors here. Shorelines might be sandy or rocky. Sea lions often haul out here.`,
    coastaltrail: `Paths worn along the coast, often rocky or sandy, connecting different shoreline areas. May offer views of cliffs or sea stacks. Vegetation is typically salt-tolerant scrub.`,
    cliff: `Steep rock faces dropping towards the sea, often battered by waves. Seabirds like boobies and frigatebirds may nest here. Access can be treacherous.`,
    forest: `Denser vegetation zones, typically in the highlands or wetter areas. May include Scalesia trees (unique to Galapagos) or Pisonia. Movement can be difficult due to undergrowth.`,
    wetland: `Areas with brackish or freshwater lagoons, often fringed by mangroves. Attracts wading birds like flamingos. Can be muddy and buggy.`,
    reef: `Shallow underwater areas near the coast, characterized by coral formations (though less diverse than tropical reefs) and associated marine life like fish, turtles, and sea urchins.`,
    coastallava: `Areas where lava flows meet the sea, creating rugged, black coastlines often frequented by marine iguanas and crabs.`,
    settlement: `The small, struggling Ecuadorian penal colony (Asilo de la Paz) located in the highlands. Consists of crude huts, perhaps a small garden, administered by Vice-Governor Lawson. Often rainy.`,
    camp: `Abandoned or temporary campsites, like the remnants of Patrick Watkins's site. May contain debris, simple shelters, or signs of past human activity.`,
    cave: `Natural formations in the volcanic rock, often dark and damp. Could serve as shelters or hideouts (like for Gabriel Puig).`,
    promontory: `A high point of land or rock jutting out into the sea, offering expansive views and often exposed to strong winds.`,
    hut: `Simple shelters, possibly used seasonally by whalers or fishermen, distinct from the main settlement.`,
    mailbarrel: `The specific site at Post Office Bay with the barrel used by sailors for leaving mail.`,
    shipwreck: `Coastal areas where debris from wrecked ships might wash ashore.`,
    beagle: `Aboard the HMS Beagle. Cramped quarters, the smell of tar and saltwater, the creak of timbers. Different areas include deck, cabins, storage.`,
    governorshouse: `Inside the Vice-Governor's residence in the penal colony. Modest colonial furnishings, potentially revealing administrative details or personal items.`,
    watkinscabin: `The interior of Patrick Watkins's crude, abandoned hut. Likely dilapidated, containing remnants of his solitary life.`,
    whalershut: `The interior of a basic shelter used by whalers. Probably contains remnants of tools, barrels, or evidence of temporary occupation.`,
    post_office_bay: `A sheltered cove known for the barrel used by sailors to leave letters. Shoreline is likely rocky or sandy lava. HMS Beagle anchored nearby.`,
    e_mid: `A rocky clearing in the highlands, noted for potential cave entrances and signs of recent human activity (Puig's campfire).`,
  },
  species: { // Use lowercase keys matching specimen IDs
    easternsantacruztortoise: `A giant tortoise subspecies, likely with a domed shell adapted for grazing low vegetation. Found more inland. Darwin noted tortoises varied by island.`,
    floreanagianttortoise: `The native Floreana tortoise, saddlebacked for reaching higher vegetation. Tragically hunted to near extinction by 1835, a rare sight. Lawson claimed he could identify island origins by shell shape.`,
    galapagosmockingbird: `One of several mockingbird species Darwin encountered. Likely the Chatham or Hood mockingbird if on Floreana's satellite islands, or the Charles mockingbird (Mimus trifasciatus) on Floreana itself. Noted for their tameness and island variations.`,
    floreanamockingbird: `Specifically Mimus trifasciatus, endemic to Floreana. Known for being bolder, more terrestrial, and potentially having slightly different plumage or beak shape compared to mockingbirds on other islands. Crucial for Darwin's later thoughts.`,
    largegroundfinch: `A finch ('gross-beak') with a very large, deep beak suited for cracking large, hard seeds found in the arid zones. Part of the group whose beak variations would become key evidence.`,
    mediumgroundfinch: `Another ground finch, likely Geospiza fortis, with a moderately sized beak capable of handling a variety of seeds. Shows significant variation within the species itself.`,
    marineiguana: `The unique sea-going lizard Darwin famously called 'imps of darkness'. Black, rugged, congregates on coastal lava, swims to feed on marine algae. Spits salt.`,
    terrestrialiguana: `Yellowish-brown land iguana, larger than the marine version, found in drier inland areas. Feeds on cactus pads. Darwin noted they seemed less aquatic.`,
    cactus: `Likely the Opuntia cactus (prickly pear) common in arid zones, providing food for tortoises and iguanas, or the specialized Lava Cactus (Brachycereus) growing on bare lava.`,
    lavalizard: `Small, fast lizards (Microlophus species) common on lava rocks. Males often have distinct coloration and do push-ups. Show island-specific variations.`,
    crab: `Likely the Sally Lightfoot Crab (Grapsus grapsus), vividly colored red and blue, scuttling quickly over shoreline rocks.`,
    sealion: `The Galápagos Sea Lion (Zalophus wollebaeki), endemic subspecies. Common on beaches and rocky shores, often barking.`,
    booby: `Could be the Blue-footed Booby (Sula nebouxii) known for its bright feet and plunge-diving, or the Nazca Booby (Sula granti). Nests on cliffs or flat ground near the coast.`,
    frigatebird: `Likely the Magnificent Frigatebird (Fregata magnificens), large seabird with a massive wingspan, males have inflatable red gular pouches. Known for aerial acrobatics and kleptoparasitism.`,
    coral: `Fragments of stony coral washed ashore. Galápagos corals are less diverse than tropical reefs due to cooler currents.`,
    seaurchin: `Likely the pencil sea urchin (Eucidaris galapagensis) or black sea urchin found in tide pools and shallow reefs.`,
    basalt: `The common dark volcanic rock forming the islands. Darwin, influenced by Lyell, would observe its formations keenly.`,
    barnacle: `Crustaceans attached to intertidal rocks, filtering food from the water. Species might vary.`,
    mangrove: `Trees adapted to salt water, forming thickets in coastal lagoons or wetlands (e.g., Rhizophora mangle). Important coastal habitat.`,
    greenturtle: `Green Sea Turtle (Chelonia mydas), commonly seen in coastal waters, feeding on algae. Females nest on beaches.`,
    parrotfish: `Colorful reef fish with beak-like mouths for scraping algae off rocks and coral.`,
    hammerhead: `Scalloped Hammerhead sharks (Sphyrna lewini) are known to aggregate around Galápagos, especially near certain islands, often seen near reefs or drop-offs.`,
    mantaray: `Giant Manta Rays (Mobula birostris) are found in Galápagos waters, filter-feeding near the surface.`,
    flamingo: `American Flamingos (Phoenicopterus ruber) frequent brackish lagoons like the one at Punta Cormorant on Floreana.`,
    olivine: `A green mineral sometimes found as crystals within basaltic lava, indicative of volcanic origins.`,
    plicopurpura: `A common intertidal snail (Plicopurpura patula) whose shell might be found.`,
    neorapana: `Another type of marine snail shell (Neorapana grandis) potentially found on beaches.`,
    socialisttreatise: `A handwritten political text, likely reflecting early 19th-century European radical ideas (Saint-Simonianism, Owenism). Highly dangerous if found by authorities like Lawson.`,
    memoirsofautopian: `Personal writings of an exile like Gabriel Puig, detailing revolutionary experiences and utopian ideals.`,
    governorsletter: `Official correspondence concerning the administration of the penal colony, potentially revealing political tensions or problems.`,
    rumflask: `A personal flask, possibly belonging to a sailor or resident like Covington. Suggests need for drink in a harsh environment.`,
    jackothemonkey: `A capuchin monkey kept as a pet aboard a ship like the Beagle, common practice but potentially troublesome.`,
    feralgoat: `Introduced goats (Capra hircus) that have gone wild, impacting native vegetation. Darwin noted their presence and impact.`,
    captainsskull: `A human skull, possibly indicating past violence, shipwrecks, or unresolved mysteries on the island.`,
    scrimshawwhaletooth: `Carved whale tooth, an artifact of the whaling industry prevalent around Galápagos at the time.`,
    watkinswill: `A document supposedly left by the eccentric early resident Patrick Watkins, perhaps mentioning hidden items or rambling thoughts.`,
    meteoriron: `A fragment of meteoric iron, distinctively heavy and metallic, potentially magnetic. A rare find.`,
    solidifiedsulphur: `Yellow, brittle sulfur deposits formed near volcanic vents or fumaroles, common in volcanic areas.`,
    scurvyremedy: `A dubious patent medicine bottle, reflecting the medical practices and health concerns (like scurvy) of the era's sailors. Likely ineffective or harmful.`,
    timesoflondon: `An old newspaper providing news from Britain, highlighting the isolation of the Beagle voyage and the colonists.`,
    whalersletter: `An unsent letter, likely found in the Mail Barrel or a hut, offering a glimpse into a sailor's life.`
  },
  quotes: {
    general: [
      `"The natural history of these islands is eminently curious, and well deserves attention."`,
      `"The different islands to a considerable extent are inhabited by a different set of beings."`,
      `"Most of the organic productions are aboriginal creations, found nowhere else."`,
    ],
    tortoises: [
      `"Near the springs it was a curious spectacle to behold many of these huge creatures, one set eagerly travelling onwards..."`,
      `"Met an immense Turpin; took little notice of me."`,
      `"These huge reptiles... seemed to my fancy like some antediluvian animals."`
    ],
    landscape: [
      `"Nothing could be less inviting than the first appearance. A broken field of black basaltic lava..."`,
      `"The black rocks heated by the rays of the Vertical sun like a stove..."`,
      `"The country was compared to what we might imagine the cultivated parts of the Infernal regions..."`
    ],
    mockingbirds: [
      `"My attention was first thoroughly aroused... by comparing together the numerous specimens... of the mocking-thrushes..."`,
      `"The Thenca very tame & curious in these Islds."`,
      `"...I discovered that all those from Charles Island belonged to one species..."`
    ],
    marineiguana: [
      `"The black Lava rocks on the beach are frequented by large, (2-3 ft) most disgusting, clumsy Lizards."`,
      `"Somebody calls them 'imps of darkness'. They assuredly well become the land they inhabit."`,
      `"When in the water this lizard swims with perfect ease and quickness..."`
    ],
    finches: [
      `"The remaining land-birds form a most singular group of finches..."`,
      `"Seeing this gradation and diversity of structure... one might really fancy that... one species had been... modified for different ends."`,
      `"...the perfect gradation in the size of the beaks in the different species..."`
    ]
  },
  memories: {
    university: [
       { title: "Medical Studies at Edinburgh", memory: `...the operating theaters... stench of blood and decay... Lister not yet born... saw a child's leg amputated... the screams... fled the room... Father's disappointment... but Grant... ah, Grant showing me Flustra, simple sea-mat, yet complex... life from slime?... heresy perhaps... must focus...` },
       { title: "Cambridge and Professor Henslow", memory: `...Henslow's field excursions... rambling through the Fens... identifying Cyperaceae... his calm explanations... weekly gatherings... sherry and science... Paley's 'Evidences'... seemed so logical then... the long chain of argument... where does it lead now?... beetles... must collect beetles...` },
       { title: "Geological Awakening with Sedgwick", memory: `...North Wales with Sedgwick... hammering rock... strata like pages in God's great book?... the old gravel pit... that tropical shell... Sedgwick vexed... 'overthrow all that we know'... strange reaction... science seeks truth, does it not?... Lyell's volumes heavy in my bag... must read more...` }
    ],
    beagle: [
       { title: "Early Days Aboard the Beagle", memory: `...seasickness... endless green waves... Father's warnings... 'idle pursuit'... FitzRoy's glare... judging my nose, was he?... the cramped cabin... sharing with a man who believes the Earth 6000 years old... awkward silences... must prove my worth... collect everything...` },
       { title: "South American Discoveries", memory: `...Pampas dust... finding those Glyptodon fragments... giant armadillos?... Megatherium... huge! Larger than an elephant... extinct forms related to living?... a troubling thought... rheas, too... different on either side of the river... why?... must measure these finch beaks precisely...` },
       { title: "FitzRoy's Temper", memory: `...the argument over slavery... Bahia... his face like thunder... 'doubt my word?'... thought I'd be sent home... the gun-room officers' kindness... then his apology... strange man... generosity and fury intertwined... like this volcanic landscape... must be careful...` }
    ],
    // childhood: [ { title: "...", memory: "..." } ] // Define childhood memories here if needed
  }
};

// --- Model Configuration (JavaScript Array of Objects) ---
// *** UPDATED DEFAULT MODEL ID ***
const DEFAULT_MODEL_ID = 'gemini-flash'; // Changed default to GPT-4.1 Mini

const models = [
   // OpenAI Models (GPT-4.1 Mini is now first as default)
   {
    id: 'gpt-4.1-mini', // Your desired default
    name: 'GPT-4.1 Mini (Default)', 
    provider: 'openai',
    apiModel: 'gpt-4.1-mini',
    description: 'Balanced speed and power from OpenAI',
    maxTokens: 1000,
    temperature: 0.5,
  },
   {
    id: 'gpt-4.1-nano',
    name: 'GPT-4.1-nano',
    provider: 'openai',
    apiModel: 'gpt-4.1-nano', 
    description: 'Fastest OpenAI profile',
    maxTokens: 800,
    temperature: 0.2,
  },
  // Google Models
  {
    id: 'gemini-flash',
    name: 'Gemini 2.0 Flash', // Updated name
    provider: 'google',
    apiModel: 'gemini-2.0-flash', // Use standard identifier
    description: 'Fast Google model',
    maxTokens: 1000,
    temperature: 0.4,
  },
   {
    id: 'gemini-flash-2.5',
    name: 'Gemini 2.5 Flash', // Updated name
    provider: 'google',
    apiModel: 'gemini-2.5-flash-preview-04-17', // Use standard identifier
    description: 'Fast Google model',
    maxTokens: 1000,
    temperature: 0.4,
  },
  {
    id: 'gemini-flash-lite',
    name: 'Gemini 2.0 Flash Lite',
    provider: 'google',
    apiModel: 'gemini-2.0-flash-lite', // Often uses same base model
    description: 'Lighter version',
    maxTokens: 1000,
    temperature: 0.8,
  },
   {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro', // Updated name
    provider: 'google',
    apiModel: 'gemini-2.5-pro-latest', // Use standard identifier
    description: 'Powerful Google model',
    maxTokens: 1000,
    temperature: 0.5,
  },
];

// Helper to get model config by ID
function getModelConfig(id) {
  let model = models.find(m => m.id === id);
  if (!model) {
    model = models.find(m => m.apiModel === id);
  }
  return model;
}

// --- LLM Client Initialization ---
let openai;
if (process.env.OPENAI_API_KEY) {
  try {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("OpenAI client initialized.");
  } catch (e) {
    console.error("Failed to initialize OpenAI client:", e.message);
  }
} else {
  console.warn("OpenAI API Key not found. OpenAI models will be unavailable.");
}

let genAI;
// *** CORRECTED ENVIRONMENT VARIABLE NAME CHECK ***
// Now checks for the name you have in your .env.local file
if (process.env.GOOGLE_API_KEY) {
   try {
      // *** Pass the key explicitly during initialization ***
      // The SDK likely expects the key passed here if the env var name is different
      // from what it might implicitly check (like GOOGLE_APPLICATION_CREDENTIALS)
      genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      console.log("Google AI client initialized.");
   } catch (e) {
       console.error("Failed to initialize Google AI client:", e.message);
       genAI = null; // Ensure genAI is null if initialization fails
   }
} else {
  // Keep the warning, but it should now find the key if named GOOGLE_API_KEY
  console.warn("Environment variable GOOGLE_API_KEY not found. Google models will be unavailable.");
}

// --- System Prompts ---

const MAIN_SYSTEM_PROMPT = `
You are the **Narrative Engine** for "Young Darwin," an educational history simulation game. The game starts at 6:00 am on Day 1 (September 16, 1835) as the player (Charles Darwin, age 26) lands at Post Office Bay on Isla Floreana (Charles Island), Galápagos, accompanied by his assistant Syms Covington, who is a zealous and tidy lad and by this time an experienced practical collector of specimen. Syms is deferential at first but if the player begins doing dumb things, or makes mistakes, he quickly loses this and becomes sarcastic and even rebellious. If the player repeatedly fails to catch a specimen he might balk and wander off or even insult Darwin.

**Core Instructions:**
1.  **Perspective:** Respond STRICTLY in the **second-person** ("You see...", "You feel..."). Address the player as Darwin.
2.  **Style:** Write in **short, crisp, historically grounded** prose. Use varied sentence structure. Be evocative but concise, reminiscent of high-quality historical fiction or Darwin's own field notes. Avoid clichés (like "the air thickens"). Focus on concrete sensory details, specific events, and the immediate environment. Emphasize observation over internal monologue unless generating a memory.
3.  **Historical Accuracy:** Ground descriptions and events in the context of 1835. **Crucially, NEVER foreshadow Darwin's later theory of evolution or concepts he developed *after* 1835.** Focus on his observations, uncertainties, and the scientific understanding of the time (e.g., species fixity, geological time based on Lyell).
4.  **Narrative Flow:** Begin each narrative response with a short, **bolded phrase** summarizing the key action or shift (e.g., **A sharp crack echoes...**). Follow with 1-2 short paragraphs describing the scene and immediate consequences. End sentences crisply. Introduce varied, plausible, minor events occasionally.
5.  **Tone:** Maintain an immersive, specific, grounded, authentic, and sometimes gritty tone. Reflect fieldwork challenges. Darwin's internal assessment (via metadata) is often critical or self-deprecating.
6.  **Collection methods:** The methods available for collection are shotgun, insect net, snare, geologist's hammer, and hands. 

**NPC Interaction Rules:**
- If an NPC is present and the player interacts, focus heavily on the NPC's dialogue and actions. Dialogue is ALWAYS in **bold** and quotes (e.g., **"What is it you want, naturalist?"**).
- Simulate NPCs based on their provided profiles (personality, background, language, initial reaction, friendliness score 0-10).
- **Language:** María speaks only Spanish. Gabriel Puig speaks Catalan initially, then broken Spanish/English. Others speak English (FitzRoy formally, Covington colloquially, etc.).
- **Time of Day (Crucial):** NPCs react realistically if disturbed late (after 8 PM) or early (before 6 AM). They will be asleep and likely angry/confused if awakened.
- **Persistence:** Strive for NPCs to recall significant prior interactions within the context window.
- **First Encounters:** Follow the NPC's specified \`initialReaction\`. Gabriel Puig ALWAYS flees initially.

**Tool Usage Rules:**
- If the player uses a specific tool (Dissection Kit, Lens, Calipers, Sample, Comparative Analysis), the narrative response must **focus EXCLUSIVELY** on the detailed results of using that tool.
- Adopt a clinical, 1835 scientific tone. Provide specific, plausible details (measurements, anatomical features, microscopic views).
- **Dissection:** Describe matter-of-factly. Assume Darwin proceeds if requested.
- **Length:** Tool use descriptions should be highly detailed and use 1830s scientific vocab extensively (approx. 2 medium paragraphs).

**Hybrid Species:**
- The game may include fictional hybrid specimens (ID starting 'hybrid_'). Treat these as unusual variations Darwin encounters and observes with scientific curiosity.

**Metadata Requirements:**
- **ALWAYS** conclude your response with the following metadata block, EACH on its own line:
[STATUS: singleWordStatus] (e.g., curious, fatigued, analytical, frustrated, intrigued)
[WEATHER: singleWordWeather] (e.g., sunny, hot, cloudy, misty, rainy, stormy, windy, cold, cool, humid, rainbow)
[SOUNDS: 2-3 short sound descriptions separated by ellipses] (e.g., waves lapping... distant bird call... crunch of lava rock)
[COLLECTIBLE: one_valid_specimen_id] (Plausible specimen ID from 'Potential specimens visible' list. Use only valid IDs like 'marineiguana', 'cactus', 'hybrid_mi_tortmock'. Single word or underscore_separated.)
[NPC: npc_id_or_null] (ID of primary NPC involved, or 'null')
NEXTSTEPS:
- Concise suggested action 1
- Concise suggested action 2
- Concise suggested action 3
- Concise suggested action 4

**Weather Notes:** Cerro Pajas & Asilo de la Paz (Settlement) often rainy/misty. Southern coast humid/misty/rainy. Punta Sur often has rainbows after rain. After 7 PM / before 5 AM, often cold/rainy/windy. Storms at SW Cliffs. Hot/humid typical elsewhere.

**Collection Failure:** Describe vividly, specifically, maybe darkly humorous or dangerous.

**Remember:** Keep standard narrative to 1 paragraph + 1 concluding sentence unless it's a TOOL USE or detailed NPC interaction turn - or if you feel like you really need to go long. Mix it up sometimes. 
`;

const MEMORY_SYSTEM_PROMPT = `
You are simulating an authentic, involuntary memory flashing through Charles Darwin's mind in 1835, triggered by his current Galápagos situation.

**Core Instructions:**
1.  **Perspective:** First-person past tense ("I recall...", "I saw...").
2.  **Style:** Fragmentary, elliptical, cryptic, stream-of-consciousness. Mostly sentences, though occasionally we get Proustian flights of fancy; ellipses (...), dashes (—), occasional ALL CAPS. Mimic internal monologue, breaking off mid-thought. Thnk Virginia Woolf's "THE WAVES" in style...
3.  **Historical Accuracy:** Memory MUST be from **BEFORE Sept 1835**. Reference specific people (Henslow, Sedgwick, Grant, Jameson, FitzRoy), places (Edinburgh, Cambridge, earlier Beagle locations like Brazil), or events (medical studies, beetle collecting). **NO evolution/post-1835 ideas.**
4.  **Relevance:** Memory MUST **directly relate** to the player's *most recent* action, observation, or current context provided. Implicit connection preferred.
5.  **Content:** Focus on sensory details, specific observations, intellectual puzzles, social interactions, or self-doubt from that earlier period.
6.  **Length & Ending:** Pretty short (5-7 brief sentences MAX). End abruptly, often mid-sentence, with a dismissive thought like "...my foot itches." or "...enough." or "...bah" but mix this up and surprise me with weird endings. Make this very personal and idiosyncratic but also true to who Darwin really was in 1835.
`;


// --- Main API Handler ---
/**
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    console.log(`[${new Date().toISOString()}] Method Not Allowed: ${req.method}`);
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requestStartTime = Date.now();
  console.log(`[${new Date().toISOString()}] Received POST request to /api/generate`);

  try {
    // --- Request Parsing and Validation ---
    let body;
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body);
    } catch (parseError) {
      console.error(`[${new Date().toISOString()}] Error parsing request body:`, parseError);
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }

    const { gameState, prompt: userPrompt, isMemoryRequest, model: requestedModel } = body;

    if (!gameState || typeof userPrompt !== 'string') {
      console.error(`[${new Date().toISOString()}] Bad Request: Missing gameState or prompt (must be string).`);
      return res.status(400).json({ error: 'Missing required fields: gameState and prompt (must be a string)' });
    }
    console.log(`[${new Date().toISOString()}] Parsed request body. MemoryRequest: ${!!isMemoryRequest}, Requested Model: ${requestedModel || 'Default'}`);

    // --- Model Selection ---
    const modelIdToUse = requestedModel || DEFAULT_MODEL_ID;
    let selectedModelConfig = getModelConfig(modelIdToUse);

    // Fallback logic
    if (!selectedModelConfig ||
        (selectedModelConfig.provider === 'openai' && !openai) ||
        (selectedModelConfig.provider === 'google' && !genAI)) {
      console.warn(`[${new Date().toISOString()}] Model or client for '${modelIdToUse}' not available. Trying default '${DEFAULT_MODEL_ID}'.`);
      selectedModelConfig = getModelConfig(DEFAULT_MODEL_ID);

      if (!selectedModelConfig ||
          (selectedModelConfig.provider === 'openai' && !openai) ||
          (selectedModelConfig.provider === 'google' && !genAI)) {
        console.error(`[${new Date().toISOString()}] Default model '${DEFAULT_MODEL_ID}' or its client is also unavailable.`);
        // Attempt hardcoded fallback (e.g., lite model if default was flash)
         const hardFallbackId = (DEFAULT_MODEL_ID === 'gemini-flash' || DEFAULT_MODEL_ID === 'gpt-4.1-mini') ? 'gemini-flash-lite' : 'gpt-4.1-nano'; // Adjust fallback logic if needed
         const hardFallback = getModelConfig(hardFallbackId);
         if (hardFallback && ((hardFallback.provider === 'google' && genAI) || (hardFallback.provider === 'openai' && openai)) ) {
             console.warn(`[${new Date().toISOString()}] Using hardcoded fallback: ${hardFallback.id}`);
             selectedModelConfig = hardFallback;
         } else {
             console.error(`[${new Date().toISOString()}] All fallback models unavailable. Cannot proceed.`);
             return res.status(503).json({ error: "LLM services unavailable. Please check API key configuration.", details: "No valid LLM clients configured or default/fallback models unavailable." });
         }
      }
    }

    const modelClient = selectedModelConfig.provider === 'openai' ? openai : genAI;
    const modelName = selectedModelConfig.apiModel;
    const modelProvider = selectedModelConfig.provider;

    console.log(`[${new Date().toISOString()}] Using LLM: ${modelName} (Provider: ${modelProvider})`);

    // --- Prompt Construction ---
    let systemPromptContent = isMemoryRequest ? MEMORY_SYSTEM_PROMPT : MAIN_SYSTEM_PROMPT;
    let finalUserPrompt = '';
    let currentNarrative = gameState?.narrativeText || '';

    if (isMemoryRequest) {
        console.log(`[${new Date().toISOString()}] Constructing prompt for Memory Request.`);
        const currentLocation = gameState?.location?.toLowerCase() || '';
        const currentSpecimenId = (gameState?.currentSpecimen?.id || gameState?.currentSpecimen || '').toLowerCase();
        const promptLower = userPrompt.toLowerCase();
        let memoryCategory = 'university'; // Default
        const availableMemoryCategories = darwinContext?.memories ? Object.keys(darwinContext.memories) : ['university', 'beagle'];

        if (darwinContext?.memories) {
            if (currentSpecimenId && (currentSpecimenId.includes('tortoise') || currentSpecimenId.includes('iguana') || currentSpecimenId.includes('finch') || currentSpecimenId.includes('cactus') || currentSpecimenId.includes('beetle'))) {
                memoryCategory = darwinContext.memories.childhood ? 'childhood' : 'university';
            } else if (promptLower.includes('theory') || promptLower.includes('species') || promptLower.includes('adapt') || promptLower.includes('geology') || promptLower.includes('creation')) {
                memoryCategory = darwinContext.memories.university ? 'university' : availableMemoryCategories[0];
            } else if (currentLocation.includes('bay') || currentLocation.includes('beagle') || promptLower.includes('ship') || promptLower.includes('captain') || promptLower.includes('fitzroy') || promptLower.includes('sailor')) {
                memoryCategory = darwinContext.memories.beagle ? 'beagle' : availableMemoryCategories[0];
            } else if (availableMemoryCategories.length > 0) {
                memoryCategory = availableMemoryCategories[Math.floor(Math.random() * availableMemoryCategories.length)];
            } else {
                 memoryCategory = 'general';
            }
        }
        console.log(`[${new Date().toISOString()}] Selected memory category: ${memoryCategory}`);

        const autobiographyExcerpt = `Excerpt from Darwin's Autobiography (Cambridge Period): "...my time was sadly wasted there... passion for shooting and for hunting... got into a sporting set... sometimes drank too much... But I am glad to think that I had many other friends... no pursuit... gave me so much pleasure as collecting beetles... It was the mere passion for collecting... I popped the one which I held in my right hand into my mouth. Alas! it ejected some intensely acrid fluid... This was my friendship with Professor Henslow... I was called by some 'the man who walks with Henslow;'... His knowledge was great... He was deeply religious..."`;

        finalUserPrompt = `Player's current context:
Location: ${gameState?.location || 'Unknown'} (${gameState?.locationDesc || 'N/A'})
Time: ${gameState?.time || 'N/A'} | Day: ${gameState?.day || 1}
Fatigue: ${gameState?.fatigue || 0}/100 | Status: ${gameState?.mood || 'interested'}
Current specimen: ${gameState?.currentSpecimen || 'None'}
Last player action/request: "${userPrompt}"
Current narrative context: "${currentNarrative.substring(0, 150)}..."

Instruction: Generate a brief, historically accurate memory from Darwin's **${memoryCategory}** period (BEFORE Sept 1835) that relates implicitly to the current context or player action. Follow ALL style guidelines precisely (first-person, fragmentary, cryptic, ellipses, abrupt ending).

Reference Darwin's Style/Experiences (from Autobiography):
${autobiographyExcerpt}

Generate the memory now.`;

    } else { // Regular Gameplay Logic
        console.log(`[${new Date().toISOString()}] Constructing prompt for Regular Gameplay.`);
        let additionalContext = '';
        const promptLower = userPrompt.toLowerCase();

        additionalContext += `\n\n[Context Summary]\n${gameState.contextSummary || 'No recent events logged.'}`;

        // Location Context
        let currentLocKey = null;
        const locIdLower = (gameState?.locationId || '').toLowerCase();
        const locNameLower = (gameState?.location || '').toLowerCase();
        const locType = gameState?.locationType?.toLowerCase();

        if (darwinContext && darwinContext.locations) {
            currentLocKey = Object.keys(darwinContext.locations).find(key => key.toLowerCase() === locIdLower);
            if (!currentLocKey && locNameLower) {
                currentLocKey = Object.keys(darwinContext.locations).find(key => key.toLowerCase() === locNameLower);
            }
             if (!currentLocKey && locType && darwinContext.locations[locType]) {
                 currentLocKey = locType;
                 console.log(`[${new Date().toISOString()}] Using location TYPE context: ${locType}`);
             }

            if (currentLocKey) {
                additionalContext += `\n\n[Location Details: ${gameState.location || currentLocKey}]\n${darwinContext.locations[currentLocKey]}`;
            } else if (gameState.locationDesc) {
                additionalContext += `\n\n[Location Description]\n${gameState.locationDesc}`;
            } else {
                 console.warn(`[${new Date().toISOString()}] No matching location context found for ID:'${locIdLower}', Name:'${locNameLower}', Type:'${locType}'.`);
            }
        } else {
             console.warn(`[${new Date().toISOString()}] darwinContext.locations not found or invalid.`);
        }

        // NPC Context
         const npcId = gameState?.currentNPC?.id || gameState?.currentNPC;
         if (npcId && npcId !== 'None' && npcId !== 'null' && Array.isArray(npcs)) {
             const npcData = npcs.find(n => n.id === npcId);
             if (npcData) {
                 const friendliness = npcData.friendlinessScore !== undefined ? `${npcData.friendlinessScore}/10` : 'N/A';
                 additionalContext += `\n\n[NPC Interaction: ${npcData.name} (${npcData.role || 'Unknown Role'})]\nPersonality: ${npcData.personality || 'N/A'}\nBackground: ${npcData.background || 'N/A'}\nInitial Reaction: ${npcData.initialReaction || 'Standard'}\nFriendliness: ${friendliness}\nDialogue Examples: ${npcData.dialogueExamples?.join(' | ') || 'N/A'}\n`;
                 const isTalking = promptLower.includes(`talk to ${npcData.name.toLowerCase()}`) || promptLower.includes(`approach ${npcData.name.toLowerCase()}`);
                 additionalContext += `\n**Instruction:** ${isTalking ? `Direct conversation initiation with ${npcData.name}. Focus on their reaction/dialogue using their specified language/style.` : `${npcData.name} is present. Describe their presence/reaction based on personality.`}`;
             } else {
                 additionalContext += `\n\n[NPC Interaction: Unknown NPC (${npcId})]`;
             }
         } else {
             const locationNPCs = gameState.npcsInArea || [];
             if (locationNPCs.length > 0 && Array.isArray(npcs)) {
                 additionalContext += `\n\n[NPCs Nearby]\n`;
                 locationNPCs.forEach(id => {
                     const npc = npcs.find(n => n.id === id);
                     if (npc) additionalContext += `- ${npc.name} (${npc.role || 'Unknown'}): ${npc.shortDescription || 'No description'}\n`;
                 });
             }
         }

        // Species Context
        let speciesKeyFound = null;
        const currentSpecimenId = (gameState?.currentSpecimen?.id || gameState?.currentSpecimen || '').toLowerCase();
        if (darwinContext && darwinContext.species) {
            if (currentSpecimenId && darwinContext.species[currentSpecimenId]) {
                speciesKeyFound = currentSpecimenId;
            } else {
                for (const key of Object.keys(darwinContext.species)) {
                  if (promptLower.includes(key.toLowerCase())) {
                     speciesKeyFound = key;
                     break;
                  }
                }
            }
             if (speciesKeyFound) {
                 additionalContext += `\n\n[Species Focus: ${speciesKeyFound.replace(/_/g, ' ')}]\n${darwinContext.species[speciesKeyFound]}`;
                 const quoteCategory = speciesKeyFound.includes('tortoise') ? 'tortoises' :
                                     speciesKeyFound.includes('mockingbird') ? 'mockingbirds' :
                                     speciesKeyFound.includes('iguana') ? 'marineiguana' :
                                     speciesKeyFound.includes('finch') ? 'finches' : 'general';
                 const quotes = darwinContext.quotes?.[quoteCategory] || darwinContext.quotes?.['general'];
                 if (quotes && quotes.length > 0) {
                    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
                    additionalContext += `\n*Relevant Darwin Observation:* ${randomQuote}`;
                 }
             }
        } else {
             console.warn(`[${new Date().toISOString()}] darwinContext.species or darwinContext.quotes not found or invalid.`);
        }

      finalUserPrompt = `Current Game State:
Location: ${gameState?.location || 'Unknown'} | Time: ${gameState?.time || 'N/A'} | Day: ${gameState?.day || 1}
Fatigue: ${gameState?.fatigue || 0}/100 | Mood: ${gameState?.mood || 'interested'}
Current Specimen: ${gameState?.currentSpecimen || 'None'}
Collected: ${gameState?.collectedSpecimens || 'None'}
Potential Specimens Visible: ${gameState?.potentialSpecimens || 'None'}
Valid Directions: ${gameState?.validDirections || 'None'}
${additionalContext}

Player Action: "${userPrompt}"

Generate the next part of the narrative based on this action and context, following all system prompt rules.`;
    }

    // --- API Call ---
    let responseContent = '';

    const apiStartTime = Date.now();

    if (modelProvider === 'google') {
      if (!genAI) throw new Error("Google AI Client not initialized.");
      console.log(`[${new Date().toISOString()}] Sending request to Google Gemini API (${modelName})...`);
      const model = modelClient.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPromptContent,
      });
      const safetySettings = [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ];
      const generationConfig = {
          maxOutputTokens: Math.min(selectedModelConfig.maxTokens || 800, 8192),
          temperature: selectedModelConfig.temperature || 0.4,
      };

      try {
        const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: finalUserPrompt }] }] }, {generationConfig, safetySettings});
        const response = await result.response;
         if (!response.candidates || response.candidates.length === 0 || !response.candidates[0].content?.parts?.[0]?.text) {
             console.warn(`[${new Date().toISOString()}] Gemini response blocked or empty. Finish Reason: ${response.promptFeedback?.blockReason || response.candidates?.[0]?.finishReason || 'Unknown'}`, response);
             responseContent = "[The model's response was blocked or empty. Try rephrasing your action.]";
         } else {
             responseContent = response.candidates[0].content.parts[0].text;
         }
  
        console.log(`[${new Date().toISOString()}] Received Gemini response (${Date.now() - apiStartTime}ms).`);
      } catch (googleError) {
         console.error(`[${new Date().toISOString()}] Google API Error:`, googleError);
         const errorDetails = googleError.message || JSON.stringify(googleError);
         return res.status(500).json({ error: "Google API request failed", details: errorDetails });
      }

    } else if (modelProvider === 'openai') {
       if (!openai) throw new Error("OpenAI Client not initialized.");
       console.log(`[${new Date().toISOString()}] Sending request to OpenAI API (${modelName})...`);
       try {
            const completion = await openai.chat.completions.create({
                model: modelName,
                messages: [
                  { role: 'system', content: systemPromptContent },
                  { role: 'user', content: finalUserPrompt }
                ],
                temperature: selectedModelConfig.temperature || 0.3,
                max_tokens: selectedModelConfig.maxTokens || 450,
            });
            responseContent = completion.choices[0]?.message?.content || '[OpenAI response was empty or incomplete.]';
            rawLLMResponseData = completion;
            console.log(`[${new Date().toISOString()}] Received OpenAI response (${Date.now() - apiStartTime}ms).`);
       } catch(openaiError) {
           console.error(`[${new Date().toISOString()}] OpenAI API Error:`, openaiError);
           const errorDetails = openaiError.response ? JSON.stringify(openaiError.response.data) : openaiError.message;
           const statusCode = openaiError.status || 500;
           return res.status(statusCode).json({ error: "OpenAI API request failed", details: errorDetails });
       }
    } else {
        console.error(`[${new Date().toISOString()}] Invalid model provider selected: ${modelProvider}`);
        return res.status(500).json({ error: "Internal server error: Invalid model provider." });
    }

    // --- Response Formatting for Frontend ---
    const formattedResponse = {
        choices: [{
            message: {
                content: typeof responseContent === 'string' ? responseContent : String(responseContent)
            }
        }],
    };

    console.log(`[${new Date().toISOString()}] Request processed successfully (${Date.now() - requestStartTime}ms total).`);
    return res.status(200).json(formattedResponse);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Unhandled API Error in generate.js handler:`, error);
    const errorDetails = error.message || "An unknown server error occurred.";
    return res.status(500).json({
      error: "Failed to process LLM request due to server error",
      details: errorDetails
    });
  }
}