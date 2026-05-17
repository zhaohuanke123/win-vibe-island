// Browser E2E Test Suite for Vibe Island v8
// Run via: npx playwright test tests/browser-v8-test.js

const { test, expect } = require('@playwright/test');

const MOCK_SESSIONS = [
  { id: 's1', label: 'win-vibe-island', cwd: 'C:\\Users\\zhk02\\Desktop\\win-vibe-island', state: 'running', agent: 'claude', createdAt: Date.now()-120000, lastActivity: Date.now()-5000, pid: 1234, currentTool: { name: 'Edit', input: 'Overlay.tsx', startTime: Date.now()-10000 }, jumpTarget: { terminalType: 'vscode' } },
  { id: 's2', label: 'open-vibe-island', cwd: 'C:\\Users\\zhk02\\Desktop\\open-vibe-island', state: 'waitingForApproval', agent: 'claude', createdAt: Date.now()-60000, lastActivity: Date.now()-2000, pid: 5678, currentTool: { name: 'Bash', input: 'rm -rf /tmp/test', startTime: Date.now()-3000 }, notifKind: 'two', jumpTarget: { terminalType: 'windowsTerminal' } },
  { id: 's3', label: 'api-server', cwd: 'C:\\Users\\zhk02\\Desktop\\api-server', state: 'completed', agent: 'codex', createdAt: Date.now()-3600000, lastActivity: Date.now()-600000, pid: 9012 },
  { id: 's4', label: 'ml-pipeline', cwd: 'C:\\Users\\zhk02\\Desktop\\ml-pipeline', state: 'waitingForAnswer', agent: 'cursor', createdAt: Date.now()-180000, lastActivity: Date.now()-1000, notifKind: 'jump', jumpTarget: { terminalType: 'cursor' } },
  { id: 's5', label: 'frontend-refactor', cwd: 'C:\\Users\\zhk02\\Desktop\\frontend-refactor', state: 'running', agent: 'gemini', createdAt: Date.now()-90000, lastActivity: Date.now()-8000, currentTool: { name: 'Grep', input: 'TODO', startTime: Date.now()-8000 } },
];

async function mockTauri(page) {
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = {
      transformCallback: (cb) => {
        const id = '_cb_' + Math.random().toString(36).slice(2);
        window[id] = cb;
        return id;
      },
      invoke: async (cmd, args) => {
        const mocks = {
          'get_hook_health': { status: 'connected', uptime_secs: 3600, request_count: 42, pending_approvals: 0 },
          'get_hook_config_status': { installed: true, hookDetails: {}, manifest_present: true, manifest_app_version: '2.0.0' },
          'get_claude_usage': { available: true, fiveHourPercent: 35, sevenDayPercent: 62, fiveHourResetAt: new Date(Date.now()+3600000).toISOString(), sevenDayResetAt: new Date(Date.now()+86400000).toISOString() },
          'update_overlay_size': null,
          'set_window_interactive': null,
          'focus_session_window': { result: 'focused' },
          'save_sessions': null,
          'load_sessions': '[]',
          'get_session_store_path': 'C:\\test\\sessions.json',
          'get_hook_config_mode': 'auto',
          'get_notification_sounds': ['None','Pop','Ping','Hero'],
          'get_detected_processes': [],
          'open_control_center': null,
        };
        return mocks[cmd] || null;
      },
    };
  });
}

async function injectSessions(page) {
  await page.evaluate((sessions) => {
    // Directly set store state via zustand
    const stores = window.__ZUSTAND_STORES__;
    if (stores) {
      for (const store of stores) {
        const state = store.getState();
        if (state.sessions !== undefined) {
          store.setState({ sessions });
          return true;
        }
      }
    }
    // Fallback: dispatch custom event
    window.__TEST_SESSIONS__ = sessions;
    return false;
  }, MOCK_SESSIONS);
}

test.describe('Vibe Island v8 — Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await mockTauri(page);
    await page.goto('http://localhost:5187/');
    await page.waitForTimeout(2000);
    await injectSessions(page);
    await page.waitForTimeout(500);
  });

  test('page renders with correct title', async ({ page }) => {
    await expect(page).toHaveTitle('Vibe Island');
  });

  test('overlay shell renders', async ({ page }) => {
    const shell = page.locator('.overlay__shell');
    await expect(shell).toBeAttached();
  });

  test('v8 CSS design tokens are set', async ({ page }) => {
    const vars = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        ink: root.getPropertyValue('--ink').trim(),
        paper: root.getPropertyValue('--paper').trim(),
        fontUI: root.getPropertyValue('--font-ui').trim(),
        fontMono: root.getPropertyValue('--font-mono').trim(),
      };
    });
    expect(vars.ink).toBe('#0d0d0f');
    expect(vars.paper).toBe('#f1ead9');
    expect(vars.fontUI).toContain('Inter');
    expect(vars.fontMono).toContain('JetBrains Mono');
  });

  test('phase colors match v8 spec', async ({ page }) => {
    const colors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        approval: root.getPropertyValue('--phase-approval').trim(),
        answer: root.getPropertyValue('--phase-answer').trim(),
        running: root.getPropertyValue('--phase-running').trim(),
        completed: root.getPropertyValue('--phase-completed').trim(),
      };
    });
    expect(colors.approval).toBe('#f4a4a4');
    expect(colors.answer).toBe('#ffd58a');
    expect(colors.running).toBe('#6ea7ff');
    expect(colors.completed).toBe('#6fb982');
  });

  test('overlay uses ink background', async ({ page }) => {
    const bg = await page.evaluate(() => {
      const el = document.querySelector('.overlay__shell');
      return el ? getComputedStyle(el).backgroundColor : null;
    });
    expect(bg).toBe('rgb(13, 13, 15)');
  });

  test('body font is Inter', async ({ page }) => {
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(font).toContain('Inter');
  });

  test('BarsGlyph component renders', async ({ page }) => {
    const glyph = page.locator('.bars-glyph');
    await expect(glyph).toBeAttached();
  });

  test('no React error boundary', async ({ page }) => {
    const hasError = await page.evaluate(() =>
      !!document.querySelector('[data-error]') ||
      document.body.innerText.includes('Something went wrong')
    );
    expect(hasError).toBe(false);
  });

  test('overlay screenshot', async ({ page }) => {
    await page.screenshot({ path: 'test-results/v8-overlay.png', fullPage: true });
  });
});

test.describe('Vibe Island v8 — Control Center', () => {
  test.beforeEach(async ({ page }) => {
    await mockTauri(page);
    await page.goto('http://localhost:5187/?window=control-center');
    await page.waitForTimeout(2000);
  });

  test('control center renders', async ({ page }) => {
    const cc = page.locator('.control-center');
    await expect(cc).toBeAttached();
  });

  test('has tab navigation', async ({ page }) => {
    const tabs = page.locator('.control-center__tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('tab switching works', async ({ page }) => {
    const tabs = page.locator('.control-center__tab');
    if (await tabs.count() > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(300);
      const active = await page.locator('.control-center__tab--active').textContent();
      expect(active).toBeTruthy();
    }
  });

  test('control center screenshot', async ({ page }) => {
    await page.screenshot({ path: 'test-results/v8-control-center.png', fullPage: true });
  });
});
