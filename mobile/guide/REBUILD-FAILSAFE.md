# Failsafe — Branch Policy & Revert Procedures

## Branch Policy
- **`main`** — Testing branch. All work lands here first.
- **`backup`** — Dedicated backup. Synced after major milestones.
- **`dev`** — Development branch. **NOT a backup branch.**

## Revert procedure (full — discard everything on main)
```bash
cd "E:\GENUM SOLUTIONS PVT LTD\Project\genumsolutions-app\mobile"
git checkout main
git reset --hard backup
git push origin main --force
```

## Revert procedure (partial — specific files)
```bash
git checkout backup -- src/screens/RemoteControlScreen.tsx
git checkout backup -- src/components/tools/DriveControls.tsx
```

## Revert procedure (single commit)
```bash
git revert HEAD
```
