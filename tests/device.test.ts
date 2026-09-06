import { describe, expect, it, vi } from 'vitest';

import { DeviceService } from '../src/services/device.service.js';
import type { SpotifyApi } from '../src/spotify/client.js';
import { AppError, NoActiveDeviceError } from '../src/utils/errors.js';

function createApi(): SpotifyApi {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

function spotifyDevice(
  overrides: Partial<{
    id: string | null;
    is_active: boolean;
    is_private_session: boolean;
    is_restricted: boolean;
    name: string;
    type: string;
    volume_percent: number | null;
    supports_volume: boolean;
  }> = {},
) {
  return {
    id: 'laptop-id',
    is_active: false,
    is_private_session: false,
    is_restricted: false,
    name: 'Laptop',
    type: 'Computer',
    volume_percent: 42,
    supports_volume: true,
    ...overrides,
  };
}

describe('DeviceService', () => {
  it('fetches and maps Spotify devices into application models', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      devices: [
        spotifyDevice({
          id: null,
          is_active: true,
          is_private_session: true,
          name: 'Web Player',
          volume_percent: null,
          supports_volume: false,
        }),
      ],
    });

    await expect(new DeviceService(api).getDevices()).resolves.toEqual([
      {
        id: null,
        isActive: true,
        isPrivateSession: true,
        isRestricted: false,
        name: 'Web Player',
        type: 'Computer',
        volumePercent: null,
        supportsVolume: false,
      },
    ]);
    expect(api.get).toHaveBeenCalledWith('/me/player/devices');
  });

  it('sorts devices deterministically so displayed numbers remain stable', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      devices: [
        spotifyDevice({ id: 'everywhere-id', name: 'Everywhere' }),
        spotifyDevice({ id: 'echo-id', name: 'Echo Pop de Bruno' }),
      ],
    });

    await expect(new DeviceService(api).getDevices()).resolves.toMatchObject([
      { id: 'echo-id', name: 'Echo Pop de Bruno' },
      { id: 'everywhere-id', name: 'Everywhere' },
    ]);
  });

  it('returns the active device and rejects when none is active', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      devices: [spotifyDevice(), spotifyDevice({ id: 'speaker-id', name: 'Speaker', is_active: true })],
    });
    await expect(new DeviceService(api).getActiveDevice()).resolves.toMatchObject({
      id: 'speaker-id',
      name: 'Speaker',
      isActive: true,
    });

    vi.mocked(api.get).mockResolvedValue({ devices: [spotifyDevice()] });
    await expect(new DeviceService(api).getActiveDevice()).rejects.toBeInstanceOf(
      NoActiveDeviceError,
    );
  });

  it('filters out restricted devices and devices with null IDs', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      devices: [
        spotifyDevice(),
        spotifyDevice({ id: 'restricted-id', name: 'TV', is_restricted: true }),
        spotifyDevice({ id: null, name: 'Unknown device' }),
      ],
    });

    await expect(new DeviceService(api).getControllableDevices()).resolves.toEqual([
      expect.objectContaining({ id: 'laptop-id', name: 'Laptop' }),
    ]);
  });

  it('finds controllable devices by case-insensitive exact ID or name', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      devices: [
        spotifyDevice(),
        spotifyDevice({ id: 'SPEAKER-ID', name: 'Living Room' }),
        spotifyDevice({ id: 'bedroom-id', name: 'Living Room Speaker' }),
      ],
    });
    const service = new DeviceService(api);

    await expect(service.findDevice('speaker-id')).resolves.toMatchObject({
      id: 'SPEAKER-ID',
    });
    await expect(service.findDevice('lIvInG rOoM')).resolves.toMatchObject({
      id: 'SPEAKER-ID',
    });
    await expect(service.findDevice('Living')).rejects.toBeInstanceOf(AppError);
  });

  it('selects a device by its one-based displayed number', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      devices: [
        spotifyDevice({ id: 'everywhere-id', name: 'Everywhere' }),
        spotifyDevice({ id: 'echo-id', name: 'Echo Pop de Bruno' }),
      ],
    });
    const service = new DeviceService(api);

    await expect(service.findDevice('1')).resolves.toMatchObject({
      id: 'echo-id',
      name: 'Echo Pop de Bruno',
    });
    await expect(service.findDevice('3')).rejects.toThrow('Device number 3 is out of range');
  });

  it('rejects a numbered device that Spotify marks as uncontrollable', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      devices: [spotifyDevice({ id: 'restricted-id', name: 'TV', is_restricted: true })],
    });

    await expect(new DeviceService(api).findDevice('1')).rejects.toThrow(
      'Device 1 ("TV") cannot be controlled',
    );
  });

  it('rejects ambiguous duplicate names and directs the user to device IDs', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      devices: [
        spotifyDevice({ id: 'first-id', name: 'Kitchen' }),
        spotifyDevice({ id: 'second-id', name: 'KITCHEN' }),
      ],
    });

    await expect(new DeviceService(api).findDevice('kitchen')).rejects.toThrow(
      'Use a device ID instead: first-id, second-id',
    );
  });

  it('does not select restricted devices or devices with null IDs', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      devices: [
        spotifyDevice({ id: 'restricted-id', name: 'Restricted', is_restricted: true }),
        spotifyDevice({ id: null, name: 'Unavailable' }),
      ],
    });

    await expect(new DeviceService(api).findDevice('restricted-id')).rejects.toThrow(
      'No controllable Spotify device',
    );
    await expect(new DeviceService(api).findDevice('Unavailable')).rejects.toThrow(
      'No controllable Spotify device',
    );
  });

  it('sends the exact transfer request and includes play only when provided', async () => {
    const api = createApi();
    const service = new DeviceService(api);

    await service.transferPlayback('speaker-id', true);
    expect(api.put).toHaveBeenNthCalledWith(1, '/me/player', {
      body: { device_ids: ['speaker-id'], play: true },
    });

    await service.transferPlayback('laptop-id');
    expect(api.put).toHaveBeenNthCalledWith(2, '/me/player', {
      body: { device_ids: ['laptop-id'] },
    });
  });

  it('rejects empty device IDs without making a request', async () => {
    const api = createApi();

    await expect(new DeviceService(api).transferPlayback('   ')).rejects.toThrow(
      'device ID is required',
    );
    expect(api.put).not.toHaveBeenCalled();
  });
});
