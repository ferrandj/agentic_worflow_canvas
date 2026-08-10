import { test, expect } from "@playwright/test";
import { createCanvas, dragCenterTo, dragOnto } from "./helpers";

test.describe.configure({ mode: "serial" });

// GitHub issue #3: free-floating sticky notes.
test("notes can be added, edited in place, and are not part of the workflow graph", async ({ page }) => {
  await page.goto("/");
  await createCanvas(page, "notes");

  await page.click('[data-testid="add-note"]');
  await page.waitForTimeout(300);
  await expect(page.getByTestId("note-textarea")).toHaveCount(1);

  await page.fill('[data-testid="note-textarea"]', "Remember to rotate secrets");
  await expect(page.getByTestId("node-Remember to rotate secrets")).toBeVisible();

  // A note has no connection handles (it's an annotation, not a workflow node).
  const handleCount = await page
    .locator('[data-testid="node-Remember to rotate secrets"] .react-flow__handle')
    .count();
  expect(handleCount).toBe(0);

  // Add a real block and confirm Mermaid export ignores the note entirely.
  await page.click('[data-testid="add-agent"]');
  await page.waitForSelector('[data-save-state="clean"]', { timeout: 5000 });
  await page.click('[data-testid="export-mermaid"]');
  const mermaid = await page.getByTestId("mermaid-output").textContent();
  expect(mermaid).not.toContain("rotate secrets");
  expect(mermaid).toContain("New_Agent");
});

// GitHub issues #1 and #2: edge labels must spawn off the line and be draggable.
test("edge labels default off the line and can be dragged", async ({ page }) => {
  await page.goto("/");
  await createCanvas(page, "edge-labels");

  await page.click('[data-testid="add-agent"]');
  await page.click('[data-testid="add-code"]');
  await page.waitForTimeout(300);
  await dragCenterTo(page, '[data-testid="node-New Agent"]', 500, 300);
  await dragCenterTo(page, '[data-testid="node-New Code"]', 850, 300);

  // Connect via handle drag.
  const agent = await page.locator('[data-testid="node-New Agent"]').boundingBox();
  const code = await page.locator('[data-testid="node-New Code"]').boundingBox();
  if (!agent || !code) throw new Error("missing boxes");
  await page.mouse.move(agent.x + agent.width - 2, agent.y + agent.height / 2);
  await page.mouse.down();
  await page.mouse.move(code.x + 2, code.y + code.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Label the edge from the inspector.
  await page.click(".react-flow__edge");
  await page.waitForTimeout(150);
  await page.locator('[data-testid="inspector"] input').last().fill("release");
  await page.waitForTimeout(300);

  const label = page.locator('[data-testid^="edge-label-"]');
  await expect(label).toBeVisible();
  const edgePath = await page.locator(".react-flow__edge-path").first().boundingBox();
  const before = await label.boundingBox();
  if (!edgePath || !before) throw new Error("missing boxes");
  // Issue #2: the label must not spawn centered on the line itself.
  const midY = edgePath.y + edgePath.height / 2;
  expect(Math.abs(before.y + before.height / 2 - midY)).toBeGreaterThan(6);

  // Issue #1: dragging the label must move it.
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + 100, before.y - 80, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await label.boundingBox();
  if (!after) throw new Error("missing box");
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(50);
});

// GitHub issue #4: groups and platforms can be resized freely, and the frame
// never shrinks below what's needed to hug its members.
test("groups can be freely resized via handles, and still hug members afterward", async ({ page }) => {
  await page.goto("/");
  await createCanvas(page, "resize");

  await page.click('[data-testid="add-agent"]');
  await page.click('[data-testid="add-code"]');
  await page.waitForTimeout(300);
  // Keep everything left-of-center so resize handles stay on screen.
  await dragCenterTo(page, '[data-testid="node-New Agent"]', 350, 300);
  await dragCenterTo(page, '[data-testid="node-New Code"]', 550, 300);
  await dragOnto(page, '[data-testid="node-New Agent"]', '[data-testid="node-New Code"]');
  await expect(page.getByTestId("container-Group")).toHaveCount(1);

  await page.locator('[data-testid="container-Group"]').click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId("resize-handle-se")).toBeVisible();

  const before = await page.locator('[data-testid="container-Group"]').boundingBox();
  const handle = await page.locator('[data-testid="resize-handle-se"]').boundingBox();
  if (!before || !handle) throw new Error("missing boxes");

  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 120, handle.y + 90, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = await page.locator('[data-testid="container-Group"]').boundingBox();
  if (!after) throw new Error("missing box");
  expect(after.width).toBeGreaterThan(before.width + 60);
  expect(after.height).toBeGreaterThan(before.height + 60);

  // The stretch must persist through a reload (round-trips through the server).
  await page.waitForSelector('[data-save-state="clean"]', { timeout: 5000 });
  await page.reload();
  await page.waitForSelector('[data-testid="flow-canvas"]');
  await page.waitForTimeout(300);
  const afterReload = await page.locator('[data-testid="container-Group"]').boundingBox();
  if (!afterReload) throw new Error("missing box");
  expect(Math.abs(afterReload.width - after.width)).toBeLessThan(5);

  // The frame still auto-hugs after the stretch: dragging a member far outside
  // the current frame must expand it further (never clip a member).
  const codeBoxNow = await page.locator('[data-testid="node-New Code"]').boundingBox();
  if (!codeBoxNow) throw new Error("missing box");
  const target = { x: afterReload.x + afterReload.width + 250, y: afterReload.y + 40 };
  await dragCenterTo(page, '[data-testid="node-New Code"]', target.x, target.y);
  const grown = await page.locator('[data-testid="container-Group"]').boundingBox();
  if (!grown) throw new Error("missing box");
  expect(grown.x + grown.width).toBeGreaterThan(afterReload.x + afterReload.width + 100);
});
