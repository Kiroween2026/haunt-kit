// Owner: Yadnesh. QR code as an SVG string (no network, no canvas).

import qrcode from "qrcode-generator";

export function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}
