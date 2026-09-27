import { test, expect } from '@playwright/test';
import { openShift } from './helpers.js';

test('zakładka „Zadania”: zadania manewrowe scenariusza z postępem, poza „Stan”; powiadomienie po wykonaniu; brak zakładki bez zadań', async ({ page }) => {
  await openShift(page, 'stare-pustkowie');
  const tab = page.locator('#panel-tabs button[data-tab=zadania]');
  await expect(tab).toBeVisible();
  await expect(tab).toContainText('Zadania');
  // kolejność zakładek: Rozkład, Dziennik, Zadania, Stan…
  const order = await page.locator('#panel-tabs button[data-tab]:not(.hidden)').evaluateAll((els) => els.map((e) => e.dataset.tab));
  expect(order.slice(0, 4)).toEqual(['rj', 'log', 'zadania', 'stan']);
  await tab.click();
  await expect(page.locator('#tasks-scenario')).toContainText('Pełna zmiana');
  await expect(page.locator('#tasks-progress')).toHaveText('0 / 2 wykonane');
  const cards = page.locator('#tasks .task-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('odstawić na tor 3');
  await expect(cards.nth(0).locator('.task-meta')).toContainText('skład 90211 · na tor 3 · do 07:52');
  await expect(cards.nth(0)).toHaveClass(/active/);
  await expect(cards.nth(1)).toHaveClass(/waiting/); // dopiero od 07:58
  await expect(cards.nth(1).locator('.task-meta')).toContainText('od 07:58');
  // „Stan” nie ma już sekcji zadań
  await page.click('#panel-tabs button[data-tab=stan]');
  await expect(page.locator('#tab-stan')).not.toContainText('Zadania manewrowe');
  expect(await page.locator('#tab-stan #tasks').count()).toBe(0);
  // wykonanie zadania przy innej zakładce: licznik na karcie „Zadania”, po wejściu karta odhaczona
  await page.evaluate(() => { const x = window.sim.traffic.tasks[0]; x.done = true; x.doneAt = window.sim.clock.time; window.sim.bus.emit('tasks', window.sim.traffic.tasks); });
  await expect(tab.locator('.badge')).toHaveText('1');
  await tab.click();
  await expect(tab.locator('.badge')).toBeHidden();
  await expect(page.locator('#tasks-progress')).toHaveText('1 / 2 wykonane');
  await expect(cards.nth(0)).toHaveClass(/done/);
  await expect(cards.nth(0).locator('.task-status')).toContainText('wykonane');
  // scenariusz bez zadań: zakładki nie ma
  await openShift(page, 'gdynia-glowna', { params: { okreg: 'GO' } });
  await expect(page.locator('#panel-tabs button[data-tab=zadania]')).toBeHidden();
});
