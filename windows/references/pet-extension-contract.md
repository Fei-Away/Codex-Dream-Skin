# Optional pet state extension

The Windows skin injector does not require a desktop pet. Pet integrations can
use the small DOM-only state bridge in `windows/scripts/` without changing the
core theme injector or spawning an app-server process.

The intended adapter boundary is:

1. A Codex UI adapter reports the selected sidebar row, its conversation ID,
   and whether the row has the visible running marker.
2. `createPetStateBridge()` arbitrates the DOM snapshot and emits normalized pet
   states to the pet package.

The selected row and its running marker are the activity gate. A stale task
completion cannot revive a conversation that is not selected or no longer has
the running marker. Visible approval and user-input signals are interpreted
from the same selected Codex page.

The bridge intentionally does not include an app-server adapter. In this
contract, app-server flags only duplicated the approval and user-input states
already observable in the DOM, while adding process and lifecycle complexity.
If a future adapter can provide genuinely new pet states, it should be added
as a separate optional package with its own tests rather than coupling the
basic bridge to app-server.

The core project intentionally does not bundle pet art or start a pet process.
A pet package can provide its own spritesheet, state map, renderer, and window
lifecycle while depending on the bridge contract. This keeps optional desktop
pet behavior separate from theme injection and makes it possible to review or
remove independently.
