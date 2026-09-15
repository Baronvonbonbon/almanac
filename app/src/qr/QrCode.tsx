import { useMemo } from "react";
import { qrModules, qrPath } from "./encode";
import "./qr.css";

/** A QR code, always black on white: readers find light codes on dark grounds far less reliably. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const { size, path } = useMemo(() => {
    const modules = qrModules(text);
    return { size: modules.length, path: qrPath(modules) };
  }, [text]);
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
