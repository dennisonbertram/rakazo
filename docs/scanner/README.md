# Document scanner: paper in, PDF in the Data room

Status: plan only, no product code. File references were read at `origin/main` (c2be84f24). Format follows `docs/omi/README.md`. Mockup: `docs/scanner/mockup.html`.

## Decisions

Decided by the owner on 2026-11-01 unless marked open.

| # | Question | Decision |
|---|---|---|
| D1 | Which scanner? | Fujitsu/Ricoh PFU ScanSnap iX1600 first (the owner's), iX1500 next. Any scanner the open-source SANE `fujitsu` backend drives should work, but only the iX1600 has been tried. |
| D2 | USB or Wi-Fi? | USB first. Wi-Fi is researched in parallel and built later as its own phase (see "Wi-Fi"). |
| D3 | Where does the scanner code run? | The Praci desktop app (Electron main process). It already holds the signed-in session, so no new credential is needed. |
| D4 | How does a scan start? | Both, with a switch: **Scan when paper is loaded** (on by default) and a **Scan** button in the app. The scanner's own touch-screen Scan button is still being investigated (S0). |
| D5 | Where do scans go? | A "Scans" folder at the top of the Data room, created on first use with `ensureDataRoomFolder` (`apps/web/src/lib/data-room.ts`). The folder can be changed in the scanner panel. Filing into "whichever folder is open" is not used: an automatic scan can happen while any page is open. |
| D6 | How does the desktop app get SANE? | v1 requires Homebrew `sane-backends` on macOS (or the distro package on Linux) and says so when it is missing. Bundling `libsane` into the signed app is a later step if the owner wants zero setup. |

## Summary

The user plugs the scanner into the Mac by USB and opens the Praci desktop app. The Data room shows the scanner as connected. The user puts paper in the feeder. About two seconds later the app scans both sides of every sheet, drops blank pages, makes one PDF, and uploads it to the "Scans" folder. The existing upload toast says "Uploaded to Scans" once the server has stored the file; the app also checks that the stored SHA-256 matches the PDF it made before deleting its local copy. The document then goes through the Data room's normal reading and indexing, and shows as ready like any upload. If the upload fails, the PDF stays on the Mac and is sent again; nothing is lost silently.

## User story

- **Faster.** No vendor app, no save dialog, no drag and drop. Paper in, document filed.
- **Simpler.** One switch and one button. The scanner either says it is connected or says what is wrong.
- **Certain.** The local copy is deleted only after the server confirms it stored exactly the bytes that were scanned; a mismatch shows an error and keeps the PDF.

## What is confirmed

### Hardware test on the owner's iX1600 (2026-11-01, macOS 15 on Apple Silicon, USB, ScanSnap Home not running, Homebrew `sane-backends` 1.4.0)

| Fact | Result |
|---|---|
| `scanimage -L` finds the scanner (`fujitsu:ScanSnap iX1600:<serial>`) | Works |
| Sources `ADF Front`, `ADF Back`, `ADF Duplex`; modes Lineart, Halftone, Gray, Color; 50–600 dpi | Read from `scanimage -A` |
| `page-loaded` sensor turns on when paper is put in the feeder | Works |
| `scanimage --source "ADF Duplex" --mode Color --resolution 300 --format=jpeg --batch` scans every side and stops with "Document feeder out of documents", exit code 0 | Works: two sides, 2550×3300 px each (US Letter at 300 dpi), upright and readable |
| `--swskip` (software blank-page skip) | Accepted; whether it dropped a real blank side was not tested |
| Touch-screen Scan button | Shows "ScanSnap is not responding" (it hands the press to ScanSnap Home). The SANE `scan` sensor never turned on in a 1 s poll. Under investigation (S0) |

### From SANE sources (not tried here)

- The `fujitsu` backend lists the iX1500 (`04c5:159f`) and iX1600 (`04c5:1632`) in `fujitsu.conf` (sane-backends 1.4.0).
- Only one program can hold the scanner. ScanSnap Home, if running, blocks SANE.
- The backend has no network support; Wi-Fi needs a separate client (see "Wi-Fi").
- The iX1500/iX1600 screen may dim after about 13 minutes on USB without vendor software; a tap wakes it (one project's report, `appositeit/panelbeater`).

## Design

### Desktop main process: scanner service (`apps/desktop/src/scanner.ts`)

- **Find SANE.** Look for `scanimage` on the usual paths (`/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`). Missing → state `sane-missing`.
- **Find the scanner.** `scanimage -L`, keep `fujitsu:` devices. None → `not-found`. "Device busy" → `busy` (another app has it).
- **Watch the feeder.** While the app is open and auto-scan is on, read `page-loaded` once a second with `scanimage -d <dev> -A`. When it has been on for 2 s, scan. After a scan, wait for `page-loaded` to go off before arming again, so a jam does not cause a loop.
- **Scan.** `scanimage -d <dev> --source "ADF Duplex" --mode Color --resolution 300 --format=jpeg --batch=<tmp>/page%03d.jpg --swskip <n>` into a fresh temporary directory. Exit 0 with at least one page → success. Any other end (jam, double feed, cover open, cancelled) → no upload, pages deleted, state `error` with the reason; the user reloads and scans again. A partial document is never filed.
- **Make the PDF.** A small writer in the same module embeds each JPEG unchanged as a DCTDecode image on its own page, sized from the JPEG's frame header at the scan resolution. About 80 lines, no new dependency (none of the repo's packages has a PDF library today). Unit-tested against fixture JPEGs.
- **Outbox.** The PDF is written to `<userData>/scan-outbox/` with its SHA-256 before upload, and deleted only after the renderer confirms a matching stored hash. On app start and whenever the window becomes ready, anything left in the outbox is offered again. The server already returns the existing item for a file with the same SHA-256 in the same space (`packages/db/src/data-room.ts`, upload dedupe), so a repeat send never makes a second copy.
- **Settings.** Auto-scan on/off, target folder path, resolution and color mode live in the desktop's local settings (`apps/desktop/src/setup-store.ts`). They are per machine because the scanner is per machine.

### IPC

Exposed on `window.rakazoDesktop.scanner` in `apps/desktop/src/preload.cjs`, only on macOS and Linux:

- `state()` and `onState(listener)`: `{ kind: "sane-missing" | "not-found" | "busy" | "ready" | "scanning" | "error", device?, error? }`.
- `scan()`: start a scan now. `cancel()`: stop a running scan; nothing is filed.
- `setAutoScan(on)`, `setFolder(path)`.
- `onDocument(listener)`: delivers `{ id, name, bytes, sha256 }` for each PDF in the outbox.
- `confirm(id, storedSha256)`: main deletes the outbox file only when the hashes match.

### Web (renderer)

- When `window.rakazoDesktop?.scanner` exists, the Data room toolbar shows a scanner control next to Import. It is absent on web, mobile and Windows desktop.
- The control shows the state in one short line and, on open, the **Scan when paper is loaded** switch, a **Scan** button and the folder.
- Each delivered PDF goes through the existing `uploadFilesToDataRoom` (`apps/web/src/components/data-room/upload-toasts.ts`) into `ensureDataRoomFolder(folderPath)`, so progress, stalls, retry, duplicates and the folder toast are the ones every upload already has. Its `onUploaded` callback compares the item's `sha256` with the PDF's and calls `confirm`. A mismatch shows an error toast and leaves the PDF in the outbox.
- Name: `Scan 2026-11-01 09.01.pdf` (local time). The Data room's existing classify step and Auto-sort can rename or move it later.

### Server

- Add `sha256` to the Data room item returned by `POST /api/data-room/upload` and to `DataRoomApiItemSchema` (`packages/contracts/src/data-room-api.ts`, `itemDto` in `apps/api/src/data-room.ts`). The column already exists (`data_room_items.sha256`). No other server change: the route, storage, dedupe and ingest are reused.

### Security and tenancy

- The upload uses the signed-in session and the selected space, exactly like "Add files". No token is stored by the scanner service.
- The outbox holds documents on the user's own disk until confirmed; a confirmed file is deleted. Signing out or switching space stops delivery (the renderer's upload scope already refuses cross-scope retries) and the outbox waits for the same user and space. `ponytail:` the outbox does not record which space a PDF was meant for; add that if users switch spaces mid-scan.
- No scanned content in logs or error strings.

### Surfaces

| Surface | Behavior | Reason |
|---|---|---|
| Desktop, macOS | Full feature | USB scanner on the user's machine |
| Desktop, Linux | Same code; untested | SANE is native there |
| Desktop, Windows | Control hidden | No SANE; would need WIA or TWAIN |
| Web, mobile, iOS | Control hidden; scans appear in the Data room like any file | A browser or phone cannot reach a USB scanner |

## The touch-screen Scan button (S0)

On USB, the iX1600 sends its Scan press to ScanSnap Home and shows "not responding" without it. To try:

1. Log every SANE hardware sensor while pressing the button. A first 4-minute log on 2026-11-01 (about 22 reads a second) saw no change except the scanner waking, but the paper sensor never turned on either, so the button was probably not pressed during it. Run again with someone at the scanner.
2. If nothing changes, the press is a vendor-specific USB message. Capturing it would need a USB trace on macOS, which is not practical without extra tools; stop there for USB.
3. On Wi-Fi the button is documented to work without ScanSnap Home (below), so the button may only come with the Wi-Fi phase.

## Wi-Fi (later phase)

Research summary (2026-11-01, from source; nothing run on hardware):

- **iX1500: feasible.** Two independent reverse-engineered projects scan and receive Scan-button presses over Wi-Fi: `elte0/scansnack` (MIT) and `appositeit/panelbeater` (GPL-2.0). They agree on the protocol: UDP 52217 discovery, TCP 53219 control, TCP 53218 scan channel tunnelling SCSI commands, a UDP datagram to the selected host on a button press, JPEG pages.
- **iX1600: unconfirmed.** No project has tested it.
- **Pairing** needs no key from ScanSnap Home: the app registers itself, then the user taps it once on the scanner's screen.
- **Wi-Fi and USB are exclusive**: an active Wi-Fi registration breaks USB scanning, and a USB cable blocks Wi-Fi registration.
- **No encryption or authentication.** Anyone on the LAN can register, trigger scans and, if selected, receive pages. Only on a trusted network.
- **Effort:** about 1,200–1,800 lines of TypeScript in the main process, ported from scansnack (MIT, keep its notice). panelbeater is GPL and may be read as protocol documentation only; no code is copied from it.
- **Gate:** before any Wi-Fi code, run scansnack's CLI once against the owner's iX1600 in a throwaway checkout (claim, scan, listen).

## Slices (one PR each)

| Slice | Scope | Depends on |
|---|---|---|
| **S0 Button probe** | Finish the sensor log for the touch-screen button; record the result here. Not merged code. | owner's scanner |
| **S1 Stored hash** | `sha256` on the upload response and `DataRoomApiItemSchema`; API test that the returned hash equals the uploaded bytes' hash; regenerate the API spec. | — |
| **S2 Desktop scanner service** | `scanner.ts` (SANE lookup, device list, feeder watch, scan, PDF writer, outbox), settings, IPC and preload. Unit tests drive a fake `scanimage` script (fixture JPEGs, empty feeder, jam, busy, missing SANE) so they run offline. | — |
| **S3 Data room scanner control** | Toolbar control with states, switch, Scan button and folder; upload through `uploadFilesToDataRoom`; hash check and `confirm`. Storybook stories for every state with a mocked `rakazoDesktop.scanner`; E2E screenshot of the control on a mocked desktop bridge. | S1, S2 |
| **S4 Wi-Fi gate** | Run scansnack against the owner's iX1600; record the result here. Not merged code. | owner's scanner |
| **S5 Wi-Fi client** | TypeScript client in the main process, pairing flow, button listener, same outbox and IPC. | S2, S4 passing |

Hand test for S2 and S3: the owner's iX1600 on USB with the desktop app pointed at a demo stack (`DEMO_SLOT=<n> pnpm demo:up`), never the live stack. Load paper, see the toast, open the PDF in the Data room, check both sides are there. Unplug mid-scan and check nothing partial is filed. Stop the API mid-upload and check the PDF is sent again after it returns.

## Mockup

`docs/scanner/mockup.html`: the toolbar control beside Import, the open control, its states (SANE missing with Copy command, no scanner, busy, scanning with Cancel, error), and the existing upload toast. There is no status dot on the toolbar: the state shows inside the control, and an error during an automatic scan raises a toast. Popover sizes are approximations of the Import menu.

## Not built

- ScanSnap Home profiles, OCR text layer (the Data room already reads scanned PDFs), deskew or crop beyond what SANE does, SV600 and iX2500 (not supported by SANE), Windows.
