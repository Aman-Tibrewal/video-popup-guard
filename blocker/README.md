# Video Popup Guard

Stops pop-ups, invisible click-stealing layers, and ad redirects on video sites. The site's scripts still load, so there's nothing for ad-blocker detection to notice.

## Install in Opera

1. Go to `opera://extensions`.
2. **Remove Popup Recon** (the two shouldn't run together).
3. Make sure **Developer mode** is on, click **Load unpacked**, and select this `blocker` folder.
4. Pin it: cube icon in the toolbar → pin **Video Popup Guard**.

## Use it

1. Click the icon and flip the switch **on**. The icon shows a green **ON** badge.
2. Open the site (or click **Reload this tab** if you're already on the video page; pages opened before you turned it on aren't protected).
3. Watch normally. The badge turns orange and counts what was blocked on the page; click the icon for the breakdown.
4. Turn it **off** when you're done. While it's on, it also blocks legitimate pop-ups everywhere (e.g. "Sign in with Google").

### Keyboard (while ON, on any page with a video)

| Key | Action |
|---|---|
| Space / K | Play / pause |
| ← / → | Back / forward 10 seconds |
| ↑ / ↓ | Volume |
| F | Full screen |
| M | Mute |

Keys are ignored while you're typing in a text box.

## What it does

- **Pop-ups**: the page gets a fake window that reports success; nothing opens.
- **Hidden new tabs**: scripted forms and link clicks that would open a new tab are dropped.
- **Invisible layers** over the video become click-through. If a click still lands on one, it's turned into play/pause.
- **Ad scripts' click and key listeners** still run, but can no longer swallow your clicks or keys.
- **Safety net**: any new tab or window a page opens to a *different* site is closed and you're returned to your video. Tabs you open yourself to the *same* site (e.g. Cmd-click another video) are kept.
- **Redirect guard**: if a video page is sent to another site without you typing an address or clicking a real link, it goes straight back.

## Dead player domains

Some sites embed a video player from a domain that has gone offline (e.g. `luluvido.com`), so the player area stays blank. The same video usually still exists on the host's working domain (e.g. `lulustream.com`), at the same address.

- In the toolbar popup, **Fix dead player domains** turns this on or off. Off = sites load exactly as they are.
- **Manage domain redirects** opens a page where you can:
  - **Add redirect**: type the working domain under "Send to", then add one or more dead domains (separate several with commas, or paste whole links).
  - Remove a dead domain with its **×**, switch a single redirect off with its own switch, or **Delete** it.
- It starts with one redirect: `luluvido.com`, `luluvdo.com` → `lulustream.com`.
- It works separately from the pop-up switch, and applies to pages you open or reload afterwards.
- It catches mistakes: a domain listed twice, or redirects that would send domains back and forth in a loop, are flagged in orange and skipped.

## If something goes wrong

- **A pop-up still appears**: note what you clicked and what opened, and tell Claude.
- **Video won't play / a button doesn't work**: turn the switch off, reload, and check whether it works without the blocker.
- **Stuck pop-up window**: icon → **Close all pop-up windows**.
