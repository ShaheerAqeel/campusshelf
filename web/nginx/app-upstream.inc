# Default app-tier upstream, used by docker compose (service name "api").
# On AWS, each web host overwrites this file every 20 s with the private IPs
# of the running app-tier instances (see infrastructure/templates/web-user-data.sh.tftpl).
server api:3000 max_fails=1 fail_timeout=15s;
