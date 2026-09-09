# What climate data we can actually use — a spec, not a wish list

**For:** Charisse, who offered on 2026-09-08 (21:15) to source "specific air quality data or
climate chuchu" tonight.
**From:** the eComon build. Written so nobody spends an evening finding data the app
cannot honestly show.
**Version:** 0.1 · 2026-09-08

---

## Read this first: the bar anything has to clear

The app has one rule that decides everything below, and it has already killed features:
**a number we did not measure never appears as a fact.** Every figure on screen names its
source, and where our curation is the only warrant the card says so instead of borrowing a
paper's authority.

So the question is not "is there air-quality data for Quezon City" — there is. It is
**"can a student standing in a sector be told something true and specific?"** A city-wide
annual mean cannot. A station 4 km away reporting hourly can, if we say it is 4 km away.

Three tests, in order:

1. **Attributable.** A named source, a date, and a licence that lets us show it.
2. **Placeable.** It resolves to a point or a polygon we can name — a station location, a
   grid cell, a barangay. "Metro Manila" fails this.
3. **Dated.** A timestamp or a period. Undated means we cannot say whether it describes
   today or 2019.

Anything that fails one of the three is still useful **in the deck or the concept note** as
context. It just cannot go on a species card or a sector card.

---

## Tier 1 — genuinely useful, in priority order

### 1. A PM2.5 / PM10 time series from the nearest monitoring station

**Why it is first.** It is the only one that turns the forest from scenery into a
mechanism. Canopy intercepts particulates; if we can show "the campus sits N km from the
nearest station, which read X µg/m³ this week", the trees stop being decoration on the map.

| Field | Needed |
|---|---|
| `station_name` | The operator's own name for it |
| `station_lat`, `station_lon` | Decimal degrees. Without these it is not placeable |
| `operator` | DENR-EMB, a university network, PhilSensors, whoever |
| `observed_at` | ISO timestamp, with its timezone stated |
| `pm25_ugm3` / `pm10_ugm3` | The reading, with units confirmed |
| `averaging_period` | 1-hour? 24-hour? annual mean? A 24-hour mean quoted as "right now" is the classic error |
| `source_url` | Where you got it |
| `licence` | Or a note that it is public-domain government data |

**Good enough:** one station, one month of daily values. **Not useful:** a single
screenshot of an AQI dial with no date.

### 2. Land-surface temperature or a heat measure, per area

**Why.** The app already measures `vegetation_ratio` per sector off satellite imagery. If
we can pair a temperature with a sector or a grid cell, we can say "the sectors we measured
as green read cooler" — or discover they do not, which is equally worth knowing and is a
real finding either way.

| Field | Needed |
|---|---|
| `lat`, `lon` or a polygon | Or a raster with its CRS stated |
| `value_c` | Land-surface temperature, or air temperature if that is what it is — do not let the two get merged |
| `measured_at` | Date, and time of day. LST at 10:30 and at 14:00 are different quantities |
| `source` | Landsat 8/9 or Sentinel-3 scene id if remote-sensed; station id if in-situ |
| `resolution_m` | 30 m Landsat and 1 km MODIS support very different claims |

**Good enough:** one cloud-free Landsat LST scene over Loyola Heights with its date.

### 3. Rainfall / flood context for Loyola Heights specifically

**Why.** The Aug 2026 Habagat suspension moved a Youth CLAP session, and suspensions are in
the group's own chat. A dated local rainfall series lets the app say something concrete
about the year it was built in.

| Field | Needed |
|---|---|
| `station_name`, `station_lat/lon` | PAGASA Science Garden is the likely nearest |
| `observed_at` | Daily is fine |
| `rain_mm` | With the accumulation window stated |
| `source_url` | |

---

## Tier 2 — useful for the deck and note, not for a card

These fail the *placeable* test but are good argument material:

- **NCR-level annual PM2.5 means** with the year and source — sets the scale in slide 2.
- **Any published figure on urban canopy and particulate interception or cooling.** A
  citation we can quote, not a number we compute ourselves.
- **Quezon City LCCAP or CDRA content** naming heat or air quality as a priority — that is
  the bridge from a student app to a city plan, which is what the LGU funding kit is about.
- **Ateneo's own Sustainable University Master Plan** — already in the group's shared files
  (the PDF Katherine posted). If it names a green-cover or climate target, quoting it is
  stronger than any external statistic, because it is the institution committing to
  something we can then measure against.

---

## What we specifically do **not** need

Saying this plainly so nobody spends the night on it:

- **A live API integration.** There is no time before Sep 12, and an API that fails on stage
  is worse than a static figure with a date on it. A CSV is better than an endpoint.
- **Anything requiring an account or a paid tier.** It cannot ship in a student prototype.
- **AQI category labels alone** ("Moderate", "Unhealthy for Sensitive Groups") without the
  underlying concentration. The categories differ between agencies; the µg/m³ does not.
- **Global or national averages.** They fail *placeable* and they make the pitch vaguer, not
  stronger.
- **Carbon sequestration estimates per tree.** We have already refused carbon-credit
  framing, and a per-tree tonnage we did not measure is exactly the kind of number this
  project has been careful not to invent.

---

## The format that costs us the least

A CSV or a Google Sheet, one row per observation, with a header row using the field names
above. Plus one line per source saying **where it came from and when you pulled it.**

That last line is not bureaucracy — it is what lets the figure appear on screen at all. A
number without a provenance line cannot be shown, no matter how good it is.

---

## If it lands, here is where it goes

| Data | Surface | What it would say |
|---|---|---|
| PM2.5 station series | Slide 2 + a line on the sector card | "The nearest air-quality station is N km away and read X µg/m³ on DATE. This campus is the green mass beside it." |
| LST per sector | The sector card, beside `vegetation_ratio` | "Measured 78% vegetation. Surface temperature on DATE: X °C." |
| Rainfall | The plan screen | Dated local context for the year |
| SUMP targets | Slide 7, the ask | An institutional commitment we can offer to help measure |

If none of it lands by Friday, **nothing breaks.** The app makes no air-quality claim today
and the deck does not promise one. This is upside, not a dependency — which is the honest
thing to tell Charisse before she spends a night on it.
