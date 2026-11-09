#!/bin/bash
# Turns an Amazon Linux 2023 instance into a NAT instance (follows the AWS NAT instance guide).
set -eux

dnf install -y iptables-services
systemctl enable --now iptables

echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/90-nat.conf
sysctl -p /etc/sysctl.d/90-nat.conf

IFACE=$(ip route show default | awk '{print $5; exit}')
iptables -t nat -A POSTROUTING -o "$IFACE" -s 10.0.0.0/16 -j MASQUERADE
# The default iptables-services rules REJECT forwarded traffic; flush that chain.
iptables -F FORWARD
service iptables save
