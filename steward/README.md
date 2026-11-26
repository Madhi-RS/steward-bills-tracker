# Steward linked authentication registration

This application is a **linked** Steward module. It runs as its own Next.js service on port 3300 and has its own PostgreSQL database. It proposes private pay-invoice tasks, including grouped proposal plans of up to 25 tasks for one review, reads the member/unit directory needed to address those proposals, and receives task/proposal events. It does not read Steward email, contacts, AI services, or payment providers.

It also declares deletion lifecycle events because Bills Tracker stores its own bill records. Signed event handling is implemented at `/steward/events`.

## Local sandbox commands

The installed `steward` command and TypeScript SDK must be version 1.31.1. The SDK checkout may also have a stale binary, so rebuild it from the current source before registering.

Build and use the current CLI, then register from the Bills Tracker repository:

```powershell
$SdkRoot = "C:\Users\MadhiarasiRS\Documents\GitHub\steward-module-sdk"
$ProjectRoot = "C:\Users\MadhiarasiRS\PROJECTS\steward-bills-tracker"

Set-Location $SdkRoot
cargo build --release -p steward-cli
$Steward = Join-Path $SdkRoot "target\release\steward.exe"
& $Steward --version

Set-Location $ProjectRoot
# Windows Credential Manager rejects some current Steward refresh tokens because of its 2560-character limit.
# This uses the CLI's owner-protected file store under %APPDATA%\steward instead.
$env:STEWARD_NO_KEYCHAIN = "1"
& $Steward login --sandbox https://sandbox.runsteward.ai
& $Steward whoami
& $Steward modules register --from "$ProjectRoot\steward\registration.json" --show
& $Steward modules keys steward-bills-tracker --show
```

`--show` prints credentials. Copy only the issued values into your untracked `.env`; never paste them into this repository, chat, or source code.

If the module already exists, update its registration after reviewing the change:

```powershell
$SdkRoot = "C:\Users\MadhiarasiRS\Documents\GitHub\steward-module-sdk"
$ProjectRoot = "C:\Users\MadhiarasiRS\PROJECTS\steward-bills-tracker"
$Steward = Join-Path $SdkRoot "target\release\steward.exe"
$env:STEWARD_NO_KEYCHAIN = "1"

& $Steward modules update steward-bills-tracker --from "$ProjectRoot\steward\registration.json"
& $Steward modules keys steward-bills-tracker --show
```

Run the application in one terminal and Steward forwarding in another:

```powershell
npm run dev

$SdkRoot = "C:\Users\MadhiarasiRS\Documents\GitHub\steward-module-sdk"
$Steward = Join-Path $SdkRoot "target\release\steward.exe"
$env:STEWARD_NO_KEYCHAIN = "1"
& $Steward listen --module steward-bills-tracker --forward-to 127.0.0.1:3300
```

The `steward listen` process renews its own developer sign-in automatically. If it ultimately reports that the sign-in ended, rerun `steward login`; do not put a developer `STEWARD_TOKEN` into the web application's environment.

## HireScope business-board pairing

`registration.json` requests the `collaborator` board template for a paired, read-only exchange: Bills Tracker asks HireScope on `module.hirescope` for onboarding status, and HireScope may ask Bills Tracker on `module.steward-bills-tracker` for the pending-bill count.

**[operator]** After registering or updating both modules, have the business owner approve the Collaborator template and pair Bills Tracker with HireScope before sending a question. The owner controls this grant; the app cannot elevate its own board access.

Bills Tracker's HireScope question uses the fixed vocabulary `onboarding status for <employee-code>` and includes a `[ref:<20-hex>]` suffix which HireScope echoes in its answer. Bills Tracker permits one open question per business, sends it with its module signature and no sources, and displays only a matching `answer` mention. As a responder, it accepts `Please provide the total number of pending bills` with an optional final period from either `module.hirescope` or `module.steward-bills-tracker` and returns the count of its own current-business bills with `pendingAmount > 0`. Board answers are informational: they never change a bill, create a proposal/task, or read HireScope data.

For the sandbox end-to-end check, run `steward listen` for both paired modules, post the question from Bills Tracker, and confirm each listener reports the appropriate `board.mention -> 200`. Check both posts in the board history and the answer in Bills Tracker's HireScope panel.

## Required issued values

After registration, record these server-only values in `.env`:

- `STEWARD_ISSUER`
- `STEWARD_WEB_CLIENT_ID`
- `STEWARD_CORE_URL`
- `STEWARD_MODULE_ID` (the opaque `mod_...` identifier returned by Steward; used to sign board posts)
- `STEWARD_SIGNING_KEY` (for signed Steward events and signed board posts)
- `STEWARD_CLIENT_ID` and `STEWARD_CLIENT_SECRET` (for service calls, including board reads/posts and deletion receipts)

Keep `STEWARD_REDIRECT_URI` exactly equal to the registered URL:

```text
http://localhost:3300/auth/callback
```

The app uses the TypeScript SDK's PKCE flow, creates an app session only after Steward's sign-in check succeeds, and verifies signed events before updating bill/task state.
