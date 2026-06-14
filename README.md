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
- Tapo bulbs and sockets
- Google Keep notes
- Google Calendar
- OurGroceries shopping list?

## Done

- Resideo heating and hot water controls
- Octopus Agile electricity price widget (current p/kWh, next slot price, 24-hour price graph)
- Octopus gas price widget (current unit rate in p/kWh)
- Open-Meteo current conditions in the header (temperature, condition, click to open forecast)
- TP-Link Deco network widget (live speeds, top 5 users by bandwidth)
- myenergi widget (solar generation, grid import/export, Zappi charging status)
- CCTV widget (4-channel live snapshots from DVR via RTSP)

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

3. Deploy the dashboard (`npm run docker:deploy`) — tokens are stored in a Docker volume (`resideo-data`) so they survive container restarts.
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

Shows current download and upload speeds and the number of connected devices from your TP-Link Deco mesh network. Refreshes every 10 seconds.

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
