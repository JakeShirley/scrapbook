import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";

const screenshotDirectory = path.resolve(
  process.env.SCRAPBOOK_SCREENSHOT_DIR ??
    fileURLToPath(new URL("../../../docs/screenshots/", import.meta.url)),
);

type ScreenshotViewport = {
  height: number;
  name: string;
  width: number;
};

type ScreenshotScenario = {
  authenticated?: boolean;
  name: string;
  path: string;
  prepare?: (page: Page) => Promise<void>;
  waitFor: (page: Page) => Promise<void>;
};

const viewports: ScreenshotViewport[] = [
  { height: 960, name: "desktop", width: 1440 },
  { height: 844, name: "mobile", width: 390 },
];

const now = "2026-05-25T12:00:00.000Z";
const expiresAt = "2026-06-24T12:00:00.000Z";

const account = {
  displayName: "Ada Lovelace",
  id: "account_demo",
  primaryEmail: "ada@example.com",
};

const session = {
  account,
  session: {
    createdAt: now,
    expiresAt,
    id: "session_demo",
  },
};

const assetFixtures = [
  createAsset("asset_sunroom", "sunroom-collage.jpg", 3024, 2268, 3_812_044),
  createAsset("asset_postcards", "market-postcards.png", 2400, 1800, 1_742_180),
  createAsset("asset_ticket", "train-ticket.webp", 1600, 1200, 824_100),
  createAsset("asset_ocean", "ocean-print.jpg", 3000, 2000, 2_456_221),
];

const pageFixtures = [
  createPage("page_cover", "Cover", {
    backgroundColor: "#fff6e6",
    layers: [
      photoLayer("photo_cover", "asset_sunroom", 220, 240, 1240, 980, -3),
      embellishmentLayer("label_cover", 1220, 1120, 700, 320, "Summer notes"),
      textLayer("text_cover", "A little book of bright days", 360, 1320, 1320, 260, 92),
      stickerLayer("sticker_cover", "noto:sun-with-face", 1660, 300, 360, 360, 8),
    ],
  }),
  createPage("page_market", "Market Morning", {
    backgroundColor: "#f5fbf8",
    layers: [
      photoLayer("photo_market", "asset_postcards", 260, 280, 1180, 1500, 2),
      washiTapeLayer("tape_market", 230, 250, 1260, 160, -2, "#f8d56b", "#2f7a75"),
      textLayer("text_market", "market finds", 1480, 520, 640, 260, 76),
      embellishmentLayer("note_market", 1450, 900, 620, 360, "fresh flowers"),
    ],
  }),
  createPage("page_trip", "Train Ride", {
    backgroundColor: "#f8f3ec",
    layers: [
      photoLayer("photo_ticket", "asset_ticket", 300, 360, 1120, 760, -5),
      photoLayer("photo_ocean", "asset_ocean", 1020, 1120, 1060, 880, 4),
      textLayer("text_trip", "window seat sketches", 360, 1290, 820, 220, 70),
      stickerLayer("sticker_trip", "noto:paperclip", 1560, 710, 260, 260, -12),
    ],
  }),
  createPage("page_notes", "Notes", {
    backgroundColor: "#fffdf7",
    layers: [
      washiTapeLayer("tape_notes", 320, 340, 1420, 170, 3, "#9cc9c5", "#fffdf7"),
      embellishmentLayer("label_notes", 420, 780, 1100, 520, "favorite ordinary magic"),
      textLayer(
        "text_notes",
        "Keep the receipt, the flower, the tiny map.",
        520,
        960,
        920,
        420,
        68,
      ),
      stickerLayer("sticker_notes", "noto:sparkles", 1530, 1280, 300, 300, 9),
    ],
  }),
];

const bookFixture = {
  coverSpreadEnabled: false,
  createdAt: now,
  id: "book_summer",
  pageCount: pageFixtures.length,
  pageHeight: 3000,
  pageWidth: 2400,
  pages: pageFixtures.map((page, index) => ({
    bookId: "book_summer",
    createdAt: now,
    id: `book_page_${index + 1}`,
    page: summarizePage(page),
    pageId: page.id,
    sortOrder: index,
    updatedAt: now,
  })),
  spreadCount: 2,
  spreads: [
    {
      kind: "facing",
      leftPageId: "page_cover",
      pageIds: ["page_cover", "page_market"],
      rightPageId: "page_market",
      spreadIndex: 0,
    },
    {
      kind: "facing",
      leftPageId: "page_trip",
      pageIds: ["page_trip", "page_notes"],
      rightPageId: "page_notes",
      spreadIndex: 1,
    },
  ],
  title: "Family Yearbook",
  updatedAt: now,
};

const bookSummaries = [
  summarizeBook(bookFixture),
  {
    coverSpreadEnabled: true,
    createdAt: now,
    id: "book_recipe",
    pageCount: 12,
    pageHeight: 2400,
    pageWidth: 2400,
    spreadCount: 7,
    title: "Recipe Cards",
    updatedAt: now,
  },
  {
    coverSpreadEnabled: false,
    createdAt: now,
    id: "book_weekend",
    pageCount: 18,
    pageHeight: 2550,
    pageWidth: 3300,
    spreadCount: 9,
    title: "Coastal Weekend",
    updatedAt: now,
  },
];

const serverLogs = [
  createLog(
    "log_books",
    "info",
    "GET /api/v1/books completed with 200",
    "GET",
    "/api/v1/books",
    200,
    14.2,
  ),
  createLog(
    "log_assets",
    "info",
    "Generated thumbnail variant for sunroom-collage.jpg",
    "POST",
    "/api/v1/assets/uploads",
    201,
    82.7,
  ),
  createLog(
    "log_export",
    "warn",
    "PDF export retried after a transient renderer timeout",
    "POST",
    "/api/v1/exports",
    202,
    311.4,
  ),
];

const assetSvgs = new Map(
  assetFixtures.map((asset, index) => [
    asset.thumbnailUrl,
    createAssetSvg(index, asset.originalFilename),
  ]),
);

const localImageFiles = [
  createLocalPngFile("garden-red.png", { blue: 68, green: 82, red: 218 }),
  createLocalPngFile("market-green.png", { blue: 118, green: 150, red: 42 }),
  createLocalPngFile("ocean-blue.png", { blue: 210, green: 128, red: 50 }),
];

const scenarios: ScreenshotScenario[] = [
  {
    authenticated: false,
    name: "auth",
    path: "/auth",
    waitFor: async (page) => {
      await expect(page.getByRole("heading", { name: "Scrapbook" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    },
  },
  {
    name: "books",
    path: "/books",
    waitFor: async (page) => {
      await expect(page.locator(".topbar h2", { hasText: "Books" })).toBeVisible();
      await expect(page.getByText("Family Yearbook")).toBeVisible();
    },
  },
  {
    name: "book-editor",
    path: "/books/book_summer",
    waitFor: async (page) => {
      await waitForBookEditor(page);
    },
  },
  {
    name: "book-editor-photo-edit",
    path: "/books/book_summer",
    prepare: async (page) => {
      await openLayerEditor(page, "Page 1", "photo");
      const dialog = page.getByRole("dialog", { name: "Edit Photo layer" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("group", { name: "Photo" })).toBeVisible();
      await expect(dialog.getByRole("group", { name: "Frame" })).toBeVisible();
    },
    waitFor: waitForBookEditor,
  },
  {
    name: "book-editor-washi-tape-edit",
    path: "/books/book_summer",
    prepare: async (page) => {
      await openLayerEditor(page, "Page 2", "washiTape");
      const dialog = page.getByRole("dialog", { name: "Edit Washi tape layer" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("group", { name: "Washi tape" })).toBeVisible();
    },
    waitFor: waitForBookEditor,
  },
  {
    name: "book-editor-text-edit",
    path: "/books/book_summer",
    prepare: async (page) => {
      await openLayerEditor(page, "Page 1", "text");
      const dialog = page.getByRole("dialog", { name: "Edit Text layer" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("group", { name: "Text", exact: true })).toBeVisible();
      await expect(dialog.getByRole("textbox", { name: "Text" })).toBeVisible();
    },
    waitFor: waitForBookEditor,
  },
  {
    name: "library",
    path: "/library",
    waitFor: async (page) => {
      await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
      await expect(page.getByText("sunroom-collage.jpg")).toBeVisible();
    },
  },
  {
    name: "image-grid",
    path: "/image-grid",
    prepare: async (page) => {
      if (!(await isVisible(page.getByRole("heading", { name: "Image Grid" })))) {
        return;
      }

      await page.locator('input[type="file"]').setInputFiles(localImageFiles);
      await expect(page.locator(".image-grid-canvas-item")).toHaveCount(localImageFiles.length);
      await expect(page.getByText(`${localImageFiles.length} placed`)).toBeVisible();
    },
    waitFor: async (page) => {
      await waitForFeatureOrFallback(page, "Image Grid");
    },
  },
  {
    name: "settings-account",
    path: "/settings",
    waitFor: async (page) => {
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
      await expect(page.getByLabel("Account").getByText(account.primaryEmail)).toBeVisible();
    },
  },
  {
    name: "settings-logs",
    path: "/settings",
    prepare: async (page) => {
      await page.getByRole("tab", { name: "Logs" }).click();
      await expect(page.getByText(serverLogs[0].message)).toBeVisible();
    },
    waitFor: async (page) => {
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    },
  },
];

async function waitForBookEditor(page: Page) {
  await expect(page.getByRole("heading", { name: "Family Yearbook" })).toBeVisible();
  await expect(page.locator(".book-canvas-deck")).toBeVisible();
}

async function waitForFeatureOrFallback(page: Page, heading: string) {
  const featureHeading = page.getByRole("heading", { name: heading });

  try {
    await expect(featureHeading).toBeVisible({ timeout: 1500 });
    return;
  } catch {
    await expect(page.locator(".topbar h2").first()).toBeVisible();
  }
}

async function isVisible(locator: ReturnType<Page["getByRole"]>) {
  try {
    return await locator.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

async function openLayerEditor(
  page: Page,
  pageLabel: "Page 1" | "Page 2",
  layerKind: "photo" | "text" | "washiTape",
) {
  const layerLabel =
    layerKind === "photo"
      ? "Photo layer"
      : layerKind === "text"
        ? "Text layer"
        : "Washi tape layer";

  await page
    .locator(`.book-page-frame[aria-label="${pageLabel}"] .canvas-layer[data-kind="${layerKind}"]`)
    .first()
    .locator(".canvas-layer-hitbox")
    .click({ force: true });
  await page
    .getByRole("toolbar", { name: `${layerLabel} actions` })
    .getByRole("button", { name: "Edit layer" })
    .click();
}

test.beforeAll(async () => {
  await mkdir(screenshotDirectory, { recursive: true });

  for (const filename of await readdir(screenshotDirectory)) {
    if (filename.endsWith(".png")) {
      await rm(path.join(screenshotDirectory, filename));
    }
  }
});

for (const viewport of viewports) {
  for (const scenario of scenarios) {
    test(`${scenario.name} ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await installMockApi(page, scenario.authenticated ?? true);
      await page.goto(scenario.path);
      await scenario.waitFor(page);
      await scenario.prepare?.(page);
      await stabilizePage(page);
      await page.screenshot({
        animations: "disabled",
        fullPage: false,
        path: path.join(screenshotDirectory, `${scenario.name}-${viewport.name}.png`),
      });
    });
  }
}

async function installMockApi(page: Page, authenticated: boolean) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathName = url.pathname;

    if (assetSvgs.has(pathName)) {
      await route.fulfill({ body: assetSvgs.get(pathName), contentType: "image/svg+xml" });
      return;
    }

    if (pathName === "/api/v1/auth/session") {
      await route.fulfill(
        authenticated
          ? { json: session }
          : { json: errorResponse("Authentication is required."), status: 401 },
      );
      return;
    }

    if (!authenticated) {
      await route.fulfill({ json: errorResponse("Authentication is required."), status: 401 });
      return;
    }

    if (pathName === "/api/v1/books") {
      await route.fulfill({ json: { books: bookSummaries } });
      return;
    }

    if (pathName === "/api/v1/books/book_summer") {
      await route.fulfill({ json: bookFixture });
      return;
    }

    if (pathName === "/api/v1/assets") {
      await route.fulfill({ json: { assets: assetFixtures } });
      return;
    }

    if (pathName === "/api/v1/pages") {
      await route.fulfill({ json: { pages: pageFixtures.map(summarizePage) } });
      return;
    }

    if (pathName.startsWith("/api/v1/pages/")) {
      const pageId = pathName.split("/").at(-1);
      const pageFixture = pageFixtures.find((fixture) => fixture.id === pageId);

      await route.fulfill(
        pageFixture
          ? { json: pageFixture }
          : { json: errorResponse("Page not found."), status: 404 },
      );
      return;
    }

    if (pathName === "/api/v1/logs") {
      const level = url.searchParams.get("level") ?? "info";

      await route.fulfill({ json: { level, logs: serverLogs } });
      return;
    }

    if (pathName === "/api/v1/auth/logout") {
      await route.fulfill({ status: 204 });
      return;
    }

    await route.fulfill({
      json: errorResponse(`No screenshot fixture for ${pathName}.`),
      status: 404,
    });
  });
}

async function stabilizePage(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((image) => {
        if (image.complete) {
          return undefined;
        }

        return new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }),
    );
  });
}

function createAsset(
  id: string,
  originalFilename: string,
  width: number,
  height: number,
  byteSize: number,
) {
  return {
    byteSize,
    checksumSha256: `sha256-${id}`,
    createdAt: now,
    height,
    id,
    mimeType: "image/png",
    originalContentUrl: `/api/screenshot-assets/${id}.svg`,
    originalFilename,
    thumbnailUrl: `/api/screenshot-assets/${id}.svg`,
    updatedAt: now,
    variants: [],
    width,
  };
}

function createPage(
  id: string,
  title: string,
  input: { backgroundColor: string; layers: Record<string, unknown>[] },
) {
  return {
    createdAt: now,
    document: {
      canvas: {
        backgroundColor: input.backgroundColor,
        height: 3000,
        width: 2400,
      },
      layers: input.layers,
      version: 1,
    },
    height: 3000,
    id,
    layerCount: input.layers.length,
    title,
    updatedAt: now,
    width: 2400,
  };
}

function summarizePage(page: ReturnType<typeof createPage>) {
  return {
    createdAt: page.createdAt,
    height: page.height,
    id: page.id,
    layerCount: page.layerCount,
    title: page.title,
    updatedAt: page.updatedAt,
    width: page.width,
  };
}

function summarizeBook(book: typeof bookFixture) {
  return {
    coverSpreadEnabled: book.coverSpreadEnabled,
    createdAt: book.createdAt,
    id: book.id,
    pageCount: book.pageCount,
    pageHeight: book.pageHeight,
    pageWidth: book.pageWidth,
    spreadCount: book.spreadCount,
    title: book.title,
    updatedAt: book.updatedAt,
  };
}

function baseLayer(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
) {
  return { height, id, locked: false, opacity: 1, rotation, width, x, y };
}

function photoLayer(
  id: string,
  assetId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
) {
  return {
    ...baseLayer(id, x, y, width, height, rotation),
    assetId,
    border: { color: "#ffffff", framePreset: "paper", radius: 28, style: "solid", width: 42 },
    crop: { aspectRatioPreset: "free", height: 1, width: 1, x: 0, y: 0 },
    filter: { brightness: 1, contrast: 1, preset: "warm", saturation: 1.04 },
    fit: "cover",
    kind: "photo",
    mask: { feather: 0, inset: 0, shape: "rectangle" },
    photoTransform: { flipX: false, flipY: false, offsetX: 0, offsetY: 0, rotation: 0, scale: 1 },
    shadow: {
      blur: 34,
      color: "#202426",
      enabled: true,
      offsetX: 0,
      offsetY: 18,
      opacity: 0.18,
      spread: 0,
    },
  };
}

function textLayer(
  id: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
) {
  return {
    ...baseLayer(id, x, y, width, height, 0),
    align: "left",
    color: "#24302f",
    fontFamily: "Love Ya Like A Sister",
    fontSize,
    kind: "text",
    text,
  };
}

function embellishmentLayer(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
) {
  return {
    ...baseLayer(id, x, y, width, height, -4),
    accentColor: "#2f7a75",
    color: "#f0c04f",
    element: "paper-label",
    kind: "embellishment",
    label,
  };
}

function stickerLayer(
  id: string,
  stickerId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
) {
  return { ...baseLayer(id, x, y, width, height, rotation), kind: "sticker", stickerId };
}

function washiTapeLayer(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  primaryColor: string,
  secondaryColor: string,
) {
  return {
    ...baseLayer(id, x, y, width, height, rotation),
    kind: "washiTape",
    outline: "torn",
    pattern: { kind: "stripe", primaryColor, secondaryColor },
    tile: { offsetX: 0, offsetY: 0, rotation: 0, scale: 1, scaleX: 1, scaleY: 1 },
  };
}

function createLog(
  id: string,
  level: "debug" | "info" | "warn" | "error",
  message: string,
  method: string,
  requestPath: string,
  status: number,
  durationMs: number,
) {
  return {
    durationMs,
    id,
    level,
    message,
    method,
    path: requestPath,
    requestId: `req_${id}`,
    status,
    timestamp: now,
  };
}

function createAssetSvg(index: number, label: string) {
  const palettes = [
    ["#eecb86", "#377f7a", "#f7efe2"],
    ["#c7dfd8", "#d86f45", "#fff8e8"],
    ["#a9c5e8", "#313d5a", "#f7e3bf"],
    ["#f1a7a0", "#276168", "#f9f3ec"],
  ];
  const [background, accent, paper] = palettes[index % palettes.length];

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
      <rect width="1200" height="900" fill="${background}"/>
      <circle cx="245" cy="210" r="170" fill="${paper}" opacity="0.78"/>
      <rect x="430" y="160" width="520" height="560" rx="44" fill="${paper}" opacity="0.88"/>
      <path d="M0 710 C220 600 330 800 560 680 C770 570 920 640 1200 500 L1200 900 L0 900 Z" fill="${accent}" opacity="0.82"/>
      <text x="92" y="815" fill="#202426" font-family="Georgia, serif" font-size="62">${label}</text>
    </svg>
  `;
}

function createLocalPngFile(name: string, color: { blue: number; green: number; red: number }) {
  return {
    buffer: createSolidColorPng(64, 64, color),
    mimeType: "image/png",
    name,
  };
}

function createSolidColorPng(
  width: number,
  height: number,
  color: { blue: number; green: number; red: number },
) {
  const bytesPerPixel = 3;
  const rowSize = width * bytesPerPixel + 1;
  const rawPixels = Buffer.alloc(rowSize * height);

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const rowOffset = rowIndex * rowSize;

    rawPixels[rowOffset] = 0;

    for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
      const pixelOffset = rowOffset + 1 + columnIndex * bytesPerPixel;

      rawPixels[pixelOffset] = color.red;
      rawPixels[pixelOffset + 1] = color.green;
      rawPixels[pixelOffset + 2] = color.blue;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createPngChunk("IHDR", header),
    createPngChunk("IDAT", deflateSync(rawPixels)),
    createPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createPngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);

  length.writeUInt32BE(data.byteLength, 0);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function getCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    return value >>> 0;
  });
}

function crc32(buffer: Buffer) {
  const table = getCrcTable();
  let value = 0xffffffff;

  for (const byte of buffer) {
    value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  }

  return (value ^ 0xffffffff) >>> 0;
}

function errorResponse(message: string) {
  return {
    error: {
      code: "request_failed",
      message,
    },
  };
}
