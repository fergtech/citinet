================================================================================
  CITINET HUB SETUP - QUICK START GUIDE
================================================================================

Thank you for creating a Citinet hub! This package contains everything you need
to run a local community hub on your computer or server.

PREREQUISITES
-------------
✓ Docker Desktop (Windows/Mac) or Docker Engine (Linux) version 20.10+
✓ At least 2GB free RAM and 5GB disk space
✓ Optional: Tailscale or Cloudflare account for public access

QUICK START (5 minutes)
-----------------------
1. Extract this ZIP to a folder (e.g., ~/citinet-hub or C:\citinet-hub)

2. Configure your hub:
   - Copy ".env.example" to ".env"
   - Edit .env with a text editor
   - Set HUB_NAME, HUB_SLUG, HUB_LOCATION
   - Change all passwords (DB_PASSWORD, JWT_SECRET, etc.)

3. Start the hub:
   Open terminal/PowerShell in this folder and run:
   
   docker-compose up -d
   
   Wait 30-60 seconds for services to start.

4. Verify it's running:
   - Visit http://localhost:9090/health (should show "OK")
   - MinIO console: http://localhost:9001
   - API logs: docker-compose logs -f citinet-api

5. Connect from browser:
   - Visit http://localhost:3000?hub=YOUR_HUB_SLUG
   - Or visit the main Citinet site and enter your hub URL

MAKING YOUR HUB PUBLIC (Optional)
---------------------------------
Your hub is currently only accessible on your local network. To make it
accessible to community members outside your network:

OPTION A: Tailscale Funnel (Recommended)
  1. Install Tailscale: https://tailscale.com/download
  2. Run: tailscale funnel 9090
  3. Copy the public URL (e.g., https://your-machine.tail12345.ts.net)
  4. Add TUNNEL_URL=<your-url> to .env
  5. Restart: docker-compose restart citinet-api

OPTION B: Cloudflare Tunnel
  1. Install cloudflared: https://developers.cloudflare.com/cloudflare-one/
  2. Run: cloudflared tunnel --url http://localhost:9090
  3. Copy the public URL (e.g., https://abc123.trycloudflare.com)
  4. Add TUNNEL_URL=<your-url> to .env
  5. Restart: docker-compose restart citinet-api

COMMON COMMANDS
---------------
Start hub:           docker-compose up -d
Stop hub:            docker-compose down
View logs:           docker-compose logs -f
Restart services:    docker-compose restart
Check status:        docker-compose ps
Update images:       docker-compose pull && docker-compose up -d

TROUBLESHOOTING
---------------
❌ "docker: command not found"
   → Install Docker Desktop from https://www.docker.com/products/docker-desktop

❌ "port 9090 already in use"
   → Change API_PORT in .env (e.g., API_PORT=9091) and restart

❌ Services keep restarting
   → Check logs: docker-compose logs citinet-api
   → Verify .env passwords are set (no "changeme" values)

❌ Can't connect from browser
   → Check hub is running: docker-compose ps
   → Verify API health: curl http://localhost:9090/health
   → Check firewall isn't blocking port 9090

NEXT STEPS
----------
✓ Invite community members to join your hub
✓ Configure moderation settings in the admin dashboard
✓ Set up automatic backups of your data volumes
✓ Register your hub with the Citinet registry (optional)

SUPPORT & DOCUMENTATION
-----------------------
📖 Full documentation: https://github.com/fergtech/citinet
💬 Community support: https://github.com/fergtech/citinet/discussions
🐛 Report issues: https://github.com/fergtech/citinet/issues

================================================================================
Happy hub hosting! 🎉
================================================================================
