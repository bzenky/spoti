import type { SpotifyApi } from '../spotify/client.js';
import { AppError, NoActiveDeviceError } from '../utils/errors.js';
import { sanitizeOneLineText } from '../utils/text.js';

export interface Device {
  id: string | null;
  isActive: boolean;
  isPrivateSession: boolean;
  isRestricted: boolean;
  name: string;
  type: string;
  volumePercent: number | null;
  supportsVolume: boolean;
}

interface DeviceObject {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
  supports_volume: boolean;
}

interface DevicesResponse {
  devices: DeviceObject[];
}

export class DeviceService {
  constructor(private readonly spotify: SpotifyApi) {}

  async getDevices(signal?: AbortSignal): Promise<Device[]> {
    const response =
      signal === undefined
        ? await this.spotify.get<DevicesResponse>('/me/player/devices')
        : await this.spotify.get<DevicesResponse>('/me/player/devices', { signal });
    return response.devices.map(mapDevice).sort(compareDevices);
  }

  async getActiveDevice(signal?: AbortSignal): Promise<Device> {
    const devices = signal === undefined ? await this.getDevices() : await this.getDevices(signal);
    const activeDevice = devices.find((device) => device.isActive);
    if (!activeDevice) throw new NoActiveDeviceError();
    return activeDevice;
  }

  async getControllableDevices(signal?: AbortSignal): Promise<Device[]> {
    const devices = signal === undefined ? await this.getDevices() : await this.getDevices(signal);
    return devices.filter((device) => device.id !== null && !device.isRestricted);
  }

  async findDevice(nameOrId: string): Promise<Device> {
    const query = nameOrId.trim();
    const displayQuery = sanitizeOneLineText(query);
    const normalizedQuery = query.toLocaleLowerCase();
    const availableDevices = await this.getDevices();

    if (/^\d+$/.test(query)) {
      const index = Number(query) - 1;
      const selected = Number.isSafeInteger(index) ? availableDevices[index] : undefined;
      if (!selected) {
        throw new AppError(
          `Device number ${displayQuery} is out of range. Run: spoti devices`,
        );
      }
      if (!selected.id || selected.isRestricted) {
        throw new AppError(
          `Device ${displayQuery} ("${sanitizeOneLineText(selected.name)}") cannot be controlled through Spotify Connect.`,
        );
      }
      return selected;
    }

    const devices = availableDevices.filter(
      (device) => device.id !== null && !device.isRestricted,
    );
    const idMatch = devices.find(
      (device) => device.id?.toLocaleLowerCase() === normalizedQuery,
    );
    if (idMatch) return idMatch;

    const nameMatches = devices.filter(
      (device) => device.name.toLocaleLowerCase() === normalizedQuery,
    );
    if (nameMatches.length === 1) return nameMatches[0]!;

    if (nameMatches.length > 1) {
      const deviceIds = nameMatches
        .map((device) => sanitizeOneLineText(device.id ?? ''))
        .join(', ');
      throw new AppError(
        `Multiple controllable Spotify devices are named "${displayQuery}". Use a device ID instead: ${deviceIds}.`,
      );
    }

    throw new AppError(
      `No controllable Spotify device matches "${displayQuery}". Check the device name or ID and ensure Spotify is open on that device.`,
    );
  }

  async transferPlayback(
    deviceId: string,
    play?: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    const normalizedDeviceId = deviceId.trim();
    if (!normalizedDeviceId) {
      throw new AppError('A Spotify device ID is required to transfer playback.');
    }

    await this.spotify.put<void>('/me/player', {
      body: {
        device_ids: [normalizedDeviceId],
        ...(play === undefined ? {} : { play }),
      },
      ...(signal === undefined ? {} : { signal }),
    });
  }
}

function compareDevices(left: Device, right: Device): number {
  const nameComparison = left.name.localeCompare(right.name, undefined, {
    sensitivity: 'base',
  });
  if (nameComparison !== 0) return nameComparison;
  return (left.id ?? '').localeCompare(right.id ?? '');
}

function mapDevice(device: DeviceObject): Device {
  return {
    id: device.id,
    isActive: device.is_active,
    isPrivateSession: device.is_private_session,
    isRestricted: device.is_restricted,
    name: device.name,
    type: device.type,
    volumePercent: device.volume_percent,
    supportsVolume: device.supports_volume,
  };
}
