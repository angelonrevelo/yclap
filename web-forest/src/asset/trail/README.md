# Trails

A trail is one JSON file in this folder: an ordered list of stops the app
routes leg by leg over the walkable ground (`src/route.ts`), with a card per
stop and the distance and minutes between them at `WALK_PACE_MS`.

## Add a trail (any campus, any park)

1. Copy `campus-tree-walk.json` to `<trail_code>.json`.
2. Fill it in:

```jsonc
{
  "_comment": "Where the stops came from and what is ours. Say it plainly.",
  "trail_code": "my-trail",          // file name, kebab-case
  "title": "…",
  "is_named_by_us": true,            // true unless the institution named it
  "blurb": "One line.",
  "campus_code": "admu-loyola",      // matches MODULE_CONFIG.campus_code
  "author": "…",
  "created_on": "YYYY-MM-DD",
  "stop": [
    {
      "stop_code": "…",              // unique in this trail
      "species_code": "narra",       // optional; must be in src/data.ts species
      "lat": 14.639, "lon": 121.077, // on open, walkable ground
      "where": "…",                  // place name
      "is_named_by_us": true,        // false only if the place name is official
      "is_position_surveyed": false, // true only for a surveyed feature
      "look_for": "What to look at here. Field marks, not a story we made up."
    }
  ]
}
```

3. Import it in `src/trail.ts` and add it to `TRAIL`.
4. `npm test`. `test/trail.test.ts` refuses a trail whose stop is not
   walkable (inside a building, the restricted grove or off the map), whose
   leg the router cannot find, or whose species has no field-guide entry.

## Rules

- A stop position is where the app sends somebody. If it is not a surveyed
  feature, say so with `is_position_surveyed: false`, and the card says it.
- No invented history. `look_for` describes what anyone can see; a story
  belongs to the person who told it and waits until they have.
- Another site needs its own walkable-ground data (sectors, paths, buildings)
  before its trails route. See `docs/spec/campus-module.md`.
