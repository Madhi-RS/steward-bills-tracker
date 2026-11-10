# Steward Bills Tracker

An independent Next.js application for recording everyday bills, tracking payments, and seeing upcoming payment deadlines. It uses Steward only for linked-app authentication; it is not a Rust Steward module or a separate SDK service.

## Stack

- Next.js `16.4.5` with the App Router
- React `19.3.1`
- TypeScript `5.9.3`
- Tailwind CSS `4.3.4`
- PostgreSQL via Prisma ORM `6.19.0`
- ESLint `9.39.5` with Next.js lint rules
- Zod `4.3.6` for runtime validation schemas
- Vitest `5.1.0` for calculation, validation, and API tests

Exact dependency versions are pinned in `package.json` and recorded in `package-lock.json` after installation.

## Prerequisites

- Node.js `22.18` or newer (required by the Steward TypeScript SDK)
- npm
- Access to the existing PostgreSQL database named `bills_db`

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create your local environment file from the example:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Update `DATABASE_URL` in `.env` with the credentials for the already-created `bills_db` database. Do not commit `.env`.

4. Generate Prisma Client:

   ```powershell
   npm run prisma:generate
   ```

5. Apply the committed migration to the existing `bills_db` database:

   ```powershell
   npm run prisma:migrate:deploy
   ```

6. Start the application:

   ```powershell
   npm run dev
   ```

Open [http://localhost:3300](http://localhost:3300). The health endpoint is available at [http://localhost:3300/api/health](http://localhost:3300/api/health).

## Database and migrations

`DATABASE_URL` is read from `.env` by Prisma. It must target the existing `bills_db` database, for example:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/bills_db?schema=public"
```

The initial tracked migration, `20261105000000_create_bills_table`, creates only the `Bill` table and its deadline index. It does not create, reset, or drop `bills_db` or any unrelated object. It includes database checks to ensure:

- total amount is positive;
- paid amount is not negative or greater than total;
- pending amount is not negative and always equals `totalAmount - paidAmount`.

The migration has not been applied by this workspace because no local `DATABASE_URL` credential was supplied. After adding a valid local `.env`, apply it with:

```powershell
npm run prisma:migrate:deploy
```

When application schema changes are added later, create a non-destructive development migration with:

```powershell
npm run prisma:migrate:dev -- --name describe_the_change
```

Commit the generated `prisma/migrations/<timestamp>_describe_the_change` directory and `migration.sql`. Never use `prisma migrate reset`, database drop commands, or other destructive operations against `bills_db`.

To apply migrations that are already committed in another environment, set that environment's `DATABASE_URL` and run:

```powershell
npm run prisma:migrate:deploy
```

`prisma migrate deploy` applies pending committed migrations only; it does not create new migration files. Never use `prisma migrate reset`, database drop commands, or `prisma db push` for this project.

### Bill schema

| Field | Database type | Notes |
| --- | --- | --- |
| `id` | UUID | Prisma-generated unique ID |
| `reason` | `VARCHAR(160)` | Bill purpose |
| `totalAmount` | `DECIMAL(12,2)` | Must be greater than zero |
| `paidAmount` | `DECIMAL(12,2)` | Cannot exceed the total |
| `pendingAmount` | `DECIMAL(12,2)` | Calculated on the server; database checked |
| `payBefore` | `DATE` | Required payment deadline |
| `createdAt`, `updatedAt` | `TIMESTAMP(3)` | Creation and update records |

Status is derived on the server and never stored or accepted from a client: `UNPAID`, `PARTIALLY_PAID`, or `PAID`.

## API

Every successful API response wraps its result in `{ "data": ... }`; failures use `{ "error": { "code", "message", "issues?" } }`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/bills` | List bills and summary totals; supports `search`, `status`, `sortDirection` |
| `POST` | `/api/bills` | Create a bill from `reason`, `totalAmount`, `paidAmount`, and `payBefore` |
| `GET` | `/api/bills/:id` | Retrieve one bill |
| `PUT` | `/api/bills/:id` | Update a bill; recalculates pending amount and status |
| `DELETE` | `/api/bills/:id` | Delete a bill, returning `204` |

Amounts are submitted as decimal strings (for example, `"1250.50"`). The API validates every request and calculates `pendingAmount` itself; it never accepts a client-supplied pending amount or status.

## Dashboard

The home page includes:

- four all-bill summary cards (total, paid, pending, and open bills);
- responsive desktop/mobile bill lists with Indian Rupee formatting;
- search, status filter, deadline sort, and clear-filters actions;
- overdue and seven-day upcoming deadline cues;
- add/edit form with client-side pending preview and server validation;
- delete confirmation, loading, success, error, and empty states.

## Testing

```powershell
npm test
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
```

The test suite covers pending and status calculation, invalid amounts and missing deadlines, authenticated API list/search/filter, create/update/delete behavior, missing records, and database-error responses. API tests mock Prisma and the auth boundary, so tests never touch `bills_db` or Steward.

## Steward authentication and bill-task sync

No authentication is faked or assumed. The committed [Steward registration](steward/registration.json) prepares this independent Next.js application as a linked module that keeps its own bill records and can propose `task.create` work. It reads the visible member/unit directory to choose an assignee and company, and listens for `proposal.decided` and `task.changed` so an accepted task can be linked back to its bill.

Before registering it in the sandbox, update the installed `steward` CLI to SDK 1.20.0 or newer. See [steward/README.md](steward/README.md) for the exact register, update, credential, and local forwarding commands.

After Steward issues the linked-app values, put them only in the ignored `.env` file: `STEWARD_PAGE_MODE=linked`, `STEWARD_CORE_URL`, `STEWARD_ISSUER`, `STEWARD_WEB_CLIENT_ID`, `STEWARD_CLIENT_ID`, `STEWARD_CLIENT_SECRET`, `STEWARD_SIGNING_KEY`, `STEWARD_REDIRECT_URI=http://localhost:3300/auth/callback`, and `STEWARD_SIGN_IN_ONLY=0`. The login endpoint uses the official TypeScript SDK's PKCE flow. It stores the state and verifier in a short-lived server-side store, then `/auth/callback` calls `StewardSignIn.finish()` before it creates an opaque, HttpOnly, SameSite=Lax app-session cookie. Access and refresh tokens remain server-side and are never logged or put in browser storage. A refused callback displays the Steward refusal code.

The current session store is process-local, which is appropriate for local development. Before deploying across multiple instances, replace it with a shared, encrypted server-side session store. Bills are partitioned by Steward business; members see only bills assigned to them, while owners/admins manage their business's bills.

### Person A → Person B sandbox test

1. Update the module registration and obtain its current keys:

   ```powershell
   $SdkRoot = "C:\Users\MadhiarasiRS\Documents\GitHub\steward-module-sdk"
   $Steward = Join-Path $SdkRoot "target\release\steward.exe"
   $env:STEWARD_NO_KEYCHAIN = "1"
   & $Steward login --sandbox https://sandbox.runsteward.ai
   & $Steward modules update steward-bills-tracker --from "$PWD\steward\registration.json"
   & $Steward modules keys steward-bills-tracker --show
   & $Steward sandbox member
   ```

   Put the issued values in `.env`, set `STEWARD_SIGN_IN_ONLY="0"`, and ensure the module is shown to the Member role in Steward so Test Member can open it. Never paste issued secrets into source control.

2. Prepare and start the bill app:

   ```powershell
   npm run prisma:generate
   npm run prisma:migrate:deploy
   npm run dev
   ```

   The task-tracking migration preserves pre-existing bills as `legacy-unassigned`. They are visible to the first owner/admin and are adopted into that Steward business when edited or assigned.

3. In a second terminal, forward signed Steward events:

   ```powershell
   $SdkRoot = "C:\Users\MadhiarasiRS\Documents\GitHub\steward-module-sdk"
   $Steward = Join-Path $SdkRoot "target\release\steward.exe"
   $env:STEWARD_NO_KEYCHAIN = "1"
   & $Steward listen --module steward-bills-tracker --forward-to 127.0.0.1:3300
   ```

4. Person A opens `http://localhost:3300/auth/login`, signs in normally, creates or selects a bill, chooses **Assign**, selects **Test Member (sandbox)**, and chooses **Propose task**. The bill should show `Task: PENDING REVIEW`.

5. Person A opens Steward → **Setup and admin → Modules → Waiting for your review**, opens the `task.create` proposal, and accepts it. The event terminal should show successful deliveries (`-> 200`), and refreshing Bills Tracker should show `Task: OPEN`.

6. Run `steward sandbox member`, open its **View Steward as them** URL, and choose **View as test member**. While the Steward banner says **Viewing as Test Member (sandbox)**, open Bills Tracker from Steward. Use the bill app's **Log out** button first, then choose **Sign in with Steward**. This ends only the bill-app session; it does not end the owner’s Steward sandbox session that supplies the Test Member view.

7. Person B opens the new private **Pay invoice: …** task. Use **Open in Steward Bills Tracker** to confirm only the assigned invoice is visible, return to Steward, and mark the task complete.

8. Watch the forwarding terminal for `task.changed -> 200`, then refresh Bills Tracker. The expected final values are:

   - Steward task: `COMPLETED`
   - paid amount: equal to total amount
   - pending amount: `₹0.00`
   - payment status: `PAID`

   If Steward reports the task done but requires its owner to confirm closure, switch back to Person A and confirm it. Bills Tracker intentionally marks the invoice paid only on Steward's final `closed` event, not on an intermediate “reported done” state.

9. Run the local regression checks:

   ```powershell
   npm test
   npm run typecheck
   npm run lint -- --max-warnings=0
   npm run build
   ```

The app does not contact a payment provider. A closed Steward task is treated as the human confirmation that payment is complete.

## Useful commands

```powershell
npm run dev               # Start development server on port 3300
npm run build             # Create a production build
npm run start             # Serve a production build on port 3300
npm run lint              # Run ESLint
npm run typecheck         # Run TypeScript checks
npm test                  # Run unit and API-route tests
npm run prisma:generate   # Generate Prisma Client
```

## Project structure

```text
app/                         Application routes and route-level UI
  api/health/route.ts        Minimal API route
  globals.css                Global Tailwind styles
  layout.tsx                 Root HTML layout and metadata
  page.tsx                   Responsive landing page
components/                  Reusable dashboard UI components
  auth/                      Steward sign-in landing screen
  bills/                     Forms, summary cards, status, table, dashboard
lib/                         Shared application code
  api.ts                     Consistent API error responses
  bills.ts                   Exact money, summary, and status calculations
  db.ts                      Reusable Prisma Client instance
  auth.ts                    Server-only opaque auth session store
  steward.ts                 Server-only Steward SDK configuration
  format.ts                  Indian Rupee and date display formatting
  utils.ts                   General utility functions
  validations/bill.ts        Runtime input and query validation schemas
prisma/
  schema.prisma              PostgreSQL datasource and Bill model
  migrations/                Tracked non-destructive Prisma migrations
tests/                       Vitest calculation and API tests
types/                       Shared API and application types
.env.example                 Safe database connection template
```
