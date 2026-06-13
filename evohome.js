const BASE_URL = 'https://tccna.resideo.com/WebAPI/emea/api/v1';
const AUTH_URL = 'https://tccna.resideo.com/Auth/OAuth/Token';

// Public client credentials from the evohome-client open-source library
const BASIC_AUTH = 'Basic NGEyMzEwODktZDJiNi00MWJkLWE1ZWItMTZhMGE0MjJiOTk5OjFhMTVjZGI4LTQyZGUtNDA3Yi1hZGQwLTA1OWY5MmM1MzBjYg==';
const ACCEPT = 'application/json, application/xml, text/json, text/x-json, text/javascript, text/xml';

class EvohomeClient {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.accessToken = null;
    this.tokenExpires = 0;
    this.locationId = null;
  }

  async _authenticate() {
    if (this.accessToken && Date.now() < this.tokenExpires - 30_000) return;

    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { Authorization: BASIC_AUTH, Accept: ACCEPT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        scope: 'EMEA-V1-Basic EMEA-V1-Anonymous EMEA-V1-Get-Current-User-Account',
        Username: this.username,
        Password: this.password,
      }),
    });

    if (!res.ok) throw new Error(`Evohome auth failed: ${res.status}`);
    const { access_token, expires_in } = await res.json();
    this.accessToken = access_token;
    this.tokenExpires = Date.now() + expires_in * 1000;
  }

  _headers() {
    return { Authorization: `bearer ${this.accessToken}`, Accept: ACCEPT };
  }

  async _resolveLocationId() {
    if (this.locationId) return this.locationId;

    const userRes = await fetch(`${BASE_URL}/userAccount`, { headers: this._headers() });
    if (!userRes.ok) throw new Error(`Evohome userAccount failed: ${userRes.status}`);
    const { userId } = await userRes.json();

    const installRes = await fetch(
      `${BASE_URL}/location/installationInfo?userId=${userId}&includeTemperatureControlSystems=True`,
      { headers: this._headers() }
    );
    if (!installRes.ok) throw new Error(`Evohome installationInfo failed: ${installRes.status}`);
    const [location] = await installRes.json();
    this.locationId = location.locationInfo.locationId;
    return this.locationId;
  }

  async getStatus() {
    await this._authenticate();
    const locationId = await this._resolveLocationId();

    const res = await fetch(
      `${BASE_URL}/location/${locationId}/status?includeTemperatureControlSystems=True`,
      { headers: this._headers() }
    );
    if (!res.ok) throw new Error(`Evohome status failed: ${res.status}`);
    const data = await res.json();

    const system = data.gateways[0].temperatureControlSystems[0];

    const zones = system.zones.map(z => ({
      id: z.zoneId,
      name: z.name,
      temperature: z.temperatureStatus?.temperature ?? null,
      target: z.setpointStatus?.targetHeatTemperature ?? null,
      mode: z.setpointStatus?.setpointMode ?? null,
    }));

    const dhw = system.dhw ? {
      temperature: system.dhw.temperatureStatus?.temperature ?? null,
      state: system.dhw.stateStatus?.state ?? null,
      mode: system.dhw.stateStatus?.mode ?? null,
    } : null;

    return {
      systemMode: system.systemModeStatus?.mode ?? null,
      zones,
      hotWater: dhw,
    };
  }
}

let client = null;

export function getHeatingStatus() {
  const username = process.env.EVOHOME_USERNAME;
  const password = process.env.EVOHOME_PASSWORD;
  if (!username || !password) {
    throw new Error('EVOHOME_USERNAME and EVOHOME_PASSWORD must be set');
  }
  if (!client) client = new EvohomeClient(username, password);
  return client.getStatus();
}
