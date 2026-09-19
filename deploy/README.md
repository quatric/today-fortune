# Self-hosting

The site is static, so any web server works. This is the setup used for the hosted copy: an Incus container running
nginx that pulls the repository from GitHub every hour, behind a Caddy reverse proxy.

1. Create a Debian 12 container with nginx, git and cron: `apt-get install -y --no-install-recommends nginx git cron ca-certificates`.
2. Copy `update-site` to `/usr/local/bin/` (mode 755) and `site.conf` to `/etc/nginx/conf.d/`, remove the default nginx site.
3. Run `update-site` once, then add `17 * * * * root /usr/local/bin/update-site` to `/etc/cron.d/update-site`.
4. Point the proxy at the container. For Caddy behind Cloudflare:

```
example.com {
	tls internal
	reverse_proxy <container ip>:80
}
```

`update-site` publishes `web/` at the web root with `data/` next to it, which is where `app.js` looks for it (`../data/`).
