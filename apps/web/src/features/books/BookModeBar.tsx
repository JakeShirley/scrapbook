import { Button, Tab, TabList } from "@fluentui/react-components";
import { ChevronLeftRegular, ChevronRightRegular } from "@fluentui/react-icons";

import type { ViewMode } from "./bookEditorTypes";

type BookModeBarProps = {
  canNavigateNext: boolean;
  canNavigatePrevious: boolean;
  isWorking: boolean;
  leftPageName: string;
  navigationLabel: string;
  rightPageName: string;
  viewMode: ViewMode;
  onNavigate: (direction: -1 | 1) => void;
  onViewModeChange: (viewMode: ViewMode) => void;
};

export function BookModeBar({
  canNavigateNext,
  canNavigatePrevious,
  isWorking,
  leftPageName,
  navigationLabel,
  rightPageName,
  viewMode,
  onNavigate,
  onViewModeChange,
}: BookModeBarProps) {
  return (
    <div className="book-modebar">
      <div className="book-modebar-nav book-modebar-nav-previous">
        <Button
          type="button"
          className="secondary-button compact-icon-button"
          aria-label="Previous"
          title="Previous"
          disabled={!canNavigatePrevious || isWorking}
          icon={<ChevronLeftRegular />}
          onClick={() => onNavigate(-1)}
        />
        <span className="book-modebar-page-name" title={leftPageName}>
          {leftPageName}
        </span>
      </div>
      <TabList
        className="book-view-toggle"
        aria-label="Editor view"
        selectedValue={viewMode}
        onTabSelect={(_, data) => onViewModeChange(data.value as ViewMode)}
      >
        <Tab value="page">Page</Tab>
        <Tab value="spread">Spread</Tab>
      </TabList>
      <div className="book-modebar-nav book-modebar-nav-next">
        <span className="book-modebar-page-name" title={rightPageName}>
          {rightPageName}
        </span>
        <Button
          type="button"
          className="secondary-button compact-icon-button"
          aria-label="Next"
          title="Next"
          disabled={!canNavigateNext || isWorking}
          icon={<ChevronRightRegular />}
          onClick={() => onNavigate(1)}
        />
      </div>
      <span className="book-modebar-status">{navigationLabel}</span>
    </div>
  );
}
