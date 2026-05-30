import type { ImagePreviewState } from "../types";

export function ImagePreviewPane({
  image,
  title,
}: {
  image: ImagePreviewState;
  title: string;
}) {
  return (
    <div className="image-preview-pane">
      <div className="image-preview-header">
        <span>{title}</span>
        <strong title={image.path}>{image.name}</strong>
      </div>
      <div className="image-preview-stage">
        <img src={image.url} alt={image.name} />
      </div>
    </div>
  );
}
