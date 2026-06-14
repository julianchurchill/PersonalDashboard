const GEO_API     = 'https://geocoding-api.open-meteo.com/v1';
const WEATHER_API = 'https://api.open-meteo.com/v1';

const WMO_DESCRIPTIONS = {
  0: 'Clear sky',          1: 'Mainly clear',       2: 'Partly cloudy',      3: 'Overcast',
  45: 'Fog',               48: 'Icy fog',
  51: 'Light drizzle',     53: 'Drizzle',            55: 'Dense drizzle',
  56: 'Freezing drizzle',  57: 'Heavy freezing drizzle',
  61: 'Slight rain',       63: 'Moderate rain',      65: 'Heavy rain',
  66: 'Freezing rain',     67: 'Heavy freezing rain',
  71: 'Slight snow',       73: 'Moderate snow',      75: 'Heavy snow',        77: 'Snow grains',
  80: 'Slight showers',    81: 'Moderate showers',   82: 'Violent showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm',      96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

let _cachedLocation = null;

export function isWeatherConfigured() {
  return !!process.env.WEATHER_LOCATION;
}

async function getLocation() {
  if (_cachedLocation) return _cachedLocation;

  const name = process.env.WEATHER_LOCATION;
  const url = `${GEO_API}/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();

  if (!data.results?.length) throw new Error(`No location found for: ${name}`);
  const loc = data.results[0];

  _cachedLocation = {
    latitude: loc.latitude,
    longitude: loc.longitude,
    name: loc.name,
  };
  return _cachedLocation;
}

export async function getCurrentWeather() {
  const loc = await getLocation();
  const url = `${WEATHER_API}/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
    `&current=temperature_2m,weather_code&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
  const data = await res.json();

  const { temperature_2m: temperature, weather_code: code } = data.current;

  return {
    temperature: Math.round(temperature),
    condition: WMO_DESCRIPTIONS[code] ?? 'Unknown',
    weatherCode: code,
    url: `https://wttr.in/${encodeURIComponent(loc.name)}`,
  };
}
