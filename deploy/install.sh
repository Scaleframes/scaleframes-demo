#!/usr/bin/env bash
# Installs Scaleframes Demo on a fresh Ubuntu 24.04 server. Run as root from the deploy/ folder:
#   sudo bash install.sh
# The script asks for the Cloudflare tunnel token, the HubSpot token and the sellers.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null; then
  echo "== Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi

echo "== Firewall: SSH, TURN 3478 and relay ports 50000-50200"
apt-get install -y ufw >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 3478/udp >/dev/null
ufw allow 3478/tcp >/dev/null
ufw allow 50000:50200/udp >/dev/null
ufw --force enable >/dev/null

if [ ! -f screego.env ]; then
  ip=$(curl -fsS4 https://api.ipify.org)
  read -rp "HubSpot private app token (leave empty to skip HubSpot): " hubspot
  sed -e "s|^SCREEGO_EXTERNAL_IP=.*|SCREEGO_EXTERNAL_IP=${ip}|" \
      -e "s|^SCREEGO_SECRET=.*|SCREEGO_SECRET=$(openssl rand -hex 32)|" \
      -e "s|^SCREEGO_HUBSPOT_TOKEN=.*|SCREEGO_HUBSPOT_TOKEN=${hubspot}|" \
      screego.env.example > screego.env
  chmod 600 screego.env
  echo "Public IP: ${ip}"
fi

if [ ! -f .env ]; then
  read -rp "Cloudflare tunnel token: " tunnel
  echo "CLOUDFLARE_TUNNEL_TOKEN=${tunnel}" > .env
  chmod 600 .env
fi

[ -f sellers.json ] || cp sellers.example.json sellers.json
touch users

echo "== Building"
docker compose build

echo "== Seller logins (empty slug to stop)"
while true; do
  read -rp "Seller slug (for example lukas): " slug
  [ -z "$slug" ] && break
  read -rsp "Password for ${slug}: " pass; echo
  sed -i "/^${slug}:/d" users
  docker compose run --rm --no-deps demo hash --name "$slug" --pass "$pass" >> users
done

echo "== Starting"
docker compose up -d
sleep 3
curl -fsS http://127.0.0.1:5050/health && echo
echo "Done. Edit sellers.json for names, languages and HubSpot e-mails, then run: docker compose restart demo"
