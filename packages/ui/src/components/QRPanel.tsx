export type QRPanelProps = {
  /** The 4-letter room code. */
  code: string;
  /** SVG markup from `room.qrSvg` (host-sdk). Generated on this device from joinUrl, never from user input. */
  svg: string;
  /** The URL the QR code opens. Shown as text, for people who can't scan. */
  joinUrl: string;
};

/** Big QR code and room code for the party screen. */
export function QRPanel({ code, svg, joinUrl }: QRPanelProps) {
  const spoken = code.split("").join(" ");
  return (
    <div className="hk-qr">
      <div
        className="hk-qr__code-image"
        role="img"
        aria-label={`QR code to join room ${spoken}`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="hk-qr__room" aria-label={`Room code ${spoken}`}>
        {code}
      </div>
      <div className="hk-qr__url">Scan, or open {joinUrl}</div>
    </div>
  );
}
