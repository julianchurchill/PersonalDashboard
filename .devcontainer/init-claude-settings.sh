#!/usr/bin/env bash
# init-claude-settings.sh
# Ensures the Claude Code user config file (.claude.json) contains the required
# MCP server configurations. Runs on every container start so that settings
# survive volume recreation and container rebuilds.
#
# Strategy: merge the required mcpServers entries into the existing
# .claude.json using Node.js (always available in the container),
# preserving any other settings or MCP entries already present.
#
# Note: mcpServers must live in .claude.json, NOT settings.json.
# Claude Code only reads MCP server config from .claude.json.

set -euo pipefail

# PS4 is set for debugging purposes; it prefixes each command with the line number.
#PS4='${LINENO}: '
# set -x is enabled to print each command before execution
#set -x

SETTINGS_FILE="${CLAUDE_CONFIG_DIR:-/home/node/.claude}/.claude.json"

# Ensure the directory exists (may not if volume is freshly created).
SETTINGS_DIR="$(dirname "$SETTINGS_FILE")"
echo "Ensuring Claude settings directory exists at $SETTINGS_DIR..."
mkdir -p "$SETTINGS_DIR"
echo "Ensuring Claude settings directory $SETTINGS_DIR has 755 permissions and node:node ownership"
chmod 755 "$SETTINGS_DIR"
chown node:node "$SETTINGS_DIR"
echo "Ensuring Claude settings file $SETTINGS_FILE has 755 permissions and node:node ownership"
chmod 644 "$SETTINGS_FILE" 2>/dev/null || true
chown node:node "$SETTINGS_FILE" 2>/dev/null || true

# Define all required MCP server entries as a single JSON object.
# Add new servers here to have them automatically provisioned on rebuild.
REQUIRED_MCP_SERVERS='{
  "context7": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@upstash/context7-mcp"]
  },
  "serena": {
    "type": "stdio",
    "command": "uvx",
    "args": [
      "--from", "git+https://github.com/oraios/serena",
      "serena", "start-mcp-server",
      "--context", "ide-assistant",
      "--project", "/workspace"
    ]
  }
}'

echo "Provisioning required MCP server settings to $SETTINGS_FILE..."
node -e "
  const fs = require('fs');
  const settingsPath = '$SETTINGS_FILE';
  const required = $REQUIRED_MCP_SERVERS;

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (_) {}
  }

  // Merge required entries, preserving any existing entries not listed here.
  settings.mcpServers = Object.assign({}, settings.mcpServers, required);

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log('init-claude-settings: MCP servers written to', settingsPath);
  console.log('  Servers:', Object.keys(settings.mcpServers).join(', '));
"

# Configure gh as the git credential helper for github.com so that git push/pull
# uses GH_TOKEN rather than the VS Code credential forwarder (which has no creds).
if command -v gh &>/dev/null; then
  echo "Configuring gh as git credential helper for github.com..."
  gh auth setup-git
fi
