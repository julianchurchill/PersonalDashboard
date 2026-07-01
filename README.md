# Personal Dashboard

## Running the Dashboard

The dashboard is a Node.js/Express app served on port 3000. Run it in a Docker container so it stays
available whenever your PC is on, without needing a terminal open.

### Deploying

Run this from the repo root (works for both first-time setup and re-deploying changes):

```bash
npm run docker:deploy
```

This builds the image, removes the old container if one exists, and starts a fresh one with
`--restart unless-stopped` so Docker automatically restarts it when Docker Desktop starts
(i.e. on PC boot). The dashboard is then reachable at <http://localhost:3000>.

### Useful commands

```bash
npm run docker:logs    # view server logs
npm run docker:stop    # stop the dashboard
npm run docker:start   # start it again
```

### Local development

Use the dev container in VS Code for active development. The server can be run directly with hot-reload:

```bash
npm run dev    # restarts automatically when server.js changes
```

## TODO

- Octopus Agile energy usage history, quick link to eInk monitor raspberry pi
- Solar generation (Solis?)
- Google Keep notes
- OurGroceries shopping list?

## Done

- Resideo heating and hot water controls
- Octopus Agile electricity price widget (current p/kWh, next slot price, 24-hour price graph)
- Octopus gas price widget (current unit rate in p/kWh)
- Open-Meteo current conditions in the header (temperature, condition, click to open forecast)
- TP-Link Deco network widget (live speeds, top 5 users by bandwidth, click to open the Deco admin page)
- myenergi widget (solar generation, grid import/export, Zappi charging status)
- CCTV widget (4-channel live snapshots from DVR via RTSP)
- Google Calendar header display (next 3 events from the family calendar, with name and date/time)
- Tapo smart plugs &amp; lights widget (shows on/off state, toggle each device on or off)
- Climate widget (temperature &amp; humidity from ThermoPro TP357/TP358/TP359 monitors via an ESP32 BLE proxy)

## Dev Containers

### Docker access inside the dev container

The dev container is configured with Docker-outside-of-Docker: it mounts the host Docker socket so the `docker` CLI works inside the container. This means containers you build or run inside the dev container appear directly in Docker Desktop on the host — useful for building and deploying the dashboard without leaving VS Code.

After rebuilding the dev container you should be able to run `docker build` and `docker run` commands from the integrated terminal.

### Resideo heating widget

The Resideo widget uses the [Honeywell Home API](https://developer.honeywellhome.com) via OAuth2. Setup is a one-time process:

1. Register a developer account at [developer.honeywellhome.com](https://developer.honeywellhome.com) and create an app with redirect URI `http://localhost:3000/auth/callback`.
2. Add the client credentials to `.devcontainer/.env.devcontainer`:

   ```env
   RESIDEO_CLIENT_ID=your_client_id
   RESIDEO_CLIENT_SECRET=your_client_secret
   ```

3. Deploy the dashboard (`npm run docker:deploy`) — tokens are stored in a Docker volume (`home-dashboard-data`) so they survive container restarts.
4. Open the dashboard at `http://localhost:3000`, click the Resideo widget ("Click to authorise"), and log in with your Resideo account to approve access.

After step 4 the widget will populate automatically and refresh every 60 seconds.

### Octopus Agile electricity price widget

The Octopus electricity widget uses the [Octopus Energy public REST API](https://developer.octopus.energy/rest/). It shows the current half-hourly unit rate in p/kWh (inc. VAT), colour-coded by price level, the next slot's price, a 24-hour price graph, and refreshes every 30 minutes.

The DNO region is discovered automatically from your account — no manual configuration needed. See the gas price widget section below for the required `OCTOPUS_API_KEY` and `OCTOPUS_ACCOUNT_NUMBER` variables.

### Octopus gas price widget

Shows the current gas unit rate in p/kWh (inc. VAT) from your Octopus variable gas tariff. Refreshes hourly.

Supply your Octopus **API key** and **account number** (both visible under **Account → API access** at octopus.energy). The dashboard will look up your active gas tariff and DNO region automatically:

```env
OCTOPUS_API_KEY=sk_live_xxxxxxxxxxxx
OCTOPUS_ACCOUNT_NUMBER=A-12345678
```

The product code is cached for 24 hours so the account API is not called on every refresh. Then re-deploy (`npm run docker:deploy`). If the variables are not set the widget shows an unconfigured message.

### Weather widget

Shows current temperature and conditions in the header bar. Clicking opens a forecast in a new tab. Refreshes every 30 minutes.

Uses [Open-Meteo](https://open-meteo.com/) — completely free, no API key or registration required. Set a location name and re-deploy:

```env
WEATHER_LOCATION=London
```

The coordinates are resolved automatically from the location name via the Open-Meteo geocoding API and cached for the lifetime of the server process. If the variable is not set the weather area is left empty.

### Network widget (TP-Link Deco)

Shows current download and upload speeds and the number of connected devices from your TP-Link Deco mesh network. Refreshes every 10 seconds. Click the widget to open the Deco admin page (`http://DECO_IP`) in a new tab.

The widget uses the Deco's local HTTPS API — no cloud account required.

**Config needed** (both visible on the Deco's admin page):

```env
DECO_IP=192.168.68.1
DECO_PASSWORD=your_admin_password
```

`DECO_IP` is the gateway IP of your Deco — the same address you'd open in a browser to reach the admin UI (typically `192.168.68.1` for Deco mesh, or check your router's DHCP settings). `DECO_PASSWORD` is the admin password you set when first configuring the Deco.

### myenergi widget

Shows live power data from your myenergi hub — solar generation, grid import/export, and Zappi car charging status. Refreshes every 30 seconds.

You will need:

- Your **hub serial number** — printed on the hub, also visible on the Products page at [myaccount.myenergi.com](https://myaccount.myenergi.com)
- An **API key** — generated from the same portal: Products page → Gateway Device → *Advanced* → *Generate new API key*. Copy it immediately; it is only shown once (you can always generate a new one if lost)

> **Important:** the API key is only available in the myaccount that was used to **register** the devices. If you are logged in via a shared account the *Advanced* button may not appear — log out and back in with the original registration email.

```env
MYENERGI_SERIAL=1234567890
MYENERGI_API_KEY=your_generated_api_key
```

The widget shows:

| Row                       | Meaning                                                  |
| ------------------------- | -------------------------------------------------------- |
| Solar                     | Power currently being generated by your solar panels     |
| Grid import / Grid export | Power being drawn from or sent back to the national grid |
| Charging                  | Power currently going to the Zappi car charger           |
| Session                   | Energy added to the car in the current charging session  |

The Zappi mode (Fast / Eco / Eco+ / Stopped) and charging status are shown in the widget badge.

### CCTV widget

Shows a 2×2 grid of live snapshots from 4 CCTV cameras, refreshed every 15 seconds. Frames are captured server-side from the DVR's RTSP streams using ffmpeg (included in the Docker image).

**Config needed:**

```env
CCTV_IP=192.168.0.5
CCTV_PASSWORD=your_dvr_password
```

Optional variables (shown with their defaults):

```env
CCTV_USER=admin
CCTV_RTSP_PORT=554
```

The widget requires an RTSP-capable DVR — it does not rely on an HTTP snapshot endpoint. If either `CCTV_IP` or `CCTV_PASSWORD` is not set the widget shows an unconfigured message.

### Google Calendar header display

Shows the next 3 upcoming events from your family calendar in the header (event name plus date/time), refreshed every 5 minutes. It uses the [Google Calendar API](https://developers.google.com/calendar) via OAuth2, read-only. Setup is a one-time process:

1. In the [Google Cloud Console](https://console.cloud.google.com/) create a project, enable the **Google Calendar API**, and configure the OAuth consent screen (External, with your Google account added as a test user). The only scope needed is `.../auth/calendar.readonly`.
2. Create an **OAuth client ID** of type *Web application* with the authorised redirect URI `http://localhost:3000/auth/google/callback`.
3. Add the client credentials to `.devcontainer/.env.devcontainer`:

   ```env
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```

4. Deploy the dashboard (`npm run docker:deploy`) — tokens are stored in the same Docker volume (`home-dashboard-data`) as the Resideo tokens, so they survive container restarts.
5. Open the dashboard at `http://localhost:3000`, click **📅 Connect calendar** in the header, and log in with your Google account to approve read-only calendar access.

By default the dashboard picks the calendar whose name contains "family" (falling back to your primary calendar). To target a specific calendar, set its ID explicitly:

```env
GOOGLE_CALENDAR_ID=abc123@group.calendar.google.com
```

The calendar ID is found under **Settings → \<calendar name\> → Integrate calendar → Calendar ID** in Google Calendar. If `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are not set the header display stays empty.

### Tapo smart plugs & lights widget

Lists your TP-Link Tapo plugs and lights with their current on/off state, and lets you toggle each one on or off directly from the dashboard. Refreshes every 60 seconds. Devices are controlled **locally** over your LAN (no cloud round-trip), though your TP-Link account credentials are still required for the device handshake.

**Config needed:**

```env
TAPO_EMAIL=you@example.com
TAPO_PASSWORD=your_tplink_password
TAPO_DEVICES=192.168.0.50,192.168.0.51
```

- `TAPO_EMAIL` / `TAPO_PASSWORD` are your **TP-Link / Tapo account** credentials (the same ones used in the Tapo app).
- `TAPO_DEVICES` is a comma-separated list of your devices' **local IP addresses**. Assign each device a static/reserved IP in your router so they don't change. By default each device's own nickname (set in the Tapo app) is shown as its label; to override the label use `Label=IP` entries, e.g.:

  ```env
  TAPO_DEVICES=Living Room Lamp=192.168.0.50,Office Plug=192.168.0.51
  ```

A device that can't be reached is shown as **Offline**; a device that refuses the login handshake (HTTP 403) is shown as **Locked** — see the protocol note below. Each device call is capped at 6 seconds so one slow device doesn't hold up the rest, and after a failed login the dashboard backs off (1 → 15 min) rather than re-hammering the device on every poll. If `TAPO_EMAIL`, `TAPO_PASSWORD`, or `TAPO_DEVICES` is not set the widget shows an unconfigured message.

#### Newer firmware: enable "Third-Party Compatibility"

The widget talks to devices using TP-Link's **KLAP** local protocol. Recent Tapo firmware (e.g. L535 bulbs on `1.4.2 Build 260203`) defaults to a **newer local protocol, TPAP**, which currently has **no open-source implementation** — not in this dashboard, nor in [python-kasa](https://github.com/python-kasa/python-kasa) (the reference library that everything else follows). A device speaking TPAP rejects the KLAP handshake with **HTTP 403**, so the widget shows it as **Locked**, even though it is reachable, owned by your account, and works in the phone app.

The fix is to make the device fall back to KLAP:

> Tapo app → **Me** (bottom-right) → **Tapo Lab** → **Third-Party Compatibility** → turn **ON**

This is an account-wide setting (not per-device), so enabling it once covers all your devices. After enabling it, redeploy / reload and the previously **Locked** devices should come up as controllable.

To check which protocol a device is using, query its local discovery service over UDP port `20002` — the JSON response's `mgt_encrypt_schm.encrypt_type` is `KLAP` (supported) or `TPAP` (not yet supported).

**Future TPAP support:** TPAP is a proprietary, undocumented handshake (PAKE + device/node certificates), so it can't be implemented reliably by reverse-engineering. If TP-Link publishes a specification — or if support lands in python-kasa / a maintained Node library — the widget could be updated to speak TPAP directly, removing the need for the Third-Party Compatibility workaround. Until then, keep that setting enabled.

### Climate widget (ThermoPro Bluetooth monitors)

Shows the current temperature and humidity from one or more **ThermoPro TP357 / TP358 / TP359** Bluetooth monitors, refreshed every 30 seconds.

These monitors broadcast their readings over Bluetooth LE (BLE), which has a short range (~10 m) and needs a Bluetooth adapter. The dashboard, however, runs in Docker Desktop, whose Linux VM has **no access to the PC's Bluetooth adapter** — so the dashboard can't read the monitors directly. Instead, a cheap **ESP32 running [ESPHome](https://esphome.io)** sits near the sensors, decodes their BLE broadcasts, and exposes each value over its built-in HTTP web server. The dashboard simply polls those JSON endpoints, exactly like the other widgets. Spread-out sensors may need more than one ESP32 (the widget can poll several).

**Config needed:**

```env
THERMOPRO_SENSORS=Bedroom=http://192.168.0.30/sensor/Bedroom%20Temperature;http://192.168.0.30/sensor/Bedroom%20Humidity,Study=http://192.168.0.31/sensor/Study%20Temperature;http://192.168.0.31/sensor/Study%20Humidity
```

- `THERMOPRO_SENSORS` is a comma-separated list of sensors. Each entry is `Label=<temperatureUrl>;<humidityUrl>`, where the two URLs are the ESPHome REST endpoints for that sensor (the humidity URL is optional — omit the `;…` for a temperature-only sensor).
- The ESPHome web server responds to `GET /sensor/<entity name>` with `{"id":"…","value":21.4,"state":"21.4 °C"}`; the dashboard reads the numeric `value`. The URL uses the sensor's **entity name**, so URL-encode spaces as `%20` (e.g. `Bedroom Temperature` → `/sensor/Bedroom%20Temperature`). The older object-id URLs (`/sensor/bedroom_temperature`) still work on current ESPHome but are deprecated and removed in ESPHome 2026.7.0.
- A sensor whose endpoint is unreachable, or whose value reads `nan` (the ESP32 hasn't heard from it — out of range or battery dead), is shown as **No signal**. If `THERMOPRO_SENSORS` is not set the widget shows an unconfigured message.

#### ESP32 BLE proxy setup (ESPHome)

Flash an ESP32 with ESPHome. There's no built-in ThermoPro platform, so an `esp32_ble_tracker` lambda decodes each monitor's advertisement (temperature: `int16` little-endian ÷ 10; humidity: a single byte — the format used by [Theengs](https://github.com/theengs/decoder) / OpenMQTTGateway) into template sensors, which `web_server` then exposes over HTTP.

First find each monitor's MAC (ThermoPro app, or `bluetoothctl scan on` on any Linux machine — look for `TP3xx` names). Then, for each monitor, add a block like this (repeat with a unique name/MAC per sensor):

```yaml
esphome:
  name: thermopro-proxy
esp32:
  board: esp32dev

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

web_server:        # serves /sensor/<id> as JSON for the dashboard to poll
  port: 80

esp32_ble_tracker:
  on_ble_advertise:
    - mac_address: AB:CD:EF:01:23:45        # ← your monitor's MAC
      then:
        - lambda: |-
            // ThermoPro packs the temperature's low byte into the BLE company
            // id, which ESPHome exposes as md.uuid (not in md.data). The temp
            // high byte is md.data[0], humidity is md.data[1].
            for (auto md : x.get_manufacturer_datas()) {
              if (md.data.size() < 2) continue;
              uint16_t cid = md.uuid.get_uuid().uuid.uuid16;
              int16_t t = ((cid >> 8) & 0xFF) | (md.data[0] << 8);
              id(bedroom_temp).publish_state(t / 10.0);
              id(bedroom_hum).publish_state(md.data[1]);
            }

sensor:
  - platform: template
    name: "Bedroom Temperature"      # entity name → /sensor/Bedroom%20Temperature
    id: bedroom_temp
    unit_of_measurement: "°C"
    accuracy_decimals: 1
  - platform: template
    name: "Bedroom Humidity"         # → /sensor/Bedroom%20Humidity
    id: bedroom_hum
    unit_of_measurement: "%"
    accuracy_decimals: 0
```

The web server serves each sensor at `/sensor/<entity name>`, using the sensor's `name` verbatim with spaces URL-encoded as `%20` (`"Bedroom Temperature"` → `/sensor/Bedroom%20Temperature`). Use those URLs in `THERMOPRO_SENSORS`. Verify a sensor directly in a browser at `http://<esp32-ip>/sensor/Bedroom%20Temperature` before deploying. If the decoded values don't match the monitor's own display, adjust the byte offsets in the lambda.

> **Note:** the decode follows the documented ThermoPro format used by [Theengs](https://github.com/theengs/decoder) / OpenMQTTGateway (`TPTH`, covering TP350/357/358/359/393): full manufacturer data is `[0..1]` company id, `[1..2]` temperature `int16` little-endian ÷ 10, `[3]` humidity. Note ThermoPro overlaps the temperature's low byte with the 2-byte BLE company id — ESPHome strips that into `md.uuid`, so the lambda reconstructs the low byte from `md.uuid` and reads the high byte from `md.data[0]`, with humidity at `md.data[1]`. If your units report different values, verify a `/sensor/<entity name>` endpoint against the unit's own display and adjust from there.

### GitHub access

To enable Claude (and yourself) to push to GitHub from the dev container add a `GH_TOKEN=xxx` line into .devcontainer/.env.devcontainer with `xxx` as your GitHub access token for accessing this repository. New tokens can be created here <https://github.com/settings/personal-access-tokens/new>.

### Audio bell

The devcontainer includes `sox` and `pulseaudio-utils` so Claude Code can play an audio tone when it finishes a response and is waiting for input. To enable it, add the following `Stop` hook to `.claude/settings.local.json` in the workspace:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sox -n /tmp/claude-bell.wav synth 0.15 sine 880 gain -3 && paplay /tmp/claude-bell.wav 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

### Troubleshooting

If containers are not rebuilding after changing devcontainer.json, Dockerfile, init-firewall.sh or any other dependencies choose 'Dev Containers: Rebuild Without Cache and Reopen in Container' instead of 'Dev Containers: Rebuild and Reopen in Container' as the latter uses a cache when building the container images which can sometimes miss your changes.

If this doesn't work then try running `docker buildx prune` from a terminal to forcefully clear out the docker build cache.
