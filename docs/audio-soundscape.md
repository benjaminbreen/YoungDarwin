# Naturalistic Audio Soundscape

Floreana has quiet, environment-aware surf, wind, rain, and dry-zone insects.
Darwin's contact audio then follows him across the island: steps, takeoffs, and landings resolve from
the same sand, loose-ground, rock, and shallow-water contact data used by the
movement and visual-effects systems. It uses genuine field recordings, not
generated or synthetic nature audio.

The Local Chart header carries a persistent speaker control immediately left
of the full-island-chart button. It changes the same saved audio preference as
the launch settings screen, so it is a true global mute rather than a second
mix state; restoring audio resumes the live environment targets smoothly.

## Source and license record

The original bay set uses five Creative Commons 0 recordings downloaded from the official
Freesound high-quality preview endpoint on 2026-07-21. The runtime files are
edited derivatives. CC0 does not require attribution, but the sources are kept
here so the recordings remain auditable.

| Runtime material | Freesound source | Recordist | Source notes |
| --- | --- | --- | --- |
| Shore surf | [Ocean Waves](https://freesound.org/people/the_toilet_guy/sounds/255153/) | the_toilet_guy | Gulf of Mexico surf, Zoom H6 X/Y |
| Wind | [Ambiance Wind Trees Strong Loop Stereo](https://freesound.org/people/Nox_Sound/sounds/544853/) | Nox_Sound | Outdoor wind through trees, Tascam DR-05 |
| Grit footsteps | [Footsteps Gravel](https://freesound.org/people/SamuelGremaud/sounds/429182/) | SamuelGremaud | Outdoor gravel walking, Zoom H4n Pro |
| Sand footsteps | [Walking on sand and gravel](https://freesound.org/people/launemax/sounds/249933/) | launemax | Slow, fast, and running footsteps |
| Shallow water | [Walking Through Shallow Water](https://freesound.org/people/ryansitz/sounds/342932/) | ryansitz | Zoom H4n and directional microphone |

The source previews live under `assets-src/audio/post-office-bay/raw/`, which is
intentionally excluded from Git with the rest of `assets-src`. The optimized
runtime derivatives live under `public/assets/audio/post-office-bay/`.

## Rebuild

With the five source previews present and `ffmpeg` installed:

```bash
npm run asset:audio:post-office-bay
```

The build script trims isolated contacts, removes unusable sub/bass and extreme
high-frequency noise, loudness-matches the variants, adds tiny contact fades,
and constructs loop seams with equal-power crossfades. Continuous beds use MP3
rather than Vorbis because some embedded Chromium/WebAudio builds can request an
OGG successfully but reject it during `decodeAudioData`; contact sprites remain
48 kHz PCM WAV. Runtime code supplies
the larger aesthetic decisions: low default gains, shoreline falloff, weather
response, variation without immediate repeats, and a strict voice limit.

## Island environmental beds

Surf is no longer gated to Post Office Bay. The mix reads authored ocean-facing
map edges from the shared geography registry, measures Darwin's distance from
those edges, and retains an audible quiet floor throughout a coastal map. Its
gain curve compensates for the field recording's naturally quiet rolling body
without compressing away the larger crests. A region one route inland from a
coastal region keeps a much lower distant-surf floor. Post Office Bay still uses
its more precise authored curved shoreline. The runtime also resumes a browser-
suspended audio context on visibility return or the next player input. Ambient
readiness is tracked per loop rather than inferred from the shared audio context:
if surf or another bed misses its first fetch/decode during a development rebuild,
the live mixer retries that missing track and applies the current target as soon
as it recovers.

## Live sound diagnostics

Press `Shift+0` during play to open the sound debug panel. It reads the live
WebAudio nodes and exposes context state, master gain, decoded/loading assets,
active voices, request/decode errors, and both requested and actual gain for
continuous tracks. Every environmental, spatial, contact, wildlife, interaction,
and Darwin-body family can be selected. Continuous tracks can be isolated at a
known diagnostic level; one-shot families can be isolated and played directly.
Tracks can also be muted or force-reloaded, and the complete snapshot can be
copied for comparison. Closing the panel clears every diagnostic override and
restores normal environment logic while preserving authored mix trims. Its live
context strip reports the current region, habitat, coast relationship, insect
eligibility, rain intensity, and time of day so a zero mixer target can be
distinguished from bad map metadata.

The panel also exposes a master trim and a persistent trim for every track,
measured in decibels. These trims affect normal gameplay immediately, survive
panel close and page reload through browser-local storage, and are visually
marked beside every adjusted track. `Copy mix settings` writes a compact
`darwin-sound-mix-v1` JSON payload containing the master value, changed track
keys, and their labels; paste that payload into an issue or agent conversation
to turn a listening pass into reproducible authored defaults. Solo and mute are
still temporary and are intentionally excluded from the copied mix. Resetting
all trims requires confirmation.

Wind, rain, and insects read the same smoothed runtime weather values used by
foliage, clouds, and rain particles. Wind rises with physical wind speed; visible
drizzle has an audible rain floor and strengthens naturally into a downpour. The
insect bed is limited to dry scrub, lava, grass, and similar habitats, rises
clearly after dusk, and is suppressed by rain, strong wind, wet regions,
highlands, and interiors. All ambient changes use slow gain ramps.

The controller is mounted once for the complete expedition rather than per
region. Coast detection reads authored ocean boundaries, coastal biome metadata,
and a small set of irregular authored shores; direct coasts receive the full
bed and their immediate graph neighbors retain distant surf. Interior routing
uses exact biome/preset categories, never loose name substrings, so names such
as Post Scrub Rise cannot accidentally silence outdoor ambience. Regression
coverage checks every non-test placement on the canonical Floreana chart.
The Beagle cabin and Lawson house retain small exterior traces instead of hard
silence. Those traces pass through per-bed low-pass filters: water and wind are
heavily muffled, while rain remains somewhat brighter as it reaches timber,
roof, and windows. The Beagle cabin keeps a low stern-water presence; Lawson's
highland house keeps wind, rain, and a nearly subliminal nocturnal insect trace.

| Runtime material | Freesound source | Recordist | Source notes |
| --- | --- | --- | --- |
| Rain on vegetation | [Rain on grass and leaves](https://freesound.org/people/SamsterBirdies/sounds/584268/) | SamsterBirdies | Stereo field recording with quiet splashes and no roof/gutter signature |
| Dry insect bed | [Long Cicada & Cricket Atmos](https://freesound.org/people/Alex_hears_things/sounds/376811/) | Alex_hears_things | Clean field recording, high-passed and mixed at very low gain as an acoustic proxy |

Both sources are Creative Commons 0. Rebuild the seamless derivatives with:

```bash
npm run asset:audio:island-ambience
```

## Movement and nearby wildlife

Takeoff and landing are one-shot contacts rather than a separate generic body
thump. Sand and loose ground reuse the corresponding boot recordings above;
authored boulders and hard basalt use a performed mountain-boot jump recording.
Wooden decks and interiors, wet mud, and vegetated leaf litter now have their
own recordings as well. The same material resolver drives footsteps, step-ups,
takeoffs, and landings, so crossing a threshold or leaving a wet bank changes
the sound without a region-specific trigger. The runtime scales landing strength
from fall velocity while keeping ordinary hops quiet.

The playable finch has animation-timed takeoff and climbing wingbeats plus tiny
surface contacts for grounded hops and touchdown. Gliding remains silent. The
playable tortoise has a close padded dirt press at each gait contact, with a much
quieter terrain layer underneath and restrained shell-height plant rustle. These
animal sounds use the existing controller contacts rather than free-running
loops, so stopping movement stops the sound immediately.

Darwin's collecting shotgun uses six real black-powder reports with slight
non-repeating variation. The second barrel starts a compressed muzzle-loading
handling sequence built from lock and ramrod Foley; it deliberately contains no
modern pump, magazine, or ejecting-cartridge sound. The report is a priority
voice so a busy cluster of footsteps and wildlife cannot make a shot silent.

Wildlife is also actor-bound rather than a looping ambience: a call can only be
scheduled when a matching, currently rendered animal is within range, and its
gain and stereo position come from that live actor pose. Calls stop at night and
during visible rain, and have long randomized gaps.

Doves, mockingbirds, and hawks follow the same rule, each with its own range and
substantially longer randomized interval. A short-eared owl call is the one
intentional nocturnal exception: it requires a live owl actor, nighttime, and
dry weather. Diurnal calls remain silent at night and every bird family is
suppressed in visible rain. These recordings are acoustic proxies rather than
claims of species-exact Galápagos recordings.

Visible storm lightning publishes one timing event at the first flash. Thunder
arrives after distance divided by the speed of sound, with distance-based gain
and low-pass filtering; an indoor strike is additionally muffled. Direct coasts
also receive a close breaker one-shot only when the player is genuinely near
the authored shoreline. Its 17–39 second gaps leave the continuous surf in
charge of the overall coast and prevent a repetitive wave cadence.

Syms uses the same authored surface-contact profiles as Darwin. His live travel
speed supplies a walking, jogging, or running cadence; each bootfall resolves to
sand, loose grit, or hard rock beneath him, pans from his world position, and
falls away with distance. It is not tied to Darwin's inputs, so autonomous
patrolling and following remain audible when Syms is actually moving.

Carpenter-bee audio follows the closest rendered flying bee, with continuous
stereo movement and a deliberately short near-field falloff. Darts are a little
brighter and louder than hovering; descent fades the buzz and a perched bee is
silent. The visual daylight, cloud, and rain gate is shared with this audio, so
there can be no disembodied bee layer after the insects stand down.

| Runtime material | Freesound source | Recordist | Source notes |
| --- | --- | --- | --- |
| Boots on hard rock | [Footsteps Mountain Boots Rock Sequence](https://freesound.org/people/Nox_Sound/sounds/558812/) | Nox_Sound | Rode NTG4+ recording; the final six performed jumps supply separate push-off and landing contacts |
| Boots on wood | [Footsteps Boots - Hardwood, walk](https://freesound.org/people/Vrymaa/sounds/734600/) | Vrymaa | Clean heavy leather boots on a hardwood floor |
| Boots in mud | [Footsteps-Mud&Grass](https://freesound.org/people/jonccox/sounds/231317/) | jonccox | Isolated boot contacts in wet grass and mud, recorded with NTG2 / Zoom R05 |
| Boots on leaf litter | [walking on crunchy ground.wav](https://freesound.org/people/soundofsong/sounds/679956/) | soundofsong | Real sticks and dead leaves underfoot |
| Black-powder report | [44_black_powder.wav](https://freesound.org/people/Jon285/sounds/34708/) | Jon285 | Six real black-powder shots; derivatives retain the muzzle report and attenuate the later target impact |
| Ramrod handling | [1801 Pattern sea service pistol - flintlock](https://freesound.org/people/jriches1/packs/44008/) | jriches1 | Separate ramrod-out and ramrod-in Foley used only as period loading gestures |
| Percussion lock | [Diablo 12g pistol, cocking back and dry fire](https://freesound.org/people/FOSSarts/sounds/741054/) | FOSSarts | Raw black-powder firearm mechanism recording; short lock movements only |
| Small-bird wings | [Bird Wings](https://freesound.org/people/IENBA/sounds/832945/) | IENBA | Purpose-recorded small-bird quick-movement Foley |
| Tortoise ground press | [Drawing in sand 1](https://freesound.org/people/_stubb/sounds/389611/) | _stubb | Finger dragged through loose dirt; edited into low, padded scrape contacts |
| Gull calls | [Seagull](https://freesound.org/people/henner1964/sounds/699979/) | henner1964 | A flying gull recorded in Neuharlingersiel harbour |
| Small passerine calls | [White-crowned Sparrow Chirp](https://freesound.org/people/Zott820/sounds/695297/) | Zott820 | Short field-recorded song used as a restrained acoustic proxy near ground finches |
| Nearby bee buzz | [Bee buzzing.wav](https://freesound.org/people/DrDufus/sounds/462875/) | DrDufus | Close mono 48 kHz field recording of a large bee moving among low leaves and forest-floor material |
| Dove call proxy | [Dove cooing](https://freesound.org/people/haulaway/sounds/735366/) | haulaway | Isolated natural dove phrases, used only near a rendered Galápagos dove |
| Hawk call proxy | [Red-tailed hawk calls](https://freesound.org/people/1888software/sounds/575524/) | 1888software | Sparse outdoor raptor calls, used only near a rendered Galápagos hawk |
| Mockingbird call proxy | [Mockingbird](https://freesound.org/people/Osiruswaltz/sounds/509053/) | Osiruswaltz | Outdoor phrases trimmed into short, widely separated actor calls |
| Owl call proxy | [Owl call](https://freesound.org/people/ivolipa/sounds/353173/) | ivolipa | Isolated nocturnal calls, enabled only near a live short-eared owl at night |
| Thunder | [Clean thunder](https://freesound.org/people/damsur/sounds/443238/) | damsur | Clean natural rolls split into three distance-filtered variants |

All sources in this table are Creative Commons 0. Rebuild their derivatives with:

```bash
npm run asset:audio:movement-wildlife
npm run asset:audio:wildlife-fieldwork
```

The original rock/call/bee previews remain under
`assets-src/audio/movement-wildlife/raw/`; the later surface, firearm, and
playable-animal sources live under `assets-src/audio/expanded-movement/raw/`.
Both source directories are intentionally ignored, while their optimized WAV
and MP3 derivatives are committed under `public/assets/audio/movement-wildlife/`.

The gull and passerine recordings are acoustic proxies, not claimed recordings
of *Leucophaeus fuliginosus* or a Galápagos *Geospiza*. Species-exact archives
were reviewed, but the available noncommercial/share-alike terms were a poor
match for this MIT-distributed project. The proxy layer is deliberately sparse
and documented so it can be replaced cleanly if redistributable exact calls
become available.

## Contextual world detail

Animal movement now follows the live displacement of rendered actors. Crabs
produce brief scuttle clusters, marine iguanas make faint claw contacts on
basalt, and goats and horses use differently scaled hoof cadences. Stopping,
despawning, changing maps, or moving out of earshot stops the contacts; marine
iguanas add one restrained water contact only when their live pose crosses the
waterline. A soft goat call remains actor-bound and uses the same dry daytime
rules as other diurnal wildlife.

The Penal Colony has isolated, distance-filtered work impacts during dry
daylight, separated by 24–56 second gaps. Wet microclimates receive individual
foliage drops during light rain and for a short period after rain, while dry
scrub can produce branch movement only in a real gust. These are localized
one-shots, not hidden loops. Equipment Foley similarly confirms actual tool,
field-case, and carry-state transitions. Physics-accepted prop placement,
existing skid/scramble events, and rare leaf-litter contacts supply the small
world-contact accents.

| Runtime material | Freesound source | Recordist | Source notes |
| --- | --- | --- | --- |
| Crab and iguana contacts | [Crab walking](https://freesound.org/people/stuniverso/sounds/761559/) | stuniverso | Close natural crab movement; a lower filtered derivative is used as a subtle claw-contact proxy |
| Goat and horse hooves | [Horse Hooves Foley](https://freesound.org/people/BorzSounds/sounds/843303/) | BorzSounds | Clean performed hoof cadence; shorter, lighter cuts are reserved for goats |
| Goat call | [Soft Goat Bleat](https://freesound.org/people/TheKingOfGeeks360/sounds/825613/) | TheKingOfGeeks360 | Quiet phrase used only near a live goat actor |
| Settlement work | [Axe Chopping Wood](https://freesound.org/people/xkeril/sounds/753925/) | xkeril | Outdoor isolated strikes, strongly distance-filtered at runtime |
| Foliage droplets | [Water Droplets](https://freesound.org/people/Legnalegna55/sounds/543649/) | Legnalegna55 | Individual drops rather than a continuous water bed |
| Equipment handling | [Soft Leather](https://freesound.org/people/Vrymaa/sounds/734598/) | Vrymaa | Quiet case, strap, and carried-equipment movements |
| Loose stones | [Tumbling Rocks](https://freesound.org/people/Fission9/sounds/488660/) | Fission9 | Short real stone cascades used only by skid and scramble events |
| Dry branches | [Dry Branches Rustling](https://freesound.org/people/Fran%20Freesound/sounds/648170/) | Fran Freesound | Sparse dry branch movement for gusts and rare litter contact |

All sources in this table are Creative Commons 0. Source previews are ignored
under `assets-src/audio/contextual-world/raw/`; committed 48 kHz PCM derivatives
are rebuilt with `npm run asset:audio:contextual-world`.

## Fieldwork Foley

Successful field actions carry restrained physical detail. Documentation mixes
a page movement with a brief pencil phrase; physical collection closes a glass
or hard-case container; placing a snare uses short rope-and-pulley movements;
crossing into or out of an authored interior uses a single quiet wooden creak.
Blocked attempts remain silent, so the Foley confirms real state changes rather
than button presses. All are one-shot sprites in the normal voice limit and
appear separately in the `Shift+0` mix panel.

| Runtime material | Freesound source | Recordist | Source notes |
| --- | --- | --- | --- |
| Pencil writing | [Pencil Writing](https://freesound.org/people/Joao_Janz/sounds/485312/) | Joao_Janz | Short close writing texture mixed beneath a page movement |
| Page movement | [Page turn](https://freesound.org/people/OwlStorm/sounds/151220/) | OwlStorm | Single paper movement used at the start of each note phrase |
| Specimen container | [Glass jar sounds](https://freesound.org/people/Vrymaa/sounds/734624/) | Vrymaa | Small isolated glass and lid contacts |
| Snare rope | [Rope and pulley](https://freesound.org/people/Sassaby/sounds/170614/) | Sassaby | Short tension and handling fragments, kept very quiet |
| Interior threshold | [Door creak](https://freesound.org/people/soundofsong/sounds/647646/) | soundofsong | One short wooden creak for entering or leaving an interior |

All new wildlife, thunder, and fieldwork sources are Creative Commons 0. Their
source previews are intentionally ignored under
`assets-src/audio/wildlife-fieldwork/raw/`; rebuild the committed 48 kHz PCM
derivatives with `npm run asset:audio:wildlife-fieldwork`. Close wave breaks are
derived from the already documented CC0 shore-surf source and are rebuilt by
`npm run asset:audio:post-office-bay`.

## Exertion and injury

Darwin's bodily layer follows authoritative gameplay state rather than guessing
from animations. A vocal reaction requires real health loss and has a long
cooldown; drowning damage is excluded so it cannot produce repeating grunts.
Incapacitation or death uses a separate, longer exhale. Winded recovery plays
individual breaths at irregular intervals only while the player controller's
existing winded state is active—there is no breathing loop, heartbeat, or
constant injured groaning.

Falls remain surface-specific. The existing sand, grit, or rock landing stays
in front; clothing and carried gear join medium falls, and a filtered body-weight
layer appears only at injurious fall speed. Below 58 health, alternating foot
contacts acquire a very small gain and pitch asymmetry to support the existing
injured gait without turning it into a conspicuous sound effect.

| Runtime material | Freesound source | Recordist | Source notes |
| --- | --- | --- | --- |
| Winded breaths | [Young Male Heavy Breathing](https://freesound.org/people/AbuNijmeh/sounds/319103/) | AbuNijmeh | Natural post-workout breathing, separated into individual breaths |
| Pain and collapse reactions | [Short Male Pain Grunts](https://freesound.org/people/unfa/sounds/610991/) | unfa | 48 kHz / 24-bit studio recording; restrained selections only |
| Hard-fall body weight | [Body Fall on Dirt](https://freesound.org/people/leonelmail/sounds/504626/) | leonelmail | Short performed fall, low-passed beneath the terrain contact |
| Clothing and gear | [Clothing rustles](https://freesound.org/people/trettfilms/sounds/128233/) | trettfilms | Multiple quiet movements suited to running and handling clothing |

All four are Creative Commons 0. Rebuild their derivatives with:

```bash
npm run asset:audio:darwin-body
```

## Physical interactions

Collision and vegetation sounds use the same policy: genuine recorded material,
short variants, conservative gains, no immediate repeats, and cooldowns that
prevent a sustained collision from becoming a machine-gun loop.

| Runtime material | Freesound source | Recordist | Source notes |
| --- | --- | --- | --- |
| Wood | [box.wav](https://freesound.org/people/1urker/sounds/456977/) | 1urker | Raw wooden-crate drops and impacts |
| Stone | [rocks hitting other rocks.wav](https://freesound.org/people/PasekaM/sounds/408522/) | PasekaM | Multiple real rock contacts |
| Metal | [metal_clank.wav](https://freesound.org/people/vibe_crc/sounds/59317/) | vibe_crc | Oktava-102 recording of clanks and tinkles |
| Glass / ceramic | [Glass Clink](https://freesound.org/people/Nightflame/sounds/397597/) | Nightflame | A cup set against a hard surface |
| Grass | [Rustling Grass](https://freesound.org/people/alegemaate/sounds/364712/) | alegemaate | Grass physically rustled through |
| Shrub | [Bush Rustle](https://freesound.org/people/RoyalRose/sounds/560261/) | RoyalRose | Raw physical bush rustle |

All are Creative Commons 0. Rebuild these derivatives with:

```bash
npm run asset:audio:interactions
```
