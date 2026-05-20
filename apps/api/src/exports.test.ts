import { createHash } from "node:crypto";

import {
  createEmbellishmentLayer,
  createPageDocument,
  createPhotoLayer,
  createTextLayer,
  type PageDocument,
  type PhotoLayer,
} from "@scrapbook/editor-core";
import { makeFixedClock } from "@scrapbook/test-utils";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { type ExportStorage, renderBookExport, renderPageExport } from "./exports.js";
import { createDatabaseConnection } from "./persistence/database.js";
import { runMigrations } from "./persistence/migrations.js";
import { createRepositories } from "./persistence/repositories.js";

const fixedDate = new Date("2026-05-17T12:00:00.000Z");
const testAccountId = "account_export_pixels";
const testAssetId = "asset_export_pixels";
const testPageId = "page_export_pixels";
const testAssetStorageKey = "uploads/export-pixels.png";

type Rgb = {
  red: number;
  green: number;
  blue: number;
};

type DecodedPng = {
  data: Buffer;
  height: number;
  width: number;
};

const scrapbookBackground = { blue: 228, green: 241, red: 247 };
const photoRed = { blue: 34, green: 46, red: 224 };

const checksumSha256 = (buffer: Buffer): string =>
  createHash("sha256").update(buffer).digest("hex");

const createSolidPng = (color: Rgb): Promise<Buffer> =>
  sharp({
    create: {
      background: { alpha: 1, b: color.blue, g: color.green, r: color.red },
      channels: 4,
      height: 32,
      width: 32,
    },
  })
    .png()
    .toBuffer();

const decodePng = async (buffer: Buffer): Promise<DecodedPng> => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });

  return { data, height: info.height, width: info.width };
};

const pixelAt = (image: DecodedPng, x: number, y: number): Rgb => {
  const offset = (y * image.width + x) * 4;

  return {
    red: image.data[offset] ?? 0,
    green: image.data[offset + 1] ?? 0,
    blue: image.data[offset + 2] ?? 0,
  };
};

const expectColorNear = (actual: Rgb, expected: Rgb, tolerance = 8) => {
  expect(Math.abs(actual.red - expected.red)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.green - expected.green)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.blue - expected.blue)).toBeLessThanOrEqual(tolerance);
};

const countPixels = (
  image: DecodedPng,
  box: { height: number; width: number; x: number; y: number },
  predicate: (pixel: Rgb) => boolean,
): number => {
  let count = 0;

  for (let pixelY = box.y; pixelY < box.y + box.height; pixelY += 1) {
    for (let pixelX = box.x; pixelX < box.x + box.width; pixelX += 1) {
      if (predicate(pixelAt(image, pixelX, pixelY))) {
        count += 1;
      }
    }
  }

  return count;
};

const createExportFixture = async (document: PageDocument) => {
  const connection = createDatabaseConnection({ databasePath: ":memory:" });
  const clock = makeFixedClock(fixedDate);
  const repositories = createRepositories(connection.db, { clock });
  const photoBuffer = await createSolidPng(photoRed);
  const storageObjects = new Map([[testAssetStorageKey, photoBuffer]]);
  const storage: ExportStorage = {
    read: async (key) => {
      const storedObject = storageObjects.get(key);

      if (!storedObject) {
        throw new Error(`Missing test storage object: ${key}`);
      }

      return storedObject;
    },
    remove: async () => {},
    write: async (_area, data) => ({ byteSize: data.byteLength, key: "exports/test.png" }),
  };

  try {
    runMigrations(connection.sqlite);
    repositories.accounts.create({
      displayName: "Export Pixels",
      id: testAccountId,
      primaryEmail: "export-pixels@example.com",
    });
    repositories.assets.createOriginal({
      accountId: testAccountId,
      byteSize: photoBuffer.byteLength,
      checksumSha256: checksumSha256(photoBuffer),
      height: 32,
      id: testAssetId,
      mimeType: "image/png",
      originalFilename: "export-pixels.png",
      originalStorageKey: testAssetStorageKey,
      width: 32,
    });
    repositories.pages.create({
      accountId: testAccountId,
      documentJson: JSON.stringify(document),
      height: document.canvas.height,
      id: testPageId,
      title: "Export pixels",
      width: document.canvas.width,
    });

    return { connection, repositories, storage };
  } catch (error) {
    connection.close();
    throw error;
  }
};

const renderDocumentPng = async (document: PageDocument): Promise<DecodedPng> => {
  const fixture = await createExportFixture(document);

  try {
    const rendered = await renderPageExport({
      accountId: testAccountId,
      format: "png",
      pageId: testPageId,
      preset: "print",
      repositories: fixture.repositories,
      storage: fixture.storage,
    });

    expect(rendered.extension).toBe(".png");
    expect(rendered.mimeType).toBe("image/png");

    return decodePng(rendered.buffer);
  } finally {
    fixture.connection.close();
  }
};

describe("PNG page exports", () => {
  it("renders canvas, photo, text, and embellishment primitives", async () => {
    const image = await renderDocumentPng(
      createPageDocument({
        canvas: { backgroundColor: "#f7f1e4", height: 320, width: 320 },
        layers: [
          createPhotoLayer({
            assetId: testAssetId,
            border: { color: "#ffffff", framePreset: "none", radius: 0, style: "solid", width: 0 },
            height: 80,
            id: "photo_primitive",
            mask: { feather: 0, inset: 0, shape: "rectangle" },
            rotation: 0,
            width: 96,
            x: 24,
            y: 24,
          }),
          createTextLayer({
            color: "#101820",
            fontFamily: "sans-serif",
            fontSize: 52,
            height: 72,
            id: "text_primitive",
            rotation: 0,
            text: "Hi",
            width: 140,
            x: 24,
            y: 132,
          }),
          createEmbellishmentLayer({
            accentColor: "#d56d46",
            color: "#fffdf7",
            element: "paper-label",
            height: 64,
            id: "embellishment_primitive",
            label: "OK",
            rotation: 0,
            width: 104,
            x: 178,
            y: 42,
          }),
        ],
      }),
    );

    expect(image).toMatchObject({ height: 320, width: 320 });
    expectColorNear(pixelAt(image, 8, 8), scrapbookBackground);
    expectColorNear(pixelAt(image, 72, 64), photoRed);
    expectColorNear(pixelAt(image, 180, 74), { blue: 70, green: 109, red: 213 }, 18);
    expect(
      countPixels(
        image,
        { height: 72, width: 140, x: 20, y: 128 },
        (pixel) => pixel.red < 70 && pixel.green < 80 && pixel.blue < 90,
      ),
    ).toBeGreaterThan(80);
  });

  it("clips photo layers with every supported mask shape", async () => {
    const maskCases: Array<{
      inside: Array<[number, number]>;
      inset: PhotoLayer["mask"]["inset"];
      outside: Array<[number, number]>;
      shape: PhotoLayer["mask"]["shape"];
    }> = [
      { inside: [[160, 160]], inset: 0.1, outside: [[88, 160]], shape: "rectangle" },
      { inside: [[160, 160]], inset: 0, outside: [[92, 92]], shape: "ellipse" },
      {
        inside: [
          [160, 104],
          [160, 224],
        ],
        inset: 0,
        outside: [[94, 96]],
        shape: "arch",
      },
      { inside: [[160, 160]], inset: 0, outside: [[96, 96]], shape: "diamond" },
      {
        inside: [[160, 160]],
        inset: 0,
        outside: [
          [84, 160],
          [160, 84],
        ],
        shape: "ticket",
      },
    ];

    for (const maskCase of maskCases) {
      const image = await renderDocumentPng(
        createPageDocument({
          canvas: { backgroundColor: "#f7f1e4", height: 320, width: 320 },
          layers: [
            createPhotoLayer({
              assetId: testAssetId,
              border: {
                color: "#ffffff",
                framePreset: "none",
                radius: 0,
                style: "solid",
                width: 0,
              },
              height: 160,
              id: `photo_${maskCase.shape}`,
              mask: { feather: 0, inset: maskCase.inset, shape: maskCase.shape },
              rotation: 0,
              width: 160,
              x: 80,
              y: 80,
            }),
          ],
        }),
      );

      for (const [insideX, insideY] of maskCase.inside) {
        expectColorNear(pixelAt(image, insideX, insideY), photoRed);
      }

      for (const [outsideX, outsideY] of maskCase.outside) {
        expectColorNear(pixelAt(image, outsideX, outsideY), scrapbookBackground);
      }
    }
  });

  it("renders every embellishment element style", async () => {
    const star = await renderDocumentPng(
      createPageDocument({
        canvas: { backgroundColor: "#f7f1e4", height: 320, width: 320 },
        layers: [
          createEmbellishmentLayer({
            color: "#d6a537",
            element: "sticker-star",
            height: 160,
            label: "",
            rotation: 0,
            width: 160,
            x: 80,
            y: 80,
          }),
        ],
      }),
    );
    const paperLabel = await renderDocumentPng(
      createPageDocument({
        canvas: { backgroundColor: "#f7f1e4", height: 320, width: 320 },
        layers: [
          createEmbellishmentLayer({
            accentColor: "#d56d46",
            color: "#fffdf7",
            element: "paper-label",
            height: 90,
            label: "",
            rotation: 0,
            width: 160,
            x: 80,
            y: 116,
          }),
        ],
      }),
    );
    const washiTape = await renderDocumentPng(
      createPageDocument({
        canvas: { backgroundColor: "#f7f1e4", height: 320, width: 320 },
        layers: [
          createEmbellishmentLayer({
            color: "#79a9a4",
            element: "washi-tape",
            height: 90,
            label: "",
            rotation: 0,
            width: 160,
            x: 80,
            y: 116,
          }),
        ],
      }),
    );
    const photoCorner = await renderDocumentPng(
      createPageDocument({
        canvas: { backgroundColor: "#f7f1e4", height: 320, width: 320 },
        layers: [
          createEmbellishmentLayer({
            accentColor: "#202426",
            color: "#fffdf7",
            element: "photo-corner",
            height: 160,
            label: "",
            rotation: 0,
            width: 160,
            x: 80,
            y: 80,
          }),
        ],
      }),
    );
    const patternPaper = await renderDocumentPng(
      createPageDocument({
        canvas: { backgroundColor: "#f7f1e4", height: 320, width: 320 },
        layers: [
          createEmbellishmentLayer({
            accentColor: "#d6a537",
            color: "#f2d7c9",
            element: "pattern-paper",
            height: 90,
            label: "",
            rotation: 0,
            width: 160,
            x: 80,
            y: 116,
          }),
        ],
      }),
    );

    expectColorNear(pixelAt(star, 160, 160), { blue: 55, green: 165, red: 214 });
    expectColorNear(pixelAt(star, 88, 88), scrapbookBackground);
    expectColorNear(pixelAt(paperLabel, 82, 160), { blue: 70, green: 109, red: 213 }, 18);
    expectColorNear(pixelAt(paperLabel, 160, 160), { blue: 247, green: 253, red: 255 });
    expect(
      countPixels(
        washiTape,
        { height: 90, width: 160, x: 80, y: 116 },
        (pixel) => pixel.red > 155 && pixel.green > 180 && pixel.blue > 175,
      ),
    ).toBeGreaterThan(300);
    expectColorNear(pixelAt(photoCorner, 92, 92), { blue: 247, green: 253, red: 255 });
    expectColorNear(pixelAt(photoCorner, 228, 228), { blue: 38, green: 36, red: 32 });
    expectColorNear(pixelAt(photoCorner, 160, 160), scrapbookBackground);
    expectColorNear(pixelAt(patternPaper, 88, 124), { blue: 55, green: 165, red: 214 });
    expectColorNear(pixelAt(patternPaper, 104, 124), { blue: 201, green: 215, red: 242 });
  });

  it("renders page exports as PDF documents", async () => {
    const fixture = await createExportFixture(
      createPageDocument({
        canvas: { backgroundColor: "#f7f1e4", height: 320, width: 320 },
        layers: [createTextLayer({ id: "pdf_text", text: "PDF" })],
      }),
    );

    try {
      const rendered = await renderPageExport({
        accountId: testAccountId,
        format: "pdf",
        pageId: testPageId,
        preset: "print",
        repositories: fixture.repositories,
        storage: fixture.storage,
      });

      expect(rendered.extension).toBe(".pdf");
      expect(rendered.mimeType).toBe("application/pdf");
      expect(rendered.buffer.subarray(0, 5).toString()).toBe("%PDF-");
      expect(rendered.buffer.toString("latin1")).toContain("/DCTDecode");
    } finally {
      fixture.connection.close();
    }
  });

  it("renders book PDF exports with one PDF page per scrapbook page", async () => {
    const fixture = await createExportFixture(
      createPageDocument({
        canvas: { backgroundColor: "#f7f1e4", height: 320, width: 320 },
        layers: [createTextLayer({ id: "book_pdf_text", text: "One" })],
      }),
    );

    try {
      const secondPage = fixture.repositories.pages.create({
        accountId: testAccountId,
        documentJson: JSON.stringify(
          createPageDocument({
            canvas: { backgroundColor: "#fffdf7", height: 320, width: 320 },
            layers: [createTextLayer({ id: "book_pdf_text_2", text: "Two" })],
          }),
        ),
        height: 320,
        id: "page_export_pixels_2",
        title: "Export pixels two",
        width: 320,
      });
      const book = fixture.repositories.books.create({
        accountId: testAccountId,
        id: "book_export_pixels",
        pageWidth: 320,
        pageHeight: 320,
        title: "Export pixels book",
      });

      fixture.repositories.books.addPage({
        accountId: testAccountId,
        bookId: book.id,
        pageId: testPageId,
        sortOrder: 0,
      });
      fixture.repositories.books.addPage({
        accountId: testAccountId,
        bookId: book.id,
        pageId: secondPage.id,
        sortOrder: 1,
      });

      const rendered = await renderBookExport({
        accountId: testAccountId,
        bookId: book.id,
        format: "pdf",
        preset: "print",
        repositories: fixture.repositories,
        storage: fixture.storage,
      });

      expect(rendered.extension).toBe(".pdf");
      expect(rendered.mimeType).toBe("application/pdf");
      expect(rendered.buffer.toString("latin1")).toContain("/Count 2");
    } finally {
      fixture.connection.close();
    }
  });
});
