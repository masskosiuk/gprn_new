import { BadRequestException } from "@nestjs/common";
import sharp from "sharp";
import { paletteFromPixels } from "@gprn/domain";
import { asRecord, requiredString } from "./validation.js";

export type DigitalKind = "PRESET" | "LUT";
export interface ProductFile {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly size: number;
  readonly format: string;
}
export const productInclude = {
  seller: { include: { user: { include: { profile: true } } } },
} as const;

export function invalidProduct(code = "PRODUCT_INVALID"): never {
  throw new BadRequestException({
    code,
    message: "Check the product name, price, cover and files.",
  });
}

export function decodeProductUpload(value: unknown, maxBytes: number): Buffer {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(maxBytes / 3) * 4 + 200
  )
    invalidProduct("PRODUCT_FILE_INVALID");
  const match = /^data:[a-z0-9.+/-]*;base64,([A-Za-z0-9+/]+={0,2})$/i.exec(
    value,
  );
  if (!match) invalidProduct("PRODUCT_FILE_INVALID");
  const buffer = Buffer.from(match[1]!, "base64");
  if (
    !buffer.length ||
    buffer.length > maxBytes ||
    buffer.toString("base64") !== match[1]
  )
    invalidProduct("PRODUCT_FILE_INVALID");
  return buffer;
}

export function validateProductFile(kind: DigitalKind, value: unknown) {
  const record = asRecord(value);
  const name = requiredString(record, "name")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\x00-\x1f\x7f]/g, "")
    .slice(0, 160);
  const format = name.split(".").pop()?.toLowerCase();
  const allowed = kind === "LUT" ? ["cube"] : ["xmp", "lrtemplate"];
  if (!format || !allowed.includes(format))
    invalidProduct("PRODUCT_FILE_INVALID");
  const buffer = decodeProductUpload(record.dataUrl, 8 * 1024 * 1024);
  const content = buffer.toString("utf8");
  if (content.includes("\u0000") || content.includes("\ufffd"))
    invalidProduct("PRODUCT_FILE_INVALID");
  if (format === "cube") {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    const sizes = lines.filter((line) => /^LUT_[13]D_SIZE\s/.test(line));
    if (sizes.length !== 1) invalidProduct("PRODUCT_FILE_INVALID");
    const size = /^LUT_([13])D_SIZE\s+(\d+)$/.exec(sizes[0]!);
    if (
      !size ||
      Number(size[2]) < 2 ||
      Number(size[2]) > (size[1] === "3" ? 65 : 65536)
    )
      invalidProduct("PRODUCT_FILE_INVALID");
    let rows = 0;
    for (const line of lines) {
      if (/^(TITLE\s+".*"|LUT_[13]D_SIZE\s+\d+)$/.test(line)) continue;
      const values = line.replace(/^DOMAIN_(MIN|MAX)\s+/, "").split(/\s+/);
      if (
        values.length !== 3 ||
        values.some(
          (item) =>
            !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(item) ||
            !Number.isFinite(Number(item)),
        )
      )
        invalidProduct("PRODUCT_FILE_INVALID");
      if (!/^DOMAIN_(MIN|MAX)\s/.test(line)) rows++;
    }
    if (rows !== Number(size[2]) ** Number(size[1]))
      invalidProduct("PRODUCT_FILE_INVALID");
  } else if (format === "xmp") {
    if (
      /<!DOCTYPE|<!ENTITY/i.test(content) ||
      !/<(?:\w+:)?RDF\b/.test(content) ||
      !/crs:[A-Za-z]+/.test(content) ||
      !content.includes("http://ns.adobe.com/camera-raw-settings/")
    )
      invalidProduct("PRODUCT_FILE_INVALID");
  } else if (
    !/settings\s*=\s*\{/.test(content) ||
    !/type\s*=\s*["']Develop["']/.test(content)
  )
    invalidProduct("PRODUCT_FILE_INVALID");
  return { buffer, format: `.${format.toUpperCase()}`, name };
}

export function readProductFiles(value: unknown): ProductFile[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (file): file is ProductFile =>
      file !== null &&
      typeof file === "object" &&
      typeof file.id === "string" &&
      typeof file.key === "string" &&
      typeof file.name === "string" &&
      typeof file.size === "number" &&
      typeof file.format === "string",
  );
}

export async function createProductCover(buffer: Buffer) {
  try {
    const image = sharp(buffer, {
      limitInputPixels: 24_000_000,
      animated: false,
    }).rotate();
    const metadata = await image.metadata();
    if (
      (!["jpeg", "png", "webp"].includes(metadata.format ?? "") &&
        !(metadata.format === "heif" && metadata.compression === "av1")) ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) > 1
    )
      invalidProduct("PRODUCT_COVER_INVALID");
    const cover = await image
      .resize(1200, 750, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
    const pixels = await sharp(cover)
      .resize(80, 50, { fit: "fill" })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer();
    return { buffer: cover, palette: paletteFromPixels(pixels) };
  } catch {
    invalidProduct("PRODUCT_COVER_INVALID");
  }
}
