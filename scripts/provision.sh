#!/usr/bin/env bash
set -euo pipefail

# provision.sh — Run on a fresh Ubuntu 24.04 VPS as root
# Usage: ssh root@server 'bash -s' < scripts/provision.sh

echo "=== GitFable VPS Provisioning ==="

# --- System updates ---
apt update && apt upgrade -y

# --- Install essential packages ---
apt install -y \
    curl \
    wget \
    git \
    ufw \
    fail2ban \
    unattended-upgrades \
    apt-listchanges \
    ca-certificates \
    gnupg

# --- Create deploy user ---
if ! id "deploy" &>/dev/null; then
    useradd -m -s /bin/bash deploy
    mkdir -p /home/deploy/.ssh
    if [ -f /root/.ssh/authorized_keys ]; then
        cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
    else
        echo "WARNING: /root/.ssh/authorized_keys not found. No SSH keys installed for deploy user." >&2
        echo "You must manually add keys to /home/deploy/.ssh/authorized_keys before SSH hardening." >&2
        touch /home/deploy/.ssh/authorized_keys
    fi
    chown -R deploy:deploy /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh
    chmod 600 /home/deploy/.ssh/authorized_keys
    echo "deploy ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/bin/docker compose" > /etc/sudoers.d/deploy
    echo "Created deploy user"
else
    echo "Deploy user already exists"
fi

# --- Install Docker (official repo) ---
if ! command -v docker &>/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    systemctl enable docker
    echo "Docker installed"
else
    echo "Docker already installed"
fi

# Ensure deploy user can run Docker without sudo
if ! id -nG deploy | grep -qw docker; then
    usermod -aG docker deploy
    echo "Added deploy user to docker group"
fi

# --- Firewall ---
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
echo "Firewall configured (22, 80, 443)"

# --- SSH hardening ---
if [ -f /home/deploy/.ssh/authorized_keys ] && [ -s /home/deploy/.ssh/authorized_keys ]; then
    sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
    sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
    sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
    # Validate config before restarting to avoid lockouts
    if ! sshd -t; then
        echo "ERROR: sshd configuration test failed. Not restarting SSH." >&2
        exit 1
    fi
    # Ubuntu uses 'ssh' unit, other distros use 'sshd'
    if systemctl list-unit-files ssh.service &>/dev/null; then
        systemctl restart ssh
    else
        systemctl restart sshd
    fi
    echo "SSH hardened (key-only, no root login)"
else
    echo "WARNING: deploy user has no SSH keys. Skipping SSH hardening to prevent lockout."
    echo "Add SSH keys to /home/deploy/.ssh/authorized_keys and re-run SSH hardening manually."
fi

# --- Fail2ban ---
systemctl enable fail2ban
systemctl start fail2ban
echo "Fail2ban enabled"

# --- Unattended upgrades ---
DEBIAN_FRONTEND=noninteractive dpkg-reconfigure -f noninteractive -plow unattended-upgrades
echo "Unattended security upgrades enabled"

# --- Create app directory ---
mkdir -p /home/deploy/gitfable/docker/secrets
mkdir -p /home/deploy/gitfable/logs
mkdir -p /home/deploy/gitfable/backups
chown -R deploy:deploy /home/deploy/gitfable

# --- Install GitHub Actions runner ---
RUNNER_VERSION="2.321.0"
RUNNER_DIR="/home/deploy/actions-runner"

if [ ! -f "$RUNNER_DIR/run.sh" ]; then
    mkdir -p "$RUNNER_DIR"
    cd "$RUNNER_DIR"
    curl -o actions-runner.tar.gz -L "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
    tar xzf actions-runner.tar.gz
    rm actions-runner.tar.gz
    chown -R deploy:deploy "$RUNNER_DIR"
    echo "GitHub Actions runner extracted to $RUNNER_DIR"
    echo "NOTE: You must register the runner manually as 'deploy' user:"
    echo "  su - deploy"
    echo "  cd $RUNNER_DIR"
    echo "  ./config.sh --url https://github.com/YOUR_ORG/YOUR_REPO --token YOUR_TOKEN --labels self-hosted,vps-prod"
    echo "  sudo ./svc.sh install"
    echo "  sudo ./svc.sh start"
else
    echo "GitHub Actions runner already installed"
fi

# --- Install B2 CLI for offsite backups ---
if ! command -v b2 &>/dev/null; then
    apt install -y python3-pip
    pip3 install b2 --break-system-packages
    echo "B2 CLI installed"
else
    echo "B2 CLI already installed"
fi

echo ""
echo "=== Provisioning complete ==="
echo "Next steps:"
echo "  1. Log out and SSH in as: ssh deploy@$(hostname -I | awk '{print $1}')"
echo "  2. Register GitHub Actions runner:"
echo "     cd ~/actions-runner"
echo "     ./config.sh --url https://github.com/nishantg96/gitfable-app --token <TOKEN> --labels self-hosted,vps-prod"
echo "     sudo ./svc.sh install && sudo ./svc.sh start"
echo "  3. Copy docker-compose and env files to /home/deploy/gitfable/"
echo "  4. Create secrets in /home/deploy/gitfable/docker/secrets/"
echo "  5. Configure B2 credentials for offsite backups (optional):"
echo "     export B2_APPLICATION_KEY_ID=... B2_APPLICATION_KEY=... B2_BUCKET_NAME=..."
echo "  6. Run: cd ~/gitfable && docker compose -f docker-compose.vps-prod.yml up -d"
