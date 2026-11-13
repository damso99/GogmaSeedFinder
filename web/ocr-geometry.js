// Pointer geometry must be mapped to the actual image area, not the entire
// object-fit:contain canvas rectangle (which may include letterbox space).
export function canvasContentRect(rect, imageWidth, imageHeight, fit = "contain") {
  if (!(rect?.width > 0 && rect?.height > 0 && imageWidth > 0 && imageHeight > 0)) return null;
  const scale = fit === "cover"
    ? Math.max(rect.width / imageWidth, rect.height / imageHeight)
    : fit === "fill"
      ? null
      : Math.min(rect.width / imageWidth, rect.height / imageHeight);
  const width = scale === null ? rect.width : imageWidth * scale;
  const height = scale === null ? rect.height : imageHeight * scale;
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  };
}

export function pointerToCanvasImage(event, rect, imageWidth, imageHeight, {
  fit = "contain", clamp = false,
} = {}) {
  const content = canvasContentRect(rect, imageWidth, imageHeight, fit);
  if (!content) return null;
  let x = (event.clientX - content.left) / content.width;
  let y = (event.clientY - content.top) / content.height;
  if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return null;
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  return { x, y };
}
