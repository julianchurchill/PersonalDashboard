# Personal Dashboard

## Running the Dashboard

The dashboard is a Node.js/Express app served on port 3000. Run it in a Docker container so it stays available whenever your PC is on, without needing a terminal open.

### First-time setup

Build the image and start the container (run from the repo root in a Windows terminal or WSL2 shell):

```bash
docker build -t personal-dashboard .
docker run -d --name dashboard --restart unless-stopped -p 3000:3000 personal-dashboard
```

The `--restart unless-stopped` flag means Docker will automatically restart the container when Docker Desktop starts (i.e. on PC boot), so the dashboard is always reachable at <http://localhost:3000>.

### Deploying changes

After editing the source files, rebuild the image and recreate the container:

```bash
docker build -t personal-dashboard .
docker rm -f dashboard
docker run -d --name dashboard --restart unless-stopped -p 3000:3000 personal-dashboard
```

### Useful commands

```bash
docker logs dashboard          # view server logs
docker stop dashboard          # stop the dashboard
docker start dashboard         # start it again
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
