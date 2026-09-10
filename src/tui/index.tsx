import { render } from 'ink';
import { createElement } from 'react';

import { TuiApp, type TuiServices } from './app.js';

export async function startTui(services: TuiServices): Promise<void> {
  const instance = render(createElement(TuiApp, services), {
    alternateScreen: true,
    exitOnCtrlC: true,
  });
  await instance.waitUntilExit();
}
