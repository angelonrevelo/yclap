/**
 * Current weather at Loyola Heights, for one job: telling a walker when it is
 * not a good time to walk.
 *
 * Source is Open-Meteo's forecast API — free, keyless, CORS-open, and a model
 * rather than a station, which the card says. Nothing here is PAGASA and no
 * surface may imply it is; the heat bands below are PAGASA's published heat
 * index classes applied to Open-Meteo's apparent temperature, and the caption
 * says that too.
 *
 * Offline, or with the request failing, there is simply no weather: no chip,
 * no card. An unmeasured "all clear" is worse than silence.
 *
 * `?weather=storm|rain|heat|clear|night` pins a reading for a projector, and
 * the card marks a pinned reading as a demo.
 */

export const CAMPUS_WEATHER_POINT = { lat: 14.6394, lon: 121.0781 };

export type WeatherSky = "clear" | "cloud" | "rain" | "storm";
export type WeatherWarn = "storm" | "rain" | "heat" | null;

export interface Weather {
  temp_c: number;
  apparent_c: number;
  precip_mm: number;
  weather_code: number;
  is_day: boolean;
  sky: WeatherSky;
  warn: WeatherWarn;
  /** True when `?weather=` pinned this reading instead of the API. */
  is_pinned: boolean;
  at: number;
}

/** PAGASA heat-index classes, lower bounds in °C. */
export const HEAT_DANGER_C = 42;
export const HEAT_CAUTION_C = 33;

/** WMO weather codes, as Open-Meteo reports them. */
export function skyOf(code: number): WeatherSky {
  if (code >= 95) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code >= 1) return "cloud";
  return "clear";
}

/** Heavy rain, violent showers or thunder — a reason to stop, not a mood. */
export function warnOf(code: number, apparent_c: number, precip_mm: number): WeatherWarn {
  if (code >= 95) return "storm";
  if (code === 65 || code === 67 || code === 82 || precip_mm >= 7.5) return "rain";
  if (apparent_c >= HEAT_DANGER_C) return "heat";
  return null;
}

function reading(code: number, temp_c: number, apparent_c: number, precip_mm: number, is_day: boolean, is_pinned: boolean): Weather {
  return {
    temp_c,
    apparent_c,
    precip_mm,
    weather_code: code,
    is_day,
    sky: skyOf(code),
    warn: warnOf(code, apparent_c, precip_mm),
    is_pinned,
    at: Date.now(),
  };
}

export function pinnedWeather(search: string): Weather | null {
  const pin = new URLSearchParams(search).get("weather");
  switch (pin) {
    case "storm":
      return reading(95, 27, 31, 12, true, true);
    case "rain":
      return reading(65, 26, 29, 9, true, true);
    case "heat":
      return reading(1, 35, 44, 0, true, true);
    case "clear":
      return reading(0, 30, 34, 0, true, true);
    case "night":
      return reading(0, 26, 28, 0, false, true);
    default:
      return null;
  }
}

export async function fetchWeather(signal?: AbortSignal): Promise<Weather | null> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${CAMPUS_WEATHER_POINT.lat}&longitude=${CAMPUS_WEATHER_POINT.lon}` +
    "&current=temperature_2m,apparent_temperature,precipitation,weather_code,is_day" +
    "&timezone=Asia%2FManila";
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        apparent_temperature?: number;
        precipitation?: number;
        weather_code?: number;
        is_day?: number;
      };
    };
    const c = json.current;
    if (!c || typeof c.weather_code !== "number" || typeof c.temperature_2m !== "number") return null;
    return reading(
      c.weather_code,
      c.temperature_2m,
      c.apparent_temperature ?? c.temperature_2m,
      c.precipitation ?? 0,
      c.is_day !== 0,
      false,
    );
  } catch {
    return null;
  }
}

export const WEATHER_TITLE: Record<Exclude<WeatherWarn, null>, string> = {
  storm: "Thunderstorm warning",
  rain: "Heavy rain warning",
  heat: "Heat warning",
};

export function weatherBody(w: Weather): string {
  switch (w.warn) {
    case "storm":
      return "There is thunder over campus right now. Get indoors and play later. Finds will still be out when it passes.";
    case "rain":
      return "Heavy rain over campus. Paths get slippery and drains overflow fast, so stay under cover until it eases.";
    case "heat":
      return `It feels like ${Math.round(w.apparent_c)}°C out. Walk in the shade, drink water, and take breaks indoors.`;
    default:
      return `${Math.round(w.temp_c)}°C, feels like ${Math.round(w.apparent_c)}°C. A good time to walk.`;
  }
}

export function weatherCaption(w: Weather): string {
  if (w.is_pinned) return "Demo reading, pinned by ?weather= and not measured";
  return "Open-Meteo model for Loyola Heights, not a PAGASA bulletin. Check PAGASA for official advisories.";
}
