# Observer

Local-first CS2 broadcast / HUD manager.

## Development Bridge

The Windows development bridge keeps `C:\Observer` synchronized with the latest commit from the `main` branch.

### First setup on the Windows server

Git for Windows must be installed and available in `PATH`.

Run once:

```bat
mkdir C:\ObserverDevBridge
git clone https://github.com/christopherstrasser-sudo/observer.git C:\ObserverDevBridge\repo
C:\ObserverDevBridge\repo\start-dev-bridge.cmd
```

After that, start the bridge with:

```bat
C:\ObserverDevBridge\repo\start-dev-bridge.cmd
```

The bridge keeps its Git working copy and logs outside the application directory in `C:\ObserverDevBridge`.

### Defaults

- Repository: `https://github.com/christopherstrasser-sudo/observer.git`
- Branch: `main`
- Target: `C:\Observer`
- Poll interval: 10 seconds
- Local data preserved: `.env`, `data`, `node_modules`, `logs`
- Log file: `C:\ObserverDevBridge\logs\observer-dev-bridge.log`

The first run always performs a clean synchronization. Afterwards, the bridge checks the remote branch every 10 seconds and only deploys when a new commit is detected.

For a one-shot synchronization, run:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File C:\ObserverDevBridge\repo\dev-bridge\observer-dev-bridge.ps1 -Once
```
