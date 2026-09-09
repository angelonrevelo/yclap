**RESOLVED: eComon** (Angelo, 09-09) — app, manifest, deck, and `--product-name` flipped to eComon. Canva PNGs still need a manual edit.

# Two messages to send this morning

The only things standing between the boards and the printer are one group
decision and one file. Both are drafted here so they cost a copy-paste rather
than a rewrite.

Files ready to attach: `docs/deck/2026-09-12-board/board-1-a3.png`,
`board-2-a4.png`, `board-3-a4.png`.

---

## 1 · To the group chat — the name, before the PNG goes out

> Guys, isang bagay lang bago natin i-send kay Ma'am Shenina: **yung pubmat
> natin ay "eComon" pa rin, pero nanalo si "magisphere" sa poll** (9:32pm,
> after ko na-post yung pubmat 8:36pm 😅). Yung app, yung website at yung deck
> ay Magisphere na lahat.
>
> Kailangan lang natin pumili kasi **print lang yung hindi na natin
> mababago sa Friday** — kaya ng app at slides mag-adjust anytime, yung sintra
> boards hindi.
>
> Tatlo lang naman options:
> 1. **Boards = Magisphere** — sunod sa poll, isang salita lang ang palit sa
>    design file, ready na agad.
> 2. **Lahat = eComon** — babalikan ko yung app at deck, kaya pa ngayong araw.
> 3. **Both** — eComon as the team/campaign name, Magisphere as the app. Pwede
>    rin, basta may isang linya tayo sa booth na nag-eexplain.
>
> Ano sa tingin niyo? Kahit reaction lang para makapag-send na tayo. 🌏🦅

**If the answer is Magisphere** (the poll's answer): nothing to do — the boards
already render it.

**If the answer is eComon**: edit one line in
`docs/deck/2026-09-12-board.html` —

```css
--product-name: "eComon";
```

— re-render the three PNGs, and tell me so I can swap the app, the manifest,
the deck and the concept note to match.

---

## 2 · To Ms. Shenina — sending the boards

> Good morning po, Ma'am Shenina! Here are the three pubmats for the sintra
> boards — **2 A4 and 1 A3** po, as discussed.
>
> Attaching them as PNG. Print-ready po sila at 300 dpi (A4 2480×3508, A3
> 3508×4961).
>
> One thing po: **hindi pa po final yung QR code** — naka-placeholder pa siya
> sa design. Gagawin po namin siya through `go.ateneo.edu/QRcode` sa "a"/eagle
> style tulad ng sabi niyo, tapos ipapalit namin agad at ire-send ulit yung
> final files.
>
> Thank you po sa pag-follow up sa Intermatrix! 🙏

**Do not send the boards as final until the QR is swapped in** — the placeholder
literally reads "REPLACE THIS" on the artwork, which is deliberate so it cannot
go to a printer by accident, but it does mean these are a *preview* until the
real QR lands.

---

## The QR, in three steps

1. Open `https://go.ateneo.edu/QRcode`, choose the **"a" or eagle** style.
2. Point it at wherever the app will live. If nothing is deployed yet, point it
   at the Drive folder for now and regenerate once there is a URL —
   `drive.google.com/drive/folders/1NeMf512NMQt12BSGhzIq8R6dgFn3nLKq`.
3. Save the PNG as `docs/deck/2026-09-12-asset/qr-ateneo.png`, then in
   `2026-09-12-board.html` replace the `.qr` placeholder block with
   `<img src="2026-09-12-asset/qr-ateneo.png" alt="">` and re-render.

---

## Still open after this, and who owns it

| Thing | Owner |
|---|---|
| The name | The group — message 1 above |
| The real QR | Whoever has the go.ateneo.edu access |
| Saturday's display — no TV confirmed, only Ivan's projector | Ivan / Ms. Shenina |
| Installing the app on a physical phone (`npm run handset`) | Needs a person holding a phone |
| Registrations — 4 so far | Everyone |
| The rest of the mentor recording, which cuts off at "a few suggestions" | Whoever recorded it |
