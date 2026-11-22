# Chrome Web Store submission kit: Video Popup Guard 1.2.0

Copy each section into the matching field of the Chrome Web Store Developer Dashboard.

## Files in this folder

| File | Where it goes |
|---|---|
| `video-popup-guard-1.2.0.zip` | **Package** → Upload new package |
| `store-icon-128.png` | **Store listing** → Store icon |
| `screenshot-1-1280x800.png`, `screenshot-2-1280x800.png` | **Store listing** → Screenshots |
| `promo-tile-440x280.png` | **Store listing** → Small promo tile |
| `PRIVACY.md` | Publish somewhere public, then paste its link under **Privacy** → Privacy policy URL |

---

## Store listing tab

**Name:** Video Popup Guard

**Summary** (from the manifest, 126 characters):
> Stops pop-ups, invisible click-stealing layers and redirects on video sites, and gives you keyboard controls that always work.

**Category:** Tools

**Language:** English

**Description:**

```
Watch videos without the pop-up storm.

Some video sites bury their players under aggressive ads: every click on Play opens a pop-up, an invisible layer steals your clicks, and mid-video the controls stop responding until you sit through more pop-ups. Video Popup Guard makes those tricks fail quietly, without blocking the site's scripts.

WHAT IT DOES
• Pop-ups: ad scripts get a fake window that reports success, so nothing actually opens.
• Hidden new tabs: scripted forms and link clicks that try to open ad tabs are stopped.
• Invisible layers: transparent layers covering the video become click-through, so Play works the first time.
• Click and key hijacking: ad scripts can no longer swallow your clicks or key presses.
• Safety net: any stray tab or window a page opens to another website is closed, and you're returned to your video.
• Redirect guard: if the video page is sent to another website without you asking, it goes straight back.
• Keyboard controls that always work: Space/K play-pause, ←/→ seek 10 seconds, ↑/↓ volume, F full screen, M mute.
• Fix dead player domains: when a site embeds a player from a domain that has gone offline, load the same video from a working domain you choose. Manage any number of redirects, each with its own on/off switch.

ONE SWITCH
Turn protection on from the toolbar when you sit down to watch and off when you're done. The badge shows how many things were blocked on the current page.

PRIVATE BY DESIGN
No data collection, no analytics, no remote code. Everything runs locally in your browser.

Works in Chrome, Opera, Edge and Brave.
```

---

## Privacy tab

**Single purpose description:**
> Protects video playback on websites from pop-up ads, click-stealing overlays and unwanted redirects, and lets the user redirect video players hosted on offline domains to working ones.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `tabs` | To recognise new tabs and windows opened by a page, close unwanted ones, return focus to the video tab, and show a per-tab blocked count on the toolbar badge. |
| `webNavigation` | To detect when a page opens a new tab or redirects the video tab to another website, so the extension can close it or send the user back to the video. |
| `storage` | To save the user's settings (protection on/off, domain redirect list) and per-tab counters locally. |
| `scripting` | To register the in-page protection script only while the user has protection switched on, and remove it when they switch it off. |
| `declarativeNetRequestWithHostAccess` | To redirect video player requests from domains the user has listed as offline to the working domain the user chose. Only used for the user's own list. |
| Host permission `<all_urls>` | Video sites and their embedded players are hosted on many different and frequently changing domains, so the protection must be able to run on any page the user chooses to watch on. It only acts while the user's toolbar switch is on. |

**Are you using remote code?** No, I am not using remote code.

**Data usage:** tick **none** of the data types. Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** the public link to `PRIVACY.md` (see below).

---

## Distribution tab

**Visibility:** Unlisted (only people with the link can find and install it). You can switch to Public later.

**Regions:** All regions.

---

## Installing it in Opera afterwards

Once the listing is approved, open its link in Opera. Opera offers **Install Chrome Extensions** on Chrome Web Store pages; accept it once, then click **Add to Opera**. Updates then arrive automatically. Remove the unpacked copy from `opera://extensions` first, so you don't run two copies.
