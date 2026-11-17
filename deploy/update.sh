#!/usr/bin/env bash
# Pulls the newest code and rebuilds when main has changed. Cron runs it every 5 minutes.
# The first manual run installs the cron entry: sudo bash /opt/scaleframes-demo/deploy/update.sh
set -euo pipefail
cd /opt/scaleframes-demo
line='*/5 * * * * root /opt/scaleframes-demo/deploy/update.sh >> /var/log/sfdemo-update.log 2>&1'
[ -f /etc/cron.d/sfdemo-update ] || echo "$line" > /etc/cron.d/sfdemo-update

git fetch -q origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && [ "${1:-}" != "--force" ]; then
  exit 0
fi
git reset -q --hard origin/main
cd deploy
docker compose up -d --build
docker image prune -f >/dev/null
echo "$(date -Is) updated to $(git rev-parse --short HEAD)"
