# Video Popup Guard

A Chromium extension (Opera, Chrome, Edge, Brave) for video sites that bury their players under pop-up ads.

- **Pop-ups**: ad scripts get a fake "success" window, so nothing actually opens.
- **Invisible layers** over the video become click-through, so Play works the first time.
- **Click and key hijacking**: ad scripts still run, but can no longer swallow your clicks or keys.
- **Keyboard controls** that always work: Space/K, ← →, ↑ ↓, F, M.
- **Safety net**: stray tabs and windows are closed, and redirects away from the video page are reversed.
- **Dead player domains**: a managed list that sends offline player domains (e.g. `luluvido.com`) to a working one (e.g. `lulustream.com`).

It doesn't block any network requests, so ad-blocker detection has nothing to notice.

## Folders

| Folder | What it is |
|---|---|
| [`blocker/`](blocker/) | The extension itself. See [blocker/README.md](blocker/README.md) for usage. |
| [`recon/`](recon/) | Diagnostic recorder used to study how a site's pop-ups work. Observes only; blocks nothing. See [recon/README.md](recon/README.md). |

## Install

1. Download or clone this repository.
2. Open `opera://extensions` (or `chrome://extensions`).
3. Turn on **Developer mode** and click **Load unpacked**.
4. Select the `blocker` folder.

Run only one of `blocker` and `recon` at a time.
