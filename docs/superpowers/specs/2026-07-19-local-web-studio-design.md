# Local Web Studio Design

Date: 2026-07-19
Status: Approved for planning
Scope: macOS local-only MVP

## Summary

Add a browser-based control panel for Codex Dream Skin Studio. A user double-clicks one launcher, which starts a short-lived HTTP service bound only to `127.0.0.1` and opens the control panel in the default browser. The page supports first-time installation and routine theme management without requiring Terminal use.

The local service uses the signed Node.js runtime bundled with the official Codex app. It exposes only fixed Dream Skin operations and reuses the repository's existing install, customize, start, pause, verify, and restore behavior. It never exposes a general shell endpoint and never modifies the official Codex application, `app.asar`, or its signature.

## Goals

- Provide a double-click entry point for non-technical macOS users.
- Complete first-time installation from the browser after the launcher starts.
- Select or drag an image, preview it, customize theme metadata and colors, and apply it.
- List and switch saved themes.
- Show Codex, CDP, injector, and active-theme status.
- Pause, reapply, verify, capture a verification screenshot, and fully restore the official appearance.
- Preserve the existing loopback-only CDP and signed-runtime security boundaries.
- Avoid new package-manager, global Node.js, Python, Docker, or framework dependencies.
- Leave clear extension points for later private-network or authenticated public access.

## Non-goals

- No LAN or public-network listener in the MVP.
- No arbitrary command runner, terminal, or user-supplied executable path.
- No editing of the official Codex bundle or signed resources.
- No multi-user accounts, cloud synchronization, or remote device management.
- No image editor beyond browser preview and the existing macOS conversion pipeline.
- No Windows web control panel in this iteration.
- No signed or notarized standalone `.app`; the entry point remains a `.command` launcher.

## Considered Approaches

### 1. Repository-owned local Node service and static web UI

Use Node's built-in HTTP facilities and plain HTML, CSS, and JavaScript. Start the service with Codex's validated bundled Node runtime and call fixed repository operations through a narrow internal executor.

This is the selected approach. It has the smallest distribution footprint, matches the existing project runtime model, supports a theme-specific UI, and keeps the security boundary auditable.

### 2. General-purpose script web UI

Tools such as OliveTin and script-server demonstrate the established pattern of exposing predefined scripts through a browser. They are useful references for action forms and progress reporting, but adopting one would add another runtime and general command-execution surface while still requiring substantial custom work for image previews and theme management.

### 3. Native Swift application with WKWebView

A native wrapper could offer a polished application lifecycle and stronger OS integration. It would also introduce Xcode builds, application signing, notarization, and a separate release pipeline. It is deferred until the local web workflow proves useful.

## User Experience

### Launcher

The customer package includes `Open Dream Skin Studio.command`. Double-clicking it:

1. Locates the official Codex bundle.
2. Validates the Codex signature, Team ID, architecture, and bundled Node.js runtime.
3. Selects an available control-panel port from a small dedicated range that does not overlap the CDP range.
4. Creates a private one-use FIFO for the readiness handshake.
5. Starts the local control service on `127.0.0.1`.
6. The service generates a cryptographically random session token and writes its ready URL once through the FIFO.
7. The launcher reads the URL, removes the FIFO, and opens a URL such as `http://127.0.0.1:<port>/#token=<token>`.

The FIFO has mode `0600`, is never a regular file, and is removed immediately after the handshake. The token is not passed in process arguments or environment variables. The URL fragment is not sent in the initial HTTP request. Client JavaScript reads it, removes it from the visible URL with `history.replaceState`, retains it only in `sessionStorage`, and sends it in an `X-Dream-Skin-Token` header for API requests.

Each launcher invocation starts a new short-lived service with a new in-memory token. An older control-panel service may remain alive until its idle timeout, but a cross-process mutation lock under the state root prevents two panels from changing installation or theme state concurrently. The launcher does not reuse another service because doing so would require persisting or transferring its bearer token.

### First-time installation

When the engine is not installed, the page shows:

- Codex discovery and signature status.
- Destination paths that will be created.
- A primary `Install Dream Skin` action.
- A concise statement that the official Codex bundle is not modified.

Installation invokes the existing installer with fixed arguments equivalent to `--no-launch`, so installation does not unexpectedly restart Codex. After installation succeeds, the service switches its executor root to the stable installed engine and refreshes status. The user may then choose a theme and explicitly apply it.

### Installed dashboard

The default dashboard keeps the common path simple:

1. Drop or select an image.
2. Enter a theme name.
3. Review the preview.
4. Select `Apply theme`.

Advanced settings are collapsed by default and contain:

- Tagline, maximum 160 characters.
- Quote, maximum 80 characters.
- Accent, secondary, and highlight six-digit hexadecimal colors.

The remaining controls are grouped by intent:

- **Themes:** current theme, saved themes, switch, delete user theme, restore bundled demo.
- **Session:** apply/reapply and pause.
- **Verification:** run live verification and optionally open the generated screenshot.
- **Recovery:** fully restore the official appearance after an explicit confirmation.
- **Diagnostics:** status summary and bounded recent logs with a copy button.

Destructive or disruptive operations describe their effect before confirmation. Applying a theme attempts a hot reapply first. If CDP is unavailable and Codex must restart, the first job ends with `restart_required`; after confirmation, the browser repeats the same fixed operation with `allowRestart: true`.

## Architecture

```text
Open Dream Skin Studio.command
        |
        v
launcher validation and server bootstrap
        |
        v
127.0.0.1 local HTTP service
   |          |             |
   |          |             +--> job registry and bounded logs
   |          +----------------> fixed operation executor
   +---------------------------> static local web UI
                                  |
                                  v
                     existing Dream Skin scripts and data
                                  |
                                  v
                        official Codex via loopback CDP
```

### Components

#### `scripts/open-web-studio-macos.sh`

- Sources existing macOS discovery and runtime helpers.
- Verifies the official Codex bundle and bundled Node runtime before executing server code.
- Starts a new independently authorized control service on an available port.
- Opens the browser only after a loopback health check succeeds.
- Never binds a non-loopback interface.

#### `scripts/web-studio-server.mjs`

- Uses only built-in Node modules.
- Generates the session token internally and reports it only through the one-use readiness FIFO.
- Serves static assets from a fixed web asset directory.
- Validates request method, path, `Host`, `Origin`, content type, content length, and session token.
- Parses bounded JSON and multipart requests.
- Creates jobs and delegates fixed actions to the executor.
- Returns structured JSON errors without local secrets or unbounded command output.
- Shuts down after a configurable idle period when no jobs are running.

#### `scripts/web-studio-executor.mjs`

- Implements an allowlist of operations.
- Spawns fixed executable paths with argument arrays and `shell: false`.
- Validates all values again at the execution boundary.
- Uses per-upload temporary directories with mode `0700` and files with mode `0600`.
- Removes temporary files after success or failure.
- Acquires a cross-process mutation lock so install, apply, pause, and restore cannot race across jobs or control-panel processes.
- Allows read-only status polling while a mutation is active.

#### `assets/web-studio/`

- Contains local HTML, CSS, JavaScript, and icons.
- Loads no remote scripts, fonts, images, or analytics.
- Provides responsive desktop and narrow-window layouts.
- Keeps the session token out of DOM text, logs, and query strings.

#### Existing scripts

Existing scripts remain the source of truth for platform behavior. The executor calls them with validated arguments or factors narrowly reusable logic out of them when direct invocation would cause UI prompts. CLI and desktop launcher behavior must continue to work independently of the web studio.

## Data and Storage

Existing storage locations remain authoritative:

| Purpose | Location |
| --- | --- |
| Installed engine | `~/.codex/codex-dream-skin-studio` |
| State and logs | `~/Library/Application Support/CodexDreamSkinStudio` |
| Active theme | `~/Library/Application Support/CodexDreamSkinStudio/theme` |
| Saved themes | `~/Library/Application Support/CodexDreamSkinStudio/themes` |
| Image library | `~/Library/Application Support/CodexDreamSkinStudio/images` |

Web control state is stored under `web-studio/` within the existing state root and contains only non-secret coordination data such as the mutation lock and bounded diagnostic metadata. The session token is held in process memory and is not written to disk.

User theme IDs are generated server-side and accepted in API paths only after matching a strict identifier pattern. Theme names are display values and are never used as directory names. Upload filenames are ignored except for display metadata; the server generates storage filenames.

## API Design

All API responses use JSON. Mutation endpoints return `202 Accepted` with a job ID. The browser polls the job resource with the session-token header, avoiding WebSocket or EventSource authentication exceptions.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/status` | Installation, Codex, CDP, injector, theme, and version status |
| `GET` | `/api/themes` | List saved user themes and the bundled demo |
| `GET` | `/api/themes/:id/image` | Read a managed saved-theme image for authenticated preview |
| `POST` | `/api/install` | Install to the stable path without launching Codex |
| `POST` | `/api/themes` | Upload, prepare, save, and optionally apply a theme |
| `POST` | `/api/themes/:id/apply` | Apply a saved theme |
| `DELETE` | `/api/themes/:id` | Delete a user-created theme that is not currently active |
| `POST` | `/api/demo/apply` | Restore and apply the bundled demo theme |
| `POST` | `/api/session/reapply` | Reapply the active theme |
| `POST` | `/api/session/pause` | Remove the live skin while leaving Codex running |
| `POST` | `/api/verify` | Run live verification and optionally create a screenshot |
| `GET` | `/api/verification/screenshot` | Read the latest managed verification screenshot |
| `POST` | `/api/restore` | Restore the official appearance after confirmation |
| `GET` | `/api/jobs/:id` | Read bounded job state, progress, and errors |

No endpoint accepts a command, executable, working directory, output path, CDP URL, host, or unrestricted filesystem path from the browser.

Theme creation and apply requests accept only validated theme fields plus the booleans `apply` and `allowRestart`. The server rejects any unrecognized field. A restore request additionally requires the exact confirmation value `restore-official` and explicit restart authorization. These confirmations prevent accidental actions; the session token remains the authorization mechanism.

### Job states

Jobs transition through:

```text
queued -> running -> succeeded
                  -> failed
```

A job response includes a stable operation name, timestamps, a short progress message, sanitized result data, and a bounded list of log lines. Browser disconnects do not cancel an active job. Completed jobs expire from memory after a short retention period.

## Theme Upload and Application

1. The browser renders a local preview using an object URL; it does not upload until the user applies or saves.
2. The server enforces a request-body limit before parsing the upload.
3. The executor verifies supported image type, source size no greater than 50 MB, and a non-empty regular file.
4. `sips` converts the image to JPEG using the existing quality and dimension policy.
5. The prepared image must not exceed 16 MB.
6. `write-theme.mjs` creates `theme.json` using validated metadata and colors.
7. The prepared image and metadata are atomically moved into a server-generated saved-theme directory.
8. Applying copies the saved theme atomically into the active theme directory.
9. The executor attempts hot reapply. A required Codex restart is a separate confirmed operation.
10. Verification runs after apply and its structured result is returned to the job.

Failures before the atomic move leave the previous active theme untouched. Failures after activation report the exact stage and retain the previous theme metadata needed for recovery.

## Security Model

### Network boundary

- Listen explicitly on `127.0.0.1`, never `0.0.0.0`, `::`, a LAN address, or a hostname resolved at runtime.
- Accept only the exact expected `Host` value for the selected port.
- Require the exact same-origin `Origin` on state-changing requests.
- Send no permissive CORS headers and reject cross-origin preflight requests.
- Set a restrictive Content Security Policy, including `default-src 'self'`, no remote connections, no framing, and no plugins.

### Authorization and request safety

- Generate at least 256 bits of randomness per server session.
- Require the token in a custom header for every API request, including reads.
- Never place the token in a query string or persist it to disk.
- Use method-specific routes and reject unexpected content types.
- Enforce small JSON limits and an upload limit slightly above 50 MB before buffering.
- Apply server-side validation independently of client-side controls.

### Command and filesystem safety

- Do not use `eval`, `bash -c`, shell interpolation, or a general command endpoint.
- Spawn only repository-owned fixed scripts with argument arrays and `shell: false`.
- Resolve all managed paths beneath known roots and reject traversal, symlinks where unsafe, and path separators in identifiers.
- Preserve strict UTF-8 and atomic write behavior for `config.toml` and theme metadata.
- Keep backup and restore behavior recoverable.
- Redact the home directory, token, and temporary paths from browser-visible logs where they do not aid remediation.

## Error Handling

Errors are classified for useful UI behavior:

- `validation_error`: bad image, field, identifier, or request.
- `not_installed`: action requires the stable installation.
- `conflict`: another mutating job is active or a theme is currently in use.
- `restart_required`: apply cannot continue without explicit restart authorization.
- `codex_unavailable`: official Codex is missing, invalid, or cannot start.
- `verification_failed`: injection ran but live acceptance checks failed.
- `operation_failed`: bounded fallback with a support-oriented message and log reference.

The page preserves entered metadata after recoverable validation failures. Restore remains reachable from the UI whenever the server can validate the installed engine, even if theme application fails.

## Service Lifecycle

- Every launcher run starts an independently authorized service on an available port.
- A cross-process lock serializes mutations from overlapping control-panel sessions and is recovered only after validating that its recorded owner is stale.
- The browser periodically sends authenticated status requests while open.
- The service does not exit while a job is queued or running.
- After all clients are inactive and no job is running, it exits automatically after 30 minutes.
- A `Stop control panel` action may end the service after current work completes.
- The control service is not installed as a persistent `launchd` daemon in the MVP.

## Testing Strategy

### Static and unit tests

- Shell and JavaScript syntax checks include the new files.
- Route matching, method restrictions, JSON limits, and multipart limits.
- Host, Origin, token, CORS, and CSP behavior.
- Identifier validation, traversal rejection, symlink handling, and generated paths.
- Theme metadata limits, six-digit color validation, and non-ASCII values.
- Job transitions, retention, mutation serialization, and idle shutdown.
- Command construction proves fixed executables, argument arrays, and `shell: false`.

### Integration tests with isolated state

- Use a temporary `HOME`, fake Codex metadata, and a fake executor where system integration is not the subject of the test.
- Cover first-time install state transitions without writing the real user configuration.
- Upload supported images and reject unsupported, empty, oversized, and misleadingly named files.
- Prove failed preparation leaves the active theme unchanged.
- Prove install and restore preserve unrelated UTF-8 TOML content.

### Live macOS verification

- Run the existing `npm test` suite.
- Launch the web studio with the official Codex bundled Node runtime.
- Complete installation or update through the page.
- Apply a custom image with a Chinese theme name.
- Verify both home and task routes, native sidebar and composer interaction, no overflow, and non-interactive decorations.
- Capture and inspect the verification screenshot.
- Pause, reapply, and fully restore the official appearance.

## Packaging and Documentation

- Add the new launcher to the repository and customer ZIP.
- Keep existing desktop launchers operational.
- Document local control-panel use in `macos/README.md` and customer instructions.
- Update `docs/platforms.md` to mark the browser control panel as macOS-only for this release.
- Treat the feature as user-visible and release-worthy: update `macos/CHANGELOG.md` and bump `macos/VERSION` when implementation is ready to ship.

## Future Network Extensions

The MVP does not include a switch that changes the listener to a LAN interface. Remote access must be added as a separate security-reviewed feature.

Preferred progression:

1. **Private devices:** keep the service on loopback and proxy it through Tailscale Serve inside a tailnet.
2. **Clientless remote browser:** keep the service on loopback and place Cloudflare Tunnel plus Cloudflare Access in front of it.
3. **Multiple managed Macs:** introduce a central authenticated control plane and outbound-only Mac agents that accept a versioned allowlist of structured Dream Skin actions.

Remote modes require their own authentication, replay protection, audit log, rate limits, secure cookie or token lifecycle, proxy-header validation, and threat model. Public exposure through Tailscale Funnel or an unauthenticated tunnel is explicitly out of scope.

## Acceptance Criteria

- A user can start the control panel by double-clicking one `.command` file without installing global Node.js or dependencies.
- An uninstalled user can install Dream Skin from the page, then customize and explicitly apply a theme.
- An installed user can change an image, edit metadata and colors, apply it, and see verification results.
- Saved themes can be listed and switched without filesystem knowledge.
- Pause, reapply, demo reset, verification screenshot, and full restore are available and accurately reported.
- The server is reachable only on IPv4 loopback and rejects invalid Host, Origin, token, route, method, type, size, identifier, and path inputs.
- No browser input can select an executable or produce shell-interpreted command text.
- Existing CLI, desktop launcher, install, start, verify, pause, and restore behavior remains compatible.
- The complete macOS test suite and live home/task verification pass.
