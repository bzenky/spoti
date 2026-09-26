import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Device, DeviceService } from '../services/device.service.js';
import type { ConfigStore } from '../storage/config.js';
import { sanitizeOneLineText } from '../utils/text.js';
import { createListWindow } from './viewport.js';

export type TuiDevice = Pick<DeviceService, 'getDevices' | 'transferPlayback'>;
export type TuiDeviceConfig = Pick<ConfigStore, 'read' | 'set' | 'resetKey'>;
export type TuiDevices = TuiDevice;

export interface DevicesScreenProps {
  device: TuiDevice;
  config: TuiDeviceConfig;
  availableRows?: number;
  onBack(): void;
  onExit(): void;
}

export function DevicesScreen({
  device,
  config,
  availableRows = 10,
  onBack,
  onExit,
}: DevicesScreenProps) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [defaultDevice, setDefaultDevice] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [showIds, setShowIds] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const discoveryRequest = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const lifecycleVersion = useRef(0);
  const transferInProgress = useRef(false);

  const cancelDiscovery = useCallback(() => {
    requestVersion.current += 1;
    discoveryRequest.current?.abort();
    discoveryRequest.current = null;
  }, []);

  const loadDevices = useCallback(
    async (clearConfirmation = true) => {
      cancelDiscovery();
      const controller = new AbortController();
      const version = requestVersion.current;
      discoveryRequest.current = controller;
      setLoading(true);
      setDevices(null);
      setError(null);
      if (clearConfirmation) setConfirmation(null);

      try {
        const [loaded, settings] = await Promise.all([
          device.getDevices(controller.signal),
          config.read(),
        ]);
        if (controller.signal.aborted || version !== requestVersion.current) return;
        setDevices(loaded);
        setDefaultDevice(settings.defaultDevice);
        const activeIndex = loaded.findIndex((entry) => entry.isActive);
        const defaultIndex = loaded.findIndex((entry) => isDefaultDevice(entry, settings.defaultDevice));
        setSelectedIndex((current) => {
          if (activeIndex >= 0) return activeIndex;
          if (defaultIndex >= 0) return defaultIndex;
          return loaded.length === 0 ? 0 : Math.min(current, loaded.length - 1);
        });
      } catch (caught) {
        if (controller.signal.aborted || version !== requestVersion.current) return;
        setError(formatDeviceError(caught));
      } finally {
        if (version === requestVersion.current) {
          discoveryRequest.current = null;
          setLoading(false);
        }
      }
    },
    [cancelDiscovery, config, device],
  );

  useEffect(() => {
    void loadDevices();
    return () => {
      lifecycleVersion.current += 1;
      requestVersion.current += 1;
      discoveryRequest.current?.abort();
      discoveryRequest.current = null;
    };
  }, [loadDevices]);

  const goBack = useCallback(() => {
    lifecycleVersion.current += 1;
    cancelDiscovery();
    onBack();
  }, [cancelDiscovery, onBack]);

  const exit = useCallback(() => {
    lifecycleVersion.current += 1;
    cancelDiscovery();
    onExit();
  }, [cancelDiscovery, onExit]);

  const transferToSelected = useCallback(async () => {
    const selected = devices?.[selectedIndex];
    if (!selected || transferInProgress.current) return;
    if (selected.isActive) {
      setConfirmation(`${safeText(selected.name, 'Selected device')} is already active.`);
      setError(null);
      return;
    }
    if (!canTransfer(selected)) {
      setError(deviceUnavailableMessage(selected));
      setConfirmation(null);
      return;
    }

    transferInProgress.current = true;
    cancelDiscovery();
    const controller = new AbortController();
    discoveryRequest.current = controller;
    const version = lifecycleVersion.current;
    setTransferring(true);
    setError(null);
    setConfirmation(null);
    try {
      await device.transferPlayback(selected.id!, undefined, controller.signal);
      if (controller.signal.aborted || version !== lifecycleVersion.current) return;
      setDevices((current) =>
        current?.map((entry) => ({
          ...entry,
          isActive: entry.id === selected.id,
        })) ?? null,
      );
      setConfirmation(`Active device: ${safeText(selected.name, 'Unnamed device')}`);
    } catch (caught) {
      if (controller.signal.aborted || version !== lifecycleVersion.current) return;
      setError(formatDeviceError(caught));
    } finally {
      transferInProgress.current = false;
      if (version === lifecycleVersion.current) setTransferring(false);
    }
  }, [cancelDiscovery, device, devices, selectedIndex]);

  const toggleDefault = useCallback(async () => {
    const selected = devices?.[selectedIndex];
    if (!selected || savingDefault || transferring) return;
    if (!selected.id) {
      setError('This Spotify device has no stable ID and cannot be saved as the default.');
      setConfirmation(null);
      return;
    }

    setSavingDefault(true);
    setError(null);
    try {
      if (isDefaultDevice(selected, defaultDevice)) {
        await config.resetKey('defaultDevice');
        setDefaultDevice(null);
        setConfirmation(`Cleared default device: ${safeText(selected.name, 'Unnamed device')}`);
      } else {
        await config.set('defaultDevice', selected.id);
        setDefaultDevice(selected.id);
        setConfirmation(`Default device: ${safeText(selected.name, 'Unnamed device')}`);
      }
    } catch (caught) {
      setError(formatDeviceError(caught));
    } finally {
      setSavingDefault(false);
    }
  }, [config, defaultDevice, devices, savingDefault, selectedIndex, transferring]);

  useInput((input, key) => {
    if (key.ctrl && input === 'x') {
      exit();
      return;
    }
    if (key.escape) {
      goBack();
      return;
    }
    if (((key.ctrl && input === 'r') || (!key.ctrl && !key.meta && input === 'r')) && !transferring) {
      void loadDevices();
      return;
    }
    if (key.ctrl || key.meta) return;
    if (input === 'i') {
      setShowIds((current) => !current);
      return;
    }
    if (input === 's') {
      void toggleDefault();
      return;
    }
    if (key.upArrow && devices?.length && !transferring && !savingDefault) {
      setSelectedIndex((current) => (current - 1 + devices.length) % devices.length);
      return;
    }
    if (key.downArrow && devices?.length && !transferring && !savingDefault) {
      setSelectedIndex((current) => (current + 1) % devices.length);
      return;
    }
    if (key.return) {
      if (error) void loadDevices();
      else void transferToSelected();
    }
  });

  const visibleDevices = createListWindow(devices ?? [], selectedIndex, availableRows);

  return (
    <Box flexDirection="column" height="100%" overflow="hidden">
      <Text bold>Spotify Connect devices</Text>
      <Box marginTop={1} flexDirection="column">
        {loading ? <Text color="yellow">Loading devices…</Text> : null}
        {!loading && error ? (
          <Text color="red">{error} Press Enter or [r] to retry.</Text>
        ) : null}
        {!loading && !error && devices?.length === 0 ? (
          <Text dimColor>No Spotify Connect devices found. Run spoti launch to open Spotify locally, then refresh.</Text>
        ) : null}
        {!loading && visibleDevices.hiddenAbove > 0 ? (
          <Text dimColor>↑ {visibleDevices.hiddenAbove} more</Text>
        ) : null}
        {!loading
          ? visibleDevices.items.map((entry, visibleIndex) => {
              const index = visibleDevices.startIndex + visibleIndex;
              const selected = index === selectedIndex;
              const unavailable = !canTransfer(entry);
              return (
                <Text
                  key={entry.id ?? `${entry.name}:${index}`}
                  wrap="truncate-end"
                  {...(selected
                    ? { color: 'green' as const }
                    : unavailable
                      ? { dimColor: true }
                      : {})}
                >
                  {selected ? '›' : ' '} {entry.isActive ? '●' : unavailable ? '×' : '○'}{' '}
                  {formatDevice(entry, isDefaultDevice(entry, defaultDevice), showIds)}
                </Text>
              );
            })
          : null}
        {!loading && visibleDevices.hiddenBelow > 0 ? (
          <Text dimColor>↓ {visibleDevices.hiddenBelow} more</Text>
        ) : null}
      </Box>
      {transferring ? <Text color="yellow">Transferring playback…</Text> : null}
      {savingDefault ? <Text color="yellow">Saving default device…</Text> : null}
      {confirmation ? <Text color="green">{confirmation}</Text> : null}
      <Box marginTop={1}>
        <Text dimColor>● active · ○ available · × unavailable · ↑/↓ select · Enter transfer · [s] default · [i] IDs · [r] refresh · Esc back</Text>
      </Box>
    </Box>
  );
}

function canTransfer(device: Device): boolean {
  return device.id !== null && !device.isRestricted;
}

function isDefaultDevice(device: Device, defaultDevice: string | null): boolean {
  if (!defaultDevice) return false;
  const normalized = defaultDevice.toLocaleLowerCase();
  return (
    device.id?.toLocaleLowerCase() === normalized ||
    device.name.toLocaleLowerCase() === normalized
  );
}

function formatDevice(device: Device, isDefault: boolean, showIds: boolean): string {
  const name = safeText(device.name, 'Unnamed device');
  const type = safeText(device.type, 'Unknown type');
  const state = device.isActive ? 'active' : device.isRestricted ? 'restricted' : !device.id ? 'unavailable' : 'available';
  const privateSession = device.isPrivateSession ? ' · private session' : '';
  const defaultLabel = isDefault ? ' · default' : '';
  const volume =
    device.supportsVolume && device.volumePercent !== null
      ? ` · Volume: ${device.volumePercent}%`
      : ' · Volume: unavailable';
  const id = showIds ? ` · ID: ${safeText(device.id ?? 'unavailable', 'unavailable')}` : '';
  return `${name} · ${type} · ${state}${privateSession}${defaultLabel}${volume}${id}`;
}

function deviceUnavailableMessage(device: Device): string {
  const name = safeText(device.name, 'This Spotify device');
  if (device.isRestricted) return `${name} is restricted and cannot be controlled through Spotify Connect.`;
  return `${name} has no usable Spotify Connect device ID.`;
}

function safeText(value: string, fallback: string): string {
  return sanitizeOneLineText(value) || fallback;
}

function formatDeviceError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeOneLineText(message) || 'Unable to load Spotify Connect devices.';
}
