# App-Server Events Reference (Codex `03bb3b12367397e14a8facc2e018d645ff4d8e83`)

This document helps agents quickly answer:
- Which app-server events CodexMonitor supports right now.
- Which app-server requests CodexMonitor sends right now.
- Where to look in CodexMonitor to add support.
- Where to look in `../Codex` to compare event lists and find emitters.

When updating this document:
1. Fetch latest refs with `git -C ../Codex fetch --all --prune`.
2. Update the Codex hash in the title using `git -C ../Codex rev-parse origin/main`.
3. Compare Codex events vs CodexMonitor routing.
4. Compare Codex client request methods vs CodexMonitor outgoing request methods.
5. Compare Codex server request methods vs CodexMonitor inbound request handling.
6. Update supported and missing lists below.

Related project skill:
- `.codex/skills/app-server-events-sync/SKILL.md`

## Where To Look In CodexMonitor

Primary app-server event source of truth (methods + typed parsing helpers):
- `src/utils/appServerEvents.ts`

Primary event router:
- `src/features/app/hooks/useAppServerEvents.ts`

Event handler composition:
- `src/features/threads/hooks/useThreadEventHandlers.ts`

Thread/turn/item handlers:
- `src/features/threads/hooks/useThreadTurnEvents.ts`
- `src/features/threads/hooks/useThreadItemEvents.ts`
- `src/features/threads/hooks/useThreadApprovalEvents.ts`
- `src/features/threads/hooks/useThreadUserInputEvents.ts`
- `src/features/skills/hooks/useSkills.ts`

State updates:
- `src/features/threads/hooks/useThreadsReducer.ts`

Item normalization / display shaping:
- `src/utils/threadItems.ts`

UI rendering of items:
- `src/features/messages/components/Messages.tsx`

Primary outgoing request layer:
- `src/services/tauri.ts`
- `src-tauri/src/shared/codex_core.rs`
- `src-tauri/src/codex/mod.rs`
- `src-tauri/src/bin/codex_monitor_daemon.rs`

## Supported Notifications (Codex v2)

These are the current Codex v2 `ServerNotification` methods that CodexMonitor
supports in `src/utils/appServerEvents.ts` (`SUPPORTED_APP_SERVER_METHODS`) and
then either routes in `useAppServerEvents.ts` or handles in feature-specific
subscriptions.

- `account/login/completed`
- `account/rateLimits/updated`
- `account/updated`
- `app/list/updated`
- `error`
- `hook/completed`
- `hook/started`
- `item/agentMessage/delta`
- `item/autoApprovalReview/completed`
- `item/autoApprovalReview/started`
- `item/commandExecution/outputDelta`
- `item/commandExecution/terminalInteraction`
- `item/completed`
- `item/fileChange/outputDelta`
- `item/plan/delta`
- `item/reasoning/summaryPartAdded`
- `item/reasoning/summaryTextDelta`
- `item/reasoning/textDelta`
- `item/started`
- `thread/archived`
- `thread/closed`
- `thread/name/updated`
- `thread/started`
- `thread/status/changed`
- `thread/tokenUsage/updated`
- `thread/unarchived`
- `turn/completed`
- `turn/diff/updated`
- `turn/plan/updated`
- `turn/started`

## Additional Stream Methods Handled In CodexMonitor

These arrive on the same frontend event stream but are not Codex v2
`ServerNotification` methods:

- approval requests ending in `requestApproval`, including
  `item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`, and
  `item/permissions/requestApproval`, via suffix match in
  `isApprovalRequestMethod(method)`
- `item/tool/requestUserInput` (a Codex v2 server request, not a notification)
- `mcpServer/elicitation/request` (routed as a conservative response-needed
  prompt; currently supports accept/decline only)
- `codex/backgroundThread` (CodexMonitor synthetic bridge event)
- `codex/connected` (CodexMonitor synthetic bridge event)
- `codex/event/skills_update_available` (handled via
  `isSkillsUpdateAvailableEvent(...)` in `useSkills.ts`)

## Conversation Compaction Signals (Codex v2)

Codex currently exposes two compaction signals:

- Preferred: `item/started` + `item/completed` with `item.type = "contextCompaction"` (`ThreadItem::ContextCompaction`).
- Deprecated: `thread/compacted` (`ContextCompactedNotification`).

CodexMonitor status:

- It routes `item/started` and `item/completed`, so the preferred signal reaches the frontend event layer.
- It renders/stores `contextCompaction` items via the normal item lifecycle.
- It no longer routes deprecated `thread/compacted`.

## Approval Auto-Review Signals (Codex v2)

CodexMonitor supports approval auto-review end to end:

- **Auto-review** is the default access mode for new settings. Selecting it sends
  `approvalsReviewer: "auto_review"` with `turn/start` while retaining the
  workspace sandbox and `on-request` approval policy.
- Existing access modes do not override `approvals_reviewer` from Codex
  configuration.
- `item/autoApprovalReview/started` and
  `item/autoApprovalReview/completed` are normalized into one updatable
  conversation item keyed by `reviewId`.
- The item shows the reviewed action, progress or decision, risk level, user
  authorization level, and rationale when Codex provides them.

The upstream notification payloads are explicitly unstable. Keep their
normalization at the `appServerEvents.ts` boundary so future schema changes do
not leak into reducers or components.

## Missing Events (Codex v2 Notifications)

Compared against Codex app-server protocol v2 notifications, the following
events are currently not routed:

- `command/exec/outputDelta`
- `configWarning`
- `deprecationNotice`
- `externalAgentConfig/import/completed`
- `externalAgentConfig/import/progress`
- `fs/changed`
- `fuzzyFileSearch/sessionCompleted`
- `fuzzyFileSearch/sessionUpdated`
- `guardianWarning`
- `item/fileChange/patchUpdated`
- `item/mcpToolCall/progress`
- `mcpServer/oauthLogin/completed`
- `mcpServer/startupStatus/updated`
- `model/rerouted`
- `model/safetyBuffering/updated`
- `model/verification`
- `process/exited`
- `process/outputDelta`
- `rawResponse/completed`
- `rawResponseItem/completed`
- `remoteControl/status/changed`
- `serverRequest/resolved`
- `skills/changed`
- `thread/compacted` (deprecated; intentionally not routed)
- `thread/deleted`
- `thread/environment/connected`
- `thread/environment/disconnected`
- `thread/goal/cleared`
- `thread/goal/updated`
- `thread/realtime/closed`
- `thread/realtime/error`
- `thread/realtime/itemAdded`
- `thread/realtime/outputAudio/delta`
- `thread/realtime/sdp`
- `thread/realtime/started`
- `thread/realtime/transcript/delta`
- `thread/realtime/transcript/done`
- `thread/settings/updated`
- `turn/moderationMetadata`
- `warning`
- `windows/worldWritableWarning`
- `windowsSandbox/setupCompleted`

## Supported Requests (CodexMonitor -> App-Server, v2)

These are v2 request methods CodexMonitor currently sends to Codex app-server:

- `thread/start`
- `thread/resume`
- `thread/fork`
- `thread/list`
- `thread/read`
- `thread/archive`
- `thread/compact/start`
- `thread/name/set`
- `turn/start`
- `turn/steer` (used for explicit steer follow-ups while a turn is active)
- `turn/interrupt`
- `review/start`
- `model/list`
- `experimentalFeature/list`
- `collaborationMode/list`
- `mcpServerStatus/list`
- `account/login/start`
- `account/login/cancel`
- `account/rateLimits/read`
- `account/read`
- `skills/list`
- `app/list`

Notes:
- `turn/start` forwards the optional `serviceTier` override (`"fast"` from the speed picker or `/fast`, `null` for standard speed) alongside `model`, `effort`, and `collaborationMode`.
- `turn/start` forwards `approvalsReviewer: "auto_review"` when the selected
  access mode is **Auto-review**. Other access modes leave the reviewer unset
  so Codex configuration remains authoritative.

## Missing Client Requests (Codex v2 ClientRequest Methods)

Compared against Codex v2 request methods, CodexMonitor currently does not send:

- `account/logout`
- `account/rateLimitResetCredit/consume`
- `account/sendAddCreditsNudgeEmail`
- `account/usage/read`
- `account/workspaceMessages/read`
- `command/exec`
- `command/exec/resize`
- `command/exec/terminate`
- `command/exec/write`
- `config/batchWrite`
- `config/mcpServer/reload`
- `config/read`
- `config/value/write`
- `configRequirements/read`
- `environment/add`
- `environment/info`
- `environment/status`
- `experimentalFeature/enablement/set`
- `externalAgentConfig/detect`
- `externalAgentConfig/import`
- `externalAgentConfig/import/readHistories`
- `feedback/upload`
- `fs/copy`
- `fs/createDirectory`
- `fs/getMetadata`
- `fs/readDirectory`
- `fs/readFile`
- `fs/remove`
- `fs/unwatch`
- `fs/watch`
- `fs/writeFile`
- `hooks/list`
- `marketplace/add`
- `marketplace/remove`
- `marketplace/upgrade`
- `mcpServer/oauth/login`
- `mcpServer/resource/read`
- `mcpServer/tool/call`
- `memory/reset`
- `mock/experimentalMethod`
- `modelProvider/capabilities/read`
- `permissionProfile/list`
- `plugin/install`
- `plugin/installed`
- `plugin/list`
- `plugin/read`
- `plugin/share/checkout`
- `plugin/share/delete`
- `plugin/share/list`
- `plugin/share/save`
- `plugin/share/updateTargets`
- `plugin/skill/read`
- `plugin/uninstall`
- `process/kill`
- `process/resizePty`
- `process/spawn`
- `process/writeStdin`
- `remoteControl/client/list`
- `remoteControl/client/revoke`
- `remoteControl/disable`
- `remoteControl/enable`
- `remoteControl/pairing/start`
- `remoteControl/pairing/status`
- `remoteControl/status/read`
- `skills/config/write`
- `skills/extraRoots/set`
- `thread/approveGuardianDeniedAction`
- `thread/backgroundTerminals/clean`
- `thread/backgroundTerminals/list`
- `thread/backgroundTerminals/terminate`
- `thread/decrement_elicitation`
- `thread/delete`
- `thread/goal/clear`
- `thread/goal/get`
- `thread/goal/set`
- `thread/increment_elicitation`
- `thread/inject_items`
- `thread/items/list`
- `thread/loaded/list`
- `thread/memoryMode/set`
- `thread/metadata/update`
- `thread/realtime/appendAudio`
- `thread/realtime/appendSpeech`
- `thread/realtime/appendText`
- `thread/realtime/listVoices`
- `thread/realtime/start`
- `thread/realtime/stop`
- `thread/rollback`
- `thread/search`
- `thread/settings/update`
- `thread/shellCommand`
- `thread/turns/list`
- `thread/unarchive`
- `thread/unsubscribe`
- `windowsSandbox/readiness`
- `windowsSandbox/setupStart`

## Server Requests (App-Server -> CodexMonitor, v2)

Supported server requests:

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`
- `item/tool/requestUserInput`
- `mcpServer/elicitation/request`

Missing server requests:

- `account/chatgptAuthTokens/refresh`
- `attestation/generate`
- `currentTime/read`
- `item/tool/call`

## Where To Look In ../Codex

Start here for the authoritative v2 notification list:
- `../Codex/codex-rs/app-server-protocol/src/protocol/common.rs`

Useful follow-ups:
- Notification payload types:
  - `../Codex/codex-rs/app-server-protocol/src/protocol/v2/`
- Emitters / wiring from core events to server notifications:
  - `../Codex/codex-rs/app-server/src/bespoke_event_handling.rs`
- Human-readable protocol notes:
  - `../Codex/codex-rs/app-server/README.md`

## Quick Comparison Workflow

Use this workflow to update the lists above:

1. Get the current Codex hash:
   - `git -C ../Codex fetch --all --prune && git -C ../Codex rev-parse origin/main`
2. List Codex v2 notification methods:
   - `git -C ../Codex show origin/main:codex-rs/app-server-protocol/src/protocol/common.rs | awk '/server_notification_definitions! \\{/,/client_notification_definitions! \\{/' | rg -N -o '=>\\s*\"[^\"]+\"|rename = \"[^\"]+\"' | sed -E 's/.*\"([^\"]+)\".*/\\1/' | sort -u`
3. List CodexMonitor routed methods:
   - `rg -n \"SUPPORTED_APP_SERVER_METHODS\" src/utils/appServerEvents.ts`
4. Update the Supported and Missing sections.

## Quick Request Comparison Workflow

Use this workflow to update request support lists:

1. Get the current Codex hash:
   - `git -C ../Codex fetch --all --prune && git -C ../Codex rev-parse origin/main`
2. List Codex client request methods:
   - `git -C ../Codex show origin/main:codex-rs/app-server-protocol/src/protocol/common.rs | awk '/client_request_definitions! \\{/,/\\/\\/\\/ DEPRECATED APIs below/' | rg -N -o '=>\\s*\"[^\"]+\"\\s*\\{' | sed -E 's/.*\"([^\"]+)\".*/\\1/' | sort -u`
3. List Codex server request methods:
   - `git -C ../Codex show origin/main:codex-rs/app-server-protocol/src/protocol/common.rs | awk '/server_request_definitions! \\{/,/\\/\\/\\/ DEPRECATED APIs below/' | rg -N -o '=>\\s*\"[^\"]+\"\\s*\\{' | sed -E 's/.*\"([^\"]+)\".*/\\1/' | sort -u`
4. List CodexMonitor outgoing requests:
   - `perl -0777 -ne 'while(/send_request_for_workspace\\(\\s*&[^,]+\\s*,\\s*\"([^\"]+)\"/g){print \"$1\\n\"}' src-tauri/src/shared/codex_core.rs | sort -u`
5. Update the Supported Requests, Missing Client Requests, and Server Requests sections.

## Schema Drift Workflow (Best)

Use this when the method list is unchanged but behavior looks off.

1. Confirm the current Codex hash:
   - `git -C ../Codex fetch --all --prune && git -C ../Codex rev-parse origin/main`
2. Inspect the authoritative notification structs:
   - `git -C ../Codex grep -n \"struct .*Notification\" origin/main -- codex-rs/app-server-protocol/src/protocol/v2`
3. For a specific method, jump to its struct definition:
   - Example: `git -C ../Codex grep -n -E \"struct (TurnPlanUpdatedNotification|ThreadTokenUsageUpdatedNotification|AccountRateLimitsUpdatedNotification|ItemStartedNotification|ItemCompletedNotification)\" origin/main -- codex-rs/app-server-protocol/src/protocol/v2`
4. Compare payload shapes to the router expectations:
   - Parser/source of truth: `src/utils/appServerEvents.ts`
   - Router: `src/features/app/hooks/useAppServerEvents.ts`
   - Turn/plan/token/rate-limit normalization: `src/features/threads/utils/threadNormalize.ts`
   - Item shaping for display: `src/utils/threadItems.ts`
5. Verify the ThreadItem schema (many UI issues start here):
   - `git -C ../Codex grep -n -E \"enum ThreadItem|CommandExecution|FileChange|McpToolCall|EnteredReviewMode|ExitedReviewMode|ContextCompaction\" origin/main -- codex-rs/app-server-protocol/src/protocol/v2`
6. Check for camelCase vs snake_case mismatches:
   - The protocol uses `#[serde(rename_all = \"camelCase\")]`, but fields are often declared in snake_case.
   - CodexMonitor generally defends against this by checking both forms (for example in `threadNormalize.ts` and `useAppServerEvents.ts`), while centralizing method/type parsing in `appServerEvents.ts`.
7. If a schema change is found, fix it at the edges first:
   - Prefer updating `src/utils/appServerEvents.ts`, `useAppServerEvents.ts`, and `threadNormalize.ts` rather than spreading conditionals into components.

## Notes

- Not all missing events must be surfaced in the conversation view; some may
  be better as toasts, settings warnings, or debug-only entries.
- For conversation view changes, prefer:
  - Add method/type support in `src/utils/appServerEvents.ts`
  - Route in `useAppServerEvents.ts`
  - Handle in `useThreadTurnEvents.ts` or `useThreadItemEvents.ts`
  - Update state in `useThreadsReducer.ts`
  - Render in `Messages.tsx`
- `turn/diff/updated` is now fully wired:
  - Routed in `useAppServerEvents.ts`
  - Handled in `useThreadTurnEvents.ts` / `useThreadEventHandlers.ts`
  - Stored in `useThreadsReducer.ts` (`turnDiffByThread`)
  - Exposed by `useThreads.ts` for UI consumers
- Steering behavior while a turn is processing:
  - CodexMonitor attempts `turn/steer` only when steer capability is enabled, the thread is processing, and an active turn id exists.
  - If `turn/steer` fails, CodexMonitor does not fall back to `turn/start`; it clears stale processing/turn state when applicable, surfaces an error, and returns `steer_failed`.
  - Local queue fallback on `steer_failed` is handled in the composer queued-send flow (`useQueuedSend`), not by all direct `sendUserMessageToThread` callers.
- Feature toggles in Settings:
  - `experimentalFeature/list` is an app-server request.
  - Toggle writes use local/daemon command surfaces (`set_codex_feature_flag` and app settings update),
    which write `config.toml`; they are not app-server `ClientRequest` methods.
