import { ImageResponse } from "next/og";
export const dynamic = "force-static";
export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: "#101010",
        color: "#ffffff",
      }}
    >
      <div
        style={{
          display: "flex",
          color: "#6cc9c2",
          fontSize: 120,
          fontWeight: 700,
        }}
      >
        GPRN
      </div>
      <div style={{ display: "flex", fontSize: 42, marginTop: 28 }}>
        Global Production &amp; Reputation Network
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 30,
          marginTop: 24,
          color: "#b8b8b8",
        }}
      >
        Photography. Portfolio reviews. Creative community.
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
