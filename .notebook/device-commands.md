# Device Commands
> CLI listing and selection for Spotify Connect devices

Entry: `src/app.ts` device command registrations

Commands:
- `device` lists devices with no selector; a number, name, or ID transfers playback
- `devices`, `dev`, and `devs` remain aliases for compatibility
- `device --default` also writes the selected name or ID to `defaultDevice`
- The device list prints the exact next command using `spoti device 1`; when no devices are available, guide users to open Spotify or run `spoti launch` and refresh
- `DeviceService.findDevice()` distinguishes an empty Connect device list from an invalid listed number
- Playback-control `Device not found` errors guide users to reopen Spotify on that device and refresh the list
- `DeviceService.findDevice()` resolves sorted one-based positions, exact case-insensitive names, or IDs
- `src/ui/completions.ts` keeps bash, zsh, and fish command/option entries in sync
- `README.md` documents commands and default-device behavior
- Interactive device selection is in `src/tui/devices-screen.tsx`
- Devices screen `o` uses the `openExternal` dependency wired from `src/cli.ts` through `TuiApp` to request `spotify:` and refresh discovery. Launch requests are deduplicated; leaving the screen suppresses subsequent discovery. `r` handles delayed Spotify registration.

Updated: 2026-10-03
