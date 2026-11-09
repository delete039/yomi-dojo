import { expect, test, type Page } from "@playwright/test";

interface RingLayout {
  ring: { left: number; right: number; width: number; height: number };
  svg: { width: number; height: number };
  neighbor: { left: number };
}

async function readRingLayout(
  page: Page,
  ringSelector: string,
  neighborSelector: string,
): Promise<RingLayout> {
  return page.evaluate(
    ({ ringSelector, neighborSelector }) => {
      const ring = document.querySelector<HTMLElement>(ringSelector);
      const svg = ring?.querySelector("svg");
      const neighbor = document.querySelector<HTMLElement>(neighborSelector);
      if (!ring || !svg || !neighbor) {
        throw new Error(`Missing ring layout target: ${ringSelector}`);
      }
      const ringRect = ring.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const neighborRect = neighbor.getBoundingClientRect();
      return {
        ring: {
          left: ringRect.left,
          right: ringRect.right,
          width: ringRect.width,
          height: ringRect.height,
        },
        svg: { width: svgRect.width, height: svgRect.height },
        neighbor: { left: neighborRect.left },
      };
    },
    { ringSelector, neighborSelector },
  );
}

function expectRingContained(layout: RingLayout): void {
  expect(layout.svg.width).toBeLessThanOrEqual(layout.ring.width + 0.5);
  expect(layout.svg.height).toBeLessThanOrEqual(layout.ring.height + 0.5);
  expect(layout.ring.right).toBeLessThanOrEqual(layout.neighbor.left + 0.5);
}

for (const width of [320, 390]) {
  test(`home and library progress rings stay contained at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 820 });

    await page.goto("/#/home");
    await page.waitForSelector(".today-card");
    expectRingContained(
      await readRingLayout(
        page,
        ".today-ring-block .progress-ring",
        ".today-details",
      ),
    );

    await page.goto("/#/library");
    await page.waitForSelector(".pack-overview");
    expectRingContained(
      await readRingLayout(
        page,
        ".pack-overview-ring .progress-ring",
        ".pack-overview-stats",
      ),
    );
  });
}
