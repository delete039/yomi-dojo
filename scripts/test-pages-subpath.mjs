/**
 * GitHub Pages smoke test.
 *
 * Serves the already-built dist/ under /repo/ (the shape of a project Pages
 * URL), verifies font/seed/service-worker loading, then reloads while offline.
 * Run with `npm run test:pages` so the production build is refreshed first.
 */
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";

const repoRoot = path.resolve("dist");
const prefix = "/repo/";
const outputDir = path.resolve("test-results", "pages-subpath");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  if (url.pathname === "/repo") return { redirect: "/repo/" };
  if (!url.pathname.startsWith(prefix)) return { status: 404 };
  let relative = decodeURIComponent(url.pathname.slice(prefix.length));
  if (!relative || relative.endsWith("/")) relative += "index.html";
  const filePath = path.resolve(repoRoot, relative);
  if (filePath !== repoRoot && !filePath.startsWith(`${repoRoot}${path.sep}`)) {
    return { status: 403 };
  }
  return { filePath };
}

const server = http.createServer(async (request, response) => {
  const resolved = resolveRequestPath(request.url ?? "/");
  if (resolved.redirect) {
    response.writeHead(301, { Location: resolved.redirect });
    response.end();
    return;
  }
  if (resolved.status || !resolved.filePath) {
    response.writeHead(resolved.status ?? 404);
    response.end("Not found");
    return;
  }
  try {
    const body = await fs.readFile(resolved.filePath);
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type":
        contentTypes.get(path.extname(resolved.filePath)) ??
        "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Unable to allocate the static test server port.");
}
const port = address.port;
const base = `http://127.0.0.1:${port}${prefix}`;
const failures = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1041, height: 917 },
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) =>
    failedRequests.push(
      `${request.url()} :: ${request.failure()?.errorText ?? "failed"}`,
    ),
  );

  await page.goto(`${base}#/type`, { waitUntil: "networkidle" });
  await page.waitForSelector(".ty-word, .ty-result, .ty-empty-state", {
    timeout: 20_000,
  });
  await page.evaluate(() => document.fonts.ready);

  const online = await page.evaluate(async () => ({
    href: location.href,
    base: document.baseURI,
    word: document.querySelector(".ty-word")?.textContent?.trim() ?? null,
    fontJakarta: document.fonts.check('600 16px "Plus Jakarta Sans"'),
    fontJapanese: document.fonts.check('600 16px "Noto Serif JP"'),
    registrations: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  if (!online.href.startsWith(`${base}#/type`)) failures.push("wrong base URL");
  if (!online.fontJakarta || !online.fontJapanese) failures.push("font not loaded");
  if (!online.word) failures.push("typing word missing");
  if (online.registrations !== 1) failures.push("service worker not registered");

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 20_000 },
  );
  const cachedUrls = await page.evaluate(async () => {
    const cache = await caches.open("yomidojo-shell-v2");
    return (await cache.keys()).map((request) => request.url);
  });
  if (
    cachedUrls.length === 0 ||
    cachedUrls.some((url) => !url.startsWith(base))
  ) {
    failures.push("service worker cache escaped /repo/ scope");
  }
  await page.screenshot({ path: path.join(outputDir, "online.png"), fullPage: true });

  let offline = null;
  let offlineError = null;
  try {
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ty-word, .ty-result, .ty-empty-state", {
      timeout: 20_000,
    });
    offline = await page.evaluate(() => ({
      href: location.href,
      word: document.querySelector(".ty-word")?.textContent?.trim() ?? null,
      title: document.title,
    }));
    if (!offline.word) failures.push("offline typing word missing");
    await page.screenshot({
      path: path.join(outputDir, "offline.png"),
      fullPage: true,
    });
  } catch (error) {
    offlineError = error instanceof Error ? error.message : String(error);
    failures.push(`offline reload failed: ${offlineError}`);
  } finally {
    await context.setOffline(false);
  }

  if (consoleErrors.length > 0) failures.push("console errors present");
  if (pageErrors.length > 0) failures.push("page errors present");
  if (failedRequests.length > 0) failures.push("failed requests present");

  const result = {
    base,
    online,
    cachedUrls,
    offline,
    offlineError,
    consoleErrors,
    pageErrors,
    failedRequests,
    failures,
  };
  await fs.writeFile(
    path.join(outputDir, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result, null, 2));
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
