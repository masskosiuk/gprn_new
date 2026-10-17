import { ImageResponse } from "next/og";
export const dynamic = "force-static";
export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#101010",
        color: "#ffffff",
        fontSize: 120,
        fontWeight: 700,
      }}
    >
      G
    </div>,
    { width: 180, height: 180 },
  );
}
