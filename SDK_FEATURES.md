Ran get main sections of HANDBOOK.md
Ran list subheadings in section 4 of HANDBOOK.md
Analyzed HANDBOOK.md:L834-865
Analyzed HANDBOOK.md:L1095-1120
Ran list all operations in contract/openapi.yaml · Exited with code 1
Ran list all operations in contract/openapi.json
Ran list all events in contract/events

Based directly on **[HANDBOOK.md](file:///Users/mohamedibrahim/Documents/Documents%20-%20Mohamed%E2%80%99s%20MacBook%20Air/projects/PenteAI/steward-module-sdk/HANDBOOK.md)** and the OpenAPI contract (`contract/openapi.json`), the Steward SDK provides **55 API operations** and **28 signed webhook events** across **13 core functional areas**.

Here is the complete feature inventory the SDK allows a module to interact with:

---

### 1. Work Delegation & Handoffs (`HANDBOOK.md` §4, "Assignments and requests")
Allows your module to take work handed over by humans (via email, tasks, contacts, or In-Tray captures):
* **`getAssignment`:** Reads the work handed to your module by a human.
* **`claimAssignmentToken`:** Claims a single-use scoped grant token to read *only* the specific records handed over.
* **`reportAssignment`:** Places target milestone dates onto the assigner's Steward **Calendar** (e.g. `starts`, `first review`).
* **`answerRequest`:** Responds to an authorized human inquiry in request mode.
* **`finishAssignment`:** Programmatically finishes the handoff and links back to what you created (`made: { id, key }`, e.g. `POR-506`).

---

### 2. Human-in-the-Loop Proposals & Plans (`HANDBOOK.md` §8)
Enforces Steward’s safety rule: modules cannot write to core tables directly; they must propose:
* **`createProposal`:** Proposes a single action (`task.create`, `contact.create`, or custom kind) to Steward's Review Queue.
* **`getProposal`:** Checks whether a proposal was `accepted` or `rejected` by the owner.
* **`createProposalPlan`:** Packages multiple proposals into an atomic, multi-step delivery plan (`mpp_...`).
* **`getProposalPlan`:** Reads the progress and outcomes of all steps in a multi-step plan.

---

### 3. Task Management & Queues (`HANDBOOK.md` §8)
Interacts with tasks created by or linked to your module:
* **`listModuleTasks`:** Lists all active tasks linked to your module.
* **`getTask`:** Reads a specific task's metadata, due date, and assignee.
* **`getThread`:** Reads a task’s internal conversation notes and activity history.
* **`updateTaskStatus`:** Updates a task's state live in Steward (`open`, `active`, `waiting`, `closed`).

---

### 4. Inter-Module RPC (`HANDBOOK.md` §4, "Calling another module")
Allows modules to communicate directly with other modules without human intervention:
* **`callModule`:** Directly calls an operation offered by another module (`POST /{business}/modules/call`) with cryptographic HMAC signing and idempotency keys.
* **Operation Provider (`offers`):** Exposes endpoints (`POST /steward/operations/<name>`) for other modules to call.

---

### 5. Asking a Person (`HANDBOOK.md` §4, "Asking a person")
Allows a module to prompt a human for a decision or missing information:
* **`askPerson`:** Sends a structured question/choice directly into a person's **In-Tray**.
* **`getAsk`:** Reads the person's response once answered.
* **`withdrawAsk`:** Cancels a pending question if the need has passed.

---

### 6. Team, Roles & Org Structure (`HANDBOOK.md` §4 & §7)
Interacts with company hierarchy and permissions without storing local copies:
* **`listPeople`:** Queries active company employees and team members.
* **`listReportingLines`:** Queries manager-to-report organizational trees to determine approval routes.
* **`listRoles` & `listUnits`:** Discovers business directory roles and organizational teams.
* **`listModuleRoles`:** Reads who currently holds your module's custom permissions (e.g. `equipment_approver`).

---

### 7. Communications & Member Notifications (`HANDBOOK.md` §4)
Interacts with staff and outside contacts:
* **`createMessage`:** Stages an outbound email/message draft in Steward’s **Out-Tray** for human approval (enforcing the 10-second Undo safety buffer).
* **`getMessage`:** Checks approval status of an outbound draft.
* **`notifyMember`:** Dispatches high-priority system alerts to business owners appearing on their dashboard under *"From your apps"*.
* **`withdrawNotice`:** Clears an active notification once resolved (e.g. blocker cleared).

---

### 8. The Board Collaboration Feed (`HANDBOOK.md` §4, "Posting on the board")
Publishes informational broadcast updates:
* **`createBoardPost`:** Publishes cryptographically signed announcements to module channels (`module.<slug>`), case channels, or department channels.
* **`getBoardPost`:** Reads a board post when mentioned (`board.mention`).

---

### 9. Core CRM, Mail & Calendar Reads (`HANDBOOK.md` §4)
Accesses core records under strict viewer-token permissions:
* **`getContact`:** Reads an authorized customer/contact record.
* **`getEmail`:** Reads authorized email messages and threads.
* **`getFreeBusy`:** Checks calendar availability for meeting scheduling.

---

### 10. Projects & Client Sharing (`HANDBOOK.md` §4, "Projects", "Clients")
Manages deliverables and external client visibility:
* **`listProjects` & `getProject`:** Reads project codes, key prefixes (e.g. `POR`), and project owners.
* **`listClientShares`:** Discovers which projects are shared with external client companies.
* **`getFirstNames`:** Safely retrieves staff first names for client guest views without leaking full identities (`names-not-stored`).

---

### 11. Guest Keys & Outside Collaborators (`HANDBOOK.md` §4, "Guest keys")
Brings external clients or vendors into your module with narrow permissions:
* **`requestGuestKey`:** Generates a secure, scoped guest access link for an external user.
* **`listGuestKeys` & `revokeGuestKey`:** Manages and terminates active guest sessions.
* **`setScopeHelpers` & `listScopeHelpers`:** Assigns internal employees to help a guest.
* **`notifyGuest`:** Dispatches notices directly to a guest key holder.

---

### 12. Legal Records, Compliance & Audit (`HANDBOOK.md` §4, "Signed agreements")
Guarantees regulatory compliance and tamper-evident records:
* **`fileRecord`:** Seals and files tamper-evident PDF agreements and SHA-256 hashes with Steward.
* **`createAudit`:** Appends compliance trace entries to the company's audit log.
* **`createDeletionReceipt`:** Emits cryptographic deletion receipts confirming data was purged within required retention windows (`M6`).

---

### 13. External Services, Usage & AI Gateway (`HANDBOOK.md` §4)
Handles outside integrations and central metering:
* **`sendOutside`:** Securely routes requests to external third-party APIs (e.g. Slack, GitHub, carriers) through Steward's relay.
* **`completeAi`:** Calls LLMs (Claude, etc.) through Steward’s metered AI Gateway with automated budget caps.
* **`listUsage` & `listUsageSources`:** Tracks daily and distinct user activity metrics.
* **`setSourceState`:** Reports health of external data sync sources.

---

### 14. Inbound Webhook Events System (`EventReceiver` — 28 Events)
Your module can listen for cryptographically signed events, including:
* **Tasks:** `task.changed`
* **Handoffs:** `instruction.given`, `assignment.ended`
* **Proposals:** `proposal.decided`, `proposal_plan.decided`
* **Roles:** `module_roles.changed`, `role.changed`, `reporting_line.changed`
* **Mail & CRM:** `email.captured`, `email.deleted`, `contact.changed`, `mailbox.disconnected`
* **Collaboration:** `board.mention`, `ask.answered`, `ask.withdrawn`, `notice.done`
* **Lifecycle:** `module.enabled`, `module.disabled`, `module.read_only`, `business.purged`, `records.erased`