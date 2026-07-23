# Multiplayer Vertical Slice Runbook

Status: playable local vertical slice, production deployment not yet linked
Implemented: 2026-07-22

## What Works

- One player creates a room as Darwin; a second joins as the tortoise.
- Admission happens before the Three.js runtime import.
- The Cloudflare Worker/Durable Object service enforces unique roles, a normal
  room cap of 20, and a deployment-wide ceiling of 30 reserved/active seats.
- Both clients publish poses at 10 Hz and render an interpolated remote avatar.
- The multiplayer tortoise and Darwin begin about 4.5 m apart in Post Office Bay.
- The tortoise can choose four authored visible behaviors. The first is “The
  tortoise looks at you curiously.” The room validates role, cooldown, zone, and
  planar range, triggers the tortoise animation for both clients, and shows the
  narrated observation only to Darwin.
- A disconnect retains the role for 60 seconds for reconnection.

This is deliberately narrower than the complete Phase 1 in
`docs/multiplayer-architecture-plan.md`. There is no Syms/finch role, travel,
shared prop state, persistence/export, human text chat, or LLM fallback yet.

## Local Play

Use two terminals from the repository root:

```bash
npm run dev
npm run multiplayer:dev
```

Open `/three` in two browsers or private profiles. On the first, choose
**Multiplayer Expedition**, create as Darwin, and copy the six-character room
code from the in-game panel. On the second, choose **Multiplayer Expedition**,
switch to **join**, select **Tortoise**, and enter the code.

Local pages on any `localhost` or `127.0.0.1` port automatically use
`http://127.0.0.1:8787`. Do not expose that local Worker as a public service.

## Verification

```bash
npm run multiplayer:test
npm run multiplayer:test:live
npm run multiplayer:test:browser
```

`multiplayer:test:live` expects `npm run multiplayer:dev` to be running.
`multiplayer:test:browser` expects both the Worker and a Next development server;
it reuses the repository's active Next server when available. It launches two
separate Chromium processes, creates/joins a room, confirms mutual presence,
activates **Look curiously**, checks Darwin's received text, and saves evidence
under `test-results/three-darwin/multiplayer-smoke/`.

Before a broad integration claim, also run:

```bash
npm run check
npm run build
npx wrangler deploy --dry-run --config multiplayer-worker/wrangler.jsonc
```

## Production Linking

Production requires both deployments; Vercel cannot own the stateful WebSocket
room itself.

1. Authenticate the Cloudflare CLI once with `npx wrangler login`.
2. Deploy the Worker with the exact Vercel browser origin allowed. Local origins
   remain allowed by code:

   ```bash
   npx wrangler deploy --config multiplayer-worker/wrangler.jsonc \
     --var ALLOWED_ORIGINS:https://your-game.example
   ```

3. Record the resulting HTTPS Worker URL and verify `<worker-url>/health`.
4. Set `NEXT_PUBLIC_MULTIPLAYER_URL` in the Vercel project to that HTTPS Worker
   URL for Production (and Preview only when its exact origins are also allowed).
5. Redeploy the Next.js app. The public variable is intentionally just the
   service URL; admission tokens remain per-session and are never build secrets.
6. Test from two unrelated browser profiles before sharing the link.

For a stable release, use a custom realtime domain and exact origin allowlist.
Do not add a wildcard Vercel preview origin. Use a separate preview Worker or
explicitly list only trusted preview URLs.

## Capacity And Cost Safety

The current hard deployment ceiling is 30 seats, including 60-second
reservations and reconnect leases. Pose input is accepted no faster than 15 Hz;
clients target 10 Hz. Requests over 4 KB and WebSocket messages over 4 KB are
rejected. Visitors who cannot reserve a seat remain in the lightweight launch
shell and do not import the 3D runtime.

These controls prevent room load from scaling with a viral landing-page spike,
but they do not replace provider billing alerts. The planning envelope and
seven-day continuous-load calculations live in
`docs/multiplayer-architecture-plan.md`. Recheck provider prices before public
launch.

## Operational Notes

- `game-core/multiplayer/protocol.js` owns protocol version, limits, role IDs,
  and shared validation helpers.
- `multiplayer-worker/src/roomState.js` contains pure room rules; keep these
  independently testable.
- `multiplayer-worker/src/index.js` owns HTTP/WebSocket routing and Durable
  Object persistence/hibernation.
- `three-game/multiplayer/MultiplayerClient.js` owns client connection,
  reconnection, snapshots, and semantic events.
- `three-game/multiplayer/MultiplayerContext.jsx` is the runtime bridge for pose
  publication without high-frequency React state updates.
- Add protocol fields compatibly or increment `MULTIPLAYER_PROTOCOL_VERSION`.
- Do not add arbitrary animal prose as the next shortcut. Extend the authored
  intent vocabulary first; later free text needs moderation, rate limits,
  accessibility treatment, and a clear distinction from observed evidence.
