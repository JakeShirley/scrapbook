import { Button } from "@fluentui/react-components";
import { ArrowDownloadRegular, DocumentPdfRegular, EditRegular } from "@fluentui/react-icons";

import { WorkspaceHeader } from "../../components/layout";

type BookEditorHeaderProps = {
  hasPages: boolean;
  isWorking: boolean;
  onEditSettings: () => void;
  onExportBookPdf: () => void;
  onExportBookPng: () => void;
  onExportPagePng: () => void;
  title: string;
};

export function BookEditorHeader({
  hasPages,
  isWorking,
  onEditSettings,
  onExportBookPdf,
  onExportBookPng,
  onExportPagePng,
  title,
}: BookEditorHeaderProps) {
  return (
    <WorkspaceHeader
      title={title}
      titleActions={
        <Button
          type="button"
          className="secondary-button compact-icon-button"
          aria-label="Edit book settings"
          aria-haspopup="dialog"
          title="Edit book settings"
          icon={<EditRegular />}
          onClick={onEditSettings}
        />
      }
    >
      <Button
        type="button"
        className="secondary-button"
        disabled={isWorking || !hasPages}
        icon={<ArrowDownloadRegular />}
        onClick={onExportPagePng}
      >
        Export page PNG
      </Button>
      <Button
        type="button"
        className="secondary-button"
        disabled={isWorking || !hasPages}
        icon={<ArrowDownloadRegular />}
        onClick={onExportBookPng}
      >
        Export book PNG
      </Button>
      <Button
        type="button"
        className="secondary-button"
        disabled={isWorking || !hasPages}
        icon={<DocumentPdfRegular />}
        onClick={onExportBookPdf}
      >
        Export book PDF
      </Button>
    </WorkspaceHeader>
  );
}
