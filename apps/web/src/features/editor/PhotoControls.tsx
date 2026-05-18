import { Button } from "@fluentui/react-components";
import { PageFitRegular } from "@fluentui/react-icons";
import { type PhotoLayer, resetPhotoLayerEdits } from "@scrapbook/editor-core";

export function PhotoControls({
  layer,
  onChange,
}: {
  layer: PhotoLayer;
  onChange: (update: Partial<PhotoLayer>) => void;
}) {
  const updatePhotoTransform = (update: Partial<PhotoLayer["photoTransform"]>) =>
    onChange({ photoTransform: { ...layer.photoTransform, ...update } });
  const updateCrop = (update: Partial<PhotoLayer["crop"]>) =>
    onChange({ crop: { ...layer.crop, ...update } });
  const updateBorder = (update: Partial<PhotoLayer["border"]>) =>
    onChange({ border: { ...layer.border, ...update } });
  const updateMask = (update: Partial<PhotoLayer["mask"]>) =>
    onChange({ mask: { ...layer.mask, ...update } });
  const updateFilter = (update: Partial<PhotoLayer["filter"]>) =>
    onChange({ filter: { ...layer.filter, ...update } });

  return (
    <>
      <fieldset className="inspector-section">
        <legend>Photo</legend>
        <label>
          <span>Fit</span>
          <select
            value={layer.fit}
            onChange={(event) => onChange({ fit: event.currentTarget.value as PhotoLayer["fit"] })}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
          </select>
        </label>
        <label>
          <span>Filter</span>
          <select
            value={layer.filter.preset}
            onChange={(event) =>
              updateFilter({ preset: event.currentTarget.value as PhotoLayer["filter"]["preset"] })
            }
          >
            <option value="none">None</option>
            <option value="warm">Warm</option>
            <option value="cool">Cool</option>
            <option value="mono">Mono</option>
            <option value="fade">Fade</option>
            <option value="sepia">Sepia</option>
          </select>
        </label>
      </fieldset>
      <fieldset className="inspector-section">
        <legend>Transform</legend>
        <label>
          <span>Scale</span>
          <input
            max={5}
            min={0.1}
            step={0.05}
            type="range"
            value={layer.photoTransform.scale}
            onChange={(event) => updatePhotoTransform({ scale: Number(event.currentTarget.value) })}
          />
        </label>
        <div className="inspector-grid">
          <label>
            <span>Offset X</span>
            <input
              max={1}
              min={-1}
              step={0.01}
              type="number"
              value={layer.photoTransform.offsetX}
              onChange={(event) =>
                updatePhotoTransform({ offsetX: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label>
            <span>Offset Y</span>
            <input
              max={1}
              min={-1}
              step={0.01}
              type="number"
              value={layer.photoTransform.offsetY}
              onChange={(event) =>
                updatePhotoTransform({ offsetY: Number(event.currentTarget.value) })
              }
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="inspector-section">
        <legend>Crop</legend>
        <div className="inspector-grid">
          <label>
            <span>Crop X</span>
            <input
              max={1 - layer.crop.width}
              min={0}
              step={0.01}
              type="number"
              value={layer.crop.x}
              onChange={(event) => updateCrop({ x: Number(event.currentTarget.value) })}
            />
          </label>
          <label>
            <span>Crop Y</span>
            <input
              max={1 - layer.crop.height}
              min={0}
              step={0.01}
              type="number"
              value={layer.crop.y}
              onChange={(event) => updateCrop({ y: Number(event.currentTarget.value) })}
            />
          </label>
          <label>
            <span>Crop W</span>
            <input
              max={1 - layer.crop.x}
              min={0.05}
              step={0.01}
              type="number"
              value={layer.crop.width}
              onChange={(event) => updateCrop({ width: Number(event.currentTarget.value) })}
            />
          </label>
          <label>
            <span>Crop H</span>
            <input
              max={1 - layer.crop.y}
              min={0.05}
              step={0.01}
              type="number"
              value={layer.crop.height}
              onChange={(event) => updateCrop({ height: Number(event.currentTarget.value) })}
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="inspector-section">
        <legend>Frame</legend>
        <div className="inspector-grid">
          <label>
            <span>Frame</span>
            <select
              value={layer.border.framePreset}
              onChange={(event) =>
                updateBorder({
                  framePreset: event.currentTarget.value as PhotoLayer["border"]["framePreset"],
                })
              }
            >
              <option value="none">None</option>
              <option value="mat">Mat</option>
              <option value="polaroid">Polaroid</option>
              <option value="film">Film</option>
              <option value="paper">Paper</option>
            </select>
          </label>
          <label>
            <span>Border</span>
            <input
              max={160}
              min={0}
              type="number"
              value={layer.border.width}
              onChange={(event) => updateBorder({ width: Number(event.currentTarget.value) })}
            />
          </label>
        </div>
        <label>
          <span>Border color</span>
          <input
            type="color"
            value={layer.border.color}
            onChange={(event) => updateBorder({ color: event.currentTarget.value })}
          />
        </label>
      </fieldset>
      <fieldset className="inspector-section">
        <legend>Mask</legend>
        <label>
          <span>Shape</span>
          <select
            value={layer.mask.shape}
            onChange={(event) =>
              updateMask({ shape: event.currentTarget.value as PhotoLayer["mask"]["shape"] })
            }
          >
            <option value="rectangle">Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="arch">Arch</option>
            <option value="diamond">Diamond</option>
            <option value="ticket">Ticket</option>
          </select>
        </label>
      </fieldset>
      <Button
        type="button"
        className="secondary-button full-width-button"
        icon={<PageFitRegular />}
        onClick={() => onChange(resetPhotoLayerEdits(layer))}
      >
        Reset photo edits
      </Button>
    </>
  );
}
