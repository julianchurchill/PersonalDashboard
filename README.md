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
- Car charger (myenergi?)
- Tapo bulbs and sockets
- Deco for WiFi monitoring
- CCTV
- Google Keep notes
- Google Calendar
- OurGroceries shopping list?

## Done

- Resideo heating and hot water controls
- Octopus Agile electricity price widget (current p/kWh, next slot price, 24-hour price graph)
- Octopus gas price widget (current unit rate in p/kWh)
- AccuWeather current conditions in the header (temperature, condition, click to open forecast)

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

### AccuWeather widget

Shows current temperature and conditions in the header bar. Clicking opens AccuWeather for detailed forecasts. Refreshes every 30 minutes.

Requires a free AccuWeather API key (sign up at [developer.accuweather.com](https://developer.accuweather.com) — the free tier allows 50 calls/day which is sufficient) and a location name:

```env
ACCUWEATHER_API_KEY=your_api_key
ACCUWEATHER_LOCATION=London, UK
```

The location key is looked up automatically from the location name and cached for the lifetime of the server process. Then re-deploy (`npm run docker:deploy`). If the variables are not set the weather area is left empty.

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
