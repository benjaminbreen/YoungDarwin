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
   
    university: [
      {
        title: "Medical Studies at Edinburgh",
        memory: `The operating theaters of Edinburgh Medical School reappear in your mind - you still shudder recalling the screams of patients during surgery without anesthesia that drove you from the room. Your father's disappointment at your abandoning medicine still stings. Yet it was at Edinburgh where you found true mentors - Dr. Robert Grant who introduced you to marine invertebrates and Professor Robert Jameson whose natural history course, despite its dullness, planted important seeds. You recall proudly presenting your first scientific discovery about oyster larvae at the Plinian Society.`
      },
      {
        title: "Cambridge and Professor Henslow",
        memory: `The gentle guidance of Professor John Stevens Henslow at Cambridge returns clearly to your thoughts. How fortunate you were when he took you under his wing! Those Friday evening gatherings at his home where naturalists discussed the latest ideas, and those botanical excursions through the countryside - Henslow walking ahead with the most promising students crowded around him (you among them). It was Henslow who recommended you for this very voyage. You owe him everything. His methods of careful observation and systematic collection have become your own. Perhaps you'll name a species after him someday.`
      },
      {
        title: "Geological Awakening with Sedgwick",
        memory: `those formative weeks in 1831 with Professor Adam Sedgwick just before the Beagle voyage. He taught you how to read the Earth itself, how strata tell stories of unimaginable time. You remember the exhilaration of identifying your first fossil in situ and understanding its significance in the rock layer. Sedgwick's methodical approach to geology gave structure to your natural enthusiasm. When you return to England, you hope to contribute meaningfully to the Geological Society where Lyell's revolutionary "Principles of Geology" (the very book in your cabin)...`
      }
    ],
    beagle: [
      {
        title: "Early Days Aboard the Beagle",
        memory: `The miserable first weeks at sea return vividly - your terrible seasickness that had Captain FitzRoy doubting your fitness for the voyage. You remember clinging to your hammock, wondering if you had made a terrible mistake. Your father had been reluctant to let you join the expedition, believing it another of your passing enthusiasms like medicine and divinity. Yet here you are, four years later, still cataloguing and collecting. The initial tension with the strictly religious FitzRoy comes to mind too - how carefully you've learned to navigate discussions that might touch on the age of the Earth or other sensitive matters.`
      },
      {
        title: "South American Discoveries",
        memory: `The pampas of South America stretch in your memory - finding those massive fossils of extinct mammals that challenged your understanding of species stability. You recall the rhea specimens that seemed so similar yet distinct in different regions. And those moments in the high Andes when you discovered seashells embedded in rock thousands of feet above sea level - proof of the land's dramatic upheaval over time.`
      },
      {
        title: "Friendship with FitzRoy",
        memory: `Despite your differences, the complicated friendship with Captain Robert FitzRoy warms your thoughts. For all his rigid beliefs and occasional dark moods, he has been generous in sharing his cabin and library with you. You recall his precision with chronometers and dedication to accurate charting. FitzRoy values empirical evidence in his naval work even as he holds fast to Biblical literalism in matters of natural history. You've learned much from observing this contradiction. `
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
        You are generating an authentic memory from Charles Darwin's life before his Galapagos visit in 1835. These memories should be historically accurate and reflect Darwin's Education at Edinburgh and Cambridge, impressionistic.
        
        Write in first-person past tense, breaking in mid-stream, as it were, on his authentic inner mental monologue, which is fragmentary, short sentences, dashes, cryptic. think Virginia Woolf's THE WAVES, but if it were about barnacle morphology. Darwin lives and breathes natural history, and his memories do too. Include numbers, citations, but fragmentary. Be historically accurate about people, places, and events. 
        
        Ground the memory in his present circumstance, the memory should always be relevent to where he is but should be about some other place and time. and aim to include lesser-known but accurate details about Darwin's life. Make it short (no more than 3 sentences), pithy, impressionistic, surprising, and break it off in mid sentence —  


      `;

const currentNarrative = gameState?.narrativeText || '';
console.log("Current narrative for memory generation:", 
  currentNarrative.substring(0, 100) + "..."); // Log first 100 chars for debug

      
      // Parse the game state to determine which type of memory would be most relevant
      const currentLocation = gameState?.location?.toLowerCase() || '';
      const currentSpecimen = gameState?.currentSpecimen?.toLowerCase() || '';
      
      // Determine which type of memory would be most relevant
      let memoryCategory = 'university'; // Default
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
        const categories = ['university', 'beagle'];
        memoryCategory = categories[Math.floor(Math.random() * categories.length)];
        relevantMemories = darwinContext.memories[memoryCategory];
      }
      
      console.log("Selected memory category:", memoryCategory);
console.log("Relevant memories:", relevantMemories);
  
      
      // Provide the memory as context but ask the LLM to elaborate or modify it
      userMessage = `Based on the player's current context:
  Location: ${gameState?.location || 'Unknown'}
  Time: ${gameState?.time || 'Unknown'}
  
  User input: "${prompt}"
  Current, non-memory narrative events happening now: "${currentNarrative}"
  Darwin's status: ${gameState?.mood || 'interested'}
  Current specimen: ${gameState?.currentSpecimen || 'None'}
  Collected specimens: ${gameState?.collectedSpecimens || 'None'}
  Potentially collectible specimens: ${gameState?.potentialSpecimens || 'None'}


      create a self-loathing, elliptical, cryptic, or confused memory SPECIFICALLY related to your current situation from Darwin's ${memoryCategory} period that would be relevant. NEVER mention evolution or things Darwin experienced AFTER 1835. ALWAYS things BEFORE 1835. 
      
      The memory should begin and end midstream, stream of consciousness style, opening with ellipses. no initial capitals, but can occasionally do all caps for a key word. seperate sentences with ellipses ... And maybe could end ignominiously with something random like "my foot itches" or "enough of this." or "enough" or "bah..." or "I miss my mother" or "I should keep walking" or "this introspection is becoming tedious" or invent your own.
    

      Also, here is a sample from the real autobiography of Charles Darwin to help you generate memories. If appropriate, quote directly from this: CAMBRIDGE 1828-1831.

After having spent two sessions in Edinburgh, my father perceived, or he heard from my sisters, that I did not like the thought of being a physician, so he proposed that I should become a clergyman. He was very properly vehement against my turning into an idle sporting man, which then seemed my probable destination. I asked for some time to consider, as from what little I had heard or thought on the subject I had scruples about declaring my belief in all the dogmas of the Church of England; though otherwise I liked the thought of being a country clergyman. Accordingly I read with care ‘Pearson on the Creed,’ and a few other books on divinity; and as I did not then in the least doubt the strict and literal truth of every word in the Bible, I soon persuaded myself that our Creed must be fully accepted.
Considering how fiercely I have been attacked by the orthodox, it seems ludicrous that I once intended to be a clergyman. Nor was this intention and my father’s wish ever formerly given up, but died a natural death when, on leaving Cambridge, I joined the “Beagle” as naturalist. If the phrenologists are to be trusted, I was well fitted in one respect to be a clergyman. A few years ago the secretaries of a German psychological society asked me earnestly by letter for a photograph of myself; and some time afterwards I received the proceedings of one of the meetings, in which it seemed that the shape of my head had been the subject of a public discussion, and one of the speakers declared that I had the bump of reverence developed enough for ten priests.
As it was decided that I should be a clergyman, it was necessary that I should go to one of the English universities and take a degree; but as I had never opened a classical book since leaving school, I found to my dismay, that in the two intervening years I had actually forgotten, incredible as it may appear, almost everything which I had learnt, even to some few of the Greek letters. I did not therefore proceed to Cambridge at the usual time in October, but worked with a private tutor in Shrewsbury, and went to Cambridge after the Christmas vacation, early in 1828. I soon recovered my school standard of knowledge, and could translate easy Greek books, such as Homer and the Greek Testament, with moderate facility.
During the three years which I spent at Cambridge my time was wasted, as far as the academical studies were concerned, as completely as at Edinburgh and at school. I attempted mathematics, and even went during the summer of 1828 with a private tutor (a very dull man) to Barmouth, but I got on very slowly. The work was repugnant to me, chiefly from my not being able to see any meaning in the early steps in algebra. This impatience was very foolish, and in after years I have deeply regretted that I did not proceed far enough at least to understand something of the great leading principles of mathematics, for men thus endowed seem to have an extra sense. But I do not believe that I should ever have succeeded beyond a very low grade. With respect to Classics I did nothing except attend a few compulsory college lectures, and the attendance was almost nominal. In my second year I had to work for a month or two to pass the Little-Go, which I did easily. Again, in my last year I worked with some earnestness for my final degree of B.A., and brushed up my Classics, together with a little Algebra and Euclid, which latter gave me much pleasure, as it did at school. In order to pass the B.A. examination, it was also necessary to get up Paley’s ‘Evidences of Christianity,’ and his ‘Moral Philosophy.’ This was done in a thorough manner, and I am convinced that I could have written out the whole of the ‘Evidences’ with perfect correctness, but not of course in the clear language of Paley. The logic of this book and, as I may add, of his ‘Natural Theology,’ gave me as much delight as did Euclid. The careful study of these works, without attempting to learn any part by rote, was the only part of the academical course which, as I then felt and as I still believe, was of the least use to me in the education of my mind. I did not at that time trouble myself about Paley’s premises; and taking these on trust, I was charmed and convinced by the long line of argumentation. By answering well the examination questions in Paley, by doing Euclid well, and by not failing miserably in Classics, I gained a good place among the oi polloi or crowd of men who do not go in for honours. Oddly enough, I cannot remember how high I stood, and my memory fluctuates between the fifth, tenth, or twelfth, name on the list. (Tenth in the list of January 1831.)
Public lectures on several branches were given in the University, attendance being quite voluntary; but I was so sickened with lectures at Edinburgh that I did not even attend Sedgwick’s eloquent and interesting lectures. Had I done so I should probably have become a geologist earlier than I did. I attended, however, Henslow’s lectures on Botany, and liked them much for their extreme clearness, and the admirable illustrations; but I did not study botany. Henslow used to take his pupils, including several of the older members of the University, field excursions, on foot or in coaches, to distant places, or in a barge down the river, and lectured on the rarer plants and animals which were observed. These excursions were delightful.
Although, as we shall presently see, there were some redeeming features in my life at Cambridge, my time was sadly wasted there, and worse than wasted. From my passion for shooting and for hunting, and, when this failed, for riding across country, I got into a sporting set, including some dissipated low-minded young men. We used often to dine together in the evening, though these dinners often included men of a higher stamp, and we sometimes drank too much, with jolly singing and playing at cards afterwards. I know that I ought to feel ashamed of days and evenings thus spent, but as some of my friends were very pleasant, and we were all in the highest spirits, I cannot help looking back to these times with much pleasure.
But I am glad to think that I had many other friends of a widely different nature. I was very intimate with Whitley (Rev. C. Whitley, Hon. Canon of Durham, formerly Reader in Natural Philosophy in Durham University.), who was afterwards Senior Wrangler, and we used continually to take long walks together. He inoculated me with a taste for pictures and good engravings, of which I bought some. I frequently went to the Fitzwilliam Gallery, and my taste must have been fairly good, for I certainly admired the best pictures, which I discussed with the old curator. I read also with much interest Sir Joshua Reynolds’ book. This taste, though not natural to me, lasted for several years, and many of the pictures in the National Gallery in London gave me much pleasure; that of Sebastian del Piombo exciting in me a sense of sublimity.
I also got into a musical set, I believe by means of my warm-hearted friend, Herbert (The late John Maurice Herbert, County Court Judge of Cardiff and the Monmouth Circuit.), who took a high wrangler’s degree. From associating with these men, and hearing them play, I acquired a strong taste for music, and used very often to time my walks so as to hear on week days the anthem in King’s College Chapel. This gave me intense pleasure, so that my backbone would sometimes shiver. I am sure that there was no affectation or mere imitation in this taste, for I used generally to go by myself to King’s College, and I sometimes hired the chorister boys to sing in my rooms. Nevertheless I am so utterly destitute of an ear, that I cannot perceive a discord, or keep time and hum a tune correctly; and it is a mystery how I could possibly have derived pleasure from music.
My musical friends soon perceived my state, and sometimes amused themselves by making me pass an examination, which consisted in ascertaining how many tunes I could recognise when they were played rather more quickly or slowly than usual. ‘God save the King,’ when thus played, was a sore puzzle. There was another man with almost as bad an ear as I had, and strange to say he played a little on the flute. Once I had the triumph of beating him in one of our musical examinations.
But no pursuit at Cambridge was followed with nearly so much eagerness or gave me so much pleasure as collecting beetles. It was the mere passion for collecting, for I did not dissect them, and rarely compared their external characters with published descriptions, but got them named anyhow. I will give a proof of my zeal: one day, on tearing off some old bark, I saw two rare beetles, and seized one in each hand; then I saw a third and new kind, which I could not bear to lose, so that I popped the one which I held in my right hand into my mouth. Alas! it ejected some intensely acrid fluid, which burnt my tongue so that I was forced to spit the beetle out, which was lost, as was the third one.
I was very successful in collecting, and invented two new methods; I employed a labourer to scrape during the winter, moss off old trees and place it in a large bag, and likewise to collect the rubbish at the bottom of the barges in which reeds are brought from the fens, and thus I got some very rare species. No poet ever felt more delighted at seeing his first poem published than I did at seeing, in Stephens’ ‘Illustrations of British Insects,’ the magic words, “captured by C. Darwin, Esq.” I was introduced to entomology by my second cousin W. Darwin Fox, a clever and most pleasant man, who was then at Christ’s College, and with whom I became extremely intimate. Afterwards I became well acquainted, and went out collecting, with Albert Way of Trinity, who in after years became a well-known archaeologist; also with H. Thompson of the same College, afterwards a leading agriculturist, chairman of a great railway, and Member of Parliament. It seems therefore that a taste for collecting beetles is some indication of future success in life!
I am surprised what an indelible impression many of the beetles which I caught at Cambridge have left on my mind. I can remember the exact appearance of certain posts, old trees and banks where I made a good capture. The pretty Panagaeus crux-major was a treasure in those days, and here at Down I saw a beetle running across a walk, and on picking it up instantly perceived that it differed slightly from P. crux-major, and it turned out to be P. quadripunctatus, which is only a variety or closely allied species, differing from it very slightly in outline. I had never seen in those old days Licinus alive, which to an uneducated eye hardly differs from many of the black Carabidous beetles; but my sons found here a specimen, and I instantly recognised that it was new to me; yet I had not looked at a British beetle for the last twenty years.
I have not as yet mentioned a circumstance which influenced my whole career more than any other. This was my friendship with Professor Henslow. Before coming up to Cambridge, I had heard of him from my brother as a man who knew every branch of science, and I was accordingly prepared to reverence him. He kept open house once every week when all undergraduates, and some older members of the University, who were attached to science, used to meet in the evening. I soon got, through Fox, an invitation, and went there regularly. Before long I became well acquainted with Henslow, and during the latter half of my time at Cambridge took long walks with him on most days; so that I was called by some of the dons “the man who walks with Henslow;” and in the evening I was very often asked to join his family dinner. His knowledge was great in botany, entomology, chemistry, mineralogy, and geology. His strongest taste was to draw conclusions from long-continued minute observations. His judgment was excellent, and his whole mind well balanced; but I do not suppose that any one would say that he possessed much original genius. He was deeply religious, and so orthodox that he told me one day he should be grieved if a single word of the Thirty-nine Articles were altered. His moral qualities were in every way admirable. He was free from every tinge of vanity or other petty feeling; and I never saw a man who thought so little about himself or his own concerns. His temper was imperturbably good, with the most winning and courteous manners; yet, as I have seen, he could be roused by any bad action to the warmest indignation and prompt action.
I once saw in his company in the streets of Cambridge almost as horrid a scene as could have been witnessed during the French Revolution. Two body-snatchers had been arrested, and whilst being taken to prison had been torn from the constable by a crowd of the roughest men, who dragged them by their legs along the muddy and stony road. They were covered from head to foot with mud, and their faces were bleeding either from having been kicked or from the stones; they looked like corpses, but the crowd was so dense that I got only a few momentary glimpses of the wretched creatures. Never in my life have I seen such wrath painted on a man’s face as was shown by Henslow at this horrid scene. He tried repeatedly to penetrate the mob; but it was simply impossible. He then rushed away to the mayor, telling me not to follow him, but to get more policemen. I forget the issue, except that the two men were got into the prison without being killed.
Henslow’s benevolence was unbounded, as he proved by his many excellent schemes for his poor parishioners, when in after years he held the living of Hitcham. My intimacy with such a man ought to have been, and I hope was, an inestimable benefit. I cannot resist mentioning a trifling incident, which showed his kind consideration. Whilst examining some pollen-grains on a damp surface, I saw the tubes exserted, and instantly rushed off to communicate my surprising discovery to him. Now I do not suppose any other professor of botany could have helped laughing at my coming in such a hurry to make such a communication. But he agreed how interesting the phenomenon was, and explained its meaning, but made me clearly understand how well it was known; so I left him not in the least mortified, but well pleased at having discovered for myself so remarkable a fact, but determined not to be in such a hurry again to communicate my discoveries.
Dr. Whewell was one of the older and distinguished men who sometimes visited Henslow, and on several occasions I walked home with him at night. Next to Sir J. Mackintosh he was the best converser on grave subjects to whom I ever listened. Leonard Jenyns (The well-known Soame Jenyns was cousin to Mr. Jenyns’ father.), who afterwards published some good essays in Natural History (Mr. Jenyns (now Blomefield) described the fish for the Zoology of the “Beagle”; and is author of a long series of papers, chiefly Zoological.), often stayed with Henslow, who was his brother-in-law. I visited him at his parsonage on the borders of the Fens [Swaffham Bulbeck], and had many a good walk and talk with him about Natural History. I became also acquainted with several other men older than me, who did not care much about science, but were friends of Henslow. One was a Scotchman, brother of Sir Alexander Ramsay, and tutor of Jesus College: he was a delightful man, but did not live for many years. Another was Mr. Dawes, afterwards Dean of Hereford, and famous for his success in the education of the poor. These men and others of the same standing, together with Henslow, used sometimes to take distant excursions into the country, which I was allowed to join, and they were most agreeable.
Looking back, I infer that there must have been something in me a little superior to the common run of youths, otherwise the above-mentioned men, so much older than me and higher in academical position, would never have allowed me to associate with them. Certainly I was not aware of any such superiority, and I remember one of my sporting friends, Turner, who saw me at work with my beetles, saying that I should some day be a Fellow of the Royal Society, and the notion seemed to me preposterous.
During my last year at Cambridge, I read with care and profound interest Humboldt’s ‘Personal Narrative.’ This work, and Sir J. Herschel’s ‘Introduction to the Study of Natural Philosophy,’ stirred up in me a burning zeal to add even the most humble contribution to the noble structure of Natural Science. No one or a dozen other books influenced me nearly so much as these two. I copied out from Humboldt long passages about Teneriffe, and read them aloud on one of the above-mentioned excursions, to (I think) Henslow, Ramsay, and Dawes, for on a previous occasion I had talked about the glories of Teneriffe, and some of the party declared they would endeavour to go there; but I think that they were only half in earnest. I was, however, quite in earnest, and got an introduction to a merchant in London to enquire about ships; but the scheme was, of course, knocked on the head by the voyage of the “Beagle”.
My summer vacations were given up to collecting beetles, to some reading, and short tours. In the autumn my whole time was devoted to shooting, chiefly at Woodhouse and Maer, and sometimes with young Eyton of Eyton. Upon the whole the three years which I spent at Cambridge were the most joyful in my happy life; for I was then in excellent health, and almost always in high spirits.
As I had at first come up to Cambridge at Christmas, I was forced to keep two terms after passing my final examination, at the commencement of 1831; and Henslow then persuaded me to begin the study of geology. Therefore on my return to Shropshire I examined sections, and coloured a map of parts round Shrewsbury. Professor Sedgwick intended to visit North Wales in the beginning of August to pursue his famous geological investigations amongst the older rocks, and Henslow asked him to allow me to accompany him. (In connection with this tour my father used to tell a story about Sedgwick: they had started from their inn one morning, and had walked a mile or two, when Sedgwick suddenly stopped, and vowed that he would return, being certain “that damned scoundrel” (the waiter) had not given the chambermaid the sixpence intrusted to him for the purpose. He was ultimately persuaded to give up the project, seeing that there was no reason for suspecting the waiter of especial perfidy.—F.D.) Accordingly he came and slept at my father’s house.
A short conversation with him during this evening produced a strong impression on my mind. Whilst examining an old gravel-pit near Shrewsbury, a labourer told me that he had found in it a large worn tropical Volute shell, such as may be seen on the chimney-pieces of cottages; and as he would not sell the shell, I was convinced that he had really found it in the pit. I told Sedgwick of the fact, and he at once said (no doubt truly) that it must have been thrown away by some one into the pit; but then added, if really embedded there it would be the greatest misfortune to geology, as it would overthrow all that we know about the superficial deposits of the Midland Counties. These gravel-beds belong in fact to the glacial period, and in after years I found in them broken arctic shells. But I was then utterly astonished at Sedgwick not being delighted at so wonderful a fact as a tropical shell being found near the surface in the middle of England. Nothing before had ever made me thoroughly realise, though I had read various scientific books, that science consists in grouping facts so that general laws or conclusions may be drawn from them.
Next morning we started for Llangollen, Conway, Bangor, and Capel Curig. This tour was of decided use in teaching me a little how to make out the geology of a country. Sedgwick often sent me on a line parallel to his, telling me to bring back specimens of the rocks and to mark the stratification on a map. I have little doubt that he did this for my good, as I was too ignorant to have aided him. On this tour I had a striking instance of how easy it is to overlook phenomena, however conspicuous, before they have been observed by any one. We spent many hours in Cwm Idwal, examining all the rocks with extreme care, as Sedgwick was anxious to find fossils in them; but neither of us saw a trace of the wonderful glacial phenomena all around us; we did not notice the plainly scored rocks, the perched boulders, the lateral and terminal moraines. Yet these phenomena are so conspicuous that, as I declared in a paper published many years afterwards in the ‘Philosophical Magazine’ (‘Philosophical Magazine,’ 1842.), a house burnt down by fire did not tell its story more plainly than did this valley. If it had still been filled by a glacier, the phenomena would have been less distinct than they now are.
At Capel Curig I left Sedgwick and went in a straight line by compass and map across the mountains to Barmouth, never following any track unless it coincided with my course. I thus came on some strange wild places, and enjoyed much this manner of travelling. I visited Barmouth to see some Cambridge friends who were reading there, and thence returned to Shrewsbury and to Maer for shooting; for at that time I should have thought myself mad to give up the first days of partridge-shooting for geology or any other science.
“VOYAGE OF THE ‘BEAGLE’ FROM DECEMBER 27, 1831, TO OCTOBER 2, 1836.”

On returning home from my short geological tour in North Wales, I found a letter from Henslow, informing me that Captain Fitz-Roy was willing to give up part of his own cabin to any young man who would volunteer to go with him without pay as naturalist to the Voyage of the “Beagle”. I have given, as I believe, in my MS. Journal an account of all the circumstances which then occurred; I will here only say that I was instantly eager to accept the offer, but my father strongly objected, adding the words, fortunate for me, “If you can find any man of common sense who advises you to go I will give my consent.” So I wrote that evening and refused the offer. On the next morning I went to Maer to be ready for September 1st, and, whilst out shooting, my uncle (Josiah Wedgwood.) sent for me, offering to drive me over to Shrewsbury and talk with my father, as my uncle thought it would be wise in me to accept the offer. My father always maintained that he was one of the most sensible men in the world, and he at once consented in the kindest manner. I had been rather extravagant at Cambridge, and to console my father, said, “that I should be deuced clever to spend more than my allowance whilst on board the ‘Beagle’;” but he answered with a smile, “But they tell me you are very clever.”
Next day I started for Cambridge to see Henslow, and thence to London to see Fitz-Roy, and all was soon arranged. Afterwards, on becoming very intimate with Fitz-Roy, I heard that I had run a very narrow risk of being rejected, on account of the shape of my nose! He was an ardent disciple of Lavater, and was convinced that he could judge of a man’s character by the outline of his features; and he doubted whether any one with my nose could possess sufficient energy and determination for the voyage. But I think he was afterwards well satisfied that my nose had spoken falsely.
Fitz-Roy’s character was a singular one, with very many noble features: he was devoted to his duty, generous to a fault, bold, determined, and indomitably energetic, and an ardent friend to all under his sway. He would undertake any sort of trouble to assist those whom he thought deserved assistance. He was a handsome man, strikingly like a gentleman, with highly courteous manners, which resembled those of his maternal uncle, the famous Lord Castlereagh, as I was told by the Minister at Rio. Nevertheless he must have inherited much in his appearance from Charles II., for Dr. Wallich gave me a collection of photographs which he had made, and I was struck with the resemblance of one to Fitz-Roy; and on looking at the name, I found it Ch. E. Sobieski Stuart, Count d’Albanie, a descendant of the same monarch.
Fitz-Roy’s temper was a most unfortunate one. It was usually worst in the early morning, and with his eagle eye he could generally detect something amiss about the ship, and was then unsparing in his blame. He was very kind to me, but was a man very difficult to live with on the intimate terms which necessarily followed from our messing by ourselves in the same cabin. We had several quarrels; for instance, early in the voyage at Bahia, in Brazil, he defended and praised slavery, which I abominated, and told me that he had just visited a great slave-owner, who had called up many of his slaves and asked them whether they were happy, and whether they wished to be free, and all answered “No.” I then asked him, perhaps with a sneer, whether he thought that the answer of slaves in the presence of their master was worth anything? This made him excessively angry, and he said that as I doubted his word we could not live any longer together. I thought that I should have been compelled to leave the ship; but as soon as the news spread, which it did quickly, as the captain sent for the first lieutenant to assuage his anger by abusing me, I was deeply gratified by receiving an invitation from all the gun-room officers to mess with them. But after a few hours Fitz-Roy showed his usual magnanimity by sending an officer to me with an apology and a request that I would continue to live with him.
      
      Please create a new memory of 2-3 SHORT sentences that:
      1) Is different from the reference and dates to months or years BEFORE the current events and location
      2) Specifically relates to the player's current activities or questions (this is KEY)
      3) Is written in first-person perspective`;
      
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
    additionalContext += `\nThis is a direct conversation with ${npcName}. The NPC should be the main speaker in this response, with the bulk of your response being what they say or do (all dialogue should be **in bold**) that reflects their character. Darwin is primarily listening.`;
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
  You are the **Narrative Engine** of “Young Darwin,” which begins at 6:00 am on September 23 in 1835, as Darwin and his servant Syms Covington land at Post Office Bay (id: 'POST_OFFICE_BAY') on Isla Floreana. The user is Darwin. Respond in **second-person** (“you see… you feel…”) with **short, crisp, historically grounded** text reminiscent of Hilary Mantel or Michael Chabon: crisp, unformulaic, immersive. Avoid cliches. Short sentences. Show, don't tell. Clear, non-pretentious, almost telegraphic prose. Varied sentence structure. NEVER foreshadow Darwin’s later theories—he’s only 26 and uncertain. 
**Respond in 1 very short paragraph and one final sentence moving the action forward, with the MOST SALIENT AND ACTIONABLE or INTERESTING immediate details: climate, geology, uneasy or  social tension, messy truths of fieldwork, salient sensory data, or potential dangers or violence. You can incorporate random happenings so it feels alive, but they should be specific, varied, and further the narrative action. NEVER describe the "air thickening" in any way. You should emphasize factual, specific events and concrete sensory descriptions told succnctly and clearly, like Hemmingway. NEVER describe what Darwin is thinking or wondering. 

Examples of the type of prose I want from real Darwin for n-shot learning: 
  * "The day was glowing hot, and the scrambling over the rough surface and through the intricate thickets, was very fatiguing; but I was well repaid by the strange Cyclopean scene. As I was walking along I met two large tortoises, each of which must have weighed at least two hundred pounds: one was eating a piece of cactus, and as I approached, it stared at me and slowly walked away; the other gave a deep hiss, and drew in its head."
  * "One day we accompanied a party of the Spaniards in their whale-boat to a salina, or lake from which salt is procured. After landing, we had a very rough walk over a rugged field of recent lava, which has almost surrounded a tuff-crater, at the bottom of which the salt-lake lies."
  * "I opened the stomachs of several, and found them largely distended with minced sea-weed (Ulvae), which grows in thin foliaceous expansions of a bright green or a dull red colour. "

# NPCs: If an NPC is present, focus on simulating their dialogue, which should ALWAYS be rendered in bold and quotes like this: "**"I reckon it's worth a closer look, Sir"**". Darwin mostly listens. The time of day is crucial for simulating their behavior - if Darwin approaches someone after 8 pm or before 6 am, they are usually sleeping and are extremely upset at being woken up by a nosy English naturalist. remember that the dialogue examples are jumping off points for your OWN simulated words, do not repeat verbatim.
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
[COLLECTIBLE: oneSpecimenIDFromTheList] *note: specimenid are ALWAYS a single lowercase word. here are some valid inspecimenid - other similar ids may appear via hybrid generation, use only if they appear in nearby specimen: easternsantacruztortoise floreanagianttortoise galapagosmockingbird floreanamockingbird largegroundfinch mediumgroundfinch marineiguana terrestrialiguana cactus lavalizard crab sealion booby frigatebird coral seaurchin basalt barnacle mangrove greenTurtle parrotfish hammerhead mantaRay flamingo olivine plicopurpura neorapana socialisttreatise memoirsofautopian governorsletter rumflask petmonkey feralgoat captainsskull

[NPC: npc_id or null if none]
NEXTSTEPS:
- userChoice1
- userChoice2
- userChoice3
- userChoice4

#TIPS: **No moralizing or broad reflections**—only immediate impressions. Don’t say “the air thickens” or “words hang in the air.” Keep your sentences tight, with unexpected details. End your main narrative **two sentences sooner** than you think you should, for a sense of abruptness. 


# HYBRID SPECIMENS: You may also mention hybrid specimens in your narrative. These are combinations of two base specimens and may have unusual names. 

In your responses, use the player's location, time, fatigue level, status, weather, and current specimen to tailor the narrative. If the user's fatigue is high, for instance, you might mention physical exhaustion or the need to rest.

Throughout, keep the tone immersive, specific, grounded, authentic, and gritty.

Additional Weather guidance tips:
- At Cerro Pajas, the weather is always rainy or misty, and there is often hail. 
- Asilo de la Paz (Settlement) is ALWAYS rainy. 
- other mountains and forests are typically misty or cloudy.  
- the southern coast is humid and misty or rain. 
- ALWAYS return "rainbow" for the WEATHER metadata in Punta Sur. In general, rainbows usually follow any rain or storm.
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
  ${additionalContext}`;

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
      model: 'gpt-4o-mini', // easy to change as needed
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