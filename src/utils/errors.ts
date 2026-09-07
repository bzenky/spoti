export class AppError extends Error {
  constructor(
    message: string,
    public readonly exitCode = 1,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConfigurationError extends AppError {}

export class AuthenticationRequiredError extends AppError {
  constructor(message = 'You are not logged in.\n\nRun: spoti login') {
    super(message);
  }
}

export class AuthorizationDeniedError extends AppError {}

export class NoActiveDeviceError extends AppError {
  constructor() {
    super(
      'No active Spotify device found.\n\nOpen Spotify on one of your devices and try again.',
    );
  }
}

export class PremiumRequiredError extends AppError {
  constructor() {
    super('Spotify Premium is required for playback control.');
  }
}

export class RateLimitedError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    const unit = retryAfterSeconds === 1 ? 'second' : 'seconds';
    super(`Spotify rate limit reached. Try again in ${retryAfterSeconds} ${unit}.`);
  }
}

export class SpotifyApiError extends AppError {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
