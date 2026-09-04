"use client";

import { EloRatingEngine } from "@gprn/domain";
import { getMessage, supportedLocales, type MessageKey, type SupportedLocale } from "@gprn/i18n";
import {
  BadgeCheck,
  Bell,
  Camera,
  Check,
  ChevronRight,
  CircleUserRound,
  Compass,
  Crown,
  Download,
  ExternalLink,
  Filter,
  Globe2,
  Grid3X3,
  Heart,
  ImagePlus,
  Link2,
  LockKeyhole,
  LogIn,
  LogOut,
  MapPin,
  Medal,
  PackageCheck,
  Search,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Star,
  Swords,
  Trophy,
  Trash2,
  Unlink,
  Upload,
  UserCircle,
  UserPlus,
  X,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { InteractivePhotoMap, type PhotoMapMarker } from "./interactive-photo-map";
import { getSectionHref, type SectionId } from "./sections";

type AuthMode = "login" | "register";
type CategoryId = "street" | "landscape" | "portrait" | "documentary" | "architecture" | "nature";
type CategoryFilter = "all" | CategoryId;
type BattleScope = "global" | "country" | "city" | "season" | "friend";
type BattleFilter = "all" | BattleScope;
type LeaderboardScope = "global" | "city" | "category";
type LocationId = "paris" | "kyiv" | "tokyo" | "reykjavik" | "lisbon" | "marrakech";
type LocationFilter = "all" | LocationId;
type SocialPlatformId = "instagram" | "facebook" | "artstation" | "adobe" | "behance";

interface HomeClientProps {
  readonly initialSection: SectionId;
  readonly locale: SupportedLocale;
}

interface NavItem {
  readonly Icon: LucideIcon;
  readonly id: SectionId;
  readonly messageKey: MessageKey;
}

interface SectionMeta {
  readonly introKey: MessageKey;
  readonly titleKey: MessageKey;
}

interface AuthForm {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

interface Feedback {
  readonly kind: "error" | "success";
  readonly text: string;
}

interface LocalNotification {
  readonly createdAt: string;
  readonly id: string;
  readonly messageKey: MessageKey;
  readonly read: boolean;
}

interface AccountRecord {
  readonly availableForHire: boolean;
  readonly avatarUrl?: string;
  readonly battles: number;
  readonly bio: string;
  readonly coverUrl?: string;
  readonly email: string;
  readonly followers: number;
  readonly following: number;
  readonly joinedAt: string;
  readonly location: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly rating: number;
  readonly socialLinks?: SocialLinks;
  readonly username: string;
  readonly website: string;
  readonly wins: number;
}

interface SocialLinkRecord {
  readonly avatarUrl?: string;
  readonly displayName?: string;
  readonly url: string;
  readonly username?: string;
}

type SocialLinks = Partial<Record<SocialPlatformId, SocialLinkRecord>>;

interface SocialProviderRecord {
  readonly connectedAt?: string | null;
  readonly connectionId?: string | null;
  readonly id: SocialPlatformId;
  readonly profile?: SocialLinkRecord | null;
  readonly reason: "ADOBE_PROFILE_UNAVAILABLE" | "OFFICIAL_API_UNAVAILABLE" | "PROFESSIONAL_ACCOUNT_REQUIRED" | null;
  readonly status: "AVAILABLE" | "NEEDS_CONFIGURATION" | "NOT_SUPPORTED";
}

interface ProfileForm {
  readonly availableForHire: boolean;
  readonly bio: string;
  readonly displayName: string;
  readonly location: string;
  readonly username: string;
  readonly website: string;
}

interface PhotoRecord {
  readonly authorKey?: MessageKey;
  readonly authorName?: string;
  readonly categoryId: CategoryId;
  readonly checksum?: string;
  readonly contentType?: string;
  readonly fileName?: string;
  readonly id: string;
  readonly isMine: boolean;
  readonly locationId: LocationId;
  readonly locationLabel?: string;
  readonly originKey: MessageKey;
  readonly provenanceKey: MessageKey;
  readonly published: boolean;
  readonly score: number;
  readonly sizeLabel?: string;
  readonly src: string;
  readonly title?: string;
  readonly titleKey?: MessageKey;
  readonly uploadedAt?: string;
  readonly votes: number;
}

interface BattleEntry {
  readonly id: string;
  readonly imageUrl: string;
  readonly isMine?: boolean;
  readonly locationId: LocationId;
  readonly photographerKey?: MessageKey;
  readonly photographerName?: string;
  readonly photoId?: string;
  readonly rating: number;
  readonly title?: string;
  readonly titleKey?: MessageKey;
  readonly votes: number;
}

interface BattleRecord {
  readonly categoryId: CategoryId;
  readonly endsAt: string;
  readonly entries: readonly [BattleEntry, BattleEntry];
  readonly id: string;
  readonly scope: BattleScope;
  readonly statusKey: MessageKey;
  readonly title?: string;
  readonly titleKey?: MessageKey;
}

interface ChallengeRecord {
  readonly categoryId: CategoryId;
  readonly copyKey: MessageKey;
  readonly deadline: string;
  readonly id: string;
  readonly participants: number;
  readonly statusKey: MessageKey;
  readonly titleKey: MessageKey;
}

interface LeaderboardRow {
  readonly avatarUrl: string;
  readonly battles: number;
  readonly change: number;
  readonly locationId: LocationId;
  readonly nameKey: MessageKey;
  readonly rating: number;
}

interface LocationPin {
  readonly id: LocationId;
  readonly key: MessageKey;
  readonly latitude: number;
  readonly longitude: number;
}

interface MarketplaceProduct {
  readonly copyKey: MessageKey;
  readonly id: string;
  readonly imageUrl: string;
  readonly kindKey: MessageKey;
  readonly price: string;
  readonly sellerKey: MessageKey;
  readonly titleKey: MessageKey;
}

interface ExpertRecord {
  readonly avatarUrl: string;
  readonly headlineKey: MessageKey;
  readonly id: string;
  readonly languages: readonly SupportedLocale[];
  readonly nameKey: MessageKey;
  readonly rating: string;
  readonly reviews: number;
  readonly specialtyKey: MessageKey;
}

const accountStorageKey = "gprn.account.v2";
const sessionStorageKey = "gprn.session.v2";
const photosStorageKey = "gprn.photos.v2";
const battleVotesStorageKey = "gprn.battleVotes.v2";
const challengeEntriesStorageKey = "gprn.challengeEntries.v2";
const seasonJoinedStorageKey = "gprn.seasonJoined.v2";
const savedPhotosStorageKey = "gprn.savedPhotos.v2";
const wishlistStorageKey = "gprn.marketWishlist.v2";
const expertWaitlistStorageKey = "gprn.expertWaitlist.v2";
const notificationsStorageKey = "gprn.notifications.v2";
const deletionRequestStorageKey = "gprn.deletionRequested.v2";
const localeCookieName = "gprn_locale";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ratingEngine = new EloRatingEngine();

const emptyAuthForm: AuthForm = {
  email: "",
  name: "",
  password: ""
};

const emptyProfileForm: ProfileForm = {
  availableForHire: true,
  bio: "",
  displayName: "",
  location: "",
  username: "",
  website: ""
};

const navItems: readonly NavItem[] = [
  { Icon: Compass, id: "home", messageKey: "nav.home" },
  { Icon: ImagePlus, id: "discover", messageKey: "nav.discover" },
  { Icon: Swords, id: "battles", messageKey: "nav.battles" },
  { Icon: BadgeCheck, id: "challenges", messageKey: "nav.challenges" },
  { Icon: Medal, id: "leaderboard", messageKey: "nav.leaderboard" },
  { Icon: MapPin, id: "map", messageKey: "nav.map" },
  { Icon: ShoppingBag, id: "marketplace", messageKey: "nav.marketplace" },
  { Icon: Trophy, id: "experts", messageKey: "nav.experts" },
  { Icon: UserCircle, id: "profile", messageKey: "nav.profile" }
];

const sectionMeta: Record<Exclude<SectionId, "home">, SectionMeta> = {
  battles: {
    introKey: "section.battles.intro",
    titleKey: "section.battles.title"
  },
  challenges: {
    introKey: "section.challenges.intro",
    titleKey: "section.challenges.title"
  },
  discover: {
    introKey: "section.discover.intro",
    titleKey: "section.discover.title"
  },
  experts: {
    introKey: "section.experts.intro",
    titleKey: "section.experts.title"
  },
  leaderboard: {
    introKey: "section.leaderboard.intro",
    titleKey: "section.leaderboard.title"
  },
  map: {
    introKey: "section.map.intro",
    titleKey: "section.map.title"
  },
  marketplace: {
    introKey: "section.marketplace.intro",
    titleKey: "section.marketplace.title"
  },
  profile: {
    introKey: "section.profile.intro",
    titleKey: "section.profile.title"
  }
};

const categoryFilters: readonly { id: CategoryFilter; key: MessageKey }[] = [
  { id: "all", key: "category.all" },
  { id: "street", key: "category.street" },
  { id: "landscape", key: "category.landscape" },
  { id: "portrait", key: "category.portrait" },
  { id: "documentary", key: "category.documentary" },
  { id: "architecture", key: "category.architecture" },
  { id: "nature", key: "category.nature" }
];

const battleFilters: readonly { id: BattleFilter; key: MessageKey }[] = [
  { id: "all", key: "battles.scope.all" },
  { id: "global", key: "battles.scope.global" },
  { id: "country", key: "battles.scope.country" },
  { id: "city", key: "battles.scope.city" },
  { id: "season", key: "battles.scope.season" },
  { id: "friend", key: "battles.scope.friend" }
];

const leaderboardScopes: readonly { id: LeaderboardScope; key: MessageKey }[] = [
  { id: "global", key: "leaderboard.scope.global" },
  { id: "city", key: "leaderboard.scope.city" },
  { id: "category", key: "leaderboard.scope.category" }
];

const locationFilters: readonly { id: LocationFilter; key: MessageKey }[] = [
  { id: "all", key: "map.location.all" },
  { id: "paris", key: "map.location.paris" },
  { id: "kyiv", key: "map.location.kyiv" },
  { id: "tokyo", key: "map.location.tokyo" },
  { id: "reykjavik", key: "map.location.reykjavik" },
  { id: "lisbon", key: "map.location.lisbon" },
  { id: "marrakech", key: "map.location.marrakech" }
];

const externalPhotoProviders: readonly { id: string; key: MessageKey }[] = [
  { id: "google-drive", key: "photo.importDrive" },
  { id: "dropbox", key: "photo.importDropbox" },
  { id: "adobe", key: "photo.importAdobe" },
  { id: "onedrive", key: "photo.importOneDrive" },
  { id: "flickr", key: "photo.importFlickr" },
  { id: "500px", key: "photo.importFiveHundredPx" },
  { id: "behance", key: "photo.importBehance" },
  { id: "connected-source", key: "photo.importConnected" }
];

const socialPlatforms: readonly {
  readonly id: SocialPlatformId;
  readonly key: MessageKey;
  readonly mark: string;
}[] = [
  {
    id: "instagram",
    key: "social.instagram",
    mark: "IG"
  },
  {
    id: "facebook",
    key: "social.facebook",
    mark: "f"
  },
  {
    id: "artstation",
    key: "social.artstation",
    mark: "A"
  },
  {
    id: "adobe",
    key: "social.adobe",
    mark: "Ad"
  },
  {
    id: "behance",
    key: "social.behance",
    mark: "Be"
  }
];

const defaultSocialProviders: readonly SocialProviderRecord[] = socialPlatforms.map((platform) => ({
  id: platform.id,
  reason:
    platform.id === "instagram"
      ? "PROFESSIONAL_ACCOUNT_REQUIRED"
      : platform.id === "adobe"
        ? "ADOBE_PROFILE_UNAVAILABLE"
        : platform.id === "facebook"
          ? null
          : "OFFICIAL_API_UNAVAILABLE",
  status: platform.id === "facebook" || platform.id === "instagram" ? "NEEDS_CONFIGURATION" : "NOT_SUPPORTED"
}));

const legalPolicies: readonly { id: string; titleKey: MessageKey }[] = [
  { id: "privacy", titleKey: "legal.privacy.title" },
  { id: "terms", titleKey: "legal.terms.title" },
  { id: "cookie", titleKey: "legal.cookie.title" },
  { id: "copyright", titleKey: "legal.copyright.title" },
  { id: "dispute", titleKey: "legal.dispute.title" },
  { id: "community", titleKey: "legal.community.title" }
];

const sampleImages = {
  architecture:
    "https://images.unsplash.com/photo-1486718448742-163732cd1544?auto=format&fit=crop&w=1200&q=80",
  city:
    "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1200&q=80",
  desert:
    "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80",
  mountain:
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80",
  night:
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80",
  street:
    "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80",
  tram:
    "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=1200&q=80"
} as const;

const curatedPhotos: readonly PhotoRecord[] = [
  {
    authorKey: "data.author.mika",
    categoryId: "street",
    id: "curated-tokyo",
    isMine: false,
    locationId: "tokyo",
    originKey: "status.directUpload",
    provenanceKey: "status.originalSupported",
    published: true,
    score: 91,
    src: sampleImages.city,
    titleKey: "data.photo.tokyo.title",
    votes: 284
  },
  {
    authorKey: "data.author.elena",
    categoryId: "landscape",
    id: "curated-iceland",
    isMine: false,
    locationId: "reykjavik",
    originKey: "status.directUpload",
    provenanceKey: "status.originalSupported",
    published: true,
    score: 88,
    src: sampleImages.mountain,
    titleKey: "data.photo.iceland.title",
    votes: 219
  },
  {
    authorKey: "data.author.yusuf",
    categoryId: "documentary",
    id: "curated-marrakech",
    isMine: false,
    locationId: "marrakech",
    originKey: "status.directUpload",
    provenanceKey: "status.metadataPending",
    published: true,
    score: 84,
    src: sampleImages.desert,
    titleKey: "data.photo.marrakech.title",
    votes: 173
  },
  {
    authorKey: "data.author.anna",
    categoryId: "architecture",
    id: "curated-kyiv",
    isMine: false,
    locationId: "kyiv",
    originKey: "status.directUpload",
    provenanceKey: "status.originalSupported",
    published: true,
    score: 86,
    src: sampleImages.architecture,
    titleKey: "data.photo.kyiv.title",
    votes: 196
  },
  {
    authorKey: "data.author.joao",
    categoryId: "street",
    id: "curated-lisbon",
    isMine: false,
    locationId: "lisbon",
    originKey: "status.directUpload",
    provenanceKey: "status.originalSupported",
    published: true,
    score: 81,
    src: sampleImages.tram,
    titleKey: "data.photo.lisbon.title",
    votes: 143
  },
  {
    authorKey: "data.author.lucas",
    categoryId: "nature",
    id: "curated-patagonia",
    isMine: false,
    locationId: "paris",
    originKey: "status.directUpload",
    provenanceKey: "status.metadataPending",
    published: true,
    score: 83,
    src: sampleImages.night,
    titleKey: "data.photo.patagonia.title",
    votes: 151
  }
];

const initialBattles: readonly BattleRecord[] = [
  {
    categoryId: "street",
    endsAt: "2026-09-04T18:00:00.000Z",
    entries: [
      {
        id: "battle-rain-a",
        imageUrl: sampleImages.city,
        locationId: "tokyo",
        photographerKey: "data.author.mika",
        rating: 1532,
        titleKey: "data.photo.tokyo.title",
        votes: 51
      },
      {
        id: "battle-rain-b",
        imageUrl: sampleImages.tram,
        locationId: "lisbon",
        photographerKey: "data.author.joao",
        rating: 1498,
        titleKey: "data.photo.lisbon.title",
        votes: 47
      }
    ],
    id: "street-rain",
    scope: "global",
    statusKey: "battles.open",
    titleKey: "data.battle.streetRain"
  },
  {
    categoryId: "landscape",
    endsAt: "2026-09-06T20:00:00.000Z",
    entries: [
      {
        id: "battle-light-a",
        imageUrl: sampleImages.mountain,
        locationId: "reykjavik",
        photographerKey: "data.author.elena",
        rating: 1601,
        titleKey: "data.photo.iceland.title",
        votes: 64
      },
      {
        id: "battle-light-b",
        imageUrl: sampleImages.night,
        locationId: "paris",
        photographerKey: "data.author.lucas",
        rating: 1574,
        titleKey: "data.photo.patagonia.title",
        votes: 58
      }
    ],
    id: "landscape-light",
    scope: "season",
    statusKey: "battles.open",
    titleKey: "data.battle.landscapeLight"
  },
  {
    categoryId: "architecture",
    endsAt: "2026-09-03T16:00:00.000Z",
    entries: [
      {
        id: "battle-geometry-a",
        imageUrl: sampleImages.architecture,
        locationId: "kyiv",
        photographerKey: "data.author.anna",
        rating: 1510,
        titleKey: "data.photo.kyiv.title",
        votes: 33
      },
      {
        id: "battle-geometry-b",
        imageUrl: sampleImages.street,
        locationId: "paris",
        photographerKey: "data.author.yusuf",
        rating: 1487,
        titleKey: "data.photo.marrakech.title",
        votes: 29
      }
    ],
    id: "city-geometry",
    scope: "city",
    statusKey: "battles.open",
    titleKey: "data.battle.cityGeometry"
  }
];

const challenges: readonly ChallengeRecord[] = [
  {
    categoryId: "street",
    copyKey: "data.challenge.cityNight.copy",
    deadline: "2026-09-18T21:00:00.000Z",
    id: "city-night",
    participants: 428,
    statusKey: "challenges.statusOpen",
    titleKey: "data.challenge.cityNight"
  },
  {
    categoryId: "architecture",
    copyKey: "data.challenge.humanScale.copy",
    deadline: "2026-09-24T21:00:00.000Z",
    id: "human-scale",
    participants: 211,
    statusKey: "challenges.statusOpen",
    titleKey: "data.challenge.humanScale"
  },
  {
    categoryId: "landscape",
    copyKey: "data.challenge.wildWeather.copy",
    deadline: "2026-10-02T21:00:00.000Z",
    id: "wild-weather",
    participants: 96,
    statusKey: "challenges.statusUpcoming",
    titleKey: "data.challenge.wildWeather"
  }
];

const leaderboardRows: readonly LeaderboardRow[] = [
  {
    avatarUrl: sampleImages.city,
    battles: 72,
    change: 4,
    locationId: "tokyo",
    nameKey: "data.author.mika",
    rating: 1824
  },
  {
    avatarUrl: sampleImages.mountain,
    battles: 68,
    change: 2,
    locationId: "reykjavik",
    nameKey: "data.author.elena",
    rating: 1792
  },
  {
    avatarUrl: sampleImages.architecture,
    battles: 59,
    change: 7,
    locationId: "kyiv",
    nameKey: "data.author.anna",
    rating: 1711
  },
  {
    avatarUrl: sampleImages.desert,
    battles: 64,
    change: -1,
    locationId: "marrakech",
    nameKey: "data.author.yusuf",
    rating: 1688
  },
  {
    avatarUrl: sampleImages.tram,
    battles: 45,
    change: 3,
    locationId: "lisbon",
    nameKey: "data.author.joao",
    rating: 1634
  }
];

const locationPins: readonly LocationPin[] = [
  { id: "paris", key: "map.location.paris", latitude: 48.8566, longitude: 2.3522 },
  { id: "kyiv", key: "map.location.kyiv", latitude: 50.4501, longitude: 30.5234 },
  { id: "tokyo", key: "map.location.tokyo", latitude: 35.6762, longitude: 139.6503 },
  { id: "reykjavik", key: "map.location.reykjavik", latitude: 64.1466, longitude: -21.9426 },
  { id: "lisbon", key: "map.location.lisbon", latitude: 38.7223, longitude: -9.1393 },
  { id: "marrakech", key: "map.location.marrakech", latitude: 31.6295, longitude: -7.9811 }
];

const marketplaceProducts: readonly MarketplaceProduct[] = [
  {
    copyKey: "data.market.print.copy",
    id: "print-city",
    imageUrl: sampleImages.architecture,
    kindKey: "marketplace.print",
    price: "$120",
    sellerKey: "data.author.anna",
    titleKey: "data.market.print.title"
  },
  {
    copyKey: "data.market.license.copy",
    id: "license-street",
    imageUrl: sampleImages.city,
    kindKey: "marketplace.license",
    price: "$49",
    sellerKey: "data.author.mika",
    titleKey: "data.market.license.title"
  },
  {
    copyKey: "data.market.preset.copy",
    id: "preset-doc",
    imageUrl: sampleImages.desert,
    kindKey: "marketplace.preset",
    price: "$29",
    sellerKey: "data.author.yusuf",
    titleKey: "data.market.preset.title"
  }
];

const experts: readonly ExpertRecord[] = [
  {
    avatarUrl: sampleImages.desert,
    headlineKey: "data.expert.iryna.headline",
    id: "iryna",
    languages: ["uk", "en"],
    nameKey: "data.expert.iryna",
    rating: "4.9",
    reviews: 128,
    specialtyKey: "category.documentary"
  },
  {
    avatarUrl: sampleImages.street,
    headlineKey: "data.expert.marcus.headline",
    id: "marcus",
    languages: ["en", "de"],
    nameKey: "data.expert.marcus",
    rating: "4.8",
    reviews: 94,
    specialtyKey: "category.portrait"
  },
  {
    avatarUrl: sampleImages.mountain,
    headlineKey: "data.expert.sofia.headline",
    id: "sofia",
    languages: ["fr", "en"],
    nameKey: "data.expert.sofia",
    rating: "4.9",
    reviews: 156,
    specialtyKey: "category.landscape"
  }
];

export function HomeClient({ initialSection, locale }: HomeClientProps): ReactNode {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isHydrated, setHydrated] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [isAuthOpen, setAuthOpen] = useState(false);
  const [isAddPhotoOpen, setAddPhotoOpen] = useState(false);
  const [authForm, setAuthForm] = useState<AuthForm>(emptyAuthForm);
  const [authFeedback, setAuthFeedback] = useState<Feedback | null>(null);
  const [globalFeedback, setGlobalFeedback] = useState<Feedback | null>(null);
  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [socialProviders, setSocialProviders] = useState<readonly SocialProviderRecord[]>(defaultSocialProviders);
  const [socialSessionReady, setSocialSessionReady] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState<PhotoRecord[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string>("");
  const [photoFeedback, setPhotoFeedback] = useState<Feedback | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [battleFilter, setBattleFilter] = useState<BattleFilter>("all");
  const [battles, setBattles] = useState<BattleRecord[]>(() => [...initialBattles]);
  const [battleVotes, setBattleVotes] = useState<Record<string, string>>({});
  const [challengeEntries, setChallengeEntries] = useState<Record<string, string>>({});
  const [seasonJoined, setSeasonJoined] = useState(false);
  const [leaderboardScope, setLeaderboardScope] = useState<LeaderboardScope>("global");
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");
  const [savedPhotoIds, setSavedPhotoIds] = useState<string[]>([]);
  const [wishlistProductIds, setWishlistProductIds] = useState<string[]>([]);
  const [expertWaitlistIds, setExpertWaitlistIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<LocalNotification[]>([]);
  const [deletionRequested, setDeletionRequested] = useState(false);

  const currentProfile = account && sessionEmail === account.email ? account : null;
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const allPhotos = useMemo<readonly PhotoRecord[]>(() => [...uploadedPhotos, ...curatedPhotos], [uploadedPhotos]);
  const publicPhotos = useMemo(() => allPhotos.filter((photo) => photo.published || photo.isMine), [allPhotos]);
  const selectedUploadedPhoto =
    uploadedPhotos.find((photo) => photo.id === selectedPhotoId) ?? uploadedPhotos[0] ?? null;
  const visiblePhotos = publicPhotos.filter((photo) => {
    const query = searchTerm.trim().toLocaleLowerCase(locale);
    const title = getPhotoTitle(photo, locale).toLocaleLowerCase(locale);
    const author = getPhotoAuthor(photo, locale).toLocaleLowerCase(locale);
    const location = getLocationLabel(photo.locationId, locale, photo.locationLabel).toLocaleLowerCase(locale);
    const categoryMatches = categoryFilter === "all" || photo.categoryId === categoryFilter;
    const queryMatches = !query || title.includes(query) || author.includes(query) || location.includes(query);

    return categoryMatches && queryMatches;
  });
  const visibleBattles = battles.filter((battle) => battleFilter === "all" || battle.scope === battleFilter);
  const visibleMapPhotos = publicPhotos.filter((photo) => locationFilter === "all" || photo.locationId === locationFilter);
  const profilePhotos = uploadedPhotos.filter((photo) => photo.isMine);
  const mapLocations = useMemo(
    () =>
      locationPins.map((location) => ({
        ...location,
        label: getMessage(locale, location.key)
      })),
    [locale]
  );
  const mapPhotoMarkers = useMemo<readonly PhotoMapMarker[]>(() => {
    const locationPhotoCounts = new Map<LocationId, number>();

    return publicPhotos.map((photo) => {
      const location = locationPins.find((candidate) => candidate.id === photo.locationId) ?? locationPins[0]!;
      const locationPhotoIndex = locationPhotoCounts.get(location.id) ?? 0;
      locationPhotoCounts.set(location.id, locationPhotoIndex + 1);
      const angle = (locationPhotoIndex * 137.5 * Math.PI) / 180;
      const radius = locationPhotoIndex === 0 ? 0 : 0.045 * Math.ceil(locationPhotoIndex / 5);

      return {
        id: location.id,
        imageUrl: photo.src,
        label: getLocationLabel(location.id, locale, photo.locationLabel),
        latitude: location.latitude + Math.cos(angle) * radius,
        longitude: location.longitude + Math.sin(angle) * radius,
        photoId: photo.id,
        title: getPhotoTitle(photo, locale)
      };
    });
  }, [locale, publicPhotos]);

  useEffect(() => {
    setAccount(readLocalStorage<AccountRecord | null>(accountStorageKey, null));
    setSessionEmail(readLocalStorage<string | null>(sessionStorageKey, null));
    setUploadedPhotos(
      readLocalStorage<PhotoRecord[]>(photosStorageKey, []).map((photo) => ({
        ...photo,
        published: Boolean(photo.published)
      }))
    );
    setBattleVotes(readLocalStorage<Record<string, string>>(battleVotesStorageKey, {}));
    setChallengeEntries(readLocalStorage<Record<string, string>>(challengeEntriesStorageKey, {}));
    setSeasonJoined(readLocalStorage<boolean>(seasonJoinedStorageKey, false));
    setSavedPhotoIds(readLocalStorage<string[]>(savedPhotosStorageKey, []));
    setWishlistProductIds(readLocalStorage<string[]>(wishlistStorageKey, []));
    setExpertWaitlistIds(readLocalStorage<string[]>(expertWaitlistStorageKey, []));
    setNotifications(readLocalStorage<LocalNotification[]>(notificationsStorageKey, []));
    setDeletionRequested(readLocalStorage<boolean>(deletionRequestStorageKey, false));
    setHydrated(true);
  }, []);

  useEffect(() => {
    writeLocaleCookie(locale);
  }, [locale]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeLocalStorage(accountStorageKey, account);
  }, [account, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeLocalStorage(sessionStorageKey, sessionEmail);
  }, [isHydrated, sessionEmail]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeLocalStorage(photosStorageKey, uploadedPhotos);
  }, [isHydrated, uploadedPhotos]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeLocalStorage(battleVotesStorageKey, battleVotes);
  }, [battleVotes, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeLocalStorage(challengeEntriesStorageKey, challengeEntries);
  }, [challengeEntries, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeLocalStorage(seasonJoinedStorageKey, seasonJoined);
  }, [isHydrated, seasonJoined]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeLocalStorage(savedPhotosStorageKey, savedPhotoIds);
  }, [isHydrated, savedPhotoIds]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeLocalStorage(wishlistStorageKey, wishlistProductIds);
  }, [isHydrated, wishlistProductIds]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeLocalStorage(expertWaitlistStorageKey, expertWaitlistIds);
  }, [expertWaitlistIds, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeLocalStorage(notificationsStorageKey, notifications);
  }, [isHydrated, notifications]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeLocalStorage(deletionRequestStorageKey, deletionRequested);
  }, [deletionRequested, isHydrated]);

  useEffect(() => {
    if (!currentProfile) {
      setProfileForm(emptyProfileForm);
      setSocialSessionReady(false);
      return;
    }

    setProfileForm({
      availableForHire: currentProfile.availableForHire,
      bio: currentProfile.bio,
      displayName: currentProfile.name,
      location: currentProfile.location,
      username: currentProfile.username,
      website: currentProfile.website
    });
  }, [currentProfile?.email]);

  useEffect(() => {
    if (!isHydrated) return;
    void refreshSocialConnections(Boolean(currentProfile));
  }, [currentProfile?.email, isHydrated]);

  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("social");
    if (!outcome) return;

    setGlobalFeedback({
      kind: outcome === "connected" ? "success" : "error",
      text: outcome === "connected" ? t("social.connectionSuccess") : t("social.connectionFailed")
    });
    router.replace(getSectionHref(locale, "profile"));
  }, [locale, router]);

  useEffect(() => {
    if (!isAuthOpen && !isAddPhotoOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setAuthOpen(false);
        setAddPhotoOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAddPhotoOpen, isAuthOpen]);

  function t(key: MessageKey): string {
    return getMessage(locale, key);
  }

  function openPhotoPicker(): void {
    fileInputRef.current?.click();
  }

  function openCoverPicker(): void {
    coverInputRef.current?.click();
  }

  function openAvatarPicker(): void {
    avatarInputRef.current?.click();
  }

  function openAddPhoto(): void {
    setPhotoFeedback(null);
    setAddPhotoOpen(true);
  }

  function chooseDeviceUpload(): void {
    setAddPhotoOpen(false);
    openPhotoPicker();
  }

  function openAuth(mode: AuthMode): void {
    setAuthMode(mode);
    setAuthFeedback(null);
    setAuthOpen(true);
  }

  async function refreshSocialConnections(includeMine: boolean): Promise<void> {
    try {
      const availability = await apiRequest<{ providers: readonly SocialProviderRecord[] }>(
        "/social-connections/providers"
      );
      setSocialProviders(availability.providers);

      if (!includeMine) return;

      const connected = await apiRequest<{ providers: readonly SocialProviderRecord[] }>("/social-connections");
      setSocialProviders(connected.providers);
      setSocialSessionReady(true);

      const socialLinks: SocialLinks = {};
      for (const provider of connected.providers) {
        if (provider.profile?.url) socialLinks[provider.id] = provider.profile;
      }
      setAccount((current) => (current ? { ...current, socialLinks } : current));
    } catch {
      setSocialSessionReady(false);
    }
  }

  function connectSocialProvider(provider: SocialPlatformId): void {
    if (!socialSessionReady) {
      setGlobalFeedback({ kind: "error", text: t("social.sessionRequired") });
      openAuth("login");
      return;
    }

    const returnTo = getSectionHref(locale, "profile");
    window.location.assign(
      `${getApiRoot()}/social-connections/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`
    );
  }

  async function disconnectSocialProvider(provider: SocialPlatformId): Promise<void> {
    try {
      await apiRequest(`/social-connections/${provider}`, { method: "DELETE" });
      setAccount((current) => {
        if (!current) return current;
        const socialLinks = { ...current.socialLinks };
        delete socialLinks[provider];
        return { ...current, socialLinks };
      });
      await refreshSocialConnections(true);
      setGlobalFeedback({ kind: "success", text: t("social.disconnected") });
    } catch {
      setGlobalFeedback({ kind: "error", text: t("social.connectionFailed") });
    }
  }

  function handleLanguageChange(event: ChangeEvent<HTMLSelectElement>): void {
    const nextLocale = event.target.value as SupportedLocale;
    writeLocaleCookie(nextLocale);
    router.push(getSectionHref(nextLocale, initialSection));
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setPhotoFeedback({ kind: "error", text: t("photo.invalid") });
      return;
    }

    const src = await readFileAsDataUrl(file);
    const checksum = await createLocalChecksum(file, src);
    const title = makePhotoTitle(file.name);
    const uploadedPhoto: PhotoRecord = {
      authorName: currentProfile?.name,
      categoryId: "documentary",
      checksum,
      contentType: file.type || "image",
      fileName: file.name,
      id: `local-photo-${Date.now()}`,
      isMine: true,
      locationId: "kyiv",
      locationLabel: currentProfile?.location,
      originKey: "status.directUpload",
      provenanceKey: "status.originalSupported",
      published: false,
      score: 0,
      sizeLabel: formatFileSize(file.size),
      src,
      title,
      uploadedAt: new Date().toISOString(),
      votes: 0
    };

    setUploadedPhotos((current) => [uploadedPhoto, ...current]);
    setSelectedPhotoId(uploadedPhoto.id);
    setPhotoFeedback({ kind: "success", text: t("photo.saved") });

  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";

    if (!file || !currentProfile) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setGlobalFeedback({ kind: "error", text: t("photo.invalid") });
      return;
    }

    try {
      const avatarUrl = await readFileAsDataUrl(file);
      setAccount({ ...currentProfile, avatarUrl });
      setGlobalFeedback({ kind: "success", text: t("photo.avatarSaved") });
    } catch {
      setGlobalFeedback({ kind: "error", text: t("photo.invalid") });
    }
  }

  async function handleCoverChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";

    if (!file || !currentProfile) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setGlobalFeedback({ kind: "error", text: t("photo.invalid") });
      return;
    }

    try {
      const coverUrl = await readFileAsDataUrl(file);
      setAccount({ ...currentProfile, coverUrl });
      setGlobalFeedback({ kind: "success", text: t("profile.coverSaved") });
    } catch {
      setGlobalFeedback({ kind: "error", text: t("photo.invalid") });
    }
  }

  function updateAuthField(field: keyof AuthForm, value: string): void {
    setAuthForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function establishServerSession(
    mode: AuthMode,
    profile: AccountRecord,
    password: string
  ): Promise<boolean> {
    const registerBody = {
      displayName: profile.name,
      email: profile.email,
      password,
      username: profile.username
    };
    const loginBody = { email: profile.email, password };
    const attempts =
      mode === "register"
        ? ([
            ["/auth/register", registerBody],
            ["/auth/login", loginBody]
          ] as const)
        : ([
            ["/auth/login", loginBody],
            ["/auth/register", registerBody]
          ] as const);

    for (const [path, body] of attempts) {
      try {
        await apiRequest(path, { body: JSON.stringify(body), method: "POST" });
        return true;
      } catch {
        // A second attempt migrates an existing local account or resumes an existing server account.
      }
    }

    return false;
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const email = authForm.email.trim().toLocaleLowerCase();
    const password = authForm.password;

    if (authMode === "register") {
      const name = authForm.name.trim();

      if (name.length < 2 || !emailPattern.test(email) || password.length < 8) {
        setAuthFeedback({ kind: "error", text: t("auth.validation") });
        return;
      }

      const passwordHash = await hashSecret(email, password);
      const newAccount: AccountRecord = {
        availableForHire: true,
        battles: 0,
        bio: t("profile.defaultBio"),
        email,
        followers: 128,
        following: 42,
        joinedAt: new Date().toISOString(),
        location: t("profile.defaultLocation"),
        name,
        passwordHash,
        rating: 1500,
        username: makeUsername(name, email),
        website: "https://gprn.example/profile",
        wins: 0
      };

      const serverReady = await establishServerSession("register", newAccount, password);
      setAccount(newAccount);
      setSessionEmail(email);
      setSocialSessionReady(serverReady);
      setAuthForm(emptyAuthForm);
      setAuthFeedback({ kind: "success", text: t("auth.success") });
      setGlobalFeedback({ kind: "success", text: t("auth.success") });
      setAuthOpen(false);
      if (serverReady) void refreshSocialConnections(true);
      router.push(getSectionHref(locale, "profile"));
      return;
    }

    if (!emailPattern.test(email) || password.length === 0) {
      setAuthFeedback({ kind: "error", text: t("auth.loginValidation") });
      return;
    }

    if (!account || account.email !== email) {
      setAuthFeedback({ kind: "error", text: t("auth.accountMissing") });
      return;
    }

    const passwordHash = await hashSecret(email, password);

    if (account.passwordHash !== passwordHash) {
      setAuthFeedback({ kind: "error", text: t("auth.badPassword") });
      return;
    }

    const serverReady = await establishServerSession("login", account, password);
    setSessionEmail(email);
    setSocialSessionReady(serverReady);
    setAuthForm(emptyAuthForm);
    setAuthFeedback({ kind: "success", text: t("auth.loginSuccess") });
    setGlobalFeedback({ kind: "success", text: t("auth.loginSuccess") });
    setAuthOpen(false);
    if (serverReady) void refreshSocialConnections(true);
  }

  function logOut(): void {
    void apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
    setSessionEmail(null);
    setSocialSessionReady(false);
    setGlobalFeedback({ kind: "success", text: t("auth.loggedOut") });
  }

  function updateProfileField(field: keyof ProfileForm, value: string | boolean): void {
    setProfileForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function saveProfile(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!currentProfile) {
      openAuth("login");
      return;
    }

    setAccount({
      ...currentProfile,
      availableForHire: profileForm.availableForHire,
      bio: profileForm.bio.trim() || t("profile.defaultBio"),
      location: profileForm.location.trim() || t("profile.defaultLocation"),
      name: profileForm.displayName.trim() || currentProfile.name,
      username: normalizeUsername(profileForm.username) || currentProfile.username,
      website: profileForm.website.trim()
    });
    setGlobalFeedback({ kind: "success", text: t("profile.saved") });
  }

  function publishPhoto(photoId: string): void {
    if (!currentProfile) {
      openAuth("login");
      setGlobalFeedback({ kind: "error", text: t("photo.publishRequiresLogin") });
      return;
    }

    setUploadedPhotos((currentPhotos) =>
      currentPhotos.map((photo) =>
        photo.id === photoId
          ? {
              ...photo,
              authorName: currentProfile.name,
              locationLabel: photo.locationLabel || currentProfile.location,
              published: true,
              uploadedAt: photo.uploadedAt ?? new Date().toISOString()
            }
          : photo
      )
    );
    setGlobalFeedback({ kind: "success", text: t("photo.published") });
    pushNotification("notifications.photoPublished");
  }

  function toggleSavePhoto(photoId: string): void {
    setSavedPhotoIds((current) =>
      current.includes(photoId) ? current.filter((savedPhotoId) => savedPhotoId !== photoId) : [...current, photoId]
    );
  }

  function pushNotification(messageKey: MessageKey): void {
    setNotifications((current) => [
      { createdAt: new Date().toISOString(), id: `notification-${Date.now()}-${current.length}`, messageKey, read: false },
      ...current
    ].slice(0, 50));
  }

  async function shareItem(title: string, path: string): Promise<void> {
    const url = new URL(path, window.location.origin).toString();

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      setGlobalFeedback({ kind: "success", text: t("share.done") });
    } catch {
      setGlobalFeedback({ kind: "error", text: t("share.failed") });
    }
  }

  function exportLocalData(): void {
    if (!currentProfile) {
      openAuth("login");
      return;
    }

    const payload = JSON.stringify(
      {
        account: currentProfile,
        battleVotes,
        challengeEntries,
        exportedAt: new Date().toISOString(),
        notifications,
        photos: uploadedPhotos,
        savedPhotoIds,
        seasonJoined
      },
      null,
      2
    );
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gprn-${currentProfile.username}-export.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setGlobalFeedback({ kind: "success", text: t("privacy.exported") });
  }

  function requestAccountDeletion(): void {
    setDeletionRequested(true);
    setGlobalFeedback({ kind: "success", text: t("privacy.deleteRequested") });
  }

  function voteBattle(battleId: string, entryId: string): void {
    if (!currentProfile) {
      openAuth("login");
      setGlobalFeedback({ kind: "error", text: t("battles.signIn") });
      return;
    }

    if (battleVotes[battleId]) {
      setGlobalFeedback({ kind: "error", text: t("battles.duplicate") });
      return;
    }

    setBattles((currentBattles) =>
      currentBattles.map((battle) => {
        if (battle.id !== battleId) {
          return battle;
        }

        const [firstEntry, secondEntry] = battle.entries;
        const winningEntry = firstEntry.id === entryId ? firstEntry : secondEntry.id === entryId ? secondEntry : null;
        const losingEntry = winningEntry?.id === firstEntry.id ? secondEntry : firstEntry;

        if (!winningEntry) {
          return battle;
        }

        const ratingChange = ratingEngine.calculateBattleWin({
          loserRating: losingEntry.rating,
          winnerRating: winningEntry.rating
        });

        const updatedEntries = battle.entries.map((entry) => {
          if (entry.id === winningEntry.id) {
            return {
              ...entry,
              rating: ratingChange.winnerRating,
              votes: entry.votes + 1
            };
          }

          if (entry.id === losingEntry.id) {
            return {
              ...entry,
              rating: ratingChange.loserRating
            };
          }

          return entry;
        }) as [BattleEntry, BattleEntry];

        return {
          ...battle,
          entries: updatedEntries
        };
      })
    );
    setBattleVotes((currentVotes) => ({
      ...currentVotes,
      [battleId]: entryId
    }));
    setGlobalFeedback({ kind: "success", text: t("battles.voted") });
    pushNotification("notifications.battleVote");
  }

  function joinBattle(): void {
    if (!currentProfile) {
      openAuth("login");
      setGlobalFeedback({ kind: "error", text: t("battles.needLogin") });
      return;
    }

    if (!selectedUploadedPhoto) {
      setGlobalFeedback({ kind: "error", text: t("battles.needPhoto") });
      return;
    }

    if (!selectedUploadedPhoto.published) {
      setGlobalFeedback({ kind: "error", text: t("battles.needPublished") });
      return;
    }

    const opponent = curatedPhotos[0];

    if (!opponent?.titleKey || !opponent.authorKey) {
      return;
    }

    const battleId = `local-battle-${Date.now()}`;
    const newBattle: BattleRecord = {
      categoryId: selectedUploadedPhoto.categoryId,
      endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      entries: [
        {
          id: `${battleId}-mine`,
          imageUrl: selectedUploadedPhoto.src,
          isMine: true,
          locationId: selectedUploadedPhoto.locationId,
          photographerName: currentProfile.name,
          photoId: selectedUploadedPhoto.id,
          rating: currentProfile.rating,
          title: getPhotoTitle(selectedUploadedPhoto, locale),
          votes: 0
        },
        {
          id: `${battleId}-opponent`,
          imageUrl: opponent.src,
          locationId: opponent.locationId,
          photographerKey: opponent.authorKey,
          rating: 1504,
          titleKey: opponent.titleKey,
          votes: 0
        }
      ],
      id: battleId,
      scope: "friend",
      statusKey: "battles.open",
      titleKey: "data.battle.localTitle"
    };

    setBattles((currentBattles) => [newBattle, ...currentBattles]);
    setBattleFilter("all");
    setGlobalFeedback({ kind: "success", text: t("battles.joined") });
    pushNotification("notifications.battleJoined");
  }

  function joinSeason(): void {
    if (!currentProfile) {
      openAuth("login");
      setGlobalFeedback({ kind: "error", text: t("season.needLogin") });
      return;
    }

    setSeasonJoined(true);
    setGlobalFeedback({ kind: "success", text: t("season.joined") });
    pushNotification("notifications.seasonJoined");
  }

  function submitChallenge(challengeId: string): void {
    if (!currentProfile) {
      openAuth("login");
      setGlobalFeedback({ kind: "error", text: t("challenges.needLogin") });
      return;
    }

    if (!selectedUploadedPhoto) {
      setGlobalFeedback({ kind: "error", text: t("challenges.needPhoto") });
      return;
    }

    setChallengeEntries((currentEntries) => ({
      ...currentEntries,
      [challengeId]: selectedUploadedPhoto.id
    }));
    setGlobalFeedback({ kind: "success", text: t("challenges.submitted") });
    pushNotification("notifications.challengeSubmitted");
  }

  function toggleWishlist(productId: string): void {
    setWishlistProductIds((current) =>
      current.includes(productId) ? current.filter((itemId) => itemId !== productId) : [...current, productId]
    );
  }

  function toggleExpertWaitlist(expertId: string): void {
    setExpertWaitlistIds((current) =>
      current.includes(expertId) ? current.filter((itemId) => itemId !== expertId) : [...current, expertId]
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href={getSectionHref(locale, "home")}>
          <span className="brand-mark">{t("app.shortName").slice(0, 1)}</span>
          <span>{t("app.name")}</span>
        </Link>

        <nav aria-label={t("nav.home")} className="nav">
          {navItems.map(({ Icon, id, messageKey }) => (
            <Link
              aria-current={initialSection === id ? "page" : undefined}
              className={`nav-button${initialSection === id ? " is-active" : ""}`}
              href={getSectionHref(locale, id)}
              key={id}
            >
              <Icon aria-hidden="true" size={15} />
              <span>{t(messageKey)}</span>
            </Link>
          ))}
        </nav>

        <div className="header-tools">
          <label className="language-picker">
            <Globe2 aria-hidden="true" size={16} />
            <span className="visually-hidden">{t("language.label")}</span>
            <select aria-label={t("language.label")} onChange={handleLanguageChange} value={locale}>
              {supportedLocales.map((supportedLocale) => (
                <option key={supportedLocale} value={supportedLocale}>
                  {supportedLocale.toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          {currentProfile ? (
            <>
              <Link className="user-pill" href={getSectionHref(locale, "profile")}>
                {currentProfile.avatarUrl ? (
                  <img alt={t("profile.avatarAlt")} src={currentProfile.avatarUrl} />
                ) : (
                  <span>{getInitials(currentProfile.name)}</span>
                )}
                <strong>{currentProfile.name}</strong>
              </Link>
              <button className="icon-text-button" onClick={logOut} type="button">
                <LogOut aria-hidden="true" size={17} />
                <span>{t("auth.logout")}</span>
              </button>
            </>
          ) : (
            <>
              <button
                className="icon-text-button"
                onClick={() => {
                  openAuth("login");
                }}
                type="button"
              >
                <LogIn aria-hidden="true" size={17} />
                <span>{t("auth.login")}</span>
              </button>
              <button
                className="header-action"
                onClick={() => {
                  openAuth("register");
                }}
                type="button"
              >
                <UserPlus aria-hidden="true" size={17} />
                <span>{t("auth.join")}</span>
              </button>
            </>
          )}
        </div>
      </header>

      <input
        accept="image/*"
        className="visually-hidden"
        onChange={(event) => {
          void handlePhotoChange(event);
        }}
        ref={fileInputRef}
        type="file"
      />
      <input
        accept="image/*"
        aria-label={t("profile.addCover")}
        className="visually-hidden"
        onChange={(event) => {
          void handleCoverChange(event);
        }}
        ref={coverInputRef}
        type="file"
      />
      <input
        accept="image/*"
        aria-label={t("profile.addAvatar")}
        className="visually-hidden"
        onChange={(event) => {
          void handleAvatarChange(event);
        }}
        ref={avatarInputRef}
        type="file"
      />

      {globalFeedback ? (
        <div className={`toast ${globalFeedback.kind}`} role="status">
          {globalFeedback.text}
        </div>
      ) : null}

      {initialSection === "home" ? renderHomePage() : renderSectionPage(initialSection)}

      {renderFooter()}
      {isAuthOpen ? renderAuthDialog() : null}
      {isAddPhotoOpen ? renderAddPhotoDialog() : null}
    </main>
  );

  function renderHomePage(): ReactNode {
    return (
      <>
        <section className="hero" id="home-hero">
          <div className="hero-copy">
            <span className="eyebrow">{t("app.tagline")}</span>
            <h1>{t("home.headline")}</h1>
            <p>{t("home.subhead")}</p>

            <div className="hero-actions">
              <button className="primary-action" onClick={openAddPhoto} type="button">
                <Camera aria-hidden="true" size={18} />
                {t("home.primary")}
              </button>
              <button
                className="secondary-action"
                onClick={() => {
                  openAuth(currentProfile ? "login" : "register");
                }}
                type="button"
              >
                <UserPlus aria-hidden="true" size={18} />
                {currentProfile ? t("auth.login") : t("home.secondary")}
              </button>
            </div>

            <div className="metric-row">
              {[
                ["18K", "home.metric.photographers"],
                [numberFormatter.format(battles.length), "home.metric.battles"],
                ["240+", "home.metric.cities"]
              ].map(([value, key]) => (
                <div className="metric" key={key}>
                  <strong>{value}</strong>
                  <span>{t(key as MessageKey)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-board" aria-live="polite">
            <div className="hero-photo">
              <img
                alt={getPhotoTitle(selectedUploadedPhoto ?? curatedPhotos[0], locale)}
                src={selectedUploadedPhoto?.src ?? sampleImages.city}
              />
            </div>
            <div className="hero-side">
              <div className="mini-card">
                <ShieldCheck aria-hidden="true" size={20} />
                <strong>{t("photo.provenanceTitle")}</strong>
                <span>{selectedUploadedPhoto?.checksum ?? t("status.originalSupported")}</span>
              </div>
              <div className="mini-card">
                <Trophy aria-hidden="true" size={20} />
                <strong>{t("section.battles.title")}</strong>
                <span>{t("battles.open")}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="home-band">
          <div>
            <span className="eyebrow">{t("common.localOnly")}</span>
            <h2>{t("home.sectionTitle")}</h2>
            <p>{t("home.sectionCopy")}</p>
          </div>
          <button className="primary-action" onClick={openAddPhoto} type="button">
            <Camera aria-hidden="true" size={18} />
            {t("photo.add")}
          </button>
        </section>

        <section className="page-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("home.previewTitle")}</span>
              <h2>{t("home.previewCopy")}</h2>
            </div>
          </div>
          <div className="feature-grid">
            {navItems
              .filter((item) => item.id !== "home")
              .map(({ Icon, id, messageKey }) => {
                const meta = sectionMeta[id as Exclude<SectionId, "home">];

                return (
                  <Link className="feature-card" href={getSectionHref(locale, id)} key={id}>
                    <Icon aria-hidden="true" size={22} />
                    <strong>{t(messageKey)}</strong>
                    <span>{t(meta.introKey)}</span>
                    <ChevronRight aria-hidden="true" className="feature-arrow" size={18} />
                  </Link>
                );
              })}
          </div>
        </section>
      </>
    );
  }

  function renderSectionPage(sectionId: Exclude<SectionId, "home">): ReactNode {
    const meta = sectionMeta[sectionId];

    return (
      <>
        <section className="page-intro">
          <div>
            <h1>{t(meta.titleKey)}</h1>
            <p>{t(meta.introKey)}</p>
          </div>
          <div className="intro-actions">
            <button className="primary-action" onClick={openAddPhoto} type="button">
              <Camera aria-hidden="true" size={18} />
              {t("photo.add")}
            </button>
            {!currentProfile ? (
              <button
                className="secondary-action"
                onClick={() => {
                  openAuth("login");
                }}
                type="button"
              >
                <LogIn aria-hidden="true" size={18} />
                {t("auth.login")}
              </button>
            ) : null}
          </div>
        </section>

        {sectionId === "discover" ? renderDiscoverPage() : null}
        {sectionId === "battles" ? renderBattlesPage() : null}
        {sectionId === "challenges" ? renderChallengesPage() : null}
        {sectionId === "leaderboard" ? renderLeaderboardPage() : null}
        {sectionId === "map" ? renderMapPage() : null}
        {sectionId === "marketplace" ? renderMarketplacePage() : null}
        {sectionId === "experts" ? renderExpertsPage() : null}
        {sectionId === "profile" ? renderProfilePage() : null}
      </>
    );
  }

  function renderDiscoverPage(): ReactNode {
    return (
      <section className="workspace-grid">
        <div className="main-column">
          <div className="toolbar">
            <label className="search-box">
              <Search aria-hidden="true" size={18} />
              <span className="visually-hidden">{t("common.search")}</span>
              <input
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                }}
                placeholder={t("discover.searchPlaceholder")}
                type="search"
                value={searchTerm}
              />
            </label>
            <label className="select-box">
              <Filter aria-hidden="true" size={18} />
              <span className="visually-hidden">{t("discover.category")}</span>
              <select
                onChange={(event) => {
                  setCategoryFilter(event.target.value as CategoryFilter);
                }}
                value={categoryFilter}
              >
                {categoryFilters.map((filter) => (
                  <option key={filter.id} value={filter.id}>
                    {t(filter.key)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("discover.featured")}</span>
              <h2>{t("section.discover.title")}</h2>
            </div>
            <span className="count-pill">{numberFormatter.format(visiblePhotos.length)}</span>
          </div>

          {visiblePhotos.length > 0 ? (
            <div className="photo-gallery">{visiblePhotos.map((photo) => renderPhotoCard(photo))}</div>
          ) : (
            <p className="empty-state">{t("discover.empty")}</p>
          )}
        </div>

        <div className="side-column">
          <button className="primary-action full-width" onClick={openAddPhoto} type="button">
            <Camera aria-hidden="true" size={18} />
            {t("photo.add")}
          </button>
          {renderProvenancePanel()}
        </div>
      </section>
    );
  }

  function renderProvenancePanel(): ReactNode {
    return (
      <aside className="info-panel">
        <div className="panel-title">
          <ShieldCheck aria-hidden="true" size={20} />
          <div>
            <h2>{t("photo.provenanceTitle")}</h2>
            <p>{t("photo.provenanceSummary")}</p>
          </div>
        </div>
        <dl className="definition-list">
          <div>
            <dt>{t("photo.originalFile")}</dt>
            <dd>{selectedUploadedPhoto ? selectedUploadedPhoto.fileName : t("photo.empty")}</dd>
          </div>
          <div>
            <dt>{t("photo.metadata")}</dt>
            <dd>{selectedUploadedPhoto?.checksum ?? t("status.metadataPending")}</dd>
          </div>
          <div>
            <dt>{t("photo.captureLocation")}</dt>
            <dd>
              {selectedUploadedPhoto
                ? getLocationLabel(selectedUploadedPhoto.locationId, locale, selectedUploadedPhoto.locationLabel)
                : t("map.location.note")}
            </dd>
          </div>
        </dl>
      </aside>
    );
  }

  function renderPhotoCard(photo: PhotoRecord): ReactNode {
    const isSaved = savedPhotoIds.includes(photo.id);

    return (
      <article className="photo-card" key={photo.id}>
        <img alt={getPhotoTitle(photo, locale)} src={photo.src} />
        <div className="photo-card-body">
          <div>
            <strong>{getPhotoTitle(photo, locale)}</strong>
            <span>{getPhotoAuthor(photo, locale)}</span>
          </div>
          <div className="meta-row">
            <span>
              <MapPin aria-hidden="true" size={14} />
              {getLocationLabel(photo.locationId, locale, photo.locationLabel)}
            </span>
            <span>{t(getCategoryKey(photo.categoryId))}</span>
          </div>
          {photo.isMine ? (
            <div className="photo-status-row">
              <span className={`photo-status ${photo.published ? "is-public" : "is-draft"}`}>
                {photo.published ? t("photo.public") : t("photo.draft")}
              </span>
            </div>
          ) : null}
          <div className="photo-actions">
            <button
              aria-label={isSaved ? t("discover.unsave") : t("discover.save")}
              className={`icon-button${isSaved ? " is-active" : ""}`}
              onClick={() => {
                toggleSavePhoto(photo.id);
              }}
              title={isSaved ? t("discover.unsave") : t("discover.save")}
              type="button"
            >
              <Heart aria-hidden="true" fill={isSaved ? "currentColor" : "none"} size={18} />
            </button>
            <button
              aria-label={t("common.share")}
              className="icon-button"
              onClick={() => {
                void shareItem(getPhotoTitle(photo, locale), `/${locale}/discover?photo=${photo.id}`);
              }}
              title={t("common.share")}
              type="button"
            >
              <Share2 aria-hidden="true" size={18} />
            </button>
            {photo.isMine ? (
              <>
                {!photo.published ? (
                  <button
                    className="primary-action compact"
                    onClick={() => {
                      publishPhoto(photo.id);
                    }}
                    type="button"
                  >
                    <Upload aria-hidden="true" size={16} />
                    {t("photo.publish")}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  function renderBattlesPage(): ReactNode {
    return (
      <section className="workspace-grid battles-grid">
        <aside className="side-column">
          <div className="info-panel">
            <div className="panel-title">
              <Swords aria-hidden="true" size={20} />
              <div>
                <h2>{t("battles.joinTitle")}</h2>
                <p>{t("battles.joinCopy")}</p>
              </div>
            </div>
            <label className="select-box full-width">
              <Grid3X3 aria-hidden="true" size={18} />
              <span className="visually-hidden">{t("common.selectPhoto")}</span>
              <select
                disabled={uploadedPhotos.length === 0}
                onChange={(event) => {
                  setSelectedPhotoId(event.target.value);
                }}
                value={selectedUploadedPhoto?.id ?? ""}
              >
                {uploadedPhotos.length === 0 ? (
                  <option value="">{t("photo.empty")}</option>
                ) : (
                  uploadedPhotos.map((photo) => (
                    <option key={photo.id} value={photo.id}>
                      {getPhotoTitle(photo, locale)} - {photo.published ? t("photo.public") : t("photo.draft")}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button className="primary-action full-width" onClick={joinBattle} type="button">
              <Trophy aria-hidden="true" size={18} />
              {t("battles.join")}
            </button>
          </div>

          <div className="segmented vertical">
            {battleFilters.map((filter) => (
              <button
                className={battleFilter === filter.id ? "is-active" : ""}
                key={filter.id}
                onClick={() => {
                  setBattleFilter(filter.id);
                }}
                type="button"
              >
                {t(filter.key)}
              </button>
            ))}
          </div>
        </aside>

        <div className="main-column battle-list">
          {visibleBattles.length > 0 ? (
            visibleBattles.map((battle) => renderBattleCard(battle))
          ) : (
            <p className="empty-state">{t("battles.noResults")}</p>
          )}
        </div>
      </section>
    );
  }

  function renderBattleCard(battle: BattleRecord): ReactNode {
    const selectedEntryId = battleVotes[battle.id];
    const totalVotes = battle.entries.reduce((sum, entry) => sum + entry.votes, 0);

    return (
      <article className="battle-card" key={battle.id}>
        <div className="battle-head">
          <div>
            <span className="eyebrow">{t(getBattleScopeKey(battle.scope))}</span>
            <h2>{battle.title ?? (battle.titleKey ? t(battle.titleKey) : t("section.battles.title"))}</h2>
          </div>
          <div className="battle-status">
            <span>{t(battle.statusKey)}</span>
            <small>
              {t("battles.ends")} {formatDate(locale, battle.endsAt)}
            </small>
            <button
              aria-label={t("common.share")}
              className="icon-button"
              onClick={() => {
                void shareItem(
                  battle.title ?? (battle.titleKey ? t(battle.titleKey) : t("section.battles.title")),
                  `/${locale}/battles?battle=${battle.id}`
                );
              }}
              title={t("common.share")}
              type="button"
            >
              <Share2 aria-hidden="true" size={16} />
            </button>
          </div>
        </div>

        <div className="battle-entries">
          {battle.entries.map((entry) => {
            const isSelected = selectedEntryId === entry.id;
            const voteShare = totalVotes > 0 ? Math.round((entry.votes / totalVotes) * 100) : 0;

            return (
              <div className={`battle-entry${isSelected ? " is-selected" : ""}`} key={entry.id}>
                <img
                  alt={entry.title ?? (entry.titleKey ? t(entry.titleKey) : t("photo.selected"))}
                  src={entry.imageUrl}
                />
                <div className="battle-entry-body">
                  <div>
                    <strong>{entry.title ?? (entry.titleKey ? t(entry.titleKey) : t("photo.selected"))}</strong>
                    <span>{entry.photographerName ?? (entry.photographerKey ? t(entry.photographerKey) : t("common.you"))}</span>
                  </div>
                  <div className="meta-row">
                    <span>{getLocationLabel(entry.locationId, locale)}</span>
                    <span>
                      {t("common.rating")} {numberFormatter.format(entry.rating)}
                    </span>
                  </div>
                  <div className="vote-bar" aria-hidden="true">
                    <span style={{ width: `${voteShare}%` }} />
                  </div>
                  <div className="battle-actions">
                    <span>
                      {numberFormatter.format(entry.votes)} {t("common.votes")}
                    </span>
                    <button
                      className="primary-action compact"
                      disabled={Boolean(selectedEntryId)}
                      onClick={() => {
                        voteBattle(battle.id, entry.id);
                      }}
                      type="button"
                    >
                      {isSelected ? t("battles.voted") : t("battles.vote")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </article>
    );
  }

  function renderChallengesPage(): ReactNode {
    return (
      <section className="page-section">
        <div className="notice-panel season-panel">
          <Trophy aria-hidden="true" size={22} />
          <div>
            <strong>{t("season.title")}</strong>
            <p>{t("season.copy")}</p>
            <span className="season-status">
              {t("season.status")}: {seasonJoined ? t("season.joined") : t("common.available")}
            </span>
          </div>
          <button className="primary-action compact" disabled={seasonJoined} onClick={joinSeason} type="button">
            <Check aria-hidden="true" size={16} />
            {seasonJoined ? t("season.joined") : t("season.join")}
          </button>
        </div>

        <div className="challenge-grid">
          {challenges.map((challenge) => {
            const submittedPhotoId = challengeEntries[challenge.id];
            const submittedPhoto = uploadedPhotos.find((photo) => photo.id === submittedPhotoId);

            return (
              <article className="challenge-card" key={challenge.id}>
                <div className="challenge-top">
                  <span className="pill">{t(challenge.statusKey)}</span>
                  <span>{t(getCategoryKey(challenge.categoryId))}</span>
                </div>
                <h2>{t(challenge.titleKey)}</h2>
                <p>{t(challenge.copyKey)}</p>
                <dl className="stats-list">
                  <div>
                    <dt>{t("challenges.participants")}</dt>
                    <dd>{numberFormatter.format(challenge.participants)}</dd>
                  </div>
                  <div>
                    <dt>{t("challenges.deadline")}</dt>
                    <dd>{formatDate(locale, challenge.deadline)}</dd>
                  </div>
                </dl>
                {submittedPhoto ? (
                  <div className="selected-file compact-file">
                    <img alt={getPhotoTitle(submittedPhoto, locale)} src={submittedPhoto.src} />
                    <div>
                      <strong>{t("challenges.already")}</strong>
                      <span>{getPhotoTitle(submittedPhoto, locale)}</span>
                    </div>
                  </div>
                ) : null}
                <button
                  className="primary-action full-width"
                  disabled={Boolean(submittedPhotoId)}
                  onClick={() => {
                    submitChallenge(challenge.id);
                  }}
                  type="button"
                >
                  <Check aria-hidden="true" size={18} />
                  {submittedPhotoId ? t("challenges.already") : t("challenges.submit")}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderLeaderboardPage(): ReactNode {
    const scopeOffset = leaderboardScope === "global" ? 0 : leaderboardScope === "city" ? -37 : 24;
    const rows = [...leaderboardRows]
      .map((row, index) => ({
        ...row,
        rating: row.rating + scopeOffset - index * 3
      }))
      .concat(
        currentProfile
          ? [
              {
                avatarUrl: currentProfile.avatarUrl ?? sampleImages.street,
                battles: currentProfile.battles + Object.keys(battleVotes).length,
                change: 12,
                locationId: "kyiv" as LocationId,
                nameKey: "common.you" as MessageKey,
                rating: currentProfile.rating + Object.keys(battleVotes).length * 8
              }
            ]
          : []
      )
      .sort((first, second) => second.rating - first.rating);

    return (
      <section className="page-section">
        <div className="segmented">
          {leaderboardScopes.map((scope) => (
            <button
              className={leaderboardScope === scope.id ? "is-active" : ""}
              key={scope.id}
              onClick={() => {
                setLeaderboardScope(scope.id);
              }}
              type="button"
            >
              {t(scope.key)}
            </button>
          ))}
        </div>

        <div className="leaderboard-table" role="table">
          <div className="leaderboard-row is-head" role="row">
            <span>{t("leaderboard.rank")}</span>
            <span>{t("leaderboard.photographer")}</span>
            <span>{t("leaderboard.reputation")}</span>
            <span>{t("leaderboard.change")}</span>
            <span>{t("leaderboard.battles")}</span>
          </div>
          {rows.map((row, index) => (
            <div className={`leaderboard-row${row.nameKey === "common.you" ? " is-you" : ""}`} key={`${row.nameKey}-${index}`} role="row">
              <span>{index + 1}</span>
              <span className="leaderboard-person">
                <img alt={t(row.nameKey)} src={row.avatarUrl} />
                <strong>{row.nameKey === "common.you" && currentProfile ? currentProfile.name : t(row.nameKey)}</strong>
                <small>{getLocationLabel(row.locationId, locale)}</small>
              </span>
              <span>{numberFormatter.format(row.rating)}</span>
              <span className={row.change >= 0 ? "positive" : "negative"}>{row.change >= 0 ? `+${row.change}` : row.change}</span>
              <span>{numberFormatter.format(row.battles)}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderMapPage(): ReactNode {
    return (
      <section className="workspace-grid">
        <div className="main-column">
          <InteractivePhotoMap
            activeLocationId={locationFilter}
            ariaLabel={t("map.pins")}
            locations={mapLocations}
            markers={mapPhotoMarkers}
            onLocationSelect={(locationId) => {
              setLocationFilter(locationId as LocationFilter);
            }}
          />
          <p className="helper-message">{t("map.location.note")}</p>
        </div>

        <aside className="side-column">
          <div className="segmented vertical">
            {locationFilters.map((filter) => (
              <button
                className={locationFilter === filter.id ? "is-active" : ""}
                key={filter.id}
                onClick={() => {
                  setLocationFilter(filter.id);
                }}
                type="button"
              >
                {t(filter.key)}
              </button>
            ))}
          </div>
          <div className="info-panel">
            <div className="panel-title">
              <MapPin aria-hidden="true" size={20} />
              <div>
                <h2>{t("map.photosHere")}</h2>
                <p>{numberFormatter.format(visibleMapPhotos.length)}</p>
              </div>
            </div>
          </div>
        </aside>

        <div className="main-column full-span">
          <div className="photo-gallery">{visibleMapPhotos.map((photo) => renderPhotoCard(photo))}</div>
        </div>
      </section>
    );
  }

  function renderMarketplacePage(): ReactNode {
    return (
      <section className="page-section">
        <div className="notice-panel">
          <PackageCheck aria-hidden="true" size={22} />
          <div>
            <strong>{t("status.paymentsDisabled")}</strong>
            <p>{t("marketplace.checkoutDisabled")}</p>
          </div>
        </div>

        <div className="product-grid">
          {marketplaceProducts.map((product) => {
            const isSaved = wishlistProductIds.includes(product.id);

            return (
              <article className="product-card" key={product.id}>
                <img alt={t(product.titleKey)} src={product.imageUrl} />
                <div className="product-body">
                  <span className="pill">{t(product.kindKey)}</span>
                  <h2>{t(product.titleKey)}</h2>
                  <p>{t(product.copyKey)}</p>
                  <dl className="definition-list compact-definition">
                    <div>
                      <dt>{t("marketplace.seller")}</dt>
                      <dd>{t(product.sellerKey)}</dd>
                    </div>
                    <div>
                      <dt>{t("marketplace.price")}</dt>
                      <dd>{product.price}</dd>
                    </div>
                  </dl>
                  <div className="card-actions">
                    <button className="primary-action compact" disabled type="button">
                      <ShoppingBag aria-hidden="true" size={16} />
                      {t("marketplace.buy")}
                    </button>
                    <button
                      className="secondary-action compact"
                      onClick={() => {
                        toggleWishlist(product.id);
                      }}
                      type="button"
                    >
                      <Heart aria-hidden="true" fill={isSaved ? "currentColor" : "none"} size={16} />
                      {isSaved ? t("marketplace.removeWishlist") : t("marketplace.addWishlist")}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderExpertsPage(): ReactNode {
    return (
      <section className="page-section">
        <div className="notice-panel">
          <Crown aria-hidden="true" size={22} />
          <div>
            <strong>{t("experts.verifiedDisabled")}</strong>
            <p>{t("experts.requestDisabled")}</p>
          </div>
        </div>

        <div className="expert-grid">
          {experts.map((expert) => {
            const isWaitlisted = expertWaitlistIds.includes(expert.id);

            return (
              <article className="expert-card" key={expert.id}>
                <img alt={t(expert.nameKey)} src={expert.avatarUrl} />
                <div>
                  <span className="pill">{t(expert.specialtyKey)}</span>
                  <h2>{t(expert.nameKey)}</h2>
                  <p>{t(expert.headlineKey)}</p>
                  <div className="meta-row">
                    <span>
                      <Star aria-hidden="true" size={14} />
                      {expert.rating} {t("experts.rating")}
                    </span>
                    <span>
                      {numberFormatter.format(expert.reviews)} {t("experts.reviews")}
                    </span>
                  </div>
                  <div className="language-list">
                    {expert.languages.map((expertLocale) => (
                      <span key={expertLocale}>{expertLocale.toUpperCase()}</span>
                    ))}
                  </div>
                  <div className="card-actions">
                    <button className="primary-action compact" disabled type="button">
                      <ExternalLink aria-hidden="true" size={16} />
                      {t("experts.request")}
                    </button>
                    <button
                      className="secondary-action compact"
                      onClick={() => {
                        toggleExpertWaitlist(expert.id);
                      }}
                      type="button"
                    >
                      <Check aria-hidden="true" size={16} />
                      {isWaitlisted ? t("experts.onWaitlist") : t("experts.waitlist")}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderProfilePage(): ReactNode {
    if (!currentProfile) {
      return (
        <section className="page-section">
          <div className="auth-empty">
            <UserCircle aria-hidden="true" size={56} />
            <h2>{t("profile.publicProfile")}</h2>
            <p>{t("profile.signInPrompt")}</p>
            <div className="hero-actions">
              <button
                className="primary-action"
                onClick={() => {
                  openAuth("login");
                }}
                type="button"
              >
                <LogIn aria-hidden="true" size={18} />
                {t("auth.login")}
              </button>
              <button
                className="secondary-action"
                onClick={() => {
                  openAuth("register");
                }}
                type="button"
              >
                <UserPlus aria-hidden="true" size={18} />
                {t("auth.join")}
              </button>
            </div>
          </div>
        </section>
      );
    }

    const connectedSocialLinks = socialPlatforms.flatMap((platform) => {
      const socialLink = currentProfile.socialLinks?.[platform.id];
      return socialLink?.url ? [{ platform, socialLink }] : [];
    });

    return (
      <section className="profile-page">
        <div className={`profile-cover${currentProfile.coverUrl ? " has-image" : ""}`}>
          {currentProfile.coverUrl ? <img alt={t("profile.coverAlt")} src={currentProfile.coverUrl} /> : null}
          <button className="cover-photo-action" onClick={openCoverPicker} type="button">
            <ImagePlus aria-hidden="true" size={18} />
            {currentProfile.coverUrl ? t("profile.changeCover") : t("profile.addCover")}
          </button>
        </div>

        <div className="profile-shell">
          <section className="profile-main">
            <div className="profile-head">
              <div className="profile-avatar">
                {currentProfile.avatarUrl ? (
                  <img alt={t("profile.avatarAlt")} src={currentProfile.avatarUrl} />
                ) : (
                  <span>{getInitials(currentProfile.name)}</span>
                )}
                <button
                  aria-label={currentProfile.avatarUrl ? t("profile.changeAvatar") : t("profile.addAvatar")}
                  className="avatar-photo-action"
                  onClick={openAvatarPicker}
                  title={currentProfile.avatarUrl ? t("profile.changeAvatar") : t("profile.addAvatar")}
                  type="button"
                >
                  <Camera aria-hidden="true" size={18} />
                </button>
              </div>
              <div>
                <span className="eyebrow">{t("profile.publicProfile")}</span>
                <h2>{currentProfile.name}</h2>
                <p>{currentProfile.bio}</p>
                <div className="meta-row">
                  <span>
                    <MapPin aria-hidden="true" size={14} />
                    {currentProfile.location}
                  </span>
                  <span>@{currentProfile.username}</span>
                </div>
                {connectedSocialLinks.length > 0 ? (
                  <nav aria-label={t("profile.socials")} className="profile-social-links">
                    {connectedSocialLinks.map(({ platform, socialLink }) => (
                      <a
                        aria-label={t(platform.key)}
                        href={socialLink.url}
                        key={platform.id}
                        rel="noreferrer"
                        target="_blank"
                        title={t(platform.key)}
                      >
                        <span className="profile-social-avatar">
                          {socialLink.avatarUrl ? <img alt="" src={socialLink.avatarUrl} /> : <span>{platform.mark}</span>}
                        </span>
                        <span className={`social-brand-badge is-${platform.id}`}>{platform.mark}</span>
                        <ExternalLink aria-hidden="true" className="social-external-icon" size={11} />
                      </a>
                    ))}
                  </nav>
                ) : null}
              </div>
            </div>

            <div className="profile-stats">
              {[
                [currentProfile.rating, "common.rating"],
                [profilePhotos.length, "profile.photos"],
                [currentProfile.wins, "profile.wins"],
                [currentProfile.followers, "profile.followers"]
              ].map(([value, key]) => (
                <div key={key}>
                  <strong>{numberFormatter.format(Number(value))}</strong>
                  <span>{t(key as MessageKey)}</span>
                </div>
              ))}
            </div>

            <div className="section-heading">
              <div>
                <span className="eyebrow">{t("profile.content")}</span>
                <h2>{t("profile.portfolio")}</h2>
              </div>
              <button className="secondary-action compact" onClick={openAddPhoto} type="button">
                <Camera aria-hidden="true" size={16} />
                {t("photo.add")}
              </button>
            </div>

            {profilePhotos.length > 0 ? (
              <div className="photo-gallery">{profilePhotos.map((photo) => renderPhotoCard(photo))}</div>
            ) : (
              <p className="empty-state">{t("profile.emptyPortfolio")}</p>
            )}

            <div className="achievement-grid">
              {["achievement.firstUpload", "achievement.firstBattle", "achievement.cityExplorer"].map((key, index) => (
                <div className="achievement-card" key={key}>
                  <Medal aria-hidden="true" size={20} />
                  <strong>{t(key as MessageKey)}</strong>
                  <span>{index === 0 && profilePhotos.length > 0 ? t("common.active") : t("common.comingSoon")}</span>
                </div>
              ))}
            </div>
          </section>

          <aside className="profile-edit">
            <form className="auth-form" onSubmit={saveProfile}>
              <div className="panel-title">
                <CircleUserRound aria-hidden="true" size={20} />
                <div>
                  <h2>{t("profile.editProfile")}</h2>
                  <p>{t("common.localOnly")}</p>
                </div>
              </div>

              <label className="form-field" htmlFor="profile-display-name">
                <span>{t("profile.displayName")}</span>
                <input
                  id="profile-display-name"
                  onChange={(event) => {
                    updateProfileField("displayName", event.target.value);
                  }}
                  type="text"
                  value={profileForm.displayName}
                />
              </label>

              <label className="form-field" htmlFor="profile-username">
                <span>{t("profile.username")}</span>
                <input
                  id="profile-username"
                  onChange={(event) => {
                    updateProfileField("username", event.target.value);
                  }}
                  type="text"
                  value={profileForm.username}
                />
              </label>

              <label className="form-field" htmlFor="profile-bio">
                <span>{t("profile.bio")}</span>
                <textarea
                  id="profile-bio"
                  onChange={(event) => {
                    updateProfileField("bio", event.target.value);
                  }}
                  rows={4}
                  value={profileForm.bio}
                />
              </label>

              <label className="form-field" htmlFor="profile-location">
                <span>{t("profile.location")}</span>
                <input
                  id="profile-location"
                  onChange={(event) => {
                    updateProfileField("location", event.target.value);
                  }}
                  type="text"
                  value={profileForm.location}
                />
              </label>

              <label className="form-field" htmlFor="profile-website">
                <span>{t("profile.website")}</span>
                <input
                  id="profile-website"
                  onChange={(event) => {
                    updateProfileField("website", event.target.value);
                  }}
                  type="url"
                  value={profileForm.website}
                />
              </label>

              <fieldset className="social-editor">
                <legend>{t("profile.socials")}</legend>
                <p>{t("social.autoIntro")}</p>
                <div className="social-editor-list">
                  {socialPlatforms.map((platform) => {
                    const provider = socialProviders.find((candidate) => candidate.id === platform.id);
                    const socialLink = currentProfile.socialLinks?.[platform.id] ?? provider?.profile ?? null;
                    const isConnected = Boolean(provider?.connectionId && socialLink?.url);
                    const statusKey = getSocialProviderStatusKey(provider, isConnected);

                    return (
                      <div className={`social-editor-row${isConnected ? " is-connected" : ""}`} key={platform.id}>
                        <span className={`social-connection-avatar is-${platform.id}`}>
                          {socialLink?.avatarUrl ? <img alt="" src={socialLink.avatarUrl} /> : platform.mark}
                        </span>
                        <div className="social-connection-copy">
                          <strong>{t(platform.key)}</strong>
                          <span>{socialLink?.username ? `@${socialLink.username}` : t(statusKey)}</span>
                        </div>
                        {isConnected ? (
                          <button
                            aria-label={`${t("social.disconnect")} ${t(platform.key)}`}
                            className="social-connection-action is-danger"
                            onClick={() => {
                              void disconnectSocialProvider(platform.id);
                            }}
                            title={t("social.disconnect")}
                            type="button"
                          >
                            <Unlink aria-hidden="true" size={16} />
                          </button>
                        ) : (
                          <button
                            className="social-connect-button"
                            disabled={provider?.status !== "AVAILABLE"}
                            onClick={() => {
                              connectSocialProvider(platform.id);
                            }}
                            type="button"
                          >
                            <Link2 aria-hidden="true" size={15} />
                            {t("social.connect")}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>

              <label className="checkbox-field" htmlFor="profile-hire">
                <input
                  checked={profileForm.availableForHire}
                  id="profile-hire"
                  onChange={(event) => {
                    updateProfileField("availableForHire", event.target.checked);
                  }}
                  type="checkbox"
                />
                <span>{t("profile.availableForHire")}</span>
              </label>

              <button className="primary-action full-width" type="submit">
                {t("profile.saveProfile")}
              </button>
            </form>

            <section className="account-panel" aria-labelledby="notifications-title">
              <div className="panel-title">
                <Bell aria-hidden="true" size={20} />
                <div>
                  <h2 id="notifications-title">{t("notifications.title")}</h2>
                  <p>{notifications.filter((notification) => !notification.read).length}</p>
                </div>
              </div>
              {notifications.length > 0 ? (
                <>
                  <div className="notification-list">
                    {notifications.slice(0, 6).map((notification) => (
                      <div className={notification.read ? "notification-item" : "notification-item is-unread"} key={notification.id}>
                        <span>{t(notification.messageKey)}</span>
                        <time dateTime={notification.createdAt}>{formatDate(locale, notification.createdAt)}</time>
                      </div>
                    ))}
                  </div>
                  <button
                    className="secondary-action full-width"
                    onClick={() => {
                      setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
                    }}
                    type="button"
                  >
                    <Check aria-hidden="true" size={16} />
                    {t("notifications.markRead")}
                  </button>
                </>
              ) : (
                <p>{t("notifications.empty")}</p>
              )}
            </section>

            <section className="account-panel" aria-labelledby="privacy-title">
              <div className="panel-title">
                <LockKeyhole aria-hidden="true" size={20} />
                <div>
                  <h2 id="privacy-title">{t("privacy.title")}</h2>
                  <p>{t("privacy.copy")}</p>
                </div>
              </div>
              <div className="account-actions">
                <button className="secondary-action full-width" onClick={exportLocalData} type="button">
                  <Download aria-hidden="true" size={16} />
                  {t("privacy.export")}
                </button>
                <button
                  className="danger-action full-width"
                  disabled={deletionRequested}
                  onClick={requestAccountDeletion}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={16} />
                  {deletionRequested ? t("privacy.deleteRequested") : t("privacy.deleteRequest")}
                </button>
              </div>
              <div className="connection-summary">
                <strong>{t("privacy.connections")}</strong>
                <span>
                  {t("profile.socialCount").replace("{count}", numberFormatter.format(connectedSocialLinks.length))}
                </span>
              </div>
            </section>
          </aside>
        </div>
      </section>
    );
  }

  function renderFooter(): ReactNode {
    return (
      <footer className="site-footer">
        <span>{t("footer.legal")}</span>
        <nav aria-label={t("footer.legal")} className="footer-links">
          {legalPolicies.map((policy) => (
            <Link href={`/${locale}/legal/${policy.id}`} key={policy.id}>
              {t(policy.titleKey)}
            </Link>
          ))}
        </nav>
      </footer>
    );
  }

  function renderAddPhotoDialog(): ReactNode {
    return (
      <div
        className="modal-backdrop"
        onMouseDown={() => {
          setAddPhotoOpen(false);
        }}
        role="presentation"
      >
        <section
          aria-labelledby="add-photo-title"
          aria-modal="true"
          className="auth-dialog source-dialog"
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          role="dialog"
        >
          <div className="dialog-header">
            <div>
              <span className="eyebrow">{t("photo.add")}</span>
              <h2 id="add-photo-title">{t("photo.addTitle")}</h2>
              <p>{t("photo.sourceIntro")}</p>
            </div>
            <button
              aria-label={t("auth.close")}
              className="icon-button"
              onClick={() => {
                setAddPhotoOpen(false);
              }}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
          </div>

          <div className="provider-list">
            <button className="provider-button is-enabled" onClick={chooseDeviceUpload} type="button">
              <ImagePlus aria-hidden="true" size={18} />
              <span>{t("photo.uploadDevice")}</span>
              <small>{t("photo.deviceWorks")}</small>
            </button>
            {externalPhotoProviders.map((provider) => (
              <button className="provider-button" disabled key={provider.id} type="button">
                <LockKeyhole aria-hidden="true" size={18} />
                <span>{t(provider.key)}</span>
                <small>{t("photo.connectWhenAvailable")}</small>
              </button>
            ))}
          </div>

          {photoFeedback ? (
            <p className={`dialog-feedback ${photoFeedback.kind}`} role="status">
              {photoFeedback.text}
            </p>
          ) : (
            <p className="helper-message">{t("photo.providersSoon")}</p>
          )}
        </section>
      </div>
    );
  }

  function renderAuthDialog(): ReactNode {
    return (
      <div
        className="modal-backdrop"
        onMouseDown={() => {
          setAuthOpen(false);
        }}
        role="presentation"
      >
        <section
          aria-labelledby="auth-title"
          aria-modal="true"
          className="auth-dialog"
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          role="dialog"
        >
          <div className="dialog-header">
            <div>
              <span className="eyebrow">{authMode === "login" ? t("auth.login") : t("auth.register")}</span>
              <h2 id="auth-title">{authMode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}</h2>
            </div>
            <button
              aria-label={t("auth.close")}
              className="icon-button"
              onClick={() => {
                setAuthOpen(false);
              }}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
          </div>

          <div className="segmented">
            <button
              className={authMode === "login" ? "is-active" : ""}
              onClick={() => {
                setAuthMode("login");
                setAuthFeedback(null);
              }}
              type="button"
            >
              {t("auth.login")}
            </button>
            <button
              className={authMode === "register" ? "is-active" : ""}
              onClick={() => {
                setAuthMode("register");
                setAuthFeedback(null);
              }}
              type="button"
            >
              {t("auth.register")}
            </button>
          </div>

          <form
            className="auth-form"
            onSubmit={(event) => {
              void handleAuthSubmit(event);
            }}
          >
            {authMode === "register" ? (
              <label className="form-field" htmlFor="auth-name">
                <span>{t("auth.name")}</span>
                <input
                  autoComplete="name"
                  id="auth-name"
                  minLength={2}
                  onChange={(event) => {
                    updateAuthField("name", event.target.value);
                  }}
                  required
                  type="text"
                  value={authForm.name}
                />
              </label>
            ) : null}

            <label className="form-field" htmlFor="auth-email">
              <span>{t("auth.email")}</span>
              <input
                autoComplete="email"
                id="auth-email"
                onChange={(event) => {
                  updateAuthField("email", event.target.value);
                }}
                required
                type="email"
                value={authForm.email}
              />
            </label>

            <label className="form-field" htmlFor="auth-password">
              <span>{t("auth.password")}</span>
              <input
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                id="auth-password"
                minLength={authMode === "register" ? 8 : undefined}
                onChange={(event) => {
                  updateAuthField("password", event.target.value);
                }}
                required
                type="password"
                value={authForm.password}
              />
            </label>

            <button className="primary-action full-width" type="submit">
              {authMode === "login" ? t("auth.submitLogin") : t("auth.submitRegister")}
            </button>
          </form>

          {authFeedback ? (
            <p className={`dialog-feedback ${authFeedback.kind}`} role="status">
              {authFeedback.text}
            </p>
          ) : (
            <p className="helper-message">{t("auth.note")}</p>
          )}
        </section>
      </div>
    );
  }
}

function getPhotoTitle(photo: PhotoRecord | null | undefined, locale: SupportedLocale): string {
  if (!photo) {
    return getMessage(locale, "photo.selected");
  }

  return photo.title ?? (photo.titleKey ? getMessage(locale, photo.titleKey) : getMessage(locale, "photo.selected"));
}

function getPhotoAuthor(photo: PhotoRecord, locale: SupportedLocale): string {
  return photo.authorName ?? (photo.authorKey ? getMessage(locale, photo.authorKey) : getMessage(locale, "common.guest"));
}

function getCategoryKey(categoryId: CategoryId): MessageKey {
  return `category.${categoryId}` as MessageKey;
}

function getBattleScopeKey(scope: BattleScope): MessageKey {
  return `battles.scope.${scope}` as MessageKey;
}

function getLocationLabel(locationId: LocationId, locale: SupportedLocale, fallback?: string): string {
  if (fallback?.trim()) {
    return fallback;
  }

  return getMessage(locale, `map.location.${locationId}` as MessageKey);
}

function formatFileSize(bytes: number): string {
  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${Math.max(1, Math.round(kilobytes))} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function formatDate(locale: SupportedLocale, isoDate: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short"
  }).format(new Date(isoDate));
}

function makePhotoTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || fileName;
}

function normalizeUsername(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 24);
}

function makeUsername(name: string, email: string): string {
  const fromName = normalizeUsername(
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, ".")
  );
  const emailName = email.split("@")[0] ?? "photographer";

  return fromName || normalizeUsername(emailName) || "photographer";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "G";
  const second = parts[1]?.[0] ?? "";

  return `${first}${second}`.toLocaleUpperCase();
}

function getSocialProviderStatusKey(provider: SocialProviderRecord | undefined, isConnected: boolean): MessageKey {
  if (isConnected) return "social.connected";
  if (!provider || provider.status === "NEEDS_CONFIGURATION") return "social.configurationRequired";
  if (provider.reason === "PROFESSIONAL_ACCOUNT_REQUIRED") return "social.professionalOnly";
  if (provider.reason === "ADOBE_PROFILE_UNAVAILABLE") return "social.adobeProfileUnavailable";
  if (provider.status === "AVAILABLE") return "social.readyToConnect";
  return "social.officialApiUnavailable";
}

function getApiRoot(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (configured) return configured;

  if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    return `${window.location.protocol}//${window.location.hostname}:4000/api/v1`;
  }

  return "/api/v1";
}

async function apiRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const response = await fetch(`${getApiRoot()}${path}`, {
    ...init,
    credentials: "include",
    headers
  });
  if (!response.ok) throw new Error(`API request failed with ${response.status}.`);
  return (await response.json()) as T;
}

function readLocalStorage<T>(key: string, fallback: T): T {
  const rawValue = window.localStorage.getItem(key);

  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorage<T>(key: string, value: T): void {
  if (value === null || value === undefined) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function writeLocaleCookie(locale: SupportedLocale): void {
  document.cookie = `${localeCookieName}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error("file-read-failed"));
    };
    reader.onload = () => {
      const result = reader.result;

      if (typeof result === "string") {
        resolve(result);
        return;
      }

      reject(new Error("file-read-failed"));
    };
    reader.readAsDataURL(file);
  });
}

async function hashSecret(email: string, secret: string): Promise<string> {
  return hashText(`${email.toLocaleLowerCase()}:${secret}`);
}

async function createLocalChecksum(file: File, src: string): Promise<string> {
  const shortHash = await hashText(`${file.name}:${file.size}:${file.type}:${file.lastModified}:${src.slice(0, 256)}`);

  return shortHash.slice(0, 16);
}

async function hashText(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return Array.from(value).reduce((hash, character) => `${hash}${character.charCodeAt(0).toString(16)}`, "");
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
