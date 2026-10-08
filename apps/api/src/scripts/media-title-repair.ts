import {
  assetMediaType,
  generateMediaTitle,
  isTechnicalMediaTitle,
  titleFromFilename,
} from "@gprn/domain";

interface RepairableWork {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly deletedAt?: Date | null;
  readonly assets: readonly {
    readonly type: string;
    readonly contentType?: string;
  }[];
  readonly provenanceEvents: readonly { readonly evidence: unknown }[];
}

export function planMediaTitleRepairs(
  photos: readonly RepairableWork[],
  locale: string,
  renamedIds: ReadonlySet<string>,
) {
  const sequences = new Map<string, number>();
  const repairs: { id: string; previous: string; title: string }[] = [];
  for (const photo of photos) {
    if (photo.deletedAt || photo.title.startsWith("__profile_")) continue;
    const sequence = sequences.get(photo.ownerId) ?? 0;
    sequences.set(photo.ownerId, sequence + 1);
    if (renamedIds.has(photo.id) || !isTechnicalMediaTitle(photo.title))
      continue;
    const filenameTitle = photo.provenanceEvents.some((event) => {
      const evidence = event.evidence;
      return (
        evidence &&
        typeof evidence === "object" &&
        "fileName" in evidence &&
        typeof evidence.fileName === "string" &&
        titleFromFilename(evidence.fileName) === photo.title
      );
    });
    if (filenameTitle)
      repairs.push({
        id: photo.id,
        previous: photo.title,
        title: generateMediaTitle(
          locale,
          assetMediaType(photo.assets),
          sequence,
        ),
      });
  }
  return repairs;
}
