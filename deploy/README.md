# Deploying to a Google Cloud e2-micro

Everything runs on one small VM: the Node server, the built React client and
the SQLite file. Players open `http://<VM external IP>` and the host opens
`http://<VM external IP>/host`. Plan for about 15 minutes of setup.

## 1. Create the VM

In the Cloud Console go to **Compute Engine → VM instances → Create instance**:

- **Machine type:** `e2-micro`
- **Region:** `us-west1`, `us-central1` or `us-east1`. These are the free-tier regions.
- **Boot disk:** Debian 12, standard persistent disk, 10–30 GB
- **Firewall:** tick **Allow HTTP traffic**

Then click **SSH** to open a terminal on the VM.

## 2. Add swap (so `npm run build` fits in 1 GB RAM)

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. Install Node 24 and git

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git
node --version   # should print v24.x
```

## 4. Get the code and build it

```bash
sudo useradd --system --create-home --home-dir /opt/avalon-online avalon || true
sudo git clone https://github.com/jkevinr59/online-avalon.git /opt/avalon-online
sudo chown -R avalon:avalon /opt/avalon-online
cd /opt/avalon-online
sudo -u avalon npm ci
sudo -u avalon npm run build
sudo -u avalon npm test   # optional sanity check
```

## 5. Run it as a service

```bash
sudo cp deploy/avalon.service /etc/systemd/system/avalon.service
sudo nano /etc/systemd/system/avalon.service   # set PLAYER_PASSWORD and HOST_PASSWORD
sudo systemctl daemon-reload
sudo systemctl enable --now avalon
systemctl status avalon            # should be "active (running)"
curl http://localhost/api/health   # {"ok":true}
```

Now open `http://<external IP>` from your phone. The external IP is shown on
the VM instances page.

The service restarts automatically if it crashes or the VM reboots. A game in
progress resumes because the live state is saved to `data/avalon.db` after
every move.

## Updating

```bash
cd /opt/avalon-online
sudo -u avalon git pull
sudo -u avalon npm ci
sudo -u avalon npm run build
sudo systemctl restart avalon
```

## Logs and troubleshooting

```bash
journalctl -u avalon -f    # live server logs
```

- **Page doesn't load from outside:** check that the VM has the `http-server`
  network tag. Ticking "Allow HTTP traffic" adds it.
- **`npm run build` gets killed:** the swap file is probably missing. Check
  with `free -h`.

## Tearing down

When the event is over, delete the VM, along with its disk, from the VM
instances page.

## Optional: HTTPS with a domain

If you point a domain at the VM, you can put [Caddy](https://caddyserver.com)
in front for automatic HTTPS:

1. Set `PORT=3000` in the service file and remove `AmbientCapabilities`.
2. Install Caddy.
3. Use this `/etc/caddy/Caddyfile`:

   ```
   avalon.example.com {
     reverse_proxy localhost:3000
   }
   ```

4. Allow HTTPS traffic on the VM.
