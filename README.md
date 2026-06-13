# Personal Dashboard

## Running the Dashboard

The dashboard is a Node.js/Express app served on port 3000. Run it in a Docker container so it stays available whenever your PC is on, without needing a terminal open.

### Deploying

Run this from the repo root (works for both first-time setup and re-deploying changes):

```bash
npm run docker:deploy
```

This builds the image, removes the old container if one exists, and starts a fresh one with `--restart unless-stopped` so Docker automatically restarts it when Docker Desktop starts (i.e. on PC boot). The dashboard is then reachable at <http://localhost:3000>.

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

- Octopus Agile energy tariff/usage, quick link to eInk monitor raspberry pi
- Solar generation (Solis?)
- Car charger (myenergi?)
- Tapo bulbs and sockets
- Residio heating and hot water controls
- Deco for WiFi monitoring
- CCTV
- Google Keep notes
- Google Calendar
- OurGroceries shopping list?

## Dev Containers

### Docker access inside the dev container

The dev container is configured with Docker-outside-of-Docker: it mounts the host Docker socket so the `docker` CLI works inside the container. This means containers you build or run inside the dev container appear directly in Docker Desktop on the host — useful for building and deploying the dashboard without leaving VS Code.

After rebuilding the dev container you should be able to run `docker build` and `docker run` commands from the integrated terminal.

### Resideo heating widget

The Resideo widget reads live heating zone and hot water status from the [Honeywell Total Connect Comfort Europe API](https://tccna.resideo.com). Add your Total Connect Comfort login credentials to `.devcontainer/.env.devcontainer`:

```env
EVOHOME_USERNAME=your@email.com
EVOHOME_PASSWORD=yourpassword
```

These are passed through to the Docker container at deploy time (`npm run docker:deploy`) and are never baked into the image. The widget will show a clear error message if the credentials are missing or incorrect.

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
