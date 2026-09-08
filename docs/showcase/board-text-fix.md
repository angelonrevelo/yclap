# The one paragraph to change before the boards print

Boards **5** and **8** of the Canva export, and **slide 9** of `ADMU.pptx`, all
carry the same sentence. Replace it in Canva before sending to Intermatrix.

## Find this

> To make learning more engaging, *Magis*phere incorporates gamified features
> such as species badges, **points**, challenges, and **leaderboards** inspired
> by location-based exploration games. Students can participate individually or
> through campus-wide activities such as biodiversity hunts, photo challenges,
> and species-of-the-week activities, making environmental learning more
> interactive and participatory.

## Replace with this

> To make learning more engaging, *Magis*phere incorporates gamified features
> such as species badges, collections, and challenges inspired by
> location-based exploration games — **personal progression rather than public
> ranking**. Students can participate individually or through campus-wide
> activities such as biodiversity hunts, photo challenges, and
> species-of-the-week activities, making environmental learning more
> interactive and participatory.

Two words in, two out. Same length, same rhythm, fits the same text box.

## Why it matters more than a wording nit

The app has badges. It has **no points and no leaderboard**, and that is a
decision rather than a gap:

- There is no field in the sync payload from which a rank could be built. The
  wire carries a name, a stage and a count, and nothing to sort by.
- `web-forest/test/badge.test.ts` fails the build if any badge's name or blurb
  mentions *synced*, *leaderboard*, *rank*, or *other players*.
- The reason is the group's own standing rule, and it matches Ateneo's
  published work on meaningful gamification — Rodrigo, Favis & Cuyegkeng
  (2021), RECIPE — which the app cites on screen in the journal.

So a judge who reads the board and then opens the app finds the app does not do
what the board promised. The replacement turns that from a mismatch into a
position: **we deliberately did not build a leaderboard, and here is the
pedagogy we did it on.** That is a stronger answer to "how is this different
from a points app" than the original sentence was.

## If the group would rather keep leaderboards

Then it is an app change, not a text change, and it needs deciding as one:
`badge.test.ts` and `sync.ts` both encode the refusal, so adding a ranking
means changing tests that were written to prevent exactly that. Worth an
explicit decision either way — but not worth discovering on Saturday.
