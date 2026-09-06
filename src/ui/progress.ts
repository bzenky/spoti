import { stderr } from 'node:process';

export type ProgressRunner = <Result>(
  label: string,
  task: () => Promise<Result>,
) => Promise<Result>;

export interface ProgressTerminal {
  readonly isTTY: boolean;
  write(value: string): void;
}

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

const defaultTerminal: ProgressTerminal = {
  isTTY: Boolean(stderr.isTTY),
  write: (value) => stderr.write(value),
};

export async function withProgress<Result>(
  label: string,
  task: () => Promise<Result>,
  terminal: ProgressTerminal = defaultTerminal,
): Promise<Result> {
  if (!terminal.isTTY) return task();

  let frameIndex = 0;
  terminal.write(`${frames[frameIndex]} ${label}`);
  const timer = setInterval(() => {
    frameIndex = (frameIndex + 1) % frames.length;
    terminal.write(`\r${frames[frameIndex]} ${label}`);
  }, 80);
  timer.unref();

  try {
    return await task();
  } finally {
    clearInterval(timer);
    terminal.write('\r\u001B[2K');
  }
}
