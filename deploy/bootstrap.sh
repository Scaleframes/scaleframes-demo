#!/usr/bin/env bash
# First-boot setup for Scaleframes Demo on Ubuntu (run by cloud-init as root).
# Expects /root/sfdemo-secrets.env, /root/sfdemo-users and /root/sfdemo-sellers.json.
set -euxo pipefail
exec > >(tee -a /var/log/sfdemo-bootstrap.log) 2>&1

# Swap: the image build needs more than 1 GB RAM on the smallest servers.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update
apt-get install -y git ufw curl
command -v docker || curl -fsSL https://get.docker.com | sh

ufw allow OpenSSH
ufw allow 3478/udp
ufw allow 3478/tcp
ufw allow 50000:50200/udp
ufw --force enable

[ -d /opt/scaleframes-demo ] || git clone https://github.com/Scaleframes/scaleframes-demo /opt/scaleframes-demo
cd /opt/scaleframes-demo/deploy

set +x # keep tokens out of the log
. /root/sfdemo-secrets.env
ip=$(curl -fsS http://169.254.169.254/hetzner/v1/metadata/public-ipv4 || curl -fsS4 https://api.ipify.org)
sed -e "s|^SCREEGO_EXTERNAL_IP=.*|SCREEGO_EXTERNAL_IP=${ip}|" \
    -e "s|^SCREEGO_SECRET=.*|SCREEGO_SECRET=$(openssl rand -hex 32)|" \
    -e "s|^SCREEGO_HUBSPOT_TOKEN=.*|SCREEGO_HUBSPOT_TOKEN=${HUBSPOT_TOKEN}|" \
    screego.env.example > screego.env
echo "CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}" > .env
chmod 600 screego.env .env
set -x

install -m 644 /root/sfdemo-users users
install -m 644 /root/sfdemo-sellers.json sellers.json

docker compose up -d --build
sleep 5
curl -fsS http://127.0.0.1:5050/health
echo "Scaleframes Demo is running. Public IP: ${ip}"
