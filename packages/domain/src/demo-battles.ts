export const demoBattleAuthors = [
  {
    key: "mika",
    id: "de000001-0000-4000-8000-000000000001",
    name: "Mika Tanaka",
    username: "demo.mika.tanaka",
    city: "tokyo",
    country: "japan",
    tier: "STAR",
    rating: 1532,
    avatarUrl:
      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=600&h=600&q=84",
  },
  {
    key: "elena",
    id: "de000001-0000-4000-8000-000000000002",
    name: "Elena Moreau",
    username: "demo.elena.moreau",
    city: "reykjavik",
    country: "iceland",
    tier: "PROFESSIONAL",
    rating: 1608,
    avatarUrl:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=600&h=600&q=84",
  },
  {
    key: "yusuf",
    id: "de000001-0000-4000-8000-000000000003",
    name: "Yusuf Amrani",
    username: "demo.yusuf.amrani",
    city: "marrakech",
    country: "morocco",
    tier: "EXPERIENCED",
    rating: 1496,
    avatarUrl:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&h=600&q=84",
  },
  {
    key: "anna",
    id: "de000001-0000-4000-8000-000000000004",
    name: "Anna Kovalenko",
    username: "demo.anna.kovalenko",
    city: "kyiv",
    country: "ukraine",
    tier: "PROFESSIONAL",
    rating: 1574,
    avatarUrl:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&h=600&q=84",
  },
  {
    key: "joao",
    id: "de000001-0000-4000-8000-000000000005",
    name: "Joao Silva",
    username: "demo.joao.silva",
    city: "lisbon",
    country: "portugal",
    tier: "BEGINNER",
    rating: 1498,
    avatarUrl:
      "https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?auto=format&fit=crop&w=600&h=600&q=84",
  },
  {
    key: "lucas",
    id: "de000001-0000-4000-8000-000000000006",
    name: "Lucas Meyer",
    username: "demo.lucas.meyer",
    city: "paris",
    country: "france",
    tier: "STAR",
    rating: 1612,
    avatarUrl:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&h=600&q=84",
  },
] as const;

export const demoBattlePhotos = [
  {
    id: "de000002-0000-4000-8000-000000000001",
    curatedId: "curated-tokyo",
    author: "mika",
    category: "street",
    title: "Crosswalk after rain",
    titleKey: "data.photo.tokyo.title",
    imageUrl:
      "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "de000002-0000-4000-8000-000000000002",
    curatedId: "curated-lisbon-blue",
    author: "joao",
    category: "street",
    title: "Blue hour tram",
    titleKey: "data.photo.lisbonBlue.title",
    imageUrl:
      "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1200&q=82",
  },
  {
    id: "de000002-0000-4000-8000-000000000003",
    curatedId: "curated-tokyo-neon",
    author: "mika",
    category: "street",
    title: "Neon pulse",
    titleKey: "data.photo.tokyoNeon.title",
    imageUrl:
      "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1200&q=82",
  },
  {
    id: "de000002-0000-4000-8000-000000000004",
    curatedId: "curated-paris-midnight",
    author: "lucas",
    category: "street",
    title: "Midnight reflections",
    titleKey: "data.photo.parisMidnight.title",
    imageUrl:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=82",
  },
  {
    id: "de000002-0000-4000-8000-000000000005",
    curatedId: "curated-kyiv-concrete",
    author: "anna",
    category: "architecture",
    title: "Concrete cadence",
    titleKey: "data.photo.kyivConcrete.title",
    imageUrl:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=82",
  },
  {
    id: "de000002-0000-4000-8000-000000000006",
    curatedId: "curated-lisbon-tiles",
    author: "joao",
    category: "architecture",
    title: "Tiled silence",
    titleKey: "data.photo.lisbonTiles.title",
    imageUrl:
      "https://images.unsplash.com/photo-1529260830199-42c24126f198?auto=format&fit=crop&w=1200&q=82",
  },
  {
    id: "de000002-0000-4000-8000-000000000007",
    curatedId: "curated-tokyo-umbrellas",
    author: "mika",
    category: "documentary",
    title: "Morning umbrellas",
    titleKey: "data.photo.tokyoUmbrellas.title",
    imageUrl:
      "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=1200&q=82",
  },
  {
    id: "de000002-0000-4000-8000-000000000008",
    curatedId: "curated-marrakech-copper",
    author: "yusuf",
    category: "documentary",
    title: "Copper light",
    titleKey: "data.photo.marrakechCopper.title",
    imageUrl:
      "https://images.unsplash.com/photo-1539020140153-e479b8c22e70?auto=format&fit=crop&w=1200&q=82",
  },
  {
    id: "de000002-0000-4000-8000-000000000009",
    curatedId: "curated-iceland-glacier",
    author: "elena",
    category: "nature",
    title: "Glacial breath",
    titleKey: "data.photo.icelandGlacier.title",
    imageUrl:
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=82",
  },
  {
    id: "de000002-0000-4000-8000-000000000010",
    curatedId: "curated-patagonia",
    author: "lucas",
    category: "nature",
    title: "Patagonia wind",
    titleKey: "data.photo.patagonia.title",
    imageUrl:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80",
  },
] as const;

export const demoBattles = [
  {
    id: "de000003-0000-4000-8000-000000000001",
    titleKey: "data.battle.cityRhythm",
    category: "street",
    durationDays: 3,
    photoIds: [demoBattlePhotos[0].id, demoBattlePhotos[1].id],
  },
  {
    id: "de000003-0000-4000-8000-000000000002",
    titleKey: "data.battle.nightPulse",
    category: "street",
    durationDays: 4,
    photoIds: [demoBattlePhotos[2].id, demoBattlePhotos[3].id],
  },
  {
    id: "de000003-0000-4000-8000-000000000003",
    titleKey: "data.battle.formAndPattern",
    category: "architecture",
    durationDays: 5,
    photoIds: [demoBattlePhotos[4].id, demoBattlePhotos[5].id],
  },
  {
    id: "de000003-0000-4000-8000-000000000004",
    titleKey: "data.battle.storiesWithoutWords",
    category: "documentary",
    durationDays: 6,
    photoIds: [demoBattlePhotos[6].id, demoBattlePhotos[7].id],
  },
  {
    id: "de000003-0000-4000-8000-000000000005",
    titleKey: "data.battle.mountainBreath",
    category: "nature",
    durationDays: 7,
    photoIds: [demoBattlePhotos[8].id, demoBattlePhotos[9].id],
  },
] as const;

export function demoBattleEndsAt(durationDays: number, now = new Date()): Date {
  return new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
}
