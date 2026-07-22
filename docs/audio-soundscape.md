# Naturalistic Audio Soundscape

Floreana has quiet, environment-aware surf, wind, rain, and dry-zone insects.
Darwin's contact audio then follows him across the island: steps, takeoffs, and landings resolve from
the same sand, loose-ground, rock, and shallow-water contact data used by the
movement and visual-effects systems. It uses genuine field recordings, not
generated or synthetic nature audio.

## Source and license record

All five sources are Creative Commons 0 recordings downloaded from the official
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
and constructs loop seams with equal-power crossfades. Runtime code supplies
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
suspended audio context on visibility return or the next player input.

Wind, rain, and insects read the same smoothed runtime weather values used by
foliage, clouds, and rain particles. Wind rises with physical wind speed; rain
rises with precipitation intensity; the insect bed is limited to dry scrub,
lava, grass, and similar habitats and is suppressed by rain, strong wind, wet
regions, highlands, and interiors. All ambient changes use slow gain ramps.

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
The runtime scales landing strength from fall velocity while keeping ordinary
hops quiet.

Wildlife is also actor-bound rather than a looping ambience: a call can only be
scheduled when a matching, currently rendered animal is within range, and its
gain and stereo position come from that live actor pose. Calls stop at night and
have long randomized gaps.

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
| Gull calls | [Seagull](https://freesound.org/people/henner1964/sounds/699979/) | henner1964 | A flying gull recorded in Neuharlingersiel harbour |
| Small passerine calls | [White-crowned Sparrow Chirp](https://freesound.org/people/Zott820/sounds/695297/) | Zott820 | Short field-recorded song used as a restrained acoustic proxy near ground finches |
| Nearby bee buzz | [Bee buzzing.wav](https://freesound.org/people/DrDufus/sounds/462875/) | DrDufus | Close mono 48 kHz field recording of a large bee moving among low leaves and forest-floor material |

All four are Creative Commons 0. Rebuild their derivatives with:

```bash
npm run asset:audio:movement-wildlife
```

The gull and passerine recordings are acoustic proxies, not claimed recordings
of *Leucophaeus fuliginosus* or a Galápagos *Geospiza*. Species-exact archives
were reviewed, but the available noncommercial/share-alike terms were a poor
match for this MIT-distributed project. The proxy layer is deliberately sparse
and documented so it can be replaced cleanly if redistributable exact calls
become available.

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
