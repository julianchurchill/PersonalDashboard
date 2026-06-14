const API_BASE = 'https://dataservice.accuweather.com';

let _cachedLocationKey = null;

export function isWeatherConfigured() {
  return !!(process.env.ACCUWEATHER_API_KEY && process.env.ACCUWEATHER_LOCATION);
}

async function getLocationKey() {
  if (_cachedLocationKey) return _cachedLocationKey;

  const { ACCUWEATHER_API_KEY: apiKey, ACCUWEATHER_LOCATION: location } = process.env;
  const url = `${API_BASE}/locations/v1/cities/search?apikey=${apiKey}&q=${encodeURIComponent(location)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Location search failed: ${res.status}`);
  const data = await res.json();

  if (!data.length) throw new Error(`No AccuWeather location found for: ${location}`);
  _cachedLocationKey = data[0].Key;
  return _cachedLocationKey;
}

export async function getCurrentWeather() {
  const locationKey = await getLocationKey();
  const apiKey = process.env.ACCUWEATHER_API_KEY;
  const url = `${API_BASE}/currentconditions/v1/${locationKey}?apikey=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
  const data = await res.json();
  const c = data[0];

  return {
    temperature: Math.round(c.Temperature.Metric.Value),
    condition: c.WeatherText,
    icon: c.WeatherIcon,
    url: c.Link,
  };
}
