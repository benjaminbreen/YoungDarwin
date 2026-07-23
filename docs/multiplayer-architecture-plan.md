# Multiplayer Expedition Architecture Plan

- Status: proposed architecture and staged implementation plan
- Scope: capped expedition rooms for approximately 10–20 players, with a hard
  initial deployment ceiling of 30 active players globally
- Primary route: `/three`
- Initial roles: one Darwin, one Syms Covington, remaining players as animals

## Purpose

This document defines an architecture for adding multiplayer to Young Darwin
without replacing the existing single-player simulation or making human-played
actors special cases throughout the codebase.

The intended end state supports:

- Capped, isolated expedition rooms.
- Unique Darwin and Syms roles.
- Multiple human-played animals.
- Independent travel between island regions.
- Human-to-human conversation when both characters are occupied.
- AI or scripted control when an actor is not human-controlled.
- Darwin observing the actual behavior of human-played animals.
- Structured procedures such as measuring, handling, feeding, trapping,
  collecting, and releasing.
- Consistent shared world outcomes when actions happen concurrently.
- Optional classroom session records and instructor controls.

The multiplayer experience should remain a playable historical simulation. It
should not become a generic chat room, deathmatch, or quiz wrapper. Animal play
must remain a genuine embodied perspective rather than an avatar skin.

## Architectural Summary

Every character or consequential creature is a stable **actor**. An actor's
identity is separate from whatever currently controls it. Its controller can be
a human player, an AI provider, or authored scripted behavior.

Every consequential interaction is a server-owned **interaction session**.
Clients request interactions; the room validates, routes, resolves, and records
them. UI components do not call an LLM or mutate shared world state directly.

```text
Next.js / React Three Fiber clients
        |
        | WebSocket commands, snapshots, and events
        v
Authoritative expedition room
  |- players and role reservations
  |- actors and control leases
  |- interaction sessions
  |- shared clock, weather, and world consequences
  |- pose cadence, coarse bounds, and zone interest management
  `- bounded semantic event log
        |
        +--> asynchronous AI gateway (only for AI-controlled responses)
        |
        `--> optional snapshot/event persistence
```

The room is authoritative over rules and outcomes. Clients retain prediction
and presentation responsibility so that controls remain responsive and the
server does not need to render Three.js or run the full browser scene.

## Non-Goals For The First Multiplayer Release

- Synchronizing decorative vegetation, particles, water, ambient audio, or
  every background animal.
- Server-side rendering or full server-side Rapier simulation.
- Hard physical collision between remote players.
- Peer-to-peer hosting.
- Built-in voice chat. Voice can be added later through a separate WebRTC/SFU
  service without changing the interaction protocol.
- Supporting every wildlife asset as a player character immediately.
- Treating arbitrary dialogue text as an authoritative gameplay command.
- Requiring multiplayer in order to play `/three`.

## Current Runtime Seams

The current code already provides useful starting points:

- `three-game/playable/playableModes.js` separates playable asset, controller
  profile, toolbar, camera, and abilities for Darwin, finch, and tortoise.
- `three-game/store.js` owns the current local expedition and scene state.
- `threeRuntimeState` in `three-game/store.js` is the hot-path local pose and
  motion mirror.
- `PlayerController.jsx` publishes a local pose while retaining responsive
  client-side movement and collision.
- `ActiveZoneContent.jsx` mounts only the client's current region.
- `SymsCovington.jsx` and `AnimalModeDarwinNpc.jsx` are locally simulated NPCs.
- `SpecimenActor.jsx` and the wildlife catalog already give fauna stable actor
  concepts, behavior profiles, and runtime poses.

The primary seams that need abstraction are:

- `openNpcEncounter` and `submitNpcEncounter` in `three-game/store.js` currently
  create a local conversation and call `/api/three-encounter` directly.
- `openExamine` and `sendExamineMessage` in `three-game/store.js` currently
  create a local examination and call `/api/three-examine` directly.
- `setPlayableMode` assumes one local player and one locally hidden animal
  specimen actor.
- Syms and animal-mode Darwin movement are browser-local, so multiple clients
  would currently simulate conflicting copies.
- Zone, time, weather, specimen collection, traps, moved props, and damage are
  currently owned by a single browser store.

Do not synchronize the entire Zustand store. Split state by ownership and move
only shared, consequential state behind explicit commands.

## Deployment Topology And Operational Ownership

Multiplayer requires a second deployment target. The existing Next.js frontend
can remain on Vercel, but an ordinary Vercel Function cannot own a long-lived,
stateful WebSocket room. The initial production topology is therefore:

```text
Browser
  |- https://game.example     -> Vercel / Next.js shell and APIs
  |- wss://realtime.example   -> Cloudflare Worker + Durable Objects
  `- https://assets.example   -> Cloudflare R2 through a cached custom domain

Durable Object room
  `- signed HTTPS request     -> Vercel AI endpoint when an AI provider is used
```

Use a TypeScript Cloudflare Worker with one Durable Object instance per active
expedition room. Use a small separate admission Durable Object to enforce the
deployment-wide player ceiling atomically across rooms. Do not add Colyseus in
the first implementation: Durable Objects supply room affinity and serialized
state access, while the versioned command, event, snapshot, and delta protocol
in this document remains the sole replication layer. Do not combine
`@colyseus/schema` synchronization with a second custom snapshot stream.

This choice adds a Cloudflare account/project, a realtime domain, and an asset
domain alongside the existing Vercel project. Keep the infrastructure
agent-maintainable by committing Worker configuration, migrations, binding
names, and deploy/check scripts. A human owner must initially create/link the
accounts, authorize the CLIs or GitHub integrations, configure DNS, and install
production secrets. After that, routine code, tests, and deployments should be
possible through the Vercel and Wrangler CLIs without manual dashboard edits.

Deployment boundaries must include:

- Explicit allowed browser origins on the Worker and R2 asset CORS policy.
- WebSocket `Origin` checks plus a short-lived, signed admission token; a room
  code is discovery, not authentication.
- A service-to-service signature on Durable Object calls to Vercel AI routes.
- Separate preview and production Durable Object namespaces and R2 buckets.
- Secrets stored in deployment secret stores, never `NEXT_PUBLIC_*` variables.
- Health/version endpoints so the client can reject an incompatible protocol
  before loading the 3D runtime.

A room can remain memory-first while occupied and periodically write a compact
snapshot plus selected semantic events. Redis, a managed database, and a
distributed matchmaking service are unnecessary for the first capped release.
Durable Object storage is sufficient until retention or classroom reporting
requires a separate durable data model.

Existing Next API routes may remain the local single-player AI provider and can
be adapted into signed server-to-server AI endpoints. The room must never await
an AI response inside its authoritative command transaction.

## Capacity, Admission, And Viral-Load Containment

The player cap must bound the whole deployment, not merely each room. Initial
production defaults are:

| Limit | Initial value | Behavior at the limit |
| --- | ---: | --- |
| Active player seats, all rooms combined | 30 | Reject new reservations before game load |
| Normal room capacity | 20 | Direct the player to another room if global capacity remains |
| Absolute room capacity | 30 | Never exceed, including instructor-created rooms |
| Temporary reservation lifetime | 60 seconds | Release the seat if the game socket does not connect |
| Reconnect grace | 60 seconds | Reserve the actor role, bounded by the global seat count |
| Pose publish target / accepted ceiling | 10 Hz / 15 Hz | Coalesce or drop excess samples |
| Persistent waiting-room sockets | 0 | Return a lightweight full response with retry guidance |

Spectators are not free seats in the first public version. If added later, give
them a separate, small deployment-wide cap and a lower-frequency read-only
stream. A disconnected socket and its replacement may overlap briefly during
handoff, but only one active control lease may publish for a seat.

Admission must happen before dynamically importing the Three.js runtime or
requesting GLBs, textures, and audio:

```text
small landing/admission shell
  -> request short-lived seat reservation
     -> full: render small status page; Retry-After with 30–60 s jitter
     -> admitted: receive signed token, then load game and open WebSocket
```

Do not maintain an unbounded WebSocket queue for rejected visitors. Cache or
coalesce the `full` result for a few seconds during a spike, use exponential
backoff with jitter, and stop retrying when the page is hidden. The rejection
page must remain useful: explain the cap, show when to retry, and offer the
single-player route without downloading multiplayer world assets.

Set a compressed transfer budget of at most 500 KB for the landing/admission
shell and a measured target of at most 100 MB for a newly admitted player's
normal first session. As of 2026-07-22, `public/assets` is approximately 749 MB
on disk, so the runtime must continue to load only needed assets rather than
making the whole directory part of entry. Record actual cold-cache transfer in
release checks; repository size is not a substitute for browser measurement.

Serve large immutable models, textures, and audio from R2 through a production
custom domain with long-lived content-hashed caching. Never use the rate-limited
`r2.dev` URL as the production asset origin. Keep the lightweight Next.js shell
on Vercel so rejected traffic cannot create large Vercel data-transfer charges.

Provide application-level operational switches that can change without a game
client rebuild:

- Close new multiplayer admissions while allowing occupied rooms to continue.
- Reduce the global seat cap and pose-rate ceiling.
- Disable AI generation and fall back to scripted/evidence-only responses.
- Disable room creation while keeping joins to known classroom rooms available.
- End expired public rooms and reject incompatible protocol versions.

The safe degradation order is AI off, new public rooms off, new admissions off,
then orderly room shutdown. A cost or traffic spike must not corrupt active room
state or silently substitute AI for a human-controlled actor.

## Cost Envelope And Budget Guardrails

The following is a planning model dated 2026-07-22, not a price guarantee.
Recheck provider pricing before implementation and before a public launch.
Prices below assume one shared active room, 30 occupied seats, and seven days
(604,800 seconds) of continuous play.

### Realtime transport

At the 10 Hz pose target:

```text
30 players * 10 messages/s * 604,800 s = 181,440,000 incoming messages
181,440,000 / 20 WebSocket billing ratio = 9,072,000 billed requests
(9.072M - 1M included) * $0.15/M = about $1.21 request overage
```

One continuously active Durable Object at the documented 128 MB allocation uses
75,600 GB-seconds for the week, below the Workers Paid monthly included amount.
With the $5 monthly minimum, budget approximately **$6–8** for realtime room
traffic at 10–15 Hz. This estimate changes if seats are spread across many
simultaneously hot room objects, message rates are not bounded, or Cloudflare
changes its pricing. Outbound WebSocket messages are currently not billed as
requests. See [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

The free Workers allowance is not suitable for the continuous-week scenario:
at 10 Hz the 30 clients produce about 54,000 billable requests per hour, using a
100,000-request daily allowance in under two hours. Conversely, even the
pathological global-cap case of one continuously hot room object per player
would add only about $23 of duration overage at current rates, putting realtime
near $30 rather than hundreds. Packing a class into one room remains better for
gameplay, state coherence, and headroom.

### Frontend and assets

Budget the current Vercel Pro monthly minimum of **$20** for a public launch;
do not rely on the Hobby plan's hard limits for a front-page event. At the
current published allowances, Pro includes 1 TB of monthly Fast Data Transfer
and additional transfer begins at $0.15/GB. See
[Vercel pricing](https://vercel.com/pricing).

R2 currently includes 10 GB-month of Standard storage, 10 million Class B reads
per month, and free internet egress. The current asset directory fits under the
storage allowance, so cached asset delivery should normally be **$0 or close to
it** at this scale. Recheck operation counts and storage after an asset audit.
See [R2 pricing](https://developers.cloudflare.com/r2/pricing/) and
[R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).

Admission order is the main cost control. Fifty thousand rejected visitors at
the 500 KB shell budget transfer about 25 GB. If those same visitors load 100 MB
before rejection, they transfer about 5 TB; on the current Vercel Pro allowance
and overage rate, the excess alone is approximately **$600**. The 30-player cap
does not protect bandwidth unless it is checked before heavy imports.

### AI generation

Use human or scripted controllers without an LLM whenever possible. Initial AI
guardrails are:

- Five generated responses per minute sustained per room, burst of ten.
- Fifteen generated responses per minute across the deployment as a hard
  traffic ceiling, independent of player session IDs.
- One player-triggered generation per 30 seconds and one in-flight job per
  interaction.
- Maximum provider input/output token budgets attached to every job.
- A **$50 rolling seven-day AI circuit breaker** for the initial public launch.
- Scripted conversation, deterministic evidence, or an explicit unavailable
  response after a rate, provider, or dollar limit is reached.

For scale, assuming 1,500 input and 200 output tokens per response, 5 calls per
minute continuously is 50,400 calls in the week. At prices published on
2026-07-22, that is approximately **$12** with Gemini 2.5 Flash-Lite or **$28**
with GPT-5.4 nano. Treat these as comparison figures only; prompts, caching, and
models will change. See [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
and [GPT-5.4 nano pricing](https://developers.openai.com/api/docs/models/gpt-5.4-nano).

### Launch budget

With admission before asset loading, R2 asset delivery, 30 continuously occupied
seats, and the 5-per-minute AI target, the expected seven-day spend is roughly:

| Component | Planning amount |
| --- | ---: |
| Vercel Pro | $20 |
| Worker and Durable Objects | $6–8 |
| R2 assets | $0 or near $0 |
| Moderate AI generation | $12–28 |
| **Expected total** | **about $38–56** |

Set provider billing alerts at approximately $25, $50, and $75 and an
application-level public-launch ceiling of **$100**. Provider budget alerts are
observability, not authority; enforce seat, rate, token, and AI-dollar limits in
application state. A mildly viral landing-page spike should produce cheap
rejections and leave the 30 admitted players stable rather than turning excess
interest into room load or multi-terabyte game downloads.

## Actor Model

An actor is the stable identity addressed by movement, observation,
conversation, procedures, and world events.

```ts
type ActorKind = 'human' | 'animal' | 'specimen' | 'npc';
type ControlType = 'human' | 'ai' | 'scripted' | 'uncontrolled';

interface ActorState {
  actorId: string;
  kind: ActorKind;
  roleId?: string;
  typeId?: string;
  speciesId?: string;
  zoneId: string;
  position: { x: number; y: number; z: number };
  yaw: number;
  velocity?: { x: number; y: number; z: number };
  actionState?: string;
  capabilities: string[];
  control: ControlLease;
}

interface ControlLease {
  type: ControlType;
  playerId?: string;
  acquiredAt: number;
  expiresAt?: number;
  fallbackPolicy: 'wait' | 'release-role' | 'ai-takeover' | 'scripted';
}
```

Actor identity must not change when its controller changes. If the Syms player
disconnects, the actor remains `syms`; only its control lease changes.

### Role Rules

- Darwin has one reservable room role.
- Syms has one reservable room role.
- Animal roles occupy the remaining room seats.
- Role claims are atomic server commands; the client cannot assign itself.
- A disconnected player's role remains reserved for a configurable grace
  period, initially 30–60 seconds.
- AI takeover must be visible to players and allowed by room policy. It must
  never silently impersonate a disconnected human.
- An instructor/spectator role may be added without a world actor.

### Animal Identity

Support both models in the protocol:

1. **Species role:** the room spawns a session actor with a species/controller
   profile. Multiple players may be finches. This is the recommended initial
   implementation.
2. **Actor possession:** a player takes control of a particular authored
   specimen actor. Its occupied state must be replicated so every client hides
   the original autonomous actor and renders the controlled actor instead.

Do not make initial multiplayer depend on possessing authored specimen spawns.
Species roles avoid conflicts with collection state and are easier to respawn.

## State Ownership

| State | Owner | Replication/persistence |
| --- | --- | --- |
| Input, camera, audio, graphics, typing draft | Local client | None |
| Local predicted pose | Local client, corrected by room | Sent at bounded rate |
| Remote pose, velocity, action/animation | Room | Replicated to interested clients |
| Role and control lease | Room | Reliable and included in snapshots |
| Current zone per actor | Room | Reliable |
| Room clock and weather seed/state | Room | Snapshot plus sparse changes |
| Collected actor IDs and specimen outcomes | Room | Reliable, optionally persisted |
| Traps, shared droppings/traces, broken/moved props | Room | Reliable, zone-scoped |
| Decorative ecology and particles | Local client | None |
| Personal camera/UI settings | Local client | Browser persistence only |
| Personal notebook drafts | Player/private store | Persist privately if desired |
| Shared expedition log | Room | Bounded log, optionally persisted |
| Conversation transcript | Interaction session | Retention controlled by room policy |

Use an authoritative mutable room snapshot plus an append-only audit/event log.
Do not require full event sourcing to reconstruct every frame. Persist semantic
events and periodic snapshots, not movement packets.

## Stable World Identity

Every shared or consequential world object must have the same durable ID on the
room and on every fresh client. This includes authored specimen actors, traps,
collectable items, breakable plants, damageable rocks, snares, and any movable
prop whose state can outlive one render frame.

Deterministic placement alone is insufficient if clients can only address a
rendered instance by array index or position. Define each deterministic layout
with a stable region seed and layout version, then derive IDs from stable
semantic inputs such as:

```text
<zoneId>:<layoutKind>:<layoutVersion>:<stableLocalKey>
```

The `stableLocalKey` may be an authored key or a deterministic generated index,
provided generation order is explicitly part of the versioned layout contract.
Never derive authoritative IDs from floating-point positions, React keys,
Three.js UUIDs, mount order, or a client's random-number state. If an algorithm
or authored ordering changes, increment its layout version and provide a
snapshot migration or deliberately expire incompatible rooms.

Phase 0 must inventory existing consequential actor and prop ID sources rather
than assuming that seeded scatter already provides identity. Add a determinism
test that creates two fresh layouts with the same region seed and asserts an
identical `ID -> type/position` map. Add a second test proving that a shared prop
event addresses the same instance in both layouts.

## Protocol

Shared protocol types belong in `game-core`, contain no React or Three.js
dependencies, and are imported by both client and room server.

```ts
interface ClientCommand<T = unknown> {
  commandId: string;
  roomId: string;
  playerId: string;
  actorId: string;
  sequence: number;
  kind: string;
  payload: T;
}

interface ServerEvent<T = unknown> {
  eventId: string;
  roomVersion: number;
  kind: string;
  audience: 'room' | 'zone' | 'participants' | 'player';
  causedByCommandId?: string;
  payload: T;
}
```

Protocol rules:

- Validate every command payload and message size at the room boundary.
- Treat command IDs as idempotency keys for consequential actions.
- Use server time and room sequence numbers for resolution.
- Never trust client-provided distance, role, inventory, or outcome claims.
- Movement samples can be coalesced; actions and interaction transitions must
  be reliable and ordered.
- Version protocol messages explicitly before public deployment.
- A reconnect receives the latest snapshot followed by events after its
  snapshot version.

The custom protocol is also the replication mechanism. Durable Object room
state is encoded into explicit full snapshots for join/reconnect and bounded
zone-scoped deltas/events during play. There is no parallel schema-sync layer.
Reliable semantic events advance `roomVersion`; high-frequency coalesced pose
samples may use their own per-actor sequence and need not enter the audit log.

### Initial Command Families

- `room.claimRole`, `room.releaseRole`, `room.ready`
- `actor.move`, `actor.enterZone`, `actor.performAction`
- `interaction.request`, `interaction.accept`, `interaction.decline`
- `interaction.message`, `interaction.react`, `interaction.cancel`
- `world.collectSpecimen`, `world.documentSpecimen`
- `world.placeSnare`, `world.checkSnare`, `world.releaseAnimal`
- `world.transferItem`, `world.moveProp`, `world.breakProp`
- `journal.publishObservation` for an explicitly shared field record

Text does not mutate inventory, movement, following, collection, or trust.
Gameplay changes require a structured command even if dialogue inspired them.

## Interaction Sessions

```ts
type InteractionKind =
  | 'conversation'
  | 'observation'
  | 'procedure'
  | 'transfer'
  | 'capture'
  | 'cooperative-task';

type InteractionPhase =
  | 'requested'
  | 'accepted'
  | 'active'
  | 'awaiting-response'
  | 'resolved'
  | 'declined'
  | 'cancelled'
  | 'expired';

interface InteractionSession {
  interactionId: string;
  kind: InteractionKind;
  initiatorActorId: string;
  targetActorId: string;
  participantActorIds: string[];
  phase: InteractionPhase;
  controllerSnapshot: Record<string, ControlLease>;
  contextSnapshot: Record<string, unknown>;
  turns?: InteractionTurn[];
  outcome?: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}
```

The controller snapshot records who was responsible when the interaction
started. A later disconnect invokes an explicit fallback transition rather than
silently redirecting a pending human response to an LLM.

### Interaction Policies

| Interaction | Target acceptance | Concurrency | Authority |
| --- | --- | --- | --- |
| Passive observation | Usually none | Shared/read-only | Evidence resolver |
| Conversation | Required for a human | Normally exclusive per target | Participants/room |
| Sketching | None | Shared/read-only | Observer authors note |
| Measurement/handling | Required or contested by authored rule | Exclusive | Procedure resolver |
| Item transfer | Required | Exclusive and atomic | Room transaction |
| Cooperative task | Required | Definition-specific | Room transaction |
| Capture attempt | Governed by room policy, not a modal per attack | Exclusive during resolution | Tool/action resolver |

Passive observation must not lock or interrupt the animal player. Invasive
procedures should offer behavioral choices or allow the animal to move away.

### Locking

- Read-only observations can overlap.
- Social conversations may be exclusive for their target to prevent multiple
  simultaneous modal conversations.
- Procedures, transfers, capture resolution, and collection take an exclusive,
  expiring actor lock.
- Locks are owned by interaction ID and released on resolution, cancellation,
  timeout, zone departure, or disconnect policy.
- Never hold a lock while synchronously awaiting an LLM response.

## Controller Providers

Interaction routing should use providers behind one gateway:

```ts
interface InteractionControllerProvider {
  begin(session: InteractionSession): void;
  receiveTurn(session: InteractionSession, turn: InteractionTurn): void;
  cancel(session: InteractionSession, reason: string): void;
}
```

The interface is event-driven. Providers eventually submit a response command;
the room loop does not await a provider call.

### Human Provider

- Sends an interaction request or turn to the controlling player's client.
- Accepts only responses from that player's active control lease.
- Provides bounded response time and explicit decline/cancel behavior.
- May offer private historical role guidance, suggested replies, or action
  choices, but never substitutes text without the player's action.

### AI Provider

- Creates an asynchronous AI job containing an immutable context snapshot and
  request ID.
- Sends the result back to the room as a provider response.
- The room verifies that the session and request are still current before
  applying it.
- AI output is presentation or proposed structured data; deterministic room
  validation still controls state changes.
- Existing `/api/three-encounter` and `/api/three-examine` behavior can back the
  first local AI provider.

### Scripted Provider

- Supplies deterministic openers, fallback responses, and authored behavior.
- Keeps single-player and multiplayer functional when an LLM is unavailable.
- Handles fixed feedback that does not benefit from generation.

## Human Darwin And Human Syms

Expected conversation flow:

1. Darwin enters Syms's interaction radius.
2. The client displays `E - Speak with Syms` based on replicated actor data.
3. Darwin sends `interaction.request` with kind `conversation`.
4. The room validates control, zone, distance, availability, and rate limits.
5. Human Syms receives `Darwin wants to speak` with accept/decline controls.
6. Acceptance opens the same canonical session for both players.
7. Messages are relayed through the room and appended to the bounded transcript.
8. Walking away, changing zones, closing the panel, or timeout ends the session.

When Syms is human-controlled:

- The LLM must not speak as Syms.
- `SymsCovington.jsx` must not mount a competing local NPC actor.
- Existing follow/wait/range directives apply only to AI/scripted Syms.
- A human Syms follows, waits, travels, or assists through ordinary controls and
  structured cooperative actions.
- Trust should not be assigned by an LLM scoring human conversation. Social or
  assessment consequences should derive from explicit actions and authored
  rules.

Optional private Syms assistance may provide:

- A short role and historical knowledge brief.
- Recent expedition/specimen context.
- Suggested period-appropriate replies.
- Reminders about labels, containers, supplies, and field tasks.

Suggested text is never sent automatically and is not visible to Darwin until
the Syms player chooses to send it.

## Observation Of Human-Played Animals

Do not ask the animal player to retrospectively write what the animal did. That
would interrupt embodied play and permit prose to contradict visible behavior.

Instead, maintain a bounded semantic behavior stream per consequential actor:

```ts
interface SemanticBehaviorEvent {
  eventId: string;
  actorId: string;
  zoneId: string;
  type:
    | 'fed'
    | 'drank'
    | 'rested'
    | 'perched'
    | 'took-flight'
    | 'landed'
    | 'fled-from'
    | 'approached'
    | 'entered-water'
    | 'left-trace'
    | 'reacted';
  at: number;
  position: { x: number; y: number; z: number };
  data: Record<string, unknown>;
}
```

Keep approximately 30–60 seconds of bounded semantic evidence per actor. Do not
store every transform as an enduring event. Generate semantic events from
validated actions and server-observed thresholds.

Expected observation flow:

1. Darwin selects a remote animal actor in observation mode.
2. The room validates zone, range, and broad facing/visibility constraints.
3. It opens a read-only observation session and records an evidence window.
4. The animal continues playing without a modal interruption.
5. Darwin may watch silently or ask a field-inquiry question.
6. A deterministic evidence resolver selects relevant observed events and known
   subject facts.
7. An LLM may phrase the evidence as concise naturalistic observation, but may
   not introduce behavior absent from the evidence.
8. Darwin chooses which facts to save and writes the field note personally.

Example:

```text
Evidence
- finch fed twice on dry seeds
- Darwin approached within 1.4 m
- finch moved away, then took flight to an opuntia perch

Permitted presentation
"It picks repeatedly at dry seeds between the stones. When you close the
distance, it retreats and then takes flight to the cactus."
```

If the evidence does not answer a question, return uncertainty rather than
inventing an action. The observation window should remain usable after the
animal leaves so Darwin can finish writing without holding the target in place.

The instructor may choose whether animal players see a subtle `being observed`
indicator. Observation telemetry and transcript retention must be disclosed in
the room setup.

## Procedures And Animal Reactions

Questions such as `what color is it?` can resolve from visible evidence without
interrupting the subject. Attempts such as `measure its shell`, `touch it`, or
`offer it food` become structured procedure interactions.

Example reaction prompt:

```text
Darwin approaches with a pocket rule.

[Remain still] [Withdraw] [Turn away] [Walk off]
```

The animal chooses behavior, not narrative prose. The choice produces a real
action/animation that the room records and the other clients render. The
procedure resolver combines:

- The selected procedure and period tool.
- Actor capabilities and species data.
- Current pose, range, terrain, and movement.
- The animal's response or actual departure.
- Known measurement uncertainty.

If the animal moves out of range, the interaction expires naturally. A future
freeform animal-intent field may map text into allowed actions, but prose must
never directly establish physical facts.

## Capture, Collection, And Player Continuity

Before enabling capture of human-played animals, define a room-level policy:

- Observation only.
- Handling and release.
- Nonlethal capture.
- Historical collection with immediate role reassignment.
- Human-player animals cannot be captured.

Do not ask for an out-of-character consent modal on every capture attempt. The
session policy sets the permitted mode up front; in-world actions then resolve
according to gameplay rules.

A captured animal player must not be removed from the lesson. Supported outcomes
should include:

- Release after observation or measurement.
- Respawn as another individual of the same species.
- Select a different available animal role.
- Enter a short captured/specimen perspective before reassignment.

Capture resolution must be atomic. The room checks tool, range, actor state,
cooldowns, and policy, then commits one outcome. Duplicate or delayed commands
must not collect the same actor twice.

## Movement And Remote Presentation

Retain local prediction in `PlayerController`:

1. Apply local controls immediately.
2. Publish bounded input/pose samples at a target 10 Hz, with a hard accepted
   ceiling initially no higher than 15 Hz.
3. Validate message cadence, finite values, coarse zone bounds, route-graph
   transition legality, and action constraints in the room. Clamp untrusted
   reported motion metadata, but do not reject displacement by trying to mirror
   the client controller.
4. Broadcast authoritative/coalesced snapshots to interested clients.
5. Interpolate remote actors with an initial 100–150 ms buffer.
6. Smooth small local corrections and snap only when divergence is unsafe.

Do not validate exact terrain height on the room server. Current movement uses
authored render height, movement height, and collider surfaces that are close
but not identical; reproducing browser Rapier and terrain contact semantics in a
headless room would create a second physics implementation. For a capped room
whose threat model is accidental drift or a curious student, coarse kinematic
checks are the intended authority boundary. The client owns terrain grounding,
step resolution, water contact, and fine obstacle collision. The room may later
add coarse forbidden volumes or transition gates when a gameplay rule needs
them, but server-side terrain agreement is not a prerequisite and may remain a
non-goal permanently.

Do not transmit bones or per-frame animation poses. Replicate velocity,
grounded/flight state, facing, and semantic action ID; remote models derive
animation locally.

Initially disable hard player-player collision. Interactions use proximity
checks, while avatars pass or softly separate visually. Revisit networked body
collision only if it becomes a meaningful mechanic.

## Zones And Interest Management

Each client continues to mount only its own active region. The room tracks each
actor's `zoneId` independently.

- Full remote actor snapshots go only to clients in the same zone.
- The roster may expose coarse presence such as `Darwin - Post Office Bay` for
  other zones.
- Zone-scoped world state loads on entry and can unload locally on departure.
- The room validates travel against the canonical route graph.
- Travel loading remains local and does not pause the room.
- Shared clock and weather continue while any one client is loading or using a
  modal.

No multiplayer interaction may pause the global room. Conversation and examine
UI must become non-pausing overlays. A delicate procedure may lock movement for
its participants, but other players and the world continue.

## Consequential Fauna Versus Ambient Ecology

- Human-played animals are room actors.
- Collectable, documentable, trapped, injured, or otherwise consequential
  specimen actors must eventually have room-authoritative semantic state.
- Decorative or distant ambient fauna may remain client-local.
- Ambient fauna promoted into an interaction becomes a stable room actor before
  a consequential result is allowed.
- Existing distance-tier rendering and animation LOD remain client concerns.

Do not network every ecology prop or wildlife animation just because multiplayer
exists.

## LLM Boundary

LLMs may:

- Speak for an AI-controlled historical actor.
- Suggest private replies to a human role player.
- Phrase canonical observation evidence naturally.
- Summarize a completed interaction or expedition log.
- Admit uncertainty when evidence is insufficient.

LLMs may not:

- Speak for a connected human-controlled actor.
- Decide whether a role is available.
- Commit collection, transfer, damage, capture, travel, or inventory changes.
- Invent behavior for a human-played animal when behavioral evidence exists.
- Interpret conversation text as an automatic world mutation.
- Block the room simulation while generating.

All AI jobs require room/session identity, idempotency keys, timeouts, rate
limits, and stale-result rejection. API keys remain server-side.

## Client UI

### Lobby

- Create/join room with short code.
- Player count and room capacity.
- Role cards with available, reserved, occupied, and reconnecting states.
- Ready state and room policy summary.
- Animal species selection and capability preview.
- Instructor/spectator controls when authorized.

### In-Game Presence

- Compact roster with role, zone, and connection status.
- Subtle same-zone nameplates or role markers.
- Reconnection and control-transfer notices.
- Optional latency indicator in diagnostics, not normal HUD clutter.

### Interaction UI

- `E - Speak with Syms` becomes a server request for a human target.
- Incoming conversation requests are small and non-blocking until accepted.
- Both participants see the same canonical conversation session.
- Observation does not open a modal on the animal player's screen.
- Procedure reactions use a compact accessible action strip with keyboard and
  touch bindings.
- Timeouts, walking away, and disconnects produce clear in-world outcomes.

### Instructor Controls

- Start, pause session clock, lock/unlock joining, and end session.
- View and reassign abandoned roles.
- Remove a participant.
- Configure capture/collection and observation-notification policy.
- Export the shared expedition record when enabled.

Instructor pause is a room-level command. An individual player's modal is not.

## Suggested Repository Layout

Names are provisional, but ownership boundaries should remain:

```text
game-core/
  multiplayer/
    protocol.ts              # versioned command/event envelopes
    roomState.ts             # serializable shared state types
    validation.ts            # pure payload and transition validation
  actors/
    actorTypes.ts
    controlLeases.ts
    capabilities.ts
  interactions/
    interactionTypes.ts
    interactionPolicies.ts
    interactionReducer.ts
    observationEvidence.ts
    procedureResolver.ts

three-game/
  multiplayer/
    MultiplayerClient.ts
    interactionGateway.ts
    remoteActorRuntime.js     # hot-path interpolation, outside React state
    roomStore.js              # low-frequency replicated/UI state
  components/world/
    RemotePlayerActors.jsx
    RemoteActor.jsx
  ui/multiplayer/
    MultiplayerLobby.jsx
    Roster.jsx
    IncomingInteraction.jsx
    HumanConversation.jsx
    ProcedureReaction.jsx

multiplayer-worker/
  wrangler.jsonc
  src/
    durable-objects/
      AdmissionCoordinator.ts
      ExpeditionRoom.ts
    state/
    commands/
    interactions/
    providers/
      HumanProvider.ts
      AiProvider.ts
      ScriptedProvider.ts
    persistence/
```

Keep hot-path remote transforms in mutable runtime structures similar to
`threeRuntimeState`; do not drive 29 remote actors through high-frequency
Zustand/React updates.

## Single-Player Compatibility

Introduce an `interactionGateway` before implementing network UI:

```ts
interface InteractionGateway {
  request(input: InteractionRequest): Promise<InteractionHandle>;
  sendTurn(interactionId: string, input: InteractionTurnInput): void;
  react(interactionId: string, reaction: InteractionReaction): void;
  cancel(interactionId: string): void;
}
```

- `LocalInteractionGateway` preserves existing single-player scripted/LLM
  behavior.
- `RoomInteractionGateway` sends commands to the expedition room.
- UI reads normalized interaction state and does not know which gateway or
  controller provider supplied it.

Refactor `openNpcEncounter`, `submitNpcEncounter`, `openExamine`, and
`sendExamineMessage` to use the gateway before changing their presentation.
The first refactor milestone should produce no player-visible behavior change.

## Progressive Delivery Plan

### Implementation status (2026-07-22)

The first playable vertical slice is implemented, but the full Phase 1 scope
below is not complete. The current slice supports one human Darwin and one human
tortoise in Post Office Bay, pre-runtime admission, short room codes, global
30-seat admission, role leases/reconnects, 10 Hz pose replication, interpolated
remote avatars, occupied-source-actor hiding, and target-only authored tortoise
behavior communication. It has pure room tests, a live two-socket test, and a
two-browser WebGL smoke test. See `docs/multiplayer-runbook.md`.

Syms, finch, multi-zone travel, shared props, persistence, and human/AI
interaction-session handoff remain later work.

### Phase 0: Domain Foundation And Local Adapter

Deliverables:

- Stable actor IDs and actor descriptors for Darwin, Syms, player animals, and
  consequential specimens.
- Stable ID contracts for shared generated props, including region seed and
  versioned layout identity.
- Versioned shared protocol and interaction types in `game-core`.
- Pure interaction reducer/state machine with timeouts and lock rules.
- `LocalInteractionGateway` wrapping the current encounter and examine calls.
- Existing single-player NPC and examination UI migrated to normalized sessions.

Acceptance:

- `/three` single-player behavior remains functionally unchanged.
- Existing encounter, examination, collection, and animal-mode smoke paths pass.
- Interaction transition and idempotency unit tests exist.
- Two fresh clients generate identical ID-to-position maps for each shared
  deterministic layout placed in multiplayer scope.
- No networking dependency is required for single-player.

### Phase 1: Room, Lobby, Roles, And Presence

Deliverables:

- Cloudflare Worker/Durable Object room service and WebSocket client.
- Committed Wrangler configuration, environment bindings, protocol health
  endpoint, and documented Vercel/Cloudflare deployment boundary.
- Admission coordinator, deployment-wide 30-seat cap, signed 60-second
  reservations, and admission before 3D runtime import.
- Create/join room, short codes, room caps, and role reservations.
- Darwin, Syms, finch, and tortoise session actors.
- Remote avatar rendering, interpolation, and same-zone interest filtering.
- Reconnect grace period and explicit role release.
- Single fixed-region multiplayer test before enabling travel.

Acceptance:

- Darwin and Syms cannot be claimed twice under concurrent requests.
- Concurrent claims across different rooms never exceed the global seat cap.
- A rejected browser renders the full/retry state without opening a room socket
  or requesting models, textures, and audio.
- 30 simulated clients can join, move, disconnect, and reconnect without room
  inconsistency.
- Local controls remain responsive under representative latency.
- Remote players do not drive high-frequency React rerenders.

### Phase 2: Zone Travel And Shared Room State

Deliverables:

- Independent actor zone transitions validated against the route graph.
- Zone-scoped interest subscriptions and late-join snapshots.
- Shared room clock and weather.
- Initial shared consequential state: collected actors, traps, and selected
  moved/broken props.

Acceptance:

- Players in different zones do not receive unnecessary transform traffic.
- Returning to a zone reconstructs its shared consequences consistently.
- One player's travel or loading state never pauses the room or other clients.
- Two fresh clients apply a moved/broken prop event to the same stable object.

### Phase 2.5: Non-Pausing Interaction Presentation

This phase intentionally contains the player-visible behavior change that Phase
0 excludes. Complete it before human conversation or observation work begins.

Deliverables:

- Convert encounter and examine surfaces into live, non-pausing overlays for
  multiplayer-capable play.
- Separate camera/input focus from simulation pause: an overlay may capture
  text input or temporarily constrain its participant without freezing the
  room, remote actors, weather, or shared clock.
- Define explicit participant movement rules for conversation, examination,
  and procedures rather than relying on the current global/local pause side
  effect.
- Preserve an intentional single-player pause policy only if it is expressed by
  `LocalInteractionGateway`; the UI component itself must not own world pause.
- Add accessible exit, timeout, focus restoration, and incoming-interaction
  behavior.

Acceptance:

- Opening examine or encounter UI does not suspend incoming room snapshots.
- A remote actor can move through the scene while a local overlay is open.
- Closing or timing out the overlay restores controls without a stuck key,
  pointer, camera, or interaction lock.
- Single-player pause behavior, if retained, is covered separately and does not
  leak into the room gateway.

### Phase 3: Human Syms Conversation

Deliverables:

- Human and AI controller providers.
- Conversation request/accept/decline/timeout flow.
- Canonical paired transcript and bounded message rate.
- Suppression of local Syms NPC when the actor has a human lease.
- Optional private Syms historical/contextual assistance.
- Clear disconnect and optional AI-takeover transition.

Acceptance:

- When Syms is human-controlled, no LLM call generates Syms's dialogue.
- Both participants see identical ordered turns.
- Text alone cannot change inventory, follow state, travel, or world state.
- Disconnect during a conversation releases locks and follows room policy.

### Phase 4: Human-Animal Observation

Deliverables:

- Semantic behavior events for movement modes and authored animal actions.
- Bounded per-actor evidence buffers.
- Remote player animals as observation-mode targets.
- Deterministic evidence selection and uncertainty handling.
- LLM presentation grounded exclusively in selected evidence.
- Personal Darwin field-note saving from the multiplayer session.

Acceptance:

- A finch that feeds and flies produces corresponding observation evidence.
- A finch that never feeds is not described as feeding.
- The animal player is not interrupted by passive observation.
- Multiple observers can watch without locking the animal.
- Observation remains usable after the subject leaves range.

### Phase 5: Procedures, Cooperation, And Transfers

Deliverables:

- Procedure definitions and capability checks.
- Animal reaction UI and animations/actions.
- Measurement, handling, offering food, assisting, and item transfer.
- Exclusive actor locks for invasive operations.
- Atomic shared inventory/supply changes.

Acceptance:

- Leaving range or declining cleanly expires a procedure.
- Duplicate transfer/measurement commands do not duplicate outcomes.
- The recorded fact matches the selected reaction and resolved world state.

### Phase 6: Capture, Collection, And Player Continuity

Deliverables:

- Room capture/collection policy.
- Authoritative contested capture resolution.
- Captured/released/collected actor state.
- Respawn, role reassignment, or captured-perspective continuation.
- Classroom-safe UI explaining the configured consequence model.

Acceptance:

- One actor cannot be collected twice.
- A captured student always has an immediate supported continuation path.
- Policy-disabled actions are rejected before changing shared state.

### Phase 7: Classroom, Public-Launch, And Persistence Hardening

Deliverables:

- Instructor controls and permissions.
- Snapshot persistence and join-in-progress recovery.
- Optional shared expedition export and assessment hooks.
- Transcript retention controls, moderation strategy, and disclosure.
- R2 asset origin with production custom domain, immutable caching, and tested
  CORS policy.
- Operational limits and switches from the capacity section, provider billing
  alerts, AI rolling-cost circuit breaker, and a public-launch runbook.
- Operational metrics, structured logs, deployment runbooks, and a repeatable
  cost worksheet populated from measured transfer/message/token rates.

Acceptance:

- A room can recover from a process restart within the documented persistence
  window.
- Exported records distinguish human text, AI text, scripted text, observed
  evidence, and authoritative outcomes.
- Session deletion/retention behavior is documented and testable.
- A synthetic 50,000-attempt admission spike never creates more than 30 active
  reservations and does not create persistent waiting sockets.
- The cold rejected path stays within the 500 KB transfer budget; admitted
  cold-cache and normal-session transfers are recorded against the 100 MB
  target.
- Disabling AI or admissions takes effect without a client rebuild and preserves
  active-room consistency.

## Testing Strategy

### Unit Tests

- Role claim races and lease expiry.
- Global seat reservation races, expiry, reconnect handoff, and cap changes.
- Command validation, authorization, and idempotency.
- Stable deterministic prop and actor ID maps across fresh layouts.
- Interaction state transitions and actor locks.
- Controller fallback transitions.
- Observation evidence selection and non-invention.
- Procedure and capture resolution.
- Zone route validation.

### Integration Tests

- Two clients complete a human Darwin/Syms conversation.
- Human Syms disconnects before accepting and while responding.
- Darwin observes a human finch performing known actions.
- Two observers inspect one animal concurrently.
- Procedure request resolves, declines, times out, and loses range.
- Two clients race to collect or transfer the same object.
- Join-in-progress receives current roles, actors, and zone consequences.

### Load And Network Tests

- 30 headless clients moving at the accepted rate and producing bounded actions.
- Cross-room admission bursts, full-response caching, reservation expiry, and
  proof that rejected clients do not fetch game assets.
- Latency, jitter, delayed packets, duplicate commands, and reconnects.
- Message-rate abuse and oversized text payloads.
- Slow AI response returning after cancellation or controller change.
- AI provider failure, room/deployment rate ceilings, token bounds, and rolling
  dollar-circuit behavior.
- Browser render cost for 29 remote avatars in one zone.
- R2 cache headers, asset CORS, versioned asset URLs, and unavailable-origin
  fallback behavior.

### Existing Project Verification

- General implementation: `npm run check`.
- Interaction/HUD changes: `npm run three:e2e:smoke`.
- Visual remote-avatar/UI changes: `npm run three:screenshot:fast` when useful.
- Broad readiness claims: `npm run build` plus multiplayer integration/load
  tests supplied by the room service.

## Security, Safety, And Privacy

- Use signed room/player identity; a short room code is discovery, not authority.
- Authorize every command against the active actor control lease.
- Rate-limit movement, interaction requests, and text separately.
- Bound transcript length, message size, and retained behavior history.
- Never expose LLM or infrastructure credentials to clients.
- Decide whether classroom conversations are stored before enabling export.
- Label human, AI, scripted, and generated-summary authorship in records.
- Provide instructor removal and room-lock controls.
- Prefer generated or instructor-approved display names for classroom sessions.

## Observability

Track at minimum:

- Active rooms, occupied/reserved seats, connected clients, joins, leaves,
  reconnects, rejected admissions, and reservation expiry.
- Room tick duration and outbound message rate.
- Incoming pose rate, coalesced/dropped samples, and billable-request estimate.
- Command rejection counts by reason.
- Interaction count, completion, timeout, and cancellation rate.
- AI job latency, failure, stale-result rejection, token use, and estimated cost
  by room and deployment.
- Landing-shell and admitted-session transfer sizes, asset-origin cache ratio,
  and estimated Vercel/R2 transfer.
- Snapshot persistence age and recovery failures.

Use IDs in logs, not full private conversation text by default.

## Decisions Required Before Each Later Phase

These are deliberately unresolved product decisions, not blockers for Phase 0:

1. Are animal species roles unlimited, capped per species, or tied to authored
   individual actors?
2. Can animal players see when passive observation begins?
3. Which room capture/collection policies ship, and which is the default?
4. What happens to an animal player's role after historical collection?
5. Are personal journals private, shared by choice, or visible to instructors?
6. Are human conversation transcripts retained, and for how long?
7. Does disconnected Darwin or Syms transfer to AI, reopen the role, or wait?
8. May players travel independently, or can an instructor require group travel?
9. Should human Syms receive LLM suggestions by default or only on request?
10. Which additional animal locomotion/controller families are required for the
    first classroom multiplayer session?

Record answers as explicit room-policy fields rather than scattering feature
flags through UI components.

## Rules For Future Agents

- Preserve the single-player path through the local interaction gateway.
- Keep protocol and interaction reducers pure and independent of React/Three.
- Do not synchronize the whole Zustand store.
- Do not let clients commit shared outcomes directly.
- Do not let dialogue text mutate world state without a structured command.
- Do not let an LLM speak for a connected human-controlled actor.
- Do not invent observed behavior when human-player evidence is available.
- Do not pause the room for one player's conversation, examination, or loading.
- Do not network decorative simulation without a demonstrated gameplay need.
- Use stable actor IDs, command IDs, interaction IDs, and room sequence numbers.
- Do not treat deterministic placement as stable identity; version and test the
  ID-to-position map of every shared generated layout.
- Do not add a second replication system alongside custom snapshots/deltas.
- Do not load the 3D runtime or large assets before a seat is reserved.
- Preserve global seat, message-rate, AI-rate/token/dollar, and rejected-shell
  budgets unless a reviewed cost model replaces them.
- Add tests for race conditions and disconnects with every consequential action.
- Update this document when protocol ownership or phase acceptance criteria
  materially change.

## First Implementation Task

The first coding task should be a behavior-preserving refactor, not a WebSocket
prototype:

1. Define actor, controller, interaction, command, and event types in
   `game-core`.
2. Inventory consequential generated layouts and define their stable
   seed/version/local-key ID contract plus determinism tests.
3. Implement and unit-test the pure interaction state machine.
4. Add `LocalInteractionGateway`.
5. Route current Syms encounter and examination store actions through it.
6. Verify that current single-player interactions remain unchanged.

This establishes the boundary needed for both human and AI providers and
prevents the later networking work from becoming a second parallel gameplay
implementation.
