# Observer

Local-first CS2 broadcast control room and HUD engine.

## v0.2 foundation

- Node.js + TypeScript broadcast backend
- CS2 Game State Integration receiver
- persistent GSI auth token
- configurable LAN / Tailscale GSI target
- Socket.IO realtime state distribution
- React control room
- OBS browser overlay at /overlay
- GSI config copy + download
- Windows firewall helper
- Windows development/start scripts

## Development

From C:\Observer:

    Start-Dev.cmd

The development URLs are:

- Control Room: http://localhost:5173
- Backend: http://localhost:3194
- CS2 GSI endpoint: http://<server-ip>:3194/api/gsi
- Development overlay: http://localhost:5173/overlay

## Production-style local start

    Build-And-Start.cmd

Then open:

- Control Room: http://localhost:3194
- OBS overlay: http://localhost:3194/overlay

## Network setup

Observer listens on 0.0.0.0:3194.

If the CS2 machine is a different PC, open TCP port 3194 in Windows Firewall on
the Observer server. Run Open-GSI-Firewall.cmd as Administrator.

Use one of these target types in the Control Room:

- same LAN: http://<observer-lan-ip>:3194/api/gsi
- Tailscale: http://<observer-tailscale-ip>:3194/api/gsi

Do not use 127.0.0.1 unless CS2 itself runs on the Observer server.

## Connect CS2

1. In the Control Room, enter the GSI target URL reachable by the CS2 PC.
2. Click "Download .cfg" or "Copy config".
3. Save the file as:

       gamestate_integration_observer.cfg

   inside:

       game\csgo\cfg\

4. Restart CS2.

Observer creates an authentication token automatically on first start and stores
it in:

    C:\Observer\data\gsi-token.txt

The generated CS2 config includes this token. Packets with a wrong or missing
token are rejected.
