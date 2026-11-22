# Popup Recon: setup and recording guide

A diagnostic extension. It **blocks nothing**: pop-ups still happen while it runs. It records *how* they happen so we can build the real blocker.

While recording is off, it doesn't touch any web page. It only records the tab you press **Start** on, plus any tabs that tab opens. The rest of your browsing is ignored, and anything you type into text boxes is never recorded.

## 1. Install in Opera (one time)

**Updating from an older version?** Go to `opera://extensions` and click the circular reload arrow on Popup Recon. That's all.


1. Go to `opera://extensions` in the address bar.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `recon` folder.
4. Pin it: click the cube icon in the toolbar (top right), then the pin next to **Popup Recon**.

(Chrome works the same way: `chrome://extensions` → Developer mode → Load unpacked → puzzle icon to pin.)

Keep Opera's built-in ad blocker set the way you normally use it.

## 2. Record a session (about 3 minutes per site)

1. Open the site's **home or listing page** (where you pick a video).
2. Click the Popup Recon icon → **Start recording on this tab**. Nothing reloads.
3. Click into the video you want, then use the site like you normally would:
   - Click Play and get through all the pop-ups to start the video.
   - Let it play for **2–3 minutes**, so the mid-video lockout happens.
   - When it locks up, try pause/play, seeking, and full screen, with **both mouse and keyboard**.
4. When something annoying happens, open the popup and type a quick note, e.g.
   *"keyboard stopped working"*, *"5th popup, video finally plays"*, *"fullscreen click opened ad"*.
   Notes are optional but very helpful.
5. **Keep the video tab open.** Click **Stop**, then **Export report**. A `recon-<site>-<time>.json` file goes to your Downloads folder.
6. Drag that file into the chat.

If you can, record **2 sites**, ideally one that asks you to disable your ad blocker.

## Notes

- Be careful on the ad pages that open: don't click **Allow** on notification prompts, and don't download anything.
- Remove the extension once we're done with recon (`opera://extensions` → Remove).
