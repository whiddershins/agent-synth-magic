# Agent control API

The running browser exposes `window.synth`. It controls the same patch state as the visible controls. It does not connect to a model or send audio anywhere.

```ts
const description = window.synth.describe();
const before = window.synth.readPatch();

const after = await window.synth.applyChanges(
  { 'op2.level': 0.25, 'op2.ratio': 3 },
  before.revision,
);

const audition = await window.synth.render({ patch: after.patch });
// audition.samples: Float32Array, mono, not an encoded media file
// audition.sampleRate: 48000 by default
// audition.measurements: peak, rms, spectralCentroidHz, durationSeconds
// audition.patch and audition.score: exact rendering inputs

// Restore a previous candidate while checking for intervening edits.
await window.synth.replacePatch(before.patch, after.revision);
```

`applyChanges()` and `replacePatch()` require `expectedRevision`. Both reject stale revisions, unknown controls, missing values, invalid routing enums, non-finite numbers and out-of-range values. A mutation updates the patch store and, when audio is enabled, waits for the AudioWorklet to acknowledge it. With audio disabled, the patch becomes the next playback configuration. If the audio processor fails, its error is surfaced; a browser-side state update is not rolled back automatically.

`readPatch()` returns `{ revision, patch }`. A patch has this shape:

```ts
{
  schemaVersion: 2,
  name: 'My patch',
  parameters: {
    algorithm: 0,
    gain: 0.22,
    feedback: 0,
    // All 73 controls are required. Use describe() to enumerate them.
  }
}
```

Use `describe().parameters` to enumerate the complete 73-control schema. Its operator level units need particular care: a modulator's full level contributes 8 radians to downstream phase; a carrier's level affects audible amplitude. Ratio and detune are combined into an oscillator frequency multiplier.

## Custom auditions

```ts
const audition = await window.synth.render({
  patch: window.synth.readPatch().patch,
  sampleRate: 48000,
  score: {
    duration: 4,
    events: [
      { time: 0, type: 'on', note: 60, velocity: 0.8 },
      { time: 1.5, type: 'off', note: 60 },
    ],
  },
});
```

Times are seconds from the start of the render. Note-on velocity is a normalized number in [0, 1]. MIDI pitches are integers in [0, 127]. Events must occur before the clip ends. Scores are limited to 0.05–12 seconds, 256 events, and integer sample rates from 8,000 to 96,000 Hz. One audition can render at a time; a stalled worker is terminated after 30 seconds. Requests return PCM without playing it through speakers or changing the current patch.

`window.synth.stop()` releases live notes and stops audition playback. Note that it does not cancel a worker that is currently rendering an offline clip.

The default phrase plays C3, C4, G4 and a C-major chord with fixed velocities. It lasts five seconds. A patch with long envelopes may need a longer score to expose the whole release. When comparing candidates, keep the score and sample rate fixed and control audition loudness. Do not compare unrelated live performances as though only the patch had changed.

## Connect an external agent

Run the local instrument with `npm run dev` (port 5173), or build it and use
`npm run preview` (port 4173). Open the local instrument with `?agent=1` appended to its URL
(e.g. `http://127.0.0.1:5173/?agent=1`); the experimental panel is hidden by default.
Click **Connect agent**, then **Copy pairing
prompt**. Give that prompt to your existing coding agent. It includes this
command with the current session and one-use code:

```sh
npm run agent -- connect --url http://127.0.0.1:5173 --session SESSION --code CODE --name Codex
```

Approve the requested permissions in the instrument. Read, edit, render/download,
and speaker playback are separate permissions. Approving playback enables audio
within that click. A pairing code lasts five minutes; the resulting connection
lasts 30 minutes, or until you disconnect or close/reload the tab. A new code is
needed for each additional agent. **Disconnect** cancels the agent's pending
renders and stops its audition playback; it leaves the current patch available
for playing, saving, or Undo.

The CLI stores a Bearer credential in `.cache/agent/connection.json` with owner-only
permissions. It does not print that credential. Use `--connection PATH` on every
command to maintain multiple connections. This bridge only accepts loopback HTTP
and same-origin browser sessions. A static deployed frontend still works as an
instrument but does not host this local Node bridge.

```sh
npm run agent -- describe
npm run agent -- read
npm run agent -- edit '{"op2.level":0.12,"op2.ratio":2}' --expect 3 --name 'Soft flute'
npm run agent -- render --out .cache/agent/flute-a.wav
npm run agent -- play RENDER_ID
npm run agent -- stop
npm run agent -- replace .cache/agent/best-patch.json --expect 4
npm run agent -- status
npm run agent -- disconnect
```

`render` prints the render ID, exact patch and note sequence, source revision
(or null for an explicitly supplied candidate), sample rate, measurements, and
local WAV/JSON sidecar paths. Use `--patch FILE`, `--score FILE`, and `--rate 48000`
to control its inputs. Downloaded files remain on disk after disconnect; server
and browser audition caches expire after ten minutes and retain only the six
most recent renders per agent. `play` accepts one of that connection's render IDs.

For a generic operation: `npm run agent -- call OPERATION '{"argument":"value"}'`.
All calls get a unique request ID. Preserve it with `--request-id ID` when retrying
an uncertain result. An identical retry returns the retained outcome; a different
payload with the same ID fails. After a timeout, inspect the patch before making
a new edit: a patch update can complete before its acknowledgement is lost.

### HTTP protocol

All routes start with `/api/agent`. Agent credentials use
`Authorization: Bearer TOKEN`; never put them in URLs. JSON bodies are limited
to 128 KB. Every response is non-cacheable. Failures have HTTP error status and
`{ ok: false, error: { code, message } }`.

| Method and route | Purpose |
| --- | --- |
| `POST /sessions/:sessionId/pairings` | `{ code, name, scopes }` returns `{ pairingId, pollSecret, expiresAt }`. Consumes the code. |
| `GET /sessions/:sessionId/pairings/:pairingId` | Use the poll secret as Bearer. Returns pending/denied, or one-time `{ status: 'approved', token, agent, sessionId, protocol }`. |
| `POST /sessions/:sessionId/call` | `{ operation, args, requestId }` returns `{ ok: true, result }`. |
| `GET /sessions/:sessionId/audio/:renderId` | Authenticated mono PCM16 WAV, accessible only to its rendering connection. |
| `GET /sessions/:sessionId/status?after=SEQ` | Read permission: own grant plus recent patch/operation events after the sequence number. |
| `DELETE /sessions/:sessionId` | Revoke this agent connection. |

| Operation | Arguments | Permission |
| --- | --- | --- |
| `describe` | `{}` | `synth.read` |
| `read_patch` | `{}` | `synth.read` |
| `apply_changes` | `{ changes, expectedRevision, name? }`; name and parameters update atomically | `synth.write` |
| `replace_patch` | `{ patch, expectedRevision }` | `synth.write` |
| `render` | `{ patch?, score?, sampleRate? }` | `synth.render` |
| `play` | `{ renderId }` | `synth.play` |
| `stop` | `{}`; releases live notes and stops audition playback | `synth.play` |

Mutating operations (including render/play/stop) require a request ID of 8–100
letters, digits, underscores, or dashes. Connections retain up to 256 request
outcomes; pair again after reaching that limit. There are at most eight pending
operations per tab and a 35-second command deadline. Browser closure, expiration,
and revocation invalidate credentials and cancel outstanding work.

### Sound-design loop

Keep the user's description and constraints, original patch, and candidate
patches together. Discover controls, read the current revision, make a coherent
batch edit, and render a fixed score. Feed the **actual downloaded audio** to an
audio-capable model when available, compare against the description, and revise
with a bounded iteration budget. Preserve the best candidate and restore it with
a revision-checked replacement. Incorporate the user's listening feedback and
manual edits; never silently retry a stale patch revision.

The bridge does not call a model. A WAV download and its measured RMS/centroid
are evidence of sound generation and transport, not evidence that an agent heard
or judged it. Agents without audio ingestion must say so and use the user's
listening feedback. See [the user-story flow and acceptance checks](AGENT_INTEGRATION.md).

Schema-1 imports migrate to schema 2 with neutral extension defaults. New snapshots and exports always contain schema 2. See [the migration](PATCH_SCHEMA.md).
