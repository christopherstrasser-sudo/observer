# Observer

Local-first CS2 broadcast control room and HUD engine.

## v0.1 foundation

- Node.js + TypeScript broadcast backend
- CS2 Game State Integration receiver
- Socket.IO realtime state distribution
- React control room
- OBS browser overlay at /overlay
- GSI config generator
- Windows development/start scripts

## Development

From C:\Observer:

    Start-Dev.cmd

The development URLs are:

- Control Room: http://localhost:5173
- Backend: http://localhost:3194
- CS2 GSI endpoint: http://127.0.0.1:3194/api/gsi
- Development overlay: http://localhost:5173/overlay

## Production-style local start

    Build-And-Start.cmd

Then open:

- Control Room: http://localhost:3194
- OBS overlay: http://localhost:3194/overlay

## Connect CS2

Open the Control Room and use "Copy Observer config".

Save it as:

    gamestate_integration_observer.cfg

inside the CS2 directory:

    game\csgo\cfg\

Restart CS2. Observer will start receiving game-state packets automatically.
