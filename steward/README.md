# Steward linked authentication registration

This application is a **linked** Steward module. It runs as its own Next.js service on port 3300 and has its own PostgreSQL database. It proposes private pay-invoice tasks, reads the member/unit directory needed to address those proposals, and receives task/proposal events. It does not read Steward email, contacts, AI services, or payment providers.

It also declares deletion lifecycle events because Bills Tracker stores its own bill records. Signed event handling is implemented at `/steward/events`.

## Local sandbox commands

The installed `steward` command must be version 1.20.0 or newer. The older local 1.16.0 command predates the current own-data sign-in contract. The SDK checkout may also have a stale binary, so rebuild it from the current source before registering.

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

## Required issued values

After registration, record these server-only values in `.env`:

- `STEWARD_ISSUER`
- `STEWARD_WEB_CLIENT_ID`
- `STEWARD_CORE_URL`
- `STEWARD_SIGNING_KEY` (for signed deletion events)
- `STEWARD_CLIENT_ID` and `STEWARD_CLIENT_SECRET` (for deletion receipts)

Keep `STEWARD_REDIRECT_URI` exactly equal to the registered URL:

```text
http://localhost:3300/auth/callback
```

The app uses the TypeScript SDK's PKCE flow, creates an app session only after Steward's sign-in check succeeds, and verifies signed events before updating bill/task state.
