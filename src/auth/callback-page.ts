export type CallbackOutcome = 'success' | 'denied' | 'failed';

const PAGES: Record<CallbackOutcome, { title: string; message: string }> = {
  success: {
    title: 'spoti is connected',
    message: 'You can close this tab and return to your terminal.',
  },
  denied: {
    title: 'Access was not granted',
    message: 'Spotify authorization was cancelled. Return to your terminal and run spoti login to try again.',
  },
  failed: {
    title: 'Something went wrong',
    message: 'spoti did not receive a valid authorization response. Return to your terminal for details.',
  },
};

export function renderCallbackPage(outcome: CallbackOutcome): string {
  const { title, message } = PAGES[outcome];
  const accent = outcome === 'success' ? '#1ed760' : '#f15e6c';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · spoti</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f6f6; --card: #fff; --text: #121212; --muted: #555; }
  @media (prefers-color-scheme: dark) { :root { --bg: #121212; --card: #1e1e1e; --text: #f6f6f6; --muted: #b3b3b3; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--text);
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 16px; box-sizing: border-box; }
  main { background: var(--card); border-radius: 12px; padding: 32px; max-width: 420px; text-align: center;
    border-top: 4px solid ${accent}; }
  h1 { font-size: 1.4rem; margin: 0 0 8px; }
  p { margin: 0; color: var(--muted); }
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${message}</p>
</main>
</body>
</html>
`;
}
