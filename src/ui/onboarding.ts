import type { Device } from '../services/device.service.js';
import { sanitizeOneLineText } from '../utils/text.js';

export const SPOTIFY_DASHBOARD_URL = 'https://developer.spotify.com/dashboard';

export function formatSetupGuide(redirectUri: string): string {
  return [
    'Connect spoti to Spotify',
    '',
    'spoti signs in through your own Spotify developer app. This takes about a minute.',
    'You need Spotify Premium: Spotify developer apps only work for Premium accounts.',
    '',
    `  1. Create an app at ${SPOTIFY_DASHBOARD_URL}`,
    '     Use any name and description, and select "Web API" when asked which APIs you use.',
    '  2. Add this Redirect URI exactly as shown:',
    `     ${redirectUri}`,
    '  3. Save, then copy the app\'s Client ID (not the Client secret).',
  ].join('\n');
}

export function formatEnvironmentClientIdWarning(): string {
  return 'Note: SPOTIFY_CLIENT_ID is set in your environment and takes precedence over the saved client ID.\n' +
    'Unset it to use the client ID you just saved.';
}

export function formatAwaitingAuthorization(authorizationUrl: string): string {
  return [
    'Opening Spotify in your browser to approve access…',
    'If it does not open, visit this URL:',
    `  ${authorizationUrl}`,
    '',
    'Waiting for approval (Ctrl+C to cancel)…',
  ].join('\n');
}

export function formatLoginNextSteps(devices: readonly Device[] | null): string {
  const sections: string[] = [];

  if (devices !== null) {
    sections.push(
      devices.length === 0
        ? 'No Spotify devices are online. Open Spotify on your phone or computer, or at\n' +
            'https://open.spotify.com, then run: spoti devices'
        : `Devices online: ${devices
            .map((device) => sanitizeOneLineText(device.name))
            .join(', ')}`,
    );
  }

  sections.push(
    [
      'Try:',
      '  spoti i                open the interactive player',
      '  spoti play <query>     search for a track and play it',
      '  spoti --help           see every command',
    ].join('\n'),
  );

  return sections.join('\n\n');
}
