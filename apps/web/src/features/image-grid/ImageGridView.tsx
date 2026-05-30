import { Button } from "@fluentui/react-components";
import {
  AddRegular,
  ArrowClockwiseRegular,
  ArrowDownloadRegular,
  DeleteRegular,
  ImageAddRegular,
} from "@fluentui/react-icons";
import type { ChangeEvent, CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import UTIF from "utif";

import { Panel, WorkspaceHeader } from "../../components/layout";
import { formatBytes } from "../../lib/format";
import { createClientId } from "../../lib/ids";

type FitMode = "cover" | "contain";
type TransformMode = "move" | "resize-east" | "resize-south" | "resize-southeast";

type GridSettings = {
  backgroundColor: string;
  cellHeight: number;
  cellWidth: number;
  columns: number;
  gap: number;
  rows: number;
};

type LocalImage = {
  bitmap: ImageBitmap;
  byteSize: number;
  height: number;
  id: string;
  name: string;
  previewUrl: string;
  width: number;
};

type GridItem = {
  column: number;
  columnSpan: number;
  fit: FitMode;
  id: string;
  imageId: string;
  row: number;
  rowSpan: number;
};

type CanvasPoint = {
  x: number;
  y: number;
};

type ActiveTransform = {
  itemId: string;
  mode: TransformMode;
  pointerId: number;
  startItem: GridItem;
  startPointer: CanvasPoint;
};

type GridRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

const defaultGrid: GridSettings = {
  backgroundColor: "#ffffff",
  cellHeight: 1200,
  cellWidth: 1200,
  columns: 3,
  gap: 60,
  rows: 2,
};

const imageAccept = "image/png,image/jpeg,image/tiff,.png,.jpg,.jpeg,.tif,.tiff";
const maximumExportDimension = 32_000;
const maximumExportPixels = 160_000_000;
const maximumColumns = 12;
const maximumRows = 24;
const supportedImagePattern = /\.(png|jpe?g|tiff?)$/i;

export function ImageGridView() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<LocalImage[]>([]);
  const [activeTransform, setActiveTransform] = useState<ActiveTransform | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grid, setGrid] = useState<GridSettings>(defaultGrid);
  const [images, setImages] = useState<LocalImage[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [items, setItems] = useState<GridItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const canvasWidth = getCanvasWidth(grid);
  const canvasHeight = getCanvasHeight(grid);
  const imageById = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const exportScale = getExportScale(items, imageById, grid);
  const exportWidth = Math.round(canvasWidth * exportScale);
  const exportHeight = Math.round(canvasHeight * exportScale);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(
    () => () => {
      for (const image of imagesRef.current) {
        releaseLocalImage(image);
      }
    },
    [],
  );

  const selectImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";

    if (files.length === 0) {
      return;
    }

    setError(null);
    setIsLoadingImages(true);

    const loadedImages: LocalImage[] = [];
    const failures: string[] = [];

    for (const file of files) {
      try {
        loadedImages.push(await loadRasterImage(file));
      } catch (loadError: unknown) {
        failures.push(
          loadError instanceof Error ? loadError.message : `Could not load ${file.name}.`,
        );
      }
    }

    if (loadedImages.length > 0) {
      const nextItemCount = items.length + loadedImages.length;
      const nextRows = clampInteger(Math.ceil(nextItemCount / grid.columns), 1, maximumRows);
      const placementGrid = { ...grid, rows: Math.max(grid.rows, nextRows) };
      const newItems = loadedImages.map((image, index) =>
        createPlacement(image.id, items.length + index, placementGrid),
      );

      setGrid((currentGrid) => ({
        ...currentGrid,
        rows: Math.max(
          currentGrid.rows,
          clampInteger(Math.ceil(nextItemCount / currentGrid.columns), 1, maximumRows),
        ),
      }));
      setImages((currentImages) => [...currentImages, ...loadedImages]);
      setItems((currentItems) => [...currentItems, ...newItems]);
      setSelectedItemId(
        (currentSelectedItemId) => currentSelectedItemId ?? newItems[0]?.id ?? null,
      );
    }

    setError(failures.length > 0 ? failures.join(" ") : null);
    setIsLoadingImages(false);
  };

  const updateGrid = (update: Partial<GridSettings>) => {
    setGrid((currentGrid) => {
      const nextGrid = normalizeGrid({ ...currentGrid, ...update });
      setItems((currentItems) => currentItems.map((item) => clampItemToGrid(item, nextGrid)));

      return nextGrid;
    });
  };

  const addImageToGrid = (imageId: string) => {
    const nextIndex = items.length;
    const requiredRows = clampInteger(Math.ceil((nextIndex + 1) / grid.columns), 1, maximumRows);
    const placementGrid = { ...grid, rows: Math.max(grid.rows, requiredRows) };
    const item = createPlacement(imageId, nextIndex, placementGrid);

    if (requiredRows > grid.rows) {
      updateGrid({ rows: requiredRows });
    }

    setItems((currentItems) => [...currentItems, item]);
    setSelectedItemId(item.id);
  };

  const removeImage = (imageId: string) => {
    const image = imageById.get(imageId);

    if (image) {
      releaseLocalImage(image);
    }

    setImages((currentImages) =>
      currentImages.filter((currentImage) => currentImage.id !== imageId),
    );
    setItems((currentItems) => currentItems.filter((item) => item.imageId !== imageId));
    setSelectedItemId((currentSelectedItemId) => {
      const selectedItemImageId = items.find((item) => item.id === currentSelectedItemId)?.imageId;

      return selectedItemImageId === imageId ? null : currentSelectedItemId;
    });
  };

  const removeItem = (itemId: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.id !== itemId));
    setSelectedItemId((currentSelectedItemId) =>
      currentSelectedItemId === itemId ? null : currentSelectedItemId,
    );
  };

  const updateItem = (itemId: string, update: Partial<GridItem>) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId ? clampItemToGrid({ ...item, ...update }, grid) : item,
      ),
    );
  };

  const autoArrange = () => {
    const requiredRows = clampInteger(Math.ceil(items.length / grid.columns), 1, maximumRows);
    const arrangementGrid = { ...grid, rows: Math.max(grid.rows, requiredRows) };

    setGrid(arrangementGrid);
    setItems((currentItems) =>
      currentItems.map((item, index) =>
        clampItemToGrid(
          {
            ...item,
            column: index % arrangementGrid.columns,
            columnSpan: 1,
            row: Math.floor(index / arrangementGrid.columns),
            rowSpan: 1,
          },
          arrangementGrid,
        ),
      ),
    );
  };

  const getCanvasPoint = (event: ReactPointerEvent): CanvasPoint | null => {
    const canvasElement = canvasRef.current;

    if (!canvasElement) {
      return null;
    }

    const bounds = canvasElement.getBoundingClientRect();

    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvasWidth,
      y: ((event.clientY - bounds.top) / bounds.height) * canvasHeight,
    };
  };

  const getTransformedItem = (transform: ActiveTransform, pointer: CanvasPoint) => {
    const columnDelta = Math.round(
      (pointer.x - transform.startPointer.x) / (grid.cellWidth + grid.gap),
    );
    const rowDelta = Math.round(
      (pointer.y - transform.startPointer.y) / (grid.cellHeight + grid.gap),
    );

    if (transform.mode === "move") {
      return clampItemToGrid(
        {
          ...transform.startItem,
          column: transform.startItem.column + columnDelta,
          row: transform.startItem.row + rowDelta,
        },
        grid,
      );
    }

    return clampItemToGrid(
      {
        ...transform.startItem,
        columnSpan:
          transform.mode === "resize-south"
            ? transform.startItem.columnSpan
            : transform.startItem.columnSpan + columnDelta,
        rowSpan:
          transform.mode === "resize-east"
            ? transform.startItem.rowSpan
            : transform.startItem.rowSpan + rowDelta,
      },
      grid,
    );
  };

  const startTransform = (
    event: ReactPointerEvent<HTMLElement>,
    item: GridItem,
    mode: TransformMode,
  ) => {
    if (event.button !== 0) {
      return;
    }

    const pointer = getCanvasPoint(event);

    if (!pointer) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedItemId(item.id);
    setActiveTransform({
      itemId: item.id,
      mode,
      pointerId: event.pointerId,
      startItem: item,
      startPointer: pointer,
    });
  };

  const transformItem = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeTransform || event.pointerId !== activeTransform.pointerId) {
      return;
    }

    const pointer = getCanvasPoint(event);
    if (!pointer) {
      return;
    }
    event.preventDefault();
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === activeTransform.itemId ? getTransformedItem(activeTransform, pointer) : item,
      ),
    );
  };

  const stopTransform = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeTransform?.pointerId !== event.pointerId) {
      return;
    }

    setActiveTransform(null);
  };

  const exportPng = async () => {
    if (items.length === 0) {
      return;
    }

    setError(null);
    setIsExporting(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = exportWidth;
      canvas.height = exportHeight;
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Canvas export is not available in this browser.");
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.scale(exportScale, exportScale);
      context.fillStyle = grid.backgroundColor;
      context.fillRect(0, 0, canvasWidth, canvasHeight);

      for (const item of items) {
        const image = imageById.get(item.imageId);

        if (image) {
          drawImageInRect(context, image, getCellRect(item, grid), item.fit);
        }
      }

      const blob = await canvasToBlob(canvas, "image/png");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `image-grid-${grid.columns}x${grid.rows}-${exportWidth}x${exportHeight}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError: unknown) {
      setError(exportError instanceof Error ? exportError.message : "Could not export the image.");
    } finally {
      setIsExporting(false);
    }
  };

  const cellElements = Array.from({ length: grid.columns * grid.rows }, (_, index) => {
    const column = index % grid.columns;
    const row = Math.floor(index / grid.columns);
    const left = ((column * (grid.cellWidth + grid.gap)) / canvasWidth) * 100;
    const top = ((row * (grid.cellHeight + grid.gap)) / canvasHeight) * 100;
    const width = (grid.cellWidth / canvasWidth) * 100;
    const height = (grid.cellHeight / canvasHeight) * 100;

    return (
      <span
        aria-hidden="true"
        key={`${column}-${row}`}
        style={{ height: `${height}%`, left: `${left}%`, top: `${top}%`, width: `${width}%` }}
      />
    );
  });

  return (
    <>
      <WorkspaceHeader title="Image Grid">
        <input
          ref={fileInputRef}
          accept={imageAccept}
          className="visually-hidden"
          multiple
          type="file"
          onChange={selectImages}
        />
        <Button
          type="button"
          className="secondary-button"
          disabled={isLoadingImages}
          icon={<ImageAddRegular />}
          onClick={() => fileInputRef.current?.click()}
        >
          Select images
        </Button>
        <Button
          type="button"
          className="secondary-button"
          disabled={items.length === 0}
          icon={<ArrowClockwiseRegular />}
          onClick={autoArrange}
        >
          Arrange
        </Button>
        <Button
          appearance="primary"
          type="button"
          className="primary-button"
          disabled={items.length === 0 || isExporting}
          icon={<ArrowDownloadRegular />}
          onClick={exportPng}
        >
          {isExporting ? "Exporting" : "Export PNG"}
        </Button>
      </WorkspaceHeader>

      {error ? (
        <p className="panel-alert" role="alert">
          {error}
        </p>
      ) : null}

      <div className="image-grid-page">
        <div className="image-grid-sidebars">
          <Panel title="Images" count={String(images.length)}>
            {isLoadingImages ? <p className="empty-state">Loading images</p> : null}
            {images.length === 0 && !isLoadingImages ? (
              <p className="empty-state">No local images selected</p>
            ) : null}
            {images.length > 0 ? (
              <ul className="image-grid-image-list">
                {images.map((image) => (
                  <li key={image.id}>
                    <img src={image.previewUrl} alt="" />
                    <span className="image-grid-image-copy">
                      <span>{image.name}</span>
                      <span>
                        {image.width} x {image.height} / {formatBytes(image.byteSize)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      className="secondary-button compact-icon-button"
                      icon={<AddRegular />}
                      aria-label={`Add ${image.name} to grid`}
                      title="Add to grid"
                      onClick={() => addImageToGrid(image.id)}
                    />
                    <Button
                      type="button"
                      className="secondary-button compact-icon-button"
                      icon={<DeleteRegular />}
                      aria-label={`Remove ${image.name}`}
                      title="Remove"
                      onClick={() => removeImage(image.id)}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>

          <Panel title="Grid" count={`${canvasWidth} x ${canvasHeight}`}>
            <form
              className="image-grid-controls"
              onSubmit={(formEvent) => formEvent.preventDefault()}
            >
              <label>
                <span>Columns</span>
                <input
                  max={maximumColumns}
                  min={1}
                  type="number"
                  value={grid.columns}
                  onChange={(event) => updateGrid({ columns: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                <span>Rows</span>
                <input
                  max={maximumRows}
                  min={1}
                  type="number"
                  value={grid.rows}
                  onChange={(event) => updateGrid({ rows: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                <span>Cell width</span>
                <input
                  min={120}
                  step={10}
                  type="number"
                  value={grid.cellWidth}
                  onChange={(event) => updateGrid({ cellWidth: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                <span>Cell height</span>
                <input
                  min={120}
                  step={10}
                  type="number"
                  value={grid.cellHeight}
                  onChange={(event) =>
                    updateGrid({ cellHeight: Number(event.currentTarget.value) })
                  }
                />
              </label>
              <label>
                <span>Gap</span>
                <input
                  min={0}
                  step={10}
                  type="number"
                  value={grid.gap}
                  onChange={(event) => updateGrid({ gap: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                <span>Background</span>
                <input
                  type="color"
                  value={grid.backgroundColor}
                  onChange={(event) => updateGrid({ backgroundColor: event.currentTarget.value })}
                />
              </label>
            </form>
          </Panel>

          <Panel title="Selection">
            {selectedItem ? (
              <SelectionControls
                item={selectedItem}
                image={imageById.get(selectedItem.imageId) ?? null}
                onChange={(update) => updateItem(selectedItem.id, update)}
                onRemove={() => removeItem(selectedItem.id)}
              />
            ) : (
              <p className="empty-state">No cell selected</p>
            )}
          </Panel>
        </div>

        <section className="image-grid-stage" aria-label="Image grid canvas">
          <div className="image-grid-stage-header">
            <span>
              {canvasWidth} x {canvasHeight}px
            </span>
            <span>
              Export {exportWidth} x {exportHeight}px
            </span>
            <span>{items.length} placed</span>
          </div>
          <div className="image-grid-preview-wrap">
            <div
              ref={canvasRef}
              className="image-grid-preview"
              style={{
                aspectRatio: `${canvasWidth} / ${canvasHeight}`,
                backgroundColor: grid.backgroundColor,
              }}
              onPointerCancel={stopTransform}
              onPointerMove={transformItem}
              onPointerUp={stopTransform}
            >
              <div className="image-grid-cell-layer">{cellElements}</div>
              {items.map((item) => {
                const image = imageById.get(item.imageId);

                if (!image) {
                  return null;
                }

                const rect = getCellRect(item, grid);
                const itemStyle: CSSProperties = {
                  height: `${(rect.height / canvasHeight) * 100}%`,
                  left: `${(rect.x / canvasWidth) * 100}%`,
                  top: `${(rect.y / canvasHeight) * 100}%`,
                  width: `${(rect.width / canvasWidth) * 100}%`,
                };

                return (
                  <div
                    className="image-grid-canvas-item"
                    data-selected={item.id === selectedItemId}
                    key={item.id}
                    style={itemStyle}
                  >
                    <img src={image.previewUrl} alt="" style={{ objectFit: item.fit }} />
                    <button
                      type="button"
                      className="image-grid-item-hitbox"
                      aria-label={`${image.name} grid item`}
                      onClick={() => setSelectedItemId(item.id)}
                      onPointerDown={(event) => startTransform(event, item, "move")}
                    />
                    {item.id === selectedItemId ? (
                      <>
                        <button
                          type="button"
                          className="image-grid-resize-handle"
                          data-handle="east"
                          aria-label="Resize item horizontally"
                          title="Resize horizontally"
                          onPointerDown={(event) => startTransform(event, item, "resize-east")}
                        />
                        <button
                          type="button"
                          className="image-grid-resize-handle"
                          data-handle="south"
                          aria-label="Resize item vertically"
                          title="Resize vertically"
                          onPointerDown={(event) => startTransform(event, item, "resize-south")}
                        />
                        <button
                          type="button"
                          className="image-grid-resize-handle"
                          data-handle="southeast"
                          aria-label="Resize item"
                          title="Resize"
                          onPointerDown={(event) => startTransform(event, item, "resize-southeast")}
                        />
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function SelectionControls({
  image,
  item,
  onChange,
  onRemove,
}: {
  image: LocalImage | null;
  item: GridItem;
  onChange: (update: Partial<GridItem>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="image-grid-selection-controls">
      <div className="image-grid-selection-title">
        <span>{image?.name ?? "Missing image"}</span>
        <span>
          Column {item.column + 1}, Row {item.row + 1}
        </span>
      </div>
      <form className="image-grid-controls" onSubmit={(formEvent) => formEvent.preventDefault()}>
        <label>
          <span>Column</span>
          <input
            min={1}
            type="number"
            value={item.column + 1}
            onChange={(event) => onChange({ column: Number(event.currentTarget.value) - 1 })}
          />
        </label>
        <label>
          <span>Row</span>
          <input
            min={1}
            type="number"
            value={item.row + 1}
            onChange={(event) => onChange({ row: Number(event.currentTarget.value) - 1 })}
          />
        </label>
        <label>
          <span>Columns</span>
          <input
            min={1}
            type="number"
            value={item.columnSpan}
            onChange={(event) => onChange({ columnSpan: Number(event.currentTarget.value) })}
          />
        </label>
        <label>
          <span>Rows</span>
          <input
            min={1}
            type="number"
            value={item.rowSpan}
            onChange={(event) => onChange({ rowSpan: Number(event.currentTarget.value) })}
          />
        </label>
        <label>
          <span>Fit</span>
          <select
            value={item.fit}
            onChange={(event) => onChange({ fit: event.currentTarget.value as FitMode })}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
          </select>
        </label>
      </form>
      <Button
        type="button"
        className="secondary-button"
        icon={<DeleteRegular />}
        onClick={onRemove}
      >
        Remove cell
      </Button>
    </div>
  );
}

function normalizeGrid(grid: GridSettings): GridSettings {
  return {
    backgroundColor: grid.backgroundColor,
    cellHeight: clampInteger(grid.cellHeight, 120, 8000),
    cellWidth: clampInteger(grid.cellWidth, 120, 8000),
    columns: clampInteger(grid.columns, 1, maximumColumns),
    gap: clampInteger(grid.gap, 0, 800),
    rows: clampInteger(grid.rows, 1, maximumRows),
  };
}

function clampInteger(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function createPlacement(imageId: string, index: number, grid: GridSettings): GridItem {
  return {
    column: index % grid.columns,
    columnSpan: 1,
    fit: "cover",
    id: createClientId(),
    imageId,
    row: Math.floor(index / grid.columns),
    rowSpan: 1,
  };
}

function clampItemToGrid(item: GridItem, grid: GridSettings): GridItem {
  const columnSpan = clampInteger(item.columnSpan, 1, grid.columns);
  const rowSpan = clampInteger(item.rowSpan, 1, grid.rows);

  return {
    ...item,
    column: clampInteger(item.column, 0, Math.max(0, grid.columns - columnSpan)),
    columnSpan,
    row: clampInteger(item.row, 0, Math.max(0, grid.rows - rowSpan)),
    rowSpan,
  };
}

function getCanvasWidth(grid: GridSettings) {
  return grid.columns * grid.cellWidth + Math.max(0, grid.columns - 1) * grid.gap;
}

function getCanvasHeight(grid: GridSettings) {
  return grid.rows * grid.cellHeight + Math.max(0, grid.rows - 1) * grid.gap;
}

function getExportScale(
  items: GridItem[],
  imageById: ReadonlyMap<string, LocalImage>,
  grid: GridSettings,
) {
  const nativeScale = items.reduce((scale, item) => {
    const image = imageById.get(item.imageId);

    if (!image) {
      return scale;
    }

    const rect = getCellRect(item, grid);
    const widthScale = image.width / rect.width;
    const heightScale = image.height / rect.height;
    const itemScale =
      item.fit === "cover" ? Math.min(widthScale, heightScale) : Math.max(widthScale, heightScale);

    return Math.max(scale, itemScale);
  }, 1);
  const canvasWidth = getCanvasWidth(grid);
  const canvasHeight = getCanvasHeight(grid);
  const dimensionScale = Math.min(
    maximumExportDimension / canvasWidth,
    maximumExportDimension / canvasHeight,
  );
  const pixelScale = Math.sqrt(maximumExportPixels / (canvasWidth * canvasHeight));
  const safeScale = Math.min(dimensionScale, pixelScale);

  if (safeScale < 1) {
    return Math.max(0.01, safeScale);
  }

  return Math.max(1, Math.min(nativeScale, safeScale));
}

function getCellRect(item: GridItem, grid: GridSettings): GridRect {
  return {
    height: item.rowSpan * grid.cellHeight + Math.max(0, item.rowSpan - 1) * grid.gap,
    width: item.columnSpan * grid.cellWidth + Math.max(0, item.columnSpan - 1) * grid.gap,
    x: item.column * (grid.cellWidth + grid.gap),
    y: item.row * (grid.cellHeight + grid.gap),
  };
}

function isTiffFile(file: File) {
  return file.type === "image/tiff" || file.type === "image/tif" || /\.tiff?$/i.test(file.name);
}

function isSupportedImageFile(file: File) {
  return (
    file.type === "image/png" ||
    file.type === "image/jpeg" ||
    isTiffFile(file) ||
    supportedImagePattern.test(file.name)
  );
}

async function loadRasterImage(file: File): Promise<LocalImage> {
  if (!isSupportedImageFile(file)) {
    throw new Error(`${file.name} is not a supported image file.`);
  }

  if (isTiffFile(file)) {
    return loadTiffImage(file);
  }

  const bitmap = await createImageBitmap(file);

  return {
    bitmap,
    byteSize: file.size,
    height: bitmap.height,
    id: createClientId(),
    name: file.name,
    previewUrl: URL.createObjectURL(file),
    width: bitmap.width,
  };
}

async function loadTiffImage(file: File): Promise<LocalImage> {
  const buffer = await file.arrayBuffer();
  const directories = UTIF.decode(buffer);
  const directory = directories[0];

  if (!directory) {
    throw new Error(`${file.name} does not contain a TIFF image.`);
  }

  UTIF.decodeImage(buffer, directory);

  if (!directory.width || !directory.height) {
    throw new Error(`${file.name} could not be decoded.`);
  }

  const rgba = UTIF.toRGBA8(directory);
  const imageData = new ImageData(new Uint8ClampedArray(rgba), directory.width, directory.height);
  const [bitmap, previewUrl] = await Promise.all([
    createImageBitmap(imageData),
    createBlobUrlFromImageData(imageData),
  ]);

  return {
    bitmap,
    byteSize: file.size,
    height: directory.height,
    id: createClientId(),
    name: file.name,
    previewUrl,
    width: directory.width,
  };
}

async function createBlobUrlFromImageData(imageData: ImageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas image decoding is unavailable in this browser.");
  }

  context.putImageData(imageData, 0, 0);
  const blob = await canvasToBlob(canvas, "image/png");

  return URL.createObjectURL(blob);
}

function drawImageInRect(
  context: CanvasRenderingContext2D,
  image: LocalImage,
  rect: GridRect,
  fit: FitMode,
) {
  const horizontalScale = rect.width / image.width;
  const verticalScale = rect.height / image.height;
  const scale =
    fit === "cover"
      ? Math.max(horizontalScale, verticalScale)
      : Math.min(horizontalScale, verticalScale);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = rect.x + (rect.width - width) / 2;
  const y = rect.y + (rect.height - height) / 2;

  context.save();
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
  context.drawImage(image.bitmap, x, y, width, height);
  context.restore();
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Could not export the canvas."));
    }, type);
  });
}

function releaseLocalImage(image: LocalImage) {
  URL.revokeObjectURL(image.previewUrl);
  image.bitmap.close();
}
