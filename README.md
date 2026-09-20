# Observer

Local-first CS2 broadcast / HUD manager.

## Development Bridge

The Windows development bridge keeps `C:\Observer` synchronized with the latest commit from the `main` branch.

Start it with:

```bat
dev-bridge\start-dev-bridge.cmd
```

The bridge stores its Git working copy and logs outside the application directory in `C:\ObserverDevBridge`.

### Defaults

- Repository: `https://github.com/christopherstrasser-sudo/observer.git`
- Branch: `main`
- Target: `C:\Observer`
- Poll interval: 10 seconds
- Local data preserved: `.env`, `data`, `node_modules`, `logs`

Use `-Once` on the PowerShell script for a single synchronization.
