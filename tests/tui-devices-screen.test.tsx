import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { Device } from '../src/services/device.service.js';
import {
  DevicesScreen,
  type DevicesScreenProps,
  type TuiDevices,
} from '../src/tui/devices-screen.js';

function createDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'laptop-id',
    isActive: true,
    isPrivateSession: false,
    isRestricted: false,
    name: 'Laptop',
    type: 'Computer',
    volumePercent: 42,
    supportsVolume: true,
    ...overrides,
  };
}

function createService(devices: Device[] = []): TuiDevices {
  return {
    getDevices: vi.fn().mockResolvedValue(devices),
    transferPlayback: vi.fn().mockResolvedValue(undefined),
  };
}

function renderScreen(device: TuiDevices, overrides: Partial<DevicesScreenProps> = {}) {
  return render(
    <DevicesScreen
      device={device}
      config={
        overrides.config ?? {
          read: vi.fn().mockResolvedValue({ defaultDevice: null }),
          set: vi.fn().mockResolvedValue(undefined),
          resetKey: vi.fn().mockResolvedValue(undefined),
        }
      }
      onBack={overrides.onBack ?? vi.fn()}
      onExit={overrides.onExit ?? vi.fn()}
    />,
  );
}

describe('DevicesScreen', () => {
  it('loads controllable devices on mount and renders safe device details', async () => {
    const service = createService([
      createDevice({ name: 'Lap\u001B[31mtop\nMain', type: 'Com\tputer' }),
      createDevice({
        id: 'speaker-id',
        isActive: false,
        name: 'Kitchen Speaker',
        type: 'Speaker',
        volumePercent: null,
        supportsVolume: false,
      }),
    ]);
    const view = renderScreen(service);

    expect(view.lastFrame()).toContain('Loading devices…');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Laptop Main · Com puter · active · Volume: 42%'));

    const signal = vi.mocked(service.getDevices).mock.calls[0]?.[0];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(view.lastFrame()).toContain('› ● Laptop Main');
    expect(view.lastFrame()).toContain('○ Kitchen Speaker · Speaker · available · Volume: unavailable');
    expect(view.lastFrame()).not.toContain('\u001B[31m');
    view.unmount();
  });

  it('moves selection with arrows, transfers on Enter, and updates active state locally', async () => {
    const laptop = createDevice();
    const speaker = createDevice({
      id: 'speaker-id',
      isActive: false,
      name: 'Kitchen Speaker',
      type: 'Speaker',
      volumePercent: 75,
    });
    const service = createService([laptop, speaker]);
    vi.mocked(service.getDevices).mockResolvedValueOnce([laptop, speaker]);
    const view = renderScreen(service);
    await vi.waitFor(() => expect(view.lastFrame()).toContain('› ● Laptop'));

    view.stdin.write('\u001B[B');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('› ○ Kitchen Speaker'));
    view.stdin.write('\r');

    await vi.waitFor(() =>
      expect(service.transferPlayback).toHaveBeenCalledWith(
        'speaker-id',
        undefined,
        expect.any(AbortSignal),
      ),
    );
    expect(service.getDevices).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(view.lastFrame()).toContain('› ● Kitchen Speaker');
      expect(view.lastFrame()).toContain('Active device: Kitchen Speaker');
    });
    view.unmount();
  });

  it('shows an empty state and supports manual refresh', async () => {
    const service = createService([]);
    vi.mocked(service.getDevices)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createDevice()]);
    const view = renderScreen(service);
    await vi.waitFor(() => {
      expect(view.lastFrame()).toContain('No Spotify Connect devices found.');
    });

    view.stdin.write('r');

    await vi.waitFor(() => expect(service.getDevices).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(view.lastFrame()).toContain('› ● Laptop'));
    view.unmount();
  });

  it('keeps sanitized load errors visible and retryable with Enter', async () => {
    const service = createService();
    vi.mocked(service.getDevices)
      .mockRejectedValueOnce(new Error('Spotify unavailable\ntry again\u001B[31m'))
      .mockResolvedValueOnce([createDevice()]);
    const view = renderScreen(service);

    await vi.waitFor(() => {
      expect(view.lastFrame()).toContain('Spotify unavailable try again Press Enter or [r] to retry.');
    });
    expect(view.lastFrame()).not.toContain('Spotify unavailable\ntry again');
    view.stdin.write('\r');

    await vi.waitFor(() => expect(service.getDevices).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(view.lastFrame()).toContain('› ● Laptop'));
    view.unmount();
  });

  it('shows transfer failures without losing the device list', async () => {
    const service = createService([createDevice({ isActive: false })]);
    vi.mocked(service.transferPlayback).mockRejectedValueOnce(
      new Error('Transfer failed\nopen Spotify'),
    );
    const view = renderScreen(service);
    await vi.waitFor(() => expect(view.lastFrame()).toContain('› ○ Laptop'));

    view.stdin.write('\r');

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Transfer failed open Spotify'));
    expect(view.lastFrame()).toContain('› ○ Laptop');
    view.unmount();
  });

  it('preselects the active device, shows unavailable devices, and toggles IDs', async () => {
    const laptop = createDevice({ id: 'laptop-id', isActive: false });
    const speaker = createDevice({ id: 'speaker-id', name: 'Kitchen Speaker', type: 'Speaker', isActive: true });
    const restricted = createDevice({
          id: 'tv-id',
          name: 'Living Room TV',
          type: 'TV',
          isActive: false,
          isRestricted: true,
        });
    const config = {
      read: vi.fn().mockResolvedValue({ defaultDevice: 'laptop-id' }),
      set: vi.fn(),
      resetKey: vi.fn(),
    };
    const view = renderScreen(createService([laptop, speaker, restricted]), { config });

    await vi.waitFor(() => expect(view.lastFrame()).toContain('› ● Kitchen Speaker'));
    expect(view.lastFrame()).toContain('Laptop · Computer · available · default');
    expect(view.lastFrame()).toContain('× Living Room TV · TV · restricted');
    view.stdin.write('i');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('ID: tv-id'));
    view.unmount();
  });

  it('sets and clears the selected default device', async () => {
    const config = {
      read: vi.fn().mockResolvedValue({ defaultDevice: null }),
      set: vi.fn().mockResolvedValue(undefined),
      resetKey: vi.fn().mockResolvedValue(undefined),
    };
    const view = renderScreen(createService([createDevice({ isActive: false })]), { config });
    await vi.waitFor(() => expect(view.lastFrame()).toContain('› ○ Laptop'));

    view.stdin.write('s');
    await vi.waitFor(() => expect(config.set).toHaveBeenCalledWith('defaultDevice', 'laptop-id'));
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Default device: Laptop'));
    view.stdin.write('s');
    await vi.waitFor(() => expect(config.resetKey).toHaveBeenCalledWith('defaultDevice'));
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Cleared default device: Laptop'));
    view.unmount();
  });

  it('aborts an in-flight load before invoking Back', async () => {
    let signal: AbortSignal | undefined;
    const service = createService();
    vi.mocked(service.getDevices).mockImplementation(
      async (requestSignal) =>
        new Promise((resolve) => {
          signal = requestSignal;
          requestSignal?.addEventListener('abort', () => resolve([]), { once: true });
        }),
    );
    const onBack = vi.fn();
    const view = renderScreen(service, { onBack });
    await vi.waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));

    view.stdin.write('\u001B');

    await vi.waitFor(() => expect(onBack).toHaveBeenCalledOnce());
    expect(signal?.aborted).toBe(true);
    view.unmount();
  });

  it('aborts an in-flight load on unmount', async () => {
    let signal: AbortSignal | undefined;
    const service = createService();
    vi.mocked(service.getDevices).mockImplementation(
      async (requestSignal) =>
        new Promise((resolve) => {
          signal = requestSignal;
          requestSignal?.addEventListener('abort', () => resolve([]), { once: true });
        }),
    );
    const view = renderScreen(service);
    await vi.waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));

    view.unmount();

    expect(signal?.aborted).toBe(true);
  });
});
