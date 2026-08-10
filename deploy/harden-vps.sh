#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# FLOWOPS VPS SECURITY HARDENING SCRIPT
# Run once after initial server setup. Safe to re-run.
#
# What it does:
# 1. Configures UFW firewall (only SSH, HTTP, HTTPS open)
# 2. Installs fail2ban (blocks brute-force SSH/HTTP attacks)
# 3. Hardens SSH (disable root password, key-only auth)
# 4. Sets up automatic security updates
# 5. Configures kernel security parameters
#
# Usage:
#   chmod +x deploy/harden-vps.sh
#   ssh root@your-vps 'bash -s' < deploy/harden-vps.sh
#
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

echo "═══════════════════════════════════════════════"
echo "  FLOWOPS VPS SECURITY HARDENING"
echo "═══════════════════════════════════════════════"

# ── 1. UFW Firewall ──────────────────────────────────────────────────────────
echo "[1/5] Configuring UFW firewall..."
apt-get update -qq && apt-get install -y -qq ufw fail2ban unattended-upgrades > /dev/null 2>&1

ufw default deny incoming
ufw default allow outgoing
ufw allow ssh          # Port 22
ufw allow 80/tcp       # HTTP (redirects to HTTPS via Cloudflare)
ufw allow 443/tcp      # HTTPS
ufw --force enable
echo "  ✓ Firewall active (SSH + HTTP + HTTPS only)"

# ── 2. Fail2ban (brute-force protection) ─────────────────────────────────────
echo "[2/5] Configuring fail2ban..."
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
ignoreip = 127.0.0.1/8

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 7200

[nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 5
EOF

systemctl enable fail2ban
systemctl restart fail2ban
echo "  ✓ Fail2ban active (SSH: 3 attempts → 2h ban)"

# ── 3. SSH Hardening ─────────────────────────────────────────────────────────
echo "[3/5] Hardening SSH configuration..."
SSHD_CONFIG="/etc/ssh/sshd_config"

# Disable password auth (key-only)
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONFIG"
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD_CONFIG"
sed -i 's/^#*MaxAuthTries.*/MaxAuthTries 3/' "$SSHD_CONFIG"
sed -i 's/^#*LoginGraceTime.*/LoginGraceTime 30/' "$SSHD_CONFIG"

# Disable X11 forwarding and empty passwords
grep -q "^X11Forwarding" "$SSHD_CONFIG" && sed -i 's/^X11Forwarding.*/X11Forwarding no/' "$SSHD_CONFIG" || echo "X11Forwarding no" >> "$SSHD_CONFIG"
grep -q "^PermitEmptyPasswords" "$SSHD_CONFIG" && sed -i 's/^PermitEmptyPasswords.*/PermitEmptyPasswords no/' "$SSHD_CONFIG" || echo "PermitEmptyPasswords no" >> "$SSHD_CONFIG"

systemctl restart sshd
echo "  ✓ SSH hardened (key-only, 3 max attempts, 30s grace)"

# ── 4. Automatic Security Updates ────────────────────────────────────────────
echo "[4/5] Enabling automatic security updates..."
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
echo "  ✓ Automatic security updates enabled (daily)"

# ── 5. Kernel Hardening ──────────────────────────────────────────────────────
echo "[5/5] Applying kernel security parameters..."
cat > /etc/sysctl.d/99-flowops-hardening.conf <<'EOF'
# Prevent IP spoofing
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Disable source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0

# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0

# Ignore send redirects
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# SYN flood protection
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2

# Disable IPv6 if not used
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1

# Prevent core dumps
fs.suid_dumpable = 0
EOF

sysctl -p /etc/sysctl.d/99-flowops-hardening.conf > /dev/null 2>&1
echo "  ✓ Kernel hardened (SYN flood protection, IP spoof prevention)"

echo ""
echo "═══════════════════════════════════════════════"
echo "  ✅ VPS HARDENING COMPLETE"
echo ""
echo "  Summary:"
echo "  • Firewall: SSH + HTTP + HTTPS only"
echo "  • Fail2ban: 3 SSH attempts → 2h ban"
echo "  • SSH: Key-only, no passwords"
echo "  • Updates: Automatic daily security patches"
echo "  • Kernel: SYN flood + IP spoof protection"
echo ""
echo "  Next steps:"
echo "  1. Add your SSH key: ssh-copy-id root@your-vps"
echo "  2. Test SSH login with key before closing session"
echo "  3. Consider moving SSH to non-standard port"
echo "═══════════════════════════════════════════════"
