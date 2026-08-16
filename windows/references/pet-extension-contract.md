# Optional pet state extension

The Windows skin injector does not require a desktop pet. Pet integrations can
use the small state bridge in `windows/scripts/` without changing the core
theme injector or spawning an app-server process from the core path.

The intended adapter boundary is:

1. A Codex UI adapter reports the selected sidebar row, its conversation ID,
   and whether the row has the visible running marker.
2. An optional app-server adapter reports detailed active flags such as
   `waitingOnApproval` or `waitingOnUserInput`.
3. `createPetStateBridge()` arbitrates the snapshots and emits normalized pet
   states to the pet package.

The selected row and its running marker are the activity gate. A stale
app-server completion or approval event cannot revive a conversation that is
not selected or no longer has the running marker.

State source modes are:

- `auto`: use app-server details when available and fall back to DOM signals.
- `dom`: use only the selected-row and visible-UI signals; no app-server is
  required.
- `app-server`: require detailed app-server flags; callers should expose an
  explicit unavailable state rather than silently treating it as active.

The core project intentionally does not bundle pet art or start a pet process.
A pet package can provide its own spritesheet, state map, renderer, and window
lifecycle while depending on the bridge contract. This keeps optional desktop
pet behavior separate from theme injection and makes it possible to review or
remove independently.
