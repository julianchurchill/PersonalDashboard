# Personal Dashboard

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
