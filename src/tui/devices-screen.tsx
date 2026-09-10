import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Device, DeviceService } from '../services/device.service.js';
import { sanitizeOneLineText } from '../utils/text.js';
import { createListWindow } from './viewport.js';

export type TuiDevice = Pick<
  DeviceService,
  'getControllableDevices' | 'transferPlayback'
>;

export type TuiDevices = TuiDevice;

export interface DevicesScreenProps {
  device: TuiDevice;
  availableRows?: number;
  onBack(): void;
  onExit(): void;
}

export function DevicesScreen({
  device,
  availableRows = 10,
  onBack,
  onExit,
}: DevicesScreenProps) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
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
        const loaded = await device.getControllableDevices(controller.signal);
        if (controller.signal.aborted || version !== requestVersion.current) return;
        setDevices(loaded);
        setSelectedIndex((current) => (loaded.length === 0 ? 0 : Math.min(current, loaded.length - 1)));
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
    [cancelDiscovery, device],
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
    if (!selected?.id || transferInProgress.current) return;

    transferInProgress.current = true;
    cancelDiscovery();
    const controller = new AbortController();
    discoveryRequest.current = controller;
    const version = lifecycleVersion.current;
    setTransferring(true);
    setError(null);
    setConfirmation(null);
    try {
      await device.transferPlayback(selected.id, undefined, controller.signal);
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
    if (key.upArrow && devices?.length && !transferring) {
      setSelectedIndex((current) => (current - 1 + devices.length) % devices.length);
      return;
    }
    if (key.downArrow && devices?.length && !transferring) {
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
          <Text dimColor>No controllable Spotify Connect devices found. Press [r] to refresh.</Text>
        ) : null}
        {!loading && visibleDevices.hiddenAbove > 0 ? (
          <Text dimColor>↑ {visibleDevices.hiddenAbove} more</Text>
        ) : null}
        {!loading
          ? visibleDevices.items.map((entry, visibleIndex) => {
              const index = visibleDevices.startIndex + visibleIndex;
              return (
                <Text
                  key={entry.id ?? `${entry.name}:${index}`}
                  wrap="truncate-end"
                  {...(index === selectedIndex ? { color: 'green' as const } : {})}
                >
                  {index === selectedIndex ? '›' : ' '} {entry.isActive ? '●' : '○'}{' '}
                  {formatDevice(entry)}
                </Text>
              );
            })
          : null}
        {!loading && visibleDevices.hiddenBelow > 0 ? (
          <Text dimColor>↓ {visibleDevices.hiddenBelow} more</Text>
        ) : null}
      </Box>
      {transferring ? <Text color="yellow">Transferring playback…</Text> : null}
      {confirmation ? <Text color="green">{confirmation}</Text> : null}
      <Box marginTop={1}>
        <Text dimColor>● active · ↑/↓ select · Enter transfer · [r] refresh · Esc back</Text>
      </Box>
    </Box>
  );
}

function formatDevice(device: Device): string {
  const name = safeText(device.name, 'Unnamed device');
  const type = safeText(device.type, 'Unknown type');
  const volume =
    device.supportsVolume && device.volumePercent !== null
      ? `${device.volumePercent}%`
      : 'Unavailable';
  return `${name} · ${type} · Volume: ${volume}`;
}

function safeText(value: string, fallback: string): string {
  return sanitizeOneLineText(value) || fallback;
}

function formatDeviceError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeOneLineText(message) || 'Unable to load Spotify Connect devices.';
}
