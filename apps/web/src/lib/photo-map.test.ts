import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile(
  "home-client.tsx",
  readFileSync(
    new URL("../app/[locale]/home-client.tsx", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const city = { id: "kyiv", latitude: 50.4501, longitude: 30.5234 };
const photos = Array.from({ length: 25 }, (_, index) => ({
  id: `photo-${index}`,
  title: `Photo ${index}`,
  locationId: "kyiv",
  locationLatitude: city.latitude,
  locationLongitude: city.longitude,
  src: `/photo-${index}.jpg`,
}));
function markers(name: string, context: object) {
  let node: ts.VariableDeclaration | undefined;
  function visit(child: ts.Node) {
    if (ts.isVariableDeclaration(child) && child.name.getText(source) === name)
      node = child;
    ts.forEachChild(child, visit);
  }
  visit(source);
  assert(node?.initializer);
  return runInNewContext(
    ts.transpileModule(
      `const ${name} = ${node.initializer.getText(source)}; ${name}`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    {
      useMemo: (value: () => unknown) => value(),
      locale: "ru",
      locationPins: [city],
      getLocationLabel: () => "Киев",
      getPhotoTitle: (photo: any) => photo.title,
      t: (key: string) => key,
      ...context,
    },
  ) as any[];
}

test("photo map restores the previous geographic placement instead of a pixel grid", () => {
  const result = markers("mapPhotoMarkers", { visiblePhotos: photos });
  assert.equal(result.length, photos.length);
  for (const [index, marker] of result.entries()) {
    const angle = (index * 137.5 * Math.PI) / 180;
    const radius = index === 0 ? 0 : 0.045 * Math.ceil(index / 5);
    assert.equal(marker.latitude, city.latitude + Math.cos(angle) * radius);
    assert.equal(marker.longitude, city.longitude + Math.sin(angle) * radius);
    assert.equal(marker.photoId, photos[index]!.id);
  }
});

test("hidden locations stay hidden and a new location starts at its own coordinates", () => {
  const result = markers("mapPhotoMarkers", {
    visiblePhotos: [
      { ...photos[0], locationHidden: true },
      photos[1],
      {
        ...photos[2],
        locationId: "other",
        locationLatitude: 48.85,
        locationLongitude: 2.35,
      },
    ],
  });
  assert.equal(result.length, 2);
  assert.equal(result[0]!.latitude, city.latitude);
  assert.equal(result[1]!.latitude, 48.85);
  assert.equal(result[1]!.longitude, 2.35);
});

test("video markers retain the same original small geographic offsets", () => {
  const result = markers("mapVideoMarkers", {
    curatedVideos: photos.slice(0, 3).map((photo) => ({
      ...photo,
      posterUrl: photo.src,
      titleKey: photo.title,
    })),
  });
  assert.equal(result.length, 3);
  assert.equal(result[0]!.latitude, city.latitude);
  assert.equal(
    result[1]!.latitude,
    city.latitude + Math.cos((137.5 * Math.PI) / 180) * 0.045,
  );
});

test("photo thumbnails override Leaflet's auto-width reset without resizing map tiles", () => {
  const css = readFileSync(
    new URL("../app/[locale]/globals.css", import.meta.url),
    "utf8",
  );
  const thumbnail = css.match(
    /\.map-board\s+\.photo-map-marker\s+\.photo-map-marker__frame\s+img\s*\{([^}]+)\}/,
  );
  assert(
    thumbnail,
    "thumbnail sizing must outrank Leaflet's two-class marker-pane selector",
  );
  assert.match(thumbnail[1]!, /\bwidth:\s*100%\s*;/);
  assert.match(thumbnail[1]!, /\bheight:\s*100%\s*;/);
  assert.match(thumbnail[1]!, /\bobject-fit:\s*cover\s*;/);
  assert.match(thumbnail[1]!, /\bdisplay:\s*block\s*;/);
});

test("photo markers retain a black outline without a stacking shadow or halo", () => {
  const css = readFileSync(
    new URL("../app/[locale]/globals.css", import.meta.url),
    "utf8",
  );
  const frame = css.match(/\.photo-map-marker__frame\s*\{([^}]+)\}/);
  assert(frame);
  assert.match(frame[1]!, /\bborder:\s*2px solid #000\s*;/);
  assert.match(frame[1]!, /\bborder-radius:\s*50%\s*;/);
  assert.match(frame[1]!, /\bbox-shadow:\s*none\s*;/);
  assert.match(frame[1]!, /\bfilter:\s*none\s*;/);
});
