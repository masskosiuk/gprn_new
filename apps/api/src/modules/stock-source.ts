export function stockSourceResponse(
  provider: string | null | undefined,
  metadata: unknown,
) {
  if (
    provider !== "stock-demo" ||
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  )
    return null;
  const record = metadata as Record<string, unknown>;
  if (
    typeof record.credit !== "string" ||
    !record.credit.trim() ||
    typeof record.sourcePage !== "string"
  )
    return null;
  try {
    const url = new URL(record.sourcePage);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return { credit: record.credit.trim(), sourcePage: url.href };
  } catch {
    return null;
  }
}
