#!/bin/bash
# WARNING: This firewall script is DISABLED and not called by devcontainer.json
#
# The script attempted to implement network security restrictions using iptables/ipset,
# but this is incompatible with Docker Desktop's DNS architecture on WSL2.
# The script would break DNS resolution by interfering with Docker's internal DNS routing.
#
# Docker Desktop containers are already isolated from the host network, so full iptables
# firewalling is unnecessary. If needed in the future, consider:
# - Using Docker's built-in network policies instead
# - Running on a Linux host with full kernel netfilter support
# - Using a network security tool that integrates with Docker's networking
#
# Before attempting to re-enable this script, understand:
# 1. The nat table must never be flushed (contains Docker's DNS rules)
# 2. DNS rules must allow 192.168.65.7:53 (Docker Desktop's nameserver)
# 3. The firewall policies must be set to ACCEPT before adding domain rules
# 4. Rules must be added in the correct order (DNS before DROP policy)

set -euo pipefail  # Exit on error, undefined vars, and pipeline failures
IFS=$'\n\t'       # Stricter word splitting
# NOTE: DO NOT flush the nat table - Docker's internal DNS translation lives there
iptables -F 2>/dev/null || { echo "WARNING: iptables -F failed (netfilter may not be available)"; }
iptables -X 2>/dev/null || true
# These would break Docker DNS, so we skip them:
# iptables -t nat -F 2>/dev/null || true
# iptables -t nat -X 2>/dev/null || true
iptables -t mangle -F 2>/dev/null || true
iptables -t mangle -X 2>/dev/null || true
ipset destroy allowed-domains 2>/dev/null || true

# Check if iptables/ipset are actually available
if ! command -v iptables &> /dev/null; then
    echo "ERROR: iptables not found in PATH"
    exit 1
fi
if ! iptables -L -n >/dev/null 2>&1; then
    echo "WARNING: iptables kernel module not loaded or no permissions. Firewall rules will not be applied."
    echo "This is normal on Docker Desktop (Windows/Mac). DNS and network access should still work."
    exit 0
fi

# First allow DNS and localhost before any restrictions
# Allow traffic to Docker's internal DNS server (127.0.0.11:53)
iptables -A OUTPUT -d 127.0.0.11 -p udp --dport 53 -j ACCEPT
iptables -A INPUT -s 127.0.0.11 -p udp --sport 53 -j ACCEPT
# Allow DNS to the host nameserver (192.168.65.7 on Docker Desktop)
iptables -A OUTPUT -d 192.168.65.7 -p udp --dport 53 -j ACCEPT
iptables -A INPUT -s 192.168.65.7 -p udp --sport 53 -j ACCEPT
# Allow outbound DNS to any external servers (fallback)
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
# Allow inbound DNS responses
iptables -A INPUT -p udp --sport 53 -j ACCEPT
# Allow outbound SSH
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
# Allow inbound SSH responses
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
# Allow all localhost traffic (loopback interface)
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Create ipset with CIDR support
ipset create allowed-domains hash:net

# Fetch GitHub meta information and aggregate + add their IP ranges
echo "Fetching GitHub IP ranges..."
gh_ranges=$(timeout 5 curl -s https://api.github.com/meta || echo '{"web":[],"api":[],"git":[]}')
if [ -z "$gh_ranges" ]; then
    echo "WARNING: Failed to fetch GitHub IP ranges (continuing without them)"
    gh_ranges='{"web":[],"api":[],"git":[]}'
fi

if ! echo "$gh_ranges" | jq -e '.web or .api or .git' >/dev/null 2>&1; then
    echo "WARNING: GitHub API response missing fields or is empty (continuing with available data)"
fi

echo "Processing GitHub IPs..."
while read -r cidr; do
    [ -z "$cidr" ] && continue
    if [[ ! "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
        echo "WARNING: Invalid CIDR range from GitHub meta: $cidr (skipping)"
        continue
    fi
    echo "Adding GitHub range $cidr"
    ipset add allowed-domains "$cidr" 2>/dev/null || echo "WARNING: Failed to add $cidr to ipset"
done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' 2>/dev/null | sort -u | aggregate -q 2>/dev/null || true)

# Resolve and add other allowed domains including VS Code extension gallery CDNs
for domain in \
    "registry.npmjs.org" \
    "api.anthropic.com" \
    "sentry.io" \
    "statsig.anthropic.com" \
    "statsig.com" \
    "marketplace.visualstudio.com" \
    "dbaeumer.gallery.vsassets.io" \
    "anthropic.gallery.vsassets.io" \
    "esbenp.gallery.vsassets.io" \
    "eamodio.gallery.vsassets.io" \
    "davidanson.gallery.vsassets.io" \
    "alexkrechik.gallery.vsassets.io" \
    "dbaeumer.gallerycdn.vsassets.io" \
    "anthropic.gallerycdn.vsassets.io" \
    "esbenp.gallerycdn.vsassets.io" \
    "eamodio.gallerycdn.vsassets.io" \
    "davidanson.gallerycdn.vsassets.io" \
    "alexkrechik.gallerycdn.vsassets.io" \
    "vscode.blob.core.windows.net" \
    "update.code.visualstudio.com" \
    "main.vscode-cdn.net" \
    "mobile.events.data.microsoft.com" \
    "stryker-mutator.io" \
    "dashboard.stryker-mutator.io" \
    "context7.com" \
    "mcp.context7.com" \
    "clerk.context7.com" \
    "pypi.org" \
    "files.pythonhosted.org"; do
    echo "Resolving $domain..."
    ips=$(timeout 3 dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}' || true)
    if [ -z "$ips" ]; then
        echo "WARNING: Failed to resolve $domain (will retry on next startup)"
        continue
    fi
    
    while read -r ip; do
        if [[ ! "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
            echo "WARNING: Invalid IP from DNS for $domain: $ip (skipping)"
            continue 2
        fi
        echo "Adding $ip for $domain"
        ipset add allowed-domains "$ip" -exist
    done < <(echo "$ips")
done

# Get host IP from default route
HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -z "$HOST_IP" ]; then
    echo "ERROR: Failed to detect host IP"
    exit 1
fi

HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
echo "Host network detected as: $HOST_NETWORK"

# Set up remaining iptables rules
iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT

# Set default policies to DROP first
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# First allow established connections for already approved traffic
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Then allow only specific outbound traffic to allowed domains
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

# Explicitly REJECT all other outbound traffic for immediate feedback
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

echo "Firewall configuration complete"
echo "Verifying firewall rules..."
if timeout 5 curl --connect-timeout 3 https://example.com >/dev/null 2>&1; then
    echo "WARNING: Firewall verification - was able to reach https://example.com (firewall may need adjustment)"
else
    echo "Firewall verification passed - unable to reach https://example.com as expected"
fi

# Verify GitHub API access
if ! timeout 5 curl --connect-timeout 3 https://api.github.com/zen >/dev/null 2>&1; then
    echo "WARNING: Firewall verification - unable to reach https://api.github.com (retrying on next startup)"
else
    echo "Firewall verification passed - able to reach https://api.github.com as expected"
fi