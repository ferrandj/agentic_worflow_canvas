import type { Page } from "@playwright/test";

export async function createCanvas(page: Page, name: string) {
  await page.click('[data-testid="new-canvas"]');
  await page.fill('[data-testid="new-canvas-name"]', name);
  await page.press('[data-testid="new-canvas-name"]', "Enter");
  await page.waitForSelector('[data-testid="flow-canvas"]');
  await page.waitForTimeout(300);
}

export async function dragCenterTo(page: Page, selector: string, tx: number, ty: number) {
  const b = await page.locator(selector).boundingBox();
  if (!b) throw new Error(`No bounding box for ${selector}`);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(tx, ty, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}

export async function dragOnto(page: Page, fromSelector: string, toSelector: string) {
  const to = await page.locator(toSelector).boundingBox();
  if (!to) throw new Error(`No bounding box for ${toSelector}`);
  await dragCenterTo(page, fromSelector, to.x + to.width / 2, to.y + to.height / 2);
}
