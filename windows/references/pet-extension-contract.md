# Optional pet state extension

The Windows skin injector does not require a desktop pet. Pet integrations can
use `windows/scripts/` as a small arbitration layer, with three source modes:

- `dom`: no app-server dependency; suitable for selected-thread, running-marker,
  visible approval, and visible user-input behavior.
- `app-server`: structured event mode for custom pets that need detailed states
  such as `commandExecution`, `fileRead`, `fileChange`, `mcpToolCall`,
  `webSearch`, `plan`, `reasoning`, `completed`, `failed`, and `aborted`.
- `auto`: use app-server events when supplied, while retaining DOM as the
  fallback and as the authority for the selected-thread activity gate.

The intended adapter boundary is:

1. A Codex UI adapter reports the selected sidebar row, its conversation ID,
   and whether the row has the visible running marker.
2. An optional app-server adapter supplies JSON-RPC notifications to
   `createPetStateBridge().ingestAppServer(message)` or includes them in
   `sync({ appServerEvents })`.
3. `createPetStateBridge()` arbitrates both sources and emits normalized pet
   states to the pet package.

The selected row and its running marker are always the activity gate. A stale
task completion or an event belonging to another conversation cannot revive a
conversation that is not selected or no longer has the running marker. A
visible approval or user-input card takes precedence over a generic reasoning
event from app-server.

DOM alone cannot reliably reproduce every structured execution item. The
app-server mode is therefore intentionally preserved as an optional capability
for enhanced pets; it is not required by the core theme injector. The pet
package owns the app-server process/transport lifecycle and can fall back to
`dom` when that process is unavailable.

The core project intentionally does not bundle pet art or start a pet process.
A pet package can provide its own spritesheet, state map, renderer, and window
lifecycle while depending on this contract. This keeps optional desktop pet
behavior separate from theme injection while retaining the detailed event
source needed by advanced custom pets.
