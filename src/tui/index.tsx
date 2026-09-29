import { render } from 'ink';
import { InkPictureProvider } from 'ink-picture';
import { createElement } from 'react';

import { TuiApp, type TuiServices } from './app.js';

export async function startTui(services: TuiServices): Promise<void> {
  const app = createElement(
    InkPictureProvider,
    { config: { cacheSize: 0 }, children: createElement(TuiApp, services) },
  );
  const instance = render(app, {
    alternateScreen: true,
    exitOnCtrlC: true,
  });
  await instance.waitUntilExit();
}
