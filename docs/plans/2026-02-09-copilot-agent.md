# OpenCode Copilot Agent — Implementation Plan

**Goal:** Register OpenCode as a third-party coding agent in VS Code's GitHub Copilot chat panel, allowing users to create, view, and interact with OpenCode sessions alongside Claude and Codex.

**Architecture:** A VS Code extension (`sdks/vscode-copilot/`) bridges OpenCode's HTTP API (via `@opencode-ai/sdk`) to VS Code's proposed `chatSessionsProvider` and `chatProvider` APIs. The extension spawns an OpenCode server, connects via the SDK, lists sessions as `ChatSessionItem`s, renders message history as chat turns, and streams agent responses in real-time via SSE events.

**Tech Stack:** TypeScript, VS Code Extension API (proposed: `chatSessionsProvider`, `chatProvider`), `@opencode-ai/sdk` (workspace dependency), esbuild (CJS bundling)

**Repo:** `bobthearsonist/opencode` (fork of `anomalyco/opencode`)
**Branch:** `feature/copilot-agent`
**Worktree:** `.worktrees/copilot-agent/`

---

## Status

| Task | Status | Notes |
|------|--------|-------|
| 1. Scaffold extension | Done | package.json, tsconfig, esbuild, types |
| 2. SDK bridge module | Done | `src/bridge.ts` exists |
| 3. Session item provider | Not started | |
| 4. Session content provider | Not started | |
| 5. Extension activation | Stub only | `src/extension.ts` has TODOs |
| 6. SSE event bridge | Not started | |
| 7. Integration wiring + smoke test | Not started | |

---

## Task 1: Scaffold Extension (DONE)

Already completed. Files at `sdks/vscode-copilot/`:
- `package.json` — extension manifest with proposed API declarations
- `tsconfig.json` — TypeScript config pointing to `./types/` for proposed API stubs
- `esbuild.js` — CJS bundler matching existing extension pattern
- `types/vscode.proposed.chatSessionsProvider.d.ts` — proposed API types
- `types/vscode.proposed.chatProvider.d.ts` — proposed API types
- `src/extension.ts` — stub

---

## Task 2: SDK Bridge Module (DONE)

Already completed. File: `sdks/vscode-copilot/src/bridge.ts`

Provides:
- `Bridge.start(cwd)` / `Bridge.stop()` — server lifecycle
- `Bridge.listSessions()` / `getSession()` / `createSession()` — session CRUD
- `Bridge.sendMessage()` / `abortSession()` / `getMessages()` — messaging
- `Bridge.listProviders()` — provider/model listing
- `Bridge.subscribeEvents(handler)` — SSE event subscription

**Verify before continuing:** Run `bun run check-types` in `sdks/vscode-copilot/` to confirm bridge.ts compiles against the SDK types.

---

## Task 3: Session Item Provider

Implements `ChatSessionItemProvider` + `ChatSessionItemController` to list OpenCode sessions in Copilot's session panel.

**Files:**
- Create: `sdks/vscode-copilot/src/sessions.ts`

### Step 1: Create the SessionItemProvider class

The class implements `vscode.ChatSessionItemProvider` with:
- `provideChatSessionItems()` — calls `bridge.listSessions()`, maps each session to a `ChatSessionItem` with URI scheme `opencode-session://`, status, timing, summary metadata
- `notifyChanged()` — fires `onDidChangeChatSessionItems` event (called by event bridge)
- `onDidCommitChatSessionItem` — event for session migration (stub for now)

Key mapping:
- `session.id` -> `Uri.parse("opencode-session://<id>")`
- `session.title` -> `item.label`
- `session.time.archived` -> `ChatSessionStatus.Completed` vs `InProgress`
- `session.time.created/updated` -> `item.timing`
- `session.summary` -> `item.description` (e.g. "3 files changed (+10 -5)")

Export constant `OPENCODE_SCHEME = "opencode-session"` for shared use.

### Step 2: Verify types compile

Run: `cd sdks/vscode-copilot && bun run check-types`

### Step 3: Commit

```
feat(copilot): add ChatSessionItemProvider implementation
```

---

## Task 4: Session Content Provider

Implements `ChatSessionContentProvider` to render OpenCode message history in the Copilot chat panel and handle new requests.

**Files:**
- Create: `sdks/vscode-copilot/src/content.ts`

### Step 1: Create message-to-turn mapping helpers

`messagesToHistory()` function converts OpenCode `Message` + `Part[]` arrays into VS Code `ChatRequestTurn | ChatResponseTurn2` arrays:

- User messages: extract text parts -> `ChatRequestTurn.prompt`
- Assistant messages: map parts to `ChatResponsePart[]`:
  - `TextPart` -> `ChatResponseMarkdownPart`
  - `ToolPart` (completed/error) -> `ChatResponseMarkdownPart` with status label
  - `ReasoningPart` -> skip for now (no public rendering API)

### Step 2: Create the SessionContentProvider class

The class implements `vscode.ChatSessionContentProvider` with:

- `provideChatSessionContent(resource, token)`:
  - Extract session ID from `resource.authority`
  - Call `bridge.getMessages(sessionId)` to get history
  - Convert to chat turns via `messagesToHistory()`
  - Return `ChatSession` with `history`, empty `options`, and a `requestHandler`

- `handleRequest(sessionId, request, stream, token)` (public, also called from extension.ts):
  - Set up cancellation: `token.onCancellationRequested` -> `bridge.abortSession()`
  - Subscribe to SSE `message.part.updated` events filtered by sessionId
  - On text delta: `stream.markdown(delta)`
  - Call `bridge.sendMessage(sessionId, request.prompt)`
  - Clean up subscription on completion
  - Return empty `ChatResult`

- `provideChatSessionProviderOptions(token)`:
  - Call `bridge.listProviders()` to get available models
  - Map to `ChatSessionProviderOptionGroup` with id "model"
  - Each model: `{ id: "provider/model", name, description }`

- `provideHandleOptionsChange(resource, updates, token)`:
  - Stub: when model option changes, log it (future: call bridge to switch model)

### Step 3: Verify types compile

Run: `cd sdks/vscode-copilot && bun run check-types`

### Step 4: Commit

```
feat(copilot): add ChatSessionContentProvider with message streaming
```

---

## Task 5: Extension Activation Wiring

Wires all providers together in `extension.ts`.

**Files:**
- Modify: `sdks/vscode-copilot/src/extension.ts`

### Step 1: Rewrite extension.ts with full activation logic

The activation should:

1. Create output channel "OpenCode Copilot"
2. Initialize Bridge and start server for workspace CWD
3. Register chat participant `opencode.copilot` with default request handler that creates a session and delegates to `contentProvider.handleRequest()`
4. Create `ChatSessionItemController` with refresh handler
5. Register `SessionItemProvider` via `chat.registerChatSessionItemProvider("opencode", ...)`
6. Register `SessionContentProvider` via `chat.registerChatSessionContentProvider(OPENCODE_SCHEME, ..., participant, { supportsInterruptions: true })`
7. Wire EventBridge for session change notifications
8. Push all disposables to `context.subscriptions`

Deactivation: stop bridge.

### Step 2: Verify types compile and build

Run: `cd sdks/vscode-copilot && bun run check-types && node esbuild.js`

### Step 3: Commit

```
feat(copilot): wire extension activation with all providers
```

---

## Task 6: Typed Event Bridge

Creates a typed event distribution layer on top of `Bridge.subscribeEvents()`.

**Files:**
- Create: `sdks/vscode-copilot/src/events.ts`

### Step 1: Create EventBridge class

- `OpenCodeEventType` union type covering key events: session.created/updated/deleted, message.updated, message.part.updated/removed, permission.asked, todo.updated, session.error
- `EventSubscription` interface with `dispose()` method (compatible with VS Code disposable pattern)
- `EventBridge` class:
  - `start()` — calls `bridge.subscribeEvents()`, distributes events to type-specific handlers
  - `on(type, handler)` — registers handler, returns `EventSubscription`
  - `stop()` — unsubscribes and clears all handlers
  - Error isolation: each handler wrapped in try/catch

### Step 2: Verify types compile

Run: `cd sdks/vscode-copilot && bun run check-types`

### Step 3: Commit

```
feat(copilot): add typed EventBridge for SSE event distribution
```

---

## Task 7: Integration Build + Push

Final verification that everything compiles, builds, and is ready for manual testing.

### Step 1: Install dependencies

Run: `cd sdks/vscode-copilot && bun install`

### Step 2: Type check

Run: `cd sdks/vscode-copilot && bun run check-types`

### Step 3: Build

Run: `cd sdks/vscode-copilot && node esbuild.js`
Expected: `dist/extension.js` produced

### Step 4: Commit any remaining changes

```
feat(copilot): complete Phase 1 — OpenCode as Copilot coding agent
```

### Step 5: Push to fork

```bash
git push -u origin feature/copilot-agent
```

---

## Future Work (Not in this PR)

- **Phase 2: Model picker** — `LanguageModelChatProvider` to expose OpenCode's models in VS Code's model picker
- **Phase 2: Permission UI** — Map `permission.asked` events to VS Code's native permission prompts
- **Phase 2: File change tracking** — Map `session.diff()` to `ChatSessionChangedFile2`
- **Phase 3: Agent mode selection** — Option group for OpenCode agents
- **Phase 3: Session forking** — Support forking sessions from Copilot chat
- **Phase 4: Upstream PR** — Propose as part of OpenCode's official extension

---

## Testing Strategy

Since these are proposed VS Code APIs (Insiders only), automated testing is limited:

1. **Type checking** — `bun run check-types` validates all code against proposed API stubs
2. **Build verification** — `node esbuild.js` confirms bundle produces valid output
3. **Manual testing** — Load in VS Code Insiders with `--enable-proposed-api opencode-copilot-agent`:
   - OpenCode appears as agent option in Copilot chat
   - Sessions list in session panel
   - Sending a message streams a response
   - Cancellation aborts the session
4. **Unit tests** (future) — message-to-turn mapping, event bridge, bridge methods

---

## Key Reference Files

| File | Purpose |
|------|---------|
| `sdks/vscode-copilot/types/vscode.proposed.chatSessionsProvider.d.ts` | Session APIs |
| `sdks/vscode-copilot/types/vscode.proposed.chatProvider.d.ts` | Model provider APIs |
| `packages/sdk/js/src/v2/gen/types.gen.ts` | OpenCode SDK types |
| `packages/sdk/js/src/v2/client.ts` | SDK client factory |
| `packages/sdk/js/src/v2/server.ts` | SDK server lifecycle |
| `sdks/vscode/src/extension.ts` | Existing extension (reference) |
| `packages/opencode/src/server/routes/session.ts` | Server-side session routes |
| `packages/opencode/src/session/prompt.ts` | Agent loop implementation |
