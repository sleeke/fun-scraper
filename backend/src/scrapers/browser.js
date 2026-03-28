/**
 * browser.js – lightweight Playwright helper for scraping JavaScript-rendered pages.
 *
 * Strategy (in order):
 *  1. Use the `playwright` package's bundled Chromium (local dev / CI).
 *  2. Use `playwright-core` with a system-installed Chrome/Chromium found via
 *     the CHROME_PATH environment variable or common install locations.
 *  3. Return null — callers must fall back to non-browser scraping.
 *
 * The module never throws; all errors are caught and logged so scrapers can
 * degrade gracefully when no browser is available (e.g. on Vercel serverless).
 */

const path = require('path');

// Common system Chrome/Chromium binary locations
const SYSTEM_CHROME_PATHS = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

/** Returns a path to an executable Chromium, or null if none found. */
async function findExecutablePath() {
  const fs = require('fs');

  // 1. Try the full `playwright` package (which bundles its own browser).
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    const { chromium: pw } = require('playwright');
    const execPath = pw.executablePath();
    if (execPath && fs.existsSync(execPath)) return execPath;
  } catch (_) {
    // playwright not installed or browser not downloaded — try next
  }

  // 2. Try system paths.
  for (const p of SYSTEM_CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

/**
 * Launch a headless Chromium browser via playwright-core.
 *
 * @returns {Promise<import('playwright-core').Browser|null>}
 */
async function launchBrowser() {
  const executablePath = await findExecutablePath();
  if (!executablePath) {
    console.warn('[browser] No Chromium executable found – browser scraping unavailable');
    return null;
  }

  const { chromium } = require('playwright-core');
  try {
    const browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });
    return browser;
  } catch (err) {
    console.warn('[browser] Failed to launch browser:', err.message);
    return null;
  }
}

/**
 * Fetch a page using a real browser (executes JavaScript).
 * Returns the final HTML of the rendered page plus a Cheerio instance.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.timeout=30000]
 * @param {string} [opts.waitUntil='networkidle'] - Playwright navigation waitUntil
 * @returns {Promise<{$: import('cheerio').CheerioAPI, html: string}|null>}
 */
async function fetchPageRendered(url, opts = {}) {
  const { timeout = 30000, waitUntil = 'networkidle' } = opts;
  const browser = await launchBrowser();
  if (!browser) return null;

  let context;
  try {
    context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-CA',
      extraHTTPHeaders: {
        'Accept-Language': 'en-CA,en;q=0.9',
      },
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil, timeout });

    const html = await page.content();
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    return { $, html };
  } catch (err) {
    console.warn(`[browser] fetchPageRendered failed for ${url}:`, err.message);
    return null;
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

/**
 * Navigate to `url` with a real browser and intercept a JSON API response
 * that matches `urlPattern`. Returns the parsed JSON or null.
 *
 * @param {string} url              - Page to navigate to
 * @param {RegExp|string} urlPattern - Pattern to match against intercepted request URLs
 * @param {object} [opts]
 * @param {number} [opts.timeout=30000]
 * @returns {Promise<object|null>}
 */
async function interceptApiResponse(url, urlPattern, opts = {}) {
  const { timeout = 30000 } = opts;
  const browser = await launchBrowser();
  if (!browser) return null;

  let context;
  try {
    context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-CA',
    });

    const page = await context.newPage();

    /** Promise that resolves with the first intercepted matching API response */
    const apiDataPromise = new Promise((resolve) => {
      page.on('response', async (response) => {
        try {
          const reqUrl = response.url();
          const matches =
            urlPattern instanceof RegExp
              ? urlPattern.test(reqUrl)
              : reqUrl.includes(urlPattern);
          if (!matches) return;

          const contentType = response.headers()['content-type'] || '';
          if (!contentType.includes('json')) return;

          const data = await response.json();
          resolve(data);
        } catch (_) {
          // ignore individual response parse failures
        }
      });
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout });

    // Give a short extra grace period for late-arriving API calls
    const result = await Promise.race([
      apiDataPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    return result;
  } catch (err) {
    console.warn(`[browser] interceptApiResponse failed for ${url}:`, err.message);
    return null;
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

module.exports = { launchBrowser, fetchPageRendered, interceptApiResponse };
