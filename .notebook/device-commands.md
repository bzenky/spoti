# Device Commands
> CLI listing and selection for Spotify Connect devices

Entry: `src/app.ts` device command registrations

Commands:
- `device` lists devices with no selector; a number, name, or ID transfers playback
- `devices`, `dev`, and `devs` remain aliases for compatibility
- `device --default` also writes the selected name or ID to `defaultDevice`
- `DeviceService.findDevice()` resolves sorted one-based positions, exact case-insensitive names, or IDs
- `src/ui/completions.ts` keeps bash, zsh, and fish command/option entries in sync
- `README.md` documents commands and default-device behavior
- Interactive device selection is in `src/tui/devices-screen.tsx`

Updated: 2026-09-30
