# Tracks — land, sea and air lines on the map

A **track** is a line with a purpose laid over the way network: a trail leg,
the walk to the nearest help, a hiking route, a shoreline to search, a flight
line. Code: `src/track.ts`. Drawn by `TrackGround` / `AirTrack` in
`src/play-map.tsx`. Switched on in the play map's routes button
(Trails, routes and emergency → "Routes on the map").

The **way network** under it (streets, walks, stairs, water) is built once by
`node script/build-network.mjs` from the cached OSM extract
(`script/data/osm-way-raw.json`, from `script/fetch-osm-way.mjs`) into
`src/asset/campus-network.json`. That build drops sidewalks, crossings,
driveways and parking aisles, cuts footpaths out of the street ribbons they
shadow, snaps near-miss ends, chains bends and prunes stubs; its `report`
says how many of each. `test/network.test.ts` holds the invariants.

## Medium and kind

| medium | kind | drawn as | for |
|---|---|---|---|
| land | `trail` | solid green ribbon | a nature trail leg (from `src/asset/trail/`) |
| land | `hike` | dashed brown ribbon | a hiking route |
| land | `evacuation` | solid orange-red ribbon, end marked | an official evacuation route |
| land | `help` | solid red ribbon, end marked | the walk to the nearest help (computed) |
| sea | `shore` | blue dots | a water edge to search: what lives in or under it |
| sea | `dive` | darker blue dots | a snorkel or dive line over the water |
| air | `flyway` | lifted dashed purple arc + ground shadow | a flight line |

Widths and dashes are metres, so a line is the same size on the ground at
every zoom. One style per kind; a site does not pick colours.

## A track file

One JSON per track in `src/asset/track/`, then add it to the import list at the
top of `src/track.ts` (the test fails until it is registered).

```json
{
  "track_code": "osmena-peak",
  "track_kind": "hike",
  "title": "Osmeña Peak from Mantalongon",
  "source": "Trail © OpenStreetMap contributors, ODbL (way 123…)",
  "point": [{ "lat": 9.8601, "lon": 123.4290 }, { "lat": 9.8627, "lon": 123.4312 }]
}
```

- `point`: at least two lat/lon. Closed loops repeat the first point last.
- `altitude_m`: **air only**, the mid-way height in metres; the line rises from
  and returns to the ground. A ground track must not carry one.
- `is_demo: true` for a line laid out to show how a kind reads rather than
  mapped or observed. The routes card says "demo line, not mapped or observed".
- `source`: required, with licence. A bad file is dropped with a console line
  (`trackProblem`), never drawn half-right.

## What ships

- `pond-shore` (sea/shore): the campus pond's OSM outline.
- `demo-flyway` (air/flyway, **demo**): Gonzaga walk to the pond, 16 m.
- Trail legs and the help route are computed, not files.

## Cebu (not built yet)

Cebu hiking trails, emergency areas and reef lines are tracks in this format,
but the app is boxed to one campus (`CAMPUS_BOX`, `MODULE_CONFIG`). A Cebu
site needs its own box, OSM extract and network build first: see ROADMAP.
