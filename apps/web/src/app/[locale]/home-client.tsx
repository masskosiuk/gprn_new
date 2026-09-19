"use client";

import { EloRatingEngine } from "@gprn/domain";
import { getMessage, type MessageKey, type SupportedLocale } from "@gprn/i18n";
import {
  Aperture,
  BadgeCheck,
  Bell,
  BookOpen,
  Bookmark,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Compass,
  Crop,
  Crown,
  CreditCard,
  Download,
  ExternalLink,
  Filter,
  Grid3X3,
  Heart,
  HandCoins,
  ImagePlus,
  Images,
  Link2,
  LockKeyhole,
  LogIn,
  LogOut,
  MapPin,
  Megaphone,
  Medal,
  Menu,
  Paperclip,
  Palette,
  Search,
  Send,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  SunMedium,
  Swords,
  Trophy,
  Trash2,
  Unlink,
  Upload,
  UserCircle,
  UserPlus,
  WalletCards,
  X,
  type LucideIcon,
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
  useState,
} from "react";

import {
  InteractivePhotoMap,
  type PhotoMapMarker,
} from "./interactive-photo-map";
import { getSectionHref, type SectionId } from "./sections";

type AuthMode = "login" | "register";
type AccountTier =
  "viewer" | "amateur" | "beginner" | "experienced" | "professional" | "star";
type CategoryId =
  | "street"
  | "landscape"
  | "portrait"
  | "documentary"
  | "architecture"
  | "nature"
  | "aiEdited"
  | "aiGenerated"
  | "commercial"
  | "product";
type CategoryFilter = "all" | CategoryId;
type BattleScope = "global" | "country" | "city" | "season" | "friend";
type BattleFilter = "all" | BattleScope;
type BattleCriterion =
  | "composition"
  | "lighting"
  | "technicalQuality"
  | "storytelling"
  | "originality"
  | "color"
  | "emotionalImpact";
type BattleScores = Record<BattleCriterion, number>;
type LeaderboardScope = "global" | "city" | "category";
type LocationId =
  "paris" | "kyiv" | "tokyo" | "reykjavik" | "lisbon" | "marrakech";
type LocationFilter = "all" | LocationId;
type SocialPlatformId =
  "instagram" | "facebook" | "artstation" | "adobe" | "behance";

interface HomeClientProps {
  readonly initialAuthorId?: string;
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

interface ImagePreview {
  readonly alt: string;
  readonly photoId?: string;
  readonly src: string;
}

interface PhotoReviewRecord {
  readonly comment?: string;
  readonly createdAt: string;
  readonly reviewerName: string;
  readonly reviewerTier: AccountTier;
  readonly scores: BattleScores;
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
  readonly reviewPrice?: number;
  readonly socialLinks?: SocialLinks;
  readonly tier?: AccountTier;
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
  readonly reason:
    | "ADOBE_PROFILE_UNAVAILABLE"
    | "OFFICIAL_API_UNAVAILABLE"
    | "PROFESSIONAL_ACCOUNT_REQUIRED"
    | null;
  readonly status: "AVAILABLE" | "NEEDS_CONFIGURATION" | "NOT_SUPPORTED";
}

interface ProfileForm {
  readonly availableForHire: boolean;
  readonly bio: string;
  readonly displayName: string;
  readonly location: string;
  readonly reviewPrice: string;
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

interface BattleEvaluationRecord {
  readonly submittedAt: string;
  readonly winnerEntryId: string;
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

interface PublicAuthorProfile {
  readonly avatarUrl: string;
  readonly bioKey: MessageKey;
  readonly coverUrl: string;
  readonly followers: number;
  readonly id: string;
  readonly locationId: LocationId;
  readonly nameKey: MessageKey;
  readonly rating: number;
  readonly tier: AccountTier;
  readonly username: string;
  readonly verified: boolean;
  readonly wins: number;
  readonly availableForHire?: boolean;
  readonly reviewPrice?: number;
  readonly serviceRating?: number;
  readonly completedOrders?: number;
}

type OrderStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "inProgress"
  | "submitted"
  | "completed"
  | "cancelled";
type PromotionPlacement = "home" | "marketplace" | "battles";

interface LocalOrder {
  readonly authorId: string;
  readonly authorName: string;
  readonly createdAt: string;
  readonly customerName: string;
  readonly id: string;
  readonly kind: "service" | "review";
  readonly message: string;
  readonly photoId?: string;
  readonly priceMinor: number;
  readonly referenceFiles: readonly string[];
  readonly referenceUrl?: string;
  readonly status: OrderStatus;
  readonly providerComment?: string;
  readonly rating?: number;
  readonly ratingComment?: string;
  readonly customerRating?: number;
  readonly customerRatingComment?: string;
  readonly providerRating?: number;
  readonly providerRatingComment?: string;
}

interface LocalWalletTransaction {
  readonly amountMinor: number;
  readonly createdAt: string;
  readonly id: string;
  readonly label: string;
}

interface LocalPromotion {
  readonly authorName: string;
  readonly createdAt: string;
  readonly id: string;
  readonly photoId: string;
  readonly placement: PromotionPlacement;
  readonly priceMinor: number;
}

type CommerceDialog =
  | {
      readonly author: PublicAuthorProfile;
      readonly kind: "service" | "donation" | "review";
    }
  | { readonly kind: "promotion"; readonly photo: PhotoRecord }
  | { readonly kind: "wallet" }
  | null;

interface CommerceForm {
  readonly amount: string;
  readonly message: string;
  readonly paymentMethod: "card" | "crypto";
  readonly photoId: string;
  readonly placement: PromotionPlacement;
  readonly referenceFiles: readonly string[];
  readonly referenceUrl: string;
}

const accountStorageKey = "gprn.account.v2";
const sessionStorageKey = "gprn.session.v2";
const photosStorageKey = "gprn.photos.v2";
const battleVotesStorageKey = "gprn.battleVotes.v2";
const challengeEntriesStorageKey = "gprn.challengeEntries.v2";
const seasonJoinedStorageKey = "gprn.seasonJoined.v2";
const savedPhotosStorageKey = "gprn.savedPhotos.v2";
const likedPhotosStorageKey = "gprn.likedPhotos.v2";
const moodboardStorageKey = "gprn.moodboard.v2";
const wishlistStorageKey = "gprn.marketWishlist.v2";
const notificationsStorageKey = "gprn.notifications.v2";
const photoReviewsStorageKey = "gprn.photoReviews.v2";
const walletStorageKey = "gprn.wallet.v1";
const walletTransactionsStorageKey = "gprn.walletTransactions.v1";
const serviceOrdersStorageKey = "gprn.serviceOrders.v1";
const promotionsStorageKey = "gprn.promotions.v1";
const marketplaceListingsStorageKey = "gprn.marketplaceListings.v1";
const deletionRequestStorageKey = "gprn.deletionRequested.v2";
const localeCookieName = "gprn_locale";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ratingEngine = new EloRatingEngine();
const battleCriteria: readonly {
  readonly Icon: LucideIcon;
  readonly id: BattleCriterion;
  readonly labelKey: MessageKey;
}[] = [
  {
    Icon: Crop,
    id: "composition",
    labelKey: "battles.criterion.composition",
  },
  { Icon: SunMedium, id: "lighting", labelKey: "battles.criterion.lighting" },
  {
    Icon: Aperture,
    id: "technicalQuality",
    labelKey: "battles.criterion.technicalQuality",
  },
  {
    Icon: BookOpen,
    id: "storytelling",
    labelKey: "battles.criterion.storytelling",
  },
  {
    Icon: Sparkles,
    id: "originality",
    labelKey: "battles.criterion.originality",
  },
  { Icon: Palette, id: "color", labelKey: "battles.criterion.color" },
  {
    Icon: Heart,
    id: "emotionalImpact",
    labelKey: "battles.criterion.emotionalImpact",
  },
];
const defaultBattleScores: BattleScores = {
  color: 5,
  composition: 5,
  emotionalImpact: 5,
  lighting: 5,
  originality: 5,
  storytelling: 5,
  technicalQuality: 5,
};

const emptyAuthForm: AuthForm = {
  email: "",
  name: "",
  password: "",
};

const emptyProfileForm: ProfileForm = {
  availableForHire: true,
  bio: "",
  displayName: "",
  location: "",
  reviewPrice: "35",
  username: "",
  website: "",
};

const emptyCommerceForm: CommerceForm = {
  amount: "",
  message: "",
  paymentMethod: "card",
  photoId: "",
  placement: "marketplace",
  referenceFiles: [],
  referenceUrl: "",
};

const promotionPriceMinor: Record<PromotionPlacement, number> = {
  battles: 1900,
  home: 4900,
  marketplace: 2900,
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
  { Icon: UserCircle, id: "profile", messageKey: "nav.profile" },
];

const languageOptions: readonly {
  flagCode: string;
  labelKey: MessageKey;
  locale: SupportedLocale;
}[] = [
  { flagCode: "gb", labelKey: "language.en", locale: "en" },
  { flagCode: "ua", labelKey: "language.uk", locale: "uk" },
  { flagCode: "ru", labelKey: "language.ru", locale: "ru" },
  { flagCode: "pl", labelKey: "language.pl", locale: "pl" },
  { flagCode: "de", labelKey: "language.de", locale: "de" },
  { flagCode: "fr", labelKey: "language.fr", locale: "fr" },
  { flagCode: "it", labelKey: "language.it", locale: "it" },
  { flagCode: "es", labelKey: "language.es", locale: "es" },
  { flagCode: "pt", labelKey: "language.pt", locale: "pt" },
  { flagCode: "nl", labelKey: "language.nl", locale: "nl" },
  { flagCode: "tr", labelKey: "language.tr", locale: "tr" },
  { flagCode: "jp", labelKey: "language.ja", locale: "ja" },
  { flagCode: "cn", labelKey: "language.zh", locale: "zh" },
  { flagCode: "kr", labelKey: "language.ko", locale: "ko" },
];

const dateInputPlaceholders: Record<SupportedLocale, string> = {
  de: "TT.MM.JJJJ",
  en: "MM/DD/YYYY",
  es: "DD/MM/AAAA",
  fr: "JJ/MM/AAAA",
  it: "GG/MM/AAAA",
  ja: "YYYY/MM/DD",
  ko: "YYYY.MM.DD",
  nl: "DD-MM-JJJJ",
  pl: "DD.MM.RRRR",
  pt: "DD/MM/AAAA",
  ru: "ДД.ММ.ГГГГ",
  tr: "GG.AA.YYYY",
  uk: "ДД.ММ.РРРР",
  zh: "YYYY/MM/DD",
};

const sectionMeta: Record<Exclude<SectionId, "home">, SectionMeta> = {
  admin: {
    introKey: "section.admin.intro",
    titleKey: "section.admin.title",
  },
  battles: {
    introKey: "section.battles.intro",
    titleKey: "section.battles.title",
  },
  challenges: {
    introKey: "section.challenges.intro",
    titleKey: "section.challenges.title",
  },
  discover: {
    introKey: "section.discover.intro",
    titleKey: "section.discover.title",
  },
  experts: {
    introKey: "section.experts.intro",
    titleKey: "section.experts.title",
  },
  leaderboard: {
    introKey: "section.leaderboard.intro",
    titleKey: "section.leaderboard.title",
  },
  map: {
    introKey: "section.map.intro",
    titleKey: "section.map.title",
  },
  marketplace: {
    introKey: "section.marketplace.intro",
    titleKey: "section.marketplace.title",
  },
  profile: {
    introKey: "section.profile.intro",
    titleKey: "section.profile.title",
  },
};

const categoryFilters: readonly { id: CategoryFilter; key: MessageKey }[] = [
  { id: "all", key: "category.all" },
  { id: "street", key: "category.street" },
  { id: "landscape", key: "category.landscape" },
  { id: "portrait", key: "category.portrait" },
  { id: "documentary", key: "category.documentary" },
  { id: "architecture", key: "category.architecture" },
  { id: "nature", key: "category.nature" },
  { id: "aiEdited", key: "category.aiEdited" },
  { id: "aiGenerated", key: "category.aiGenerated" },
  { id: "commercial", key: "category.commercial" },
  { id: "product", key: "category.product" },
];

const battleFilters: readonly { id: BattleFilter; key: MessageKey }[] = [
  { id: "all", key: "battles.scope.all" },
  { id: "global", key: "battles.scope.global" },
  { id: "country", key: "battles.scope.country" },
  { id: "city", key: "battles.scope.city" },
  { id: "season", key: "battles.scope.season" },
  { id: "friend", key: "battles.scope.friend" },
];

const leaderboardScopes: readonly { id: LeaderboardScope; key: MessageKey }[] =
  [
    { id: "global", key: "leaderboard.scope.global" },
    { id: "city", key: "leaderboard.scope.city" },
    { id: "category", key: "leaderboard.scope.category" },
  ];

const locationFilters: readonly { id: LocationFilter; key: MessageKey }[] = [
  { id: "all", key: "map.location.all" },
  { id: "paris", key: "map.location.paris" },
  { id: "kyiv", key: "map.location.kyiv" },
  { id: "tokyo", key: "map.location.tokyo" },
  { id: "reykjavik", key: "map.location.reykjavik" },
  { id: "lisbon", key: "map.location.lisbon" },
  { id: "marrakech", key: "map.location.marrakech" },
];

const externalPhotoProviders: readonly { id: string; key: MessageKey }[] = [
  { id: "google-drive", key: "photo.importDrive" },
  { id: "dropbox", key: "photo.importDropbox" },
  { id: "adobe", key: "photo.importAdobe" },
  { id: "onedrive", key: "photo.importOneDrive" },
  { id: "flickr", key: "photo.importFlickr" },
  { id: "500px", key: "photo.importFiveHundredPx" },
  { id: "behance", key: "photo.importBehance" },
  { id: "connected-source", key: "photo.importConnected" },
];

const socialPlatforms: readonly {
  readonly id: SocialPlatformId;
  readonly key: MessageKey;
  readonly mark: string;
}[] = [
  {
    id: "instagram",
    key: "social.instagram",
    mark: "IG",
  },
  {
    id: "facebook",
    key: "social.facebook",
    mark: "f",
  },
  {
    id: "artstation",
    key: "social.artstation",
    mark: "A",
  },
  {
    id: "adobe",
    key: "social.adobe",
    mark: "Ad",
  },
  {
    id: "behance",
    key: "social.behance",
    mark: "Be",
  },
];

const defaultSocialProviders: readonly SocialProviderRecord[] =
  socialPlatforms.map((platform) => ({
    id: platform.id,
    reason:
      platform.id === "instagram"
        ? "PROFESSIONAL_ACCOUNT_REQUIRED"
        : platform.id === "adobe"
          ? "ADOBE_PROFILE_UNAVAILABLE"
          : platform.id === "facebook"
            ? null
            : "OFFICIAL_API_UNAVAILABLE",
    status:
      platform.id === "facebook" || platform.id === "instagram"
        ? "NEEDS_CONFIGURATION"
        : "NOT_SUPPORTED",
  }));

const legalPolicies: readonly { id: string; titleKey: MessageKey }[] = [
  { id: "privacy", titleKey: "legal.privacy.title" },
  { id: "terms", titleKey: "legal.terms.title" },
  { id: "cookie", titleKey: "legal.cookie.title" },
  { id: "copyright", titleKey: "legal.copyright.title" },
  { id: "dispute", titleKey: "legal.dispute.title" },
  { id: "community", titleKey: "legal.community.title" },
];

const sampleImages = {
  architecture:
    "https://images.unsplash.com/photo-1486718448742-163732cd1544?auto=format&fit=crop&w=1200&q=80",
  city: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1200&q=80",
  desert:
    "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80",
  mountain:
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80",
  night:
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80",
  street:
    "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80",
  tram: "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=1200&q=80",
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
    uploadedAt: "2026-09-03T12:00:00.000Z",
    votes: 284,
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
    uploadedAt: "2026-08-28T09:30:00.000Z",
    votes: 219,
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
    uploadedAt: "2026-08-14T15:45:00.000Z",
    votes: 173,
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
    uploadedAt: "2026-07-22T10:15:00.000Z",
    votes: 196,
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
    uploadedAt: "2026-06-30T17:20:00.000Z",
    votes: 143,
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
    uploadedAt: "2026-05-18T08:40:00.000Z",
    votes: 151,
  },
];

const publicAuthorProfiles: readonly PublicAuthorProfile[] = [
  {
    avatarUrl: sampleImages.city,
    bioKey: "profile.authorBio.mika",
    coverUrl: sampleImages.city,
    followers: 1204,
    id: "mika",
    locationId: "tokyo",
    nameKey: "data.author.mika",
    rating: 1532,
    availableForHire: true,
    completedOrders: 42,
    reviewPrice: 6500,
    serviceRating: 4.9,
    tier: "star",
    username: "mika.tanaka",
    verified: true,
    wins: 18,
  },
  {
    avatarUrl: sampleImages.mountain,
    bioKey: "profile.authorBio.elena",
    coverUrl: sampleImages.mountain,
    followers: 2130,
    id: "elena",
    locationId: "reykjavik",
    nameKey: "data.author.elena",
    rating: 1608,
    availableForHire: true,
    completedOrders: 65,
    reviewPrice: 4500,
    serviceRating: 4.8,
    tier: "professional",
    username: "elena.moreau",
    verified: true,
    wins: 27,
  },
  {
    avatarUrl: sampleImages.desert,
    bioKey: "profile.authorBio.yusuf",
    coverUrl: sampleImages.desert,
    followers: 914,
    id: "yusuf",
    locationId: "marrakech",
    nameKey: "data.author.yusuf",
    rating: 1496,
    availableForHire: true,
    completedOrders: 18,
    reviewPrice: 3200,
    serviceRating: 4.7,
    tier: "experienced",
    username: "yusuf.amrani",
    verified: true,
    wins: 13,
  },
  {
    avatarUrl: sampleImages.architecture,
    bioKey: "profile.authorBio.anna",
    coverUrl: sampleImages.architecture,
    followers: 1806,
    id: "anna",
    locationId: "kyiv",
    nameKey: "data.author.anna",
    rating: 1574,
    availableForHire: false,
    completedOrders: 31,
    reviewPrice: 4200,
    serviceRating: 4.9,
    tier: "professional",
    username: "anna.kovalenko",
    verified: true,
    wins: 21,
  },
  {
    avatarUrl: sampleImages.tram,
    bioKey: "profile.authorBio.joao",
    coverUrl: sampleImages.tram,
    followers: 1022,
    id: "joao",
    locationId: "lisbon",
    nameKey: "data.author.joao",
    rating: 1498,
    availableForHire: true,
    tier: "beginner",
    username: "joao.silva",
    verified: false,
    wins: 14,
  },
  {
    avatarUrl: sampleImages.night,
    bioKey: "profile.authorBio.lucas",
    coverUrl: sampleImages.night,
    followers: 2460,
    id: "lucas",
    locationId: "paris",
    nameKey: "data.author.lucas",
    rating: 1612,
    availableForHire: true,
    completedOrders: 77,
    reviewPrice: 7500,
    serviceRating: 5,
    tier: "star",
    username: "lucas.meyer",
    verified: true,
    wins: 31,
  },
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
        votes: 51,
      },
      {
        id: "battle-rain-b",
        imageUrl: sampleImages.tram,
        locationId: "lisbon",
        photographerKey: "data.author.joao",
        rating: 1498,
        titleKey: "data.photo.lisbon.title",
        votes: 47,
      },
    ],
    id: "street-rain",
    scope: "global",
    statusKey: "battles.open",
    titleKey: "data.battle.streetRain",
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
        votes: 64,
      },
      {
        id: "battle-light-b",
        imageUrl: sampleImages.night,
        locationId: "paris",
        photographerKey: "data.author.lucas",
        rating: 1574,
        titleKey: "data.photo.patagonia.title",
        votes: 58,
      },
    ],
    id: "landscape-light",
    scope: "season",
    statusKey: "battles.open",
    titleKey: "data.battle.landscapeLight",
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
        votes: 33,
      },
      {
        id: "battle-geometry-b",
        imageUrl: sampleImages.street,
        locationId: "paris",
        photographerKey: "data.author.yusuf",
        rating: 1487,
        titleKey: "data.photo.marrakech.title",
        votes: 29,
      },
    ],
    id: "city-geometry",
    scope: "city",
    statusKey: "battles.open",
    titleKey: "data.battle.cityGeometry",
  },
];

const challenges: readonly ChallengeRecord[] = [
  {
    categoryId: "street",
    copyKey: "data.challenge.cityNight.copy",
    deadline: "2026-09-18T21:00:00.000Z",
    id: "city-night",
    participants: 428,
    statusKey: "challenges.statusOpen",
    titleKey: "data.challenge.cityNight",
  },
  {
    categoryId: "architecture",
    copyKey: "data.challenge.humanScale.copy",
    deadline: "2026-09-24T21:00:00.000Z",
    id: "human-scale",
    participants: 211,
    statusKey: "challenges.statusOpen",
    titleKey: "data.challenge.humanScale",
  },
  {
    categoryId: "landscape",
    copyKey: "data.challenge.wildWeather.copy",
    deadline: "2026-10-02T21:00:00.000Z",
    id: "wild-weather",
    participants: 96,
    statusKey: "challenges.statusUpcoming",
    titleKey: "data.challenge.wildWeather",
  },
];

const leaderboardRows: readonly LeaderboardRow[] = [
  {
    avatarUrl: sampleImages.city,
    battles: 72,
    change: 4,
    locationId: "tokyo",
    nameKey: "data.author.mika",
    rating: 1824,
  },
  {
    avatarUrl: sampleImages.mountain,
    battles: 68,
    change: 2,
    locationId: "reykjavik",
    nameKey: "data.author.elena",
    rating: 1792,
  },
  {
    avatarUrl: sampleImages.architecture,
    battles: 59,
    change: 7,
    locationId: "kyiv",
    nameKey: "data.author.anna",
    rating: 1711,
  },
  {
    avatarUrl: sampleImages.desert,
    battles: 64,
    change: -1,
    locationId: "marrakech",
    nameKey: "data.author.yusuf",
    rating: 1688,
  },
  {
    avatarUrl: sampleImages.tram,
    battles: 45,
    change: 3,
    locationId: "lisbon",
    nameKey: "data.author.joao",
    rating: 1634,
  },
];

const locationPins: readonly LocationPin[] = [
  {
    id: "paris",
    key: "map.location.paris",
    latitude: 48.8566,
    longitude: 2.3522,
  },
  {
    id: "kyiv",
    key: "map.location.kyiv",
    latitude: 50.4501,
    longitude: 30.5234,
  },
  {
    id: "tokyo",
    key: "map.location.tokyo",
    latitude: 35.6762,
    longitude: 139.6503,
  },
  {
    id: "reykjavik",
    key: "map.location.reykjavik",
    latitude: 64.1466,
    longitude: -21.9426,
  },
  {
    id: "lisbon",
    key: "map.location.lisbon",
    latitude: 38.7223,
    longitude: -9.1393,
  },
  {
    id: "marrakech",
    key: "map.location.marrakech",
    latitude: 31.6295,
    longitude: -7.9811,
  },
];

const marketplaceProducts: readonly MarketplaceProduct[] = [
  {
    copyKey: "data.market.print.copy",
    id: "print-city",
    imageUrl: sampleImages.architecture,
    kindKey: "marketplace.print",
    price: "$120",
    sellerKey: "data.author.anna",
    titleKey: "data.market.print.title",
  },
  {
    copyKey: "data.market.license.copy",
    id: "license-street",
    imageUrl: sampleImages.city,
    kindKey: "marketplace.license",
    price: "$49",
    sellerKey: "data.author.mika",
    titleKey: "data.market.license.title",
  },
  {
    copyKey: "data.market.preset.copy",
    id: "preset-doc",
    imageUrl: sampleImages.desert,
    kindKey: "marketplace.preset",
    price: "$29",
    sellerKey: "data.author.yusuf",
    titleKey: "data.market.preset.title",
  },
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
    specialtyKey: "category.documentary",
  },
  {
    avatarUrl: sampleImages.street,
    headlineKey: "data.expert.marcus.headline",
    id: "marcus",
    languages: ["en", "de"],
    nameKey: "data.expert.marcus",
    rating: "4.8",
    reviews: 94,
    specialtyKey: "category.portrait",
  },
  {
    avatarUrl: sampleImages.mountain,
    headlineKey: "data.expert.sofia.headline",
    id: "sofia",
    languages: ["fr", "en"],
    nameKey: "data.expert.sofia",
    rating: "4.9",
    reviews: 156,
    specialtyKey: "category.landscape",
  },
];

export function HomeClient({
  initialAuthorId,
  initialSection,
  locale,
}: HomeClientProps): ReactNode {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const [isHydrated, setHydrated] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [isAuthOpen, setAuthOpen] = useState(false);
  const [isAddPhotoOpen, setAddPhotoOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const [isPhotoReviewOpen, setPhotoReviewOpen] = useState(false);
  const [photoReviewComment, setPhotoReviewComment] = useState("");
  const [photoReviewScores, setPhotoReviewScores] =
    useState<BattleScores>(defaultBattleScores);
  const [photoReviews, setPhotoReviews] = useState<
    Record<string, PhotoReviewRecord[]>
  >({});
  const [authForm, setAuthForm] = useState<AuthForm>(emptyAuthForm);
  const [authFeedback, setAuthFeedback] = useState<Feedback | null>(null);
  const [globalFeedback, setGlobalFeedback] = useState<Feedback | null>(null);
  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [socialProviders, setSocialProviders] = useState<
    readonly SocialProviderRecord[]
  >(defaultSocialProviders);
  const [socialSessionReady, setSocialSessionReady] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState<PhotoRecord[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string>("");
  const [photoFeedback, setPhotoFeedback] = useState<Feedback | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [discoverLocationFilter, setDiscoverLocationFilter] =
    useState<LocationFilter>("all");
  const [discoverDateFrom, setDiscoverDateFrom] = useState("");
  const [discoverDateTo, setDiscoverDateTo] = useState("");
  const [battleFilter, setBattleFilter] = useState<BattleFilter>("all");
  const [battles, setBattles] = useState<BattleRecord[]>(() => [
    ...initialBattles,
  ]);
  const [battleVotes, setBattleVotes] = useState<
    Record<string, BattleEvaluationRecord>
  >({});
  const [challengeEntries, setChallengeEntries] = useState<
    Record<string, string>
  >({});
  const [seasonJoined, setSeasonJoined] = useState(false);
  const [leaderboardScope, setLeaderboardScope] =
    useState<LeaderboardScope>("global");
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");
  const [savedPhotoIds, setSavedPhotoIds] = useState<string[]>([]);
  const [likedPhotoIds, setLikedPhotoIds] = useState<string[]>([]);
  const [moodboardPhotoIds, setMoodboardPhotoIds] = useState<string[]>([]);
  const [wishlistProductIds, setWishlistProductIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<LocalNotification[]>([]);
  const [isNotificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [commerceDialog, setCommerceDialog] = useState<CommerceDialog>(null);
  const [commerceForm, setCommerceForm] =
    useState<CommerceForm>(emptyCommerceForm);
  const [walletBalanceMinor, setWalletBalanceMinor] = useState(0);
  const [walletTransactions, setWalletTransactions] = useState<
    LocalWalletTransaction[]
  >([]);
  const [serviceOrders, setServiceOrders] = useState<LocalOrder[]>([]);
  const [orderRatingComments, setOrderRatingComments] = useState<
    Record<string, string>
  >({});
  const [promotions, setPromotions] = useState<LocalPromotion[]>([]);
  const [listedPhotoIds, setListedPhotoIds] = useState<string[]>([]);
  const [deletionRequested, setDeletionRequested] = useState(false);

  useEffect(() => {
    if (initialSection !== "discover") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const requestedCategory = searchParams.get("category");
    const requestedLocation = searchParams.get("location");

    if (
      requestedCategory &&
      categoryFilters.some((filter) => filter.id === requestedCategory)
    ) {
      setCategoryFilter(requestedCategory as CategoryFilter);
    }

    if (
      requestedLocation &&
      locationFilters.some((filter) => filter.id === requestedLocation)
    ) {
      setDiscoverLocationFilter(requestedLocation as LocationFilter);
    }
  }, [initialSection]);

  const currentProfile =
    account && sessionEmail === account.email ? account : null;
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(locale),
    [locale],
  );
  const allPhotos = useMemo<readonly PhotoRecord[]>(
    () => [...uploadedPhotos, ...curatedPhotos],
    [uploadedPhotos],
  );
  const publicPhotos = useMemo(
    () => allPhotos.filter((photo) => photo.published || photo.isMine),
    [allPhotos],
  );
  const selectedUploadedPhoto =
    uploadedPhotos.find((photo) => photo.id === selectedPhotoId) ??
    uploadedPhotos[0] ??
    null;
  const visiblePhotos = publicPhotos.filter((photo) => {
    const query = searchTerm.trim().toLocaleLowerCase(locale);
    const title = getPhotoTitle(photo, locale).toLocaleLowerCase(locale);
    const author = getPhotoAuthor(photo, locale).toLocaleLowerCase(locale);
    const location = getLocationLabel(
      photo.locationId,
      locale,
      photo.locationLabel,
    ).toLocaleLowerCase(locale);
    const categoryMatches =
      categoryFilter === "all" || photo.categoryId === categoryFilter;
    const locationMatches =
      discoverLocationFilter === "all" ||
      photo.locationId === discoverLocationFilter;
    const publishedAt = photo.uploadedAt ? new Date(photo.uploadedAt) : null;
    const fromMatches =
      !discoverDateFrom ||
      Boolean(
        publishedAt && publishedAt >= new Date(`${discoverDateFrom}T00:00:00`),
      );
    const toMatches =
      !discoverDateTo ||
      Boolean(
        publishedAt &&
        publishedAt <= new Date(`${discoverDateTo}T23:59:59.999`),
      );
    const queryMatches =
      !query ||
      title.includes(query) ||
      author.includes(query) ||
      location.includes(query);

    return (
      categoryMatches &&
      locationMatches &&
      fromMatches &&
      toMatches &&
      queryMatches
    );
  });
  const visibleBattles = battles.filter(
    (battle) => battleFilter === "all" || battle.scope === battleFilter,
  );
  const visibleMapPhotos = publicPhotos.filter(
    (photo) => locationFilter === "all" || photo.locationId === locationFilter,
  );
  const profilePhotos = uploadedPhotos.filter((photo) => photo.isMine);
  const mapLocations = useMemo(
    () =>
      locationPins.map((location) => ({
        ...location,
        label: getMessage(locale, location.key),
      })),
    [locale],
  );
  const mapPhotoMarkers = useMemo<readonly PhotoMapMarker[]>(() => {
    const locationPhotoCounts = new Map<LocationId, number>();

    return publicPhotos.map((photo) => {
      const location =
        locationPins.find((candidate) => candidate.id === photo.locationId) ??
        locationPins[0]!;
      const locationPhotoIndex = locationPhotoCounts.get(location.id) ?? 0;
      locationPhotoCounts.set(location.id, locationPhotoIndex + 1);
      const angle = (locationPhotoIndex * 137.5 * Math.PI) / 180;
      const radius =
        locationPhotoIndex === 0
          ? 0
          : 0.045 * Math.ceil(locationPhotoIndex / 5);

      return {
        id: location.id,
        imageUrl: photo.src,
        label: getLocationLabel(location.id, locale, photo.locationLabel),
        latitude: location.latitude + Math.cos(angle) * radius,
        longitude: location.longitude + Math.sin(angle) * radius,
        photoId: photo.id,
        title: getPhotoTitle(photo, locale),
      };
    });
  }, [locale, publicPhotos]);

  useEffect(() => {
    const storedAccount = readLocalStorage<AccountRecord | null>(
      accountStorageKey,
      null,
    );
    setAccount(
      storedAccount
        ? { ...storedAccount, tier: storedAccount.tier ?? "viewer" }
        : null,
    );
    setSessionEmail(readLocalStorage<string | null>(sessionStorageKey, null));
    setUploadedPhotos(
      readLocalStorage<PhotoRecord[]>(photosStorageKey, []).map((photo) => ({
        ...photo,
        published: Boolean(photo.published),
      })),
    );
    setBattleVotes(
      normalizeStoredBattleVotes(
        readLocalStorage<Record<string, BattleEvaluationRecord | string>>(
          battleVotesStorageKey,
          {},
        ),
      ),
    );
    setChallengeEntries(
      readLocalStorage<Record<string, string>>(challengeEntriesStorageKey, {}),
    );
    setSeasonJoined(readLocalStorage<boolean>(seasonJoinedStorageKey, false));
    setSavedPhotoIds(readLocalStorage<string[]>(savedPhotosStorageKey, []));
    setLikedPhotoIds(readLocalStorage<string[]>(likedPhotosStorageKey, []));
    setMoodboardPhotoIds(readLocalStorage<string[]>(moodboardStorageKey, []));
    setWishlistProductIds(readLocalStorage<string[]>(wishlistStorageKey, []));
    setNotifications(
      readLocalStorage<LocalNotification[]>(notificationsStorageKey, []),
    );
    setPhotoReviews(
      readLocalStorage<Record<string, PhotoReviewRecord[]>>(
        photoReviewsStorageKey,
        {},
      ),
    );
    setWalletBalanceMinor(readLocalStorage<number>(walletStorageKey, 0));
    setWalletTransactions(
      readLocalStorage<LocalWalletTransaction[]>(
        walletTransactionsStorageKey,
        [],
      ),
    );
    setServiceOrders(
      readLocalStorage<LocalOrder[]>(serviceOrdersStorageKey, []),
    );
    setPromotions(readLocalStorage<LocalPromotion[]>(promotionsStorageKey, []));
    setListedPhotoIds(
      readLocalStorage<string[]>(marketplaceListingsStorageKey, []),
    );
    setDeletionRequested(
      readLocalStorage<boolean>(deletionRequestStorageKey, false),
    );
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
    if (!isHydrated) return;
    writeLocalStorage(likedPhotosStorageKey, likedPhotoIds);
  }, [isHydrated, likedPhotoIds]);

  useEffect(() => {
    if (!isHydrated) return;
    writeLocalStorage(moodboardStorageKey, moodboardPhotoIds);
  }, [isHydrated, moodboardPhotoIds]);

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

    writeLocalStorage(notificationsStorageKey, notifications);
  }, [isHydrated, notifications]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeLocalStorage(photoReviewsStorageKey, photoReviews);
  }, [isHydrated, photoReviews]);

  useEffect(() => {
    if (!isHydrated) return;
    writeLocalStorage(walletStorageKey, walletBalanceMinor);
  }, [isHydrated, walletBalanceMinor]);

  useEffect(() => {
    if (!isHydrated) return;
    writeLocalStorage(walletTransactionsStorageKey, walletTransactions);
  }, [isHydrated, walletTransactions]);

  useEffect(() => {
    if (!isHydrated) return;
    writeLocalStorage(serviceOrdersStorageKey, serviceOrders);
  }, [isHydrated, serviceOrders]);

  useEffect(() => {
    if (!isHydrated) return;
    writeLocalStorage(promotionsStorageKey, promotions);
  }, [isHydrated, promotions]);

  useEffect(() => {
    if (!isHydrated) return;
    writeLocalStorage(marketplaceListingsStorageKey, listedPhotoIds);
  }, [isHydrated, listedPhotoIds]);

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
      reviewPrice: String((currentProfile.reviewPrice ?? 3500) / 100),
      username: currentProfile.username,
      website: currentProfile.website,
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
      text:
        outcome === "connected"
          ? t("social.connectionSuccess")
          : t("social.connectionFailed"),
    });
    router.replace(getSectionHref(locale, "profile"));
  }, [locale, router]);

  useEffect(() => {
    if (
      !isAuthOpen &&
      !isAddPhotoOpen &&
      !imagePreview &&
      !isPhotoReviewOpen &&
      !isMobileMenuOpen &&
      !isLanguageMenuOpen &&
      !isNotificationMenuOpen &&
      !commerceDialog
    ) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setAuthOpen(false);
        setAddPhotoOpen(false);
        setImagePreview(null);
        setPhotoReviewOpen(false);
        setMobileMenuOpen(false);
        setLanguageMenuOpen(false);
        setNotificationMenuOpen(false);
        setCommerceDialog(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    imagePreview,
    isPhotoReviewOpen,
    isAddPhotoOpen,
    isAuthOpen,
    isLanguageMenuOpen,
    isMobileMenuOpen,
    isNotificationMenuOpen,
    commerceDialog,
  ]);

  useEffect(() => {
    if (!isLanguageMenuOpen) return;

    function handlePointerDown(event: PointerEvent): void {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setLanguageMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isLanguageMenuOpen]);

  useEffect(() => {
    if (!imagePreview && !commerceDialog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [commerceDialog, imagePreview]);

  function t(key: MessageKey): string {
    return getMessage(locale, key);
  }

  function formatVoteCount(count: number): string {
    const pluralCategory = new Intl.PluralRules(locale).select(count);
    const labelKey =
      pluralCategory === "one"
        ? "battles.votes.one"
        : pluralCategory === "few"
          ? "battles.votes.few"
          : "battles.votes.many";

    return `${numberFormatter.format(count)} ${t(labelKey)}`;
  }

  function renderVerifiedBadge(): ReactNode {
    return (
      <BadgeCheck
        aria-label={t("author.verified")}
        className="verified-author-badge"
        role="img"
        size={17}
      >
        <title>{t("author.verified")}</title>
      </BadgeCheck>
    );
  }

  function renderProfessionalBadge(): ReactNode {
    return (
      <span
        aria-label={t("author.professional")}
        className="professional-avatar-badge"
        role="img"
        title={t("author.professional")}
      >
        <Crown aria-hidden="true" size={14} strokeWidth={2.4} />
      </span>
    );
  }

  function renderAccountTierBadge(tier: AccountTier): ReactNode {
    const tierKey = `author.tier.${tier}` as MessageKey;
    const TierIcon =
      tier === "star"
        ? Sparkles
        : tier === "professional"
          ? Crown
          : tier === "experienced"
            ? Medal
            : tier === "beginner"
              ? Aperture
              : tier === "amateur"
                ? Camera
                : UserCircle;

    return (
      <span
        aria-label={t(tierKey)}
        className={`account-tier-badge is-${tier}`}
        role="img"
        title={t(tierKey)}
      >
        <TierIcon aria-hidden="true" size={14} strokeWidth={2.3} />
      </span>
    );
  }

  function renderPreviewableImage(
    src: string,
    alt: string,
    photoId?: string,
  ): ReactNode {
    const openPreview = (): void => {
      setPhotoReviewOpen(false);
      setPhotoReviewComment("");
      setPhotoReviewScores({ ...defaultBattleScores });
      setImagePreview({ alt, photoId, src: getLargeImageSource(src) });
    };

    return (
      <img
        alt={alt}
        className="previewable-image"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openPreview();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          openPreview();
        }}
        role="button"
        src={src}
        tabIndex={0}
        title={t("photo.openPreview")}
      />
    );
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
      const availability = await apiRequest<{
        providers: readonly SocialProviderRecord[];
      }>("/social-connections/providers");
      setSocialProviders(availability.providers);

      if (!includeMine) return;

      const connected = await apiRequest<{
        providers: readonly SocialProviderRecord[];
      }>("/social-connections");
      setSocialProviders(connected.providers);
      setSocialSessionReady(true);

      const socialLinks: SocialLinks = {};
      for (const provider of connected.providers) {
        if (provider.profile?.url) socialLinks[provider.id] = provider.profile;
      }
      setAccount((current) =>
        current ? { ...current, socialLinks } : current,
      );
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
      `${getApiRoot()}/social-connections/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  async function disconnectSocialProvider(
    provider: SocialPlatformId,
  ): Promise<void> {
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

  function handleLanguageChange(nextLocale: SupportedLocale): void {
    setLanguageMenuOpen(false);
    writeLocaleCookie(nextLocale);
    router.push(getSectionHref(nextLocale, initialSection));
  }

  async function handlePhotoChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
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
      votes: 0,
    };

    setUploadedPhotos((current) => [uploadedPhoto, ...current]);
    if (currentProfile?.tier === "viewer") {
      setAccount({ ...currentProfile, tier: "beginner" });
    }
    setSelectedPhotoId(uploadedPhoto.id);
    setPhotoFeedback({ kind: "success", text: t("photo.saved") });
  }

  async function handleAvatarChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
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

  async function handleCoverChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
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
      [field]: value,
    }));
  }

  async function establishServerSession(
    mode: AuthMode,
    profile: AccountRecord,
    password: string,
  ): Promise<boolean> {
    const registerBody = {
      displayName: profile.name,
      email: profile.email,
      password,
      username: profile.username,
    };
    const loginBody = { email: profile.email, password };
    const attempts =
      mode === "register"
        ? ([
            ["/auth/register", registerBody],
            ["/auth/login", loginBody],
          ] as const)
        : ([
            ["/auth/login", loginBody],
            ["/auth/register", registerBody],
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

  async function handleAuthSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
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
        tier: "viewer",
        username: makeUsername(name, email),
        website: "https://gprn.example/profile",
        wins: 0,
      };

      const serverReady = await establishServerSession(
        "register",
        newAccount,
        password,
      );
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

    const serverReady = await establishServerSession(
      "login",
      account,
      password,
    );
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

  function updateProfileField(
    field: keyof ProfileForm,
    value: string | boolean,
  ): void {
    setProfileForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function saveProfile(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!currentProfile) {
      openAuth("login");
      return;
    }

    const canOfferReviews = ["experienced", "professional", "star"].includes(
      currentProfile.tier ?? "viewer",
    );
    const reviewPrice = Math.round(Number(profileForm.reviewPrice) * 100);

    if (
      canOfferReviews &&
      (!Number.isFinite(reviewPrice) || reviewPrice <= 0)
    ) {
      setGlobalFeedback({ kind: "error", text: t("commerce.invalidAmount") });
      return;
    }

    setAccount({
      ...currentProfile,
      availableForHire: profileForm.availableForHire,
      bio: profileForm.bio.trim() || t("profile.defaultBio"),
      location: profileForm.location.trim() || t("profile.defaultLocation"),
      name: profileForm.displayName.trim() || currentProfile.name,
      reviewPrice: canOfferReviews
        ? reviewPrice
        : currentProfile.reviewPrice,
      username:
        normalizeUsername(profileForm.username) || currentProfile.username,
      website: profileForm.website.trim(),
    });
    if (canOfferReviews) {
      void apiRequest("/platform/paid-review-settings", {
        body: JSON.stringify({ enabled: true, priceMinor: reviewPrice }),
        method: "PATCH",
      }).catch(() => undefined);
    }
    setGlobalFeedback({ kind: "success", text: t("profile.saved") });
  }

  function publishPhoto(photoId: string): void {
    if (!currentProfile) {
      openAuth("login");
      setGlobalFeedback({
        kind: "error",
        text: t("photo.publishRequiresLogin"),
      });
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
              uploadedAt: photo.uploadedAt ?? new Date().toISOString(),
            }
          : photo,
      ),
    );
    setGlobalFeedback({ kind: "success", text: t("photo.published") });
    pushNotification("notifications.photoPublished");
  }

  function toggleSavePhoto(photoId: string): void {
    setSavedPhotoIds((current) =>
      current.includes(photoId)
        ? current.filter((savedPhotoId) => savedPhotoId !== photoId)
        : [...current, photoId],
    );
  }

  function toggleLikePhoto(photoId: string): void {
    setLikedPhotoIds((current) =>
      current.includes(photoId)
        ? current.filter((likedPhotoId) => likedPhotoId !== photoId)
        : [...current, photoId],
    );
  }

  function toggleMoodboardPhoto(photoId: string): void {
    setMoodboardPhotoIds((current) =>
      current.includes(photoId)
        ? current.filter((moodboardPhotoId) => moodboardPhotoId !== photoId)
        : [...current, photoId],
    );
  }

  function toggleMarketplaceListing(photoId: string): void {
    setListedPhotoIds((current) =>
      current.includes(photoId)
        ? current.filter((listedPhotoId) => listedPhotoId !== photoId)
        : [...current, photoId],
    );
    setGlobalFeedback({
      kind: "success",
      text: listedPhotoIds.includes(photoId)
        ? t("marketplace.unlisted")
        : t("marketplace.listed"),
    });
  }

  function buyMarketplaceItem(title: string, priceMinor: number): void {
    if (!currentProfile) {
      openAuth("login");
      return;
    }
    if (walletBalanceMinor < priceMinor) {
      setGlobalFeedback({ kind: "error", text: t("wallet.insufficient") });
      return;
    }
    const now = new Date().toISOString();
    setWalletBalanceMinor((current) => current - priceMinor);
    setWalletTransactions((current) => [
      {
        amountMinor: -priceMinor,
        createdAt: now,
        id: `wallet-${Date.now()}`,
        label: `${t("marketplace.purchase")}: ${title}`,
      },
      ...current,
    ]);
    setGlobalFeedback({ kind: "success", text: t("marketplace.purchased") });
  }

  function openCommerceDialog(dialog: Exclude<CommerceDialog, null>): void {
    if (!currentProfile) {
      openAuth("login");
      setGlobalFeedback({ kind: "error", text: t("common.signInRequired") });
      return;
    }
    setCommerceForm({
      ...emptyCommerceForm,
      amount:
        dialog.kind === "review"
          ? String((dialog.author.reviewPrice ?? 3500) / 100)
          : dialog.kind === "donation"
            ? "10"
            : dialog.kind === "service"
              ? "150"
              : dialog.kind === "promotion"
                ? String(promotionPriceMinor.marketplace / 100)
                : "25",
      photoId:
        dialog.kind === "promotion"
          ? dialog.photo.id
          : (selectedUploadedPhoto?.id ?? ""),
    });
    setCommerceDialog(dialog);
  }

  function updateCommerceField<K extends keyof CommerceForm>(
    field: K,
    value: CommerceForm[K],
  ): void {
    setCommerceForm((current) => ({ ...current, [field]: value }));
  }

  function submitCommerce(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!commerceDialog || !currentProfile) return;

    const now = new Date().toISOString();
    const amountMinor = Math.round(Number(commerceForm.amount) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setGlobalFeedback({ kind: "error", text: t("commerce.invalidAmount") });
      return;
    }

    if (commerceDialog.kind === "wallet") {
      setWalletBalanceMinor((current) => current + amountMinor);
      setWalletTransactions((current) => [
        {
          amountMinor,
          createdAt: now,
          id: `wallet-${Date.now()}`,
          label:
            commerceForm.paymentMethod === "card"
              ? t("wallet.cardTopUp")
              : t("wallet.cryptoTopUp"),
        },
        ...current,
      ]);
      setGlobalFeedback({ kind: "success", text: t("wallet.toppedUp") });
      setCommerceDialog(null);
      return;
    }

    if (commerceDialog.kind === "promotion") {
      const priceMinor = promotionPriceMinor[commerceForm.placement];
      if (walletBalanceMinor < priceMinor) {
        setGlobalFeedback({ kind: "error", text: t("wallet.insufficient") });
        return;
      }
      setWalletBalanceMinor((current) => current - priceMinor);
      setWalletTransactions((current) => [
        {
          amountMinor: -priceMinor,
          createdAt: now,
          id: `wallet-${Date.now()}`,
          label: t(
            `promotion.placement.${commerceForm.placement}` as MessageKey,
          ),
        },
        ...current,
      ]);
      setPromotions((current) => [
        {
          authorName: currentProfile.name,
          createdAt: now,
          id: `promotion-${Date.now()}`,
          photoId: commerceDialog.photo.id,
          placement: commerceForm.placement,
          priceMinor,
        },
        ...current,
      ]);
      setGlobalFeedback({ kind: "success", text: t("promotion.created") });
      pushNotification("notifications.promotionCreated");
      setCommerceDialog(null);
      return;
    }

    if (commerceDialog.kind === "donation") {
      if (walletBalanceMinor < amountMinor) {
        setGlobalFeedback({ kind: "error", text: t("wallet.insufficient") });
        return;
      }
      setWalletBalanceMinor((current) => current - amountMinor);
      setWalletTransactions((current) => [
        {
          amountMinor: -amountMinor,
          createdAt: now,
          id: `wallet-${Date.now()}`,
          label: `${t("donation.title")}: ${t(commerceDialog.author.nameKey)}`,
        },
        ...current,
      ]);
      setGlobalFeedback({ kind: "success", text: t("donation.sent") });
      setCommerceDialog(null);
      return;
    }

    if (!commerceForm.message.trim() && commerceDialog.kind === "service") {
      setGlobalFeedback({ kind: "error", text: t("service.messageRequired") });
      return;
    }
    if (!commerceForm.photoId && commerceDialog.kind === "review") {
      setGlobalFeedback({ kind: "error", text: t("service.photoRequired") });
      return;
    }

    const orderPrice =
      commerceDialog.kind === "review"
        ? (commerceDialog.author.reviewPrice ?? 3500)
        : amountMinor;
    const order: LocalOrder = {
      authorId: commerceDialog.author.id,
      authorName: t(commerceDialog.author.nameKey),
      createdAt: now,
      customerName: currentProfile.name,
      id: `order-${Date.now()}`,
      kind: commerceDialog.kind,
      message: commerceForm.message.trim(),
      photoId:
        commerceDialog.kind === "review" ? commerceForm.photoId : undefined,
      priceMinor: orderPrice,
      referenceFiles: commerceForm.referenceFiles,
      referenceUrl: commerceForm.referenceUrl.trim() || undefined,
      status: "pending",
    };
    setServiceOrders((current) => [order, ...current]);
    pushNotification(
      commerceDialog.kind === "review"
        ? "notifications.reviewRequested"
        : "notifications.serviceRequested",
    );
    setGlobalFeedback({ kind: "success", text: t("service.requestSent") });
    setCommerceDialog(null);
  }

  function updateLocalOrder(
    orderId: string,
    status: OrderStatus,
    providerComment?: string,
  ): void {
    const order = serviceOrders.find((candidate) => candidate.id === orderId);
    if (!order) return;
    if (status === "completed" && order.status !== "completed") {
      if (walletBalanceMinor < order.priceMinor) {
        setGlobalFeedback({ kind: "error", text: t("wallet.insufficient") });
        return;
      }
      const fee = Math.round(order.priceMinor * 0.05);
      setWalletBalanceMinor((current) => current - order.priceMinor);
      setWalletTransactions((current) => [
        {
          amountMinor: -order.priceMinor,
          createdAt: new Date().toISOString(),
          id: `wallet-${Date.now()}`,
          label: `${t("service.completed")}; ${t("service.fee")}: ${formatMoney(fee, locale)}`,
        },
        ...current,
      ]);
    }
    setServiceOrders((current) =>
      current.map((candidate) =>
        candidate.id === orderId
          ? { ...candidate, providerComment, status }
          : candidate,
      ),
    );
    pushNotification("notifications.orderUpdated");
  }

  function rateLocalOrder(
    orderId: string,
    rating: number,
    isProvider: boolean,
  ): void {
    const comment = orderRatingComments[orderId]?.trim() || undefined;
    setServiceOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? isProvider
            ? {
                ...order,
                providerRating: rating,
                providerRatingComment: comment,
              }
            : {
                ...order,
                customerRating: rating,
                customerRatingComment: comment,
                rating,
                ratingComment: comment,
              }
          : order,
      ),
    );
    setOrderRatingComments((current) => ({ ...current, [orderId]: "" }));
    setGlobalFeedback({ kind: "success", text: t("service.ratingSaved") });
  }

  function pushNotification(messageKey: MessageKey): void {
    setNotifications((current) =>
      [
        {
          createdAt: new Date().toISOString(),
          id: `notification-${Date.now()}-${current.length}`,
          messageKey,
          read: false,
        },
        ...current,
      ].slice(0, 50),
    );
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
        seasonJoined,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([payload], { type: "application/json" }),
    );
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

  function voteForBattleEntry(battle: BattleRecord, entryId: string): void {
    if (!currentProfile) {
      openAuth("login");
      setGlobalFeedback({ kind: "error", text: t("battles.signIn") });
      return;
    }

    if (battleVotes[battle.id]) {
      setGlobalFeedback({ kind: "error", text: t("battles.duplicate") });
      return;
    }

    const winningEntry = battle.entries.find((entry) => entry.id === entryId);
    const losingEntry = battle.entries.find((entry) => entry.id !== entryId);

    if (!winningEntry || !losingEntry) return;

    const voteWeight = getBattleVoteWeight(currentProfile.tier ?? "viewer");

    setBattles((currentBattles) =>
      currentBattles.map((currentBattle) => {
        if (currentBattle.id !== battle.id) return currentBattle;

        const ratingChange = ratingEngine.calculateBattleWin({
          loserRating: losingEntry.rating,
          winnerRating: winningEntry.rating,
        });

        return {
          ...currentBattle,
          entries: currentBattle.entries.map((entry) => {
            if (entry.id === winningEntry.id) {
              return {
                ...entry,
                rating: ratingChange.winnerRating,
                votes: entry.votes + voteWeight,
              };
            }

            if (entry.id === losingEntry.id) {
              return { ...entry, rating: ratingChange.loserRating };
            }

            return entry;
          }) as [BattleEntry, BattleEntry],
        };
      }),
    );
    setBattleVotes((currentVotes) => ({
      ...currentVotes,
      [battle.id]: {
        submittedAt: new Date().toISOString(),
        winnerEntryId: winningEntry.id,
      },
    }));
    setGlobalFeedback({ kind: "success", text: t("battles.voted") });
    pushNotification("notifications.battleVote");
  }

  function openDetailedPhotoReview(): void {
    if (!currentProfile) {
      setImagePreview(null);
      openAuth("login");
      setGlobalFeedback({ kind: "error", text: t("photo.reviewSignIn") });
      return;
    }

    const tier = currentProfile.tier ?? "viewer";

    if (tier !== "professional" && tier !== "star") {
      setGlobalFeedback({
        kind: "error",
        text: t("photo.reviewProfessionalOnly"),
      });
      return;
    }

    setPhotoReviewOpen(true);
  }

  function submitPhotoReview(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!currentProfile || !imagePreview?.photoId) return;

    const tier = currentProfile.tier ?? "viewer";

    if (tier !== "professional" && tier !== "star") return;

    const review: PhotoReviewRecord = {
      comment: photoReviewComment.trim() || undefined,
      createdAt: new Date().toISOString(),
      reviewerName: currentProfile.name,
      reviewerTier: tier,
      scores: { ...photoReviewScores },
    };

    setPhotoReviews((current) => ({
      ...current,
      [imagePreview.photoId!]: [
        ...(current[imagePreview.photoId!] ?? []),
        review,
      ],
    }));
    setPhotoReviewOpen(false);
    setPhotoReviewComment("");
    setPhotoReviewScores({ ...defaultBattleScores });
    setGlobalFeedback({ kind: "success", text: t("photo.reviewSaved") });
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

    const opponent = curatedPhotos
      .filter((photo) => photo.categoryId === selectedUploadedPhoto.categoryId)
      .map((photo) => ({
        photo,
        rating:
          publicAuthorProfiles.find(
            (author) => author.id === getPhotoAuthorId(photo),
          )?.rating ?? 1500,
      }))
      .sort(
        (left, right) =>
          Math.abs(left.rating - currentProfile.rating) -
          Math.abs(right.rating - currentProfile.rating),
      )[0];

    if (!opponent?.photo.titleKey || !opponent.photo.authorKey) {
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
          votes: 0,
        },
        {
          id: `${battleId}-opponent`,
          imageUrl: opponent.photo.src,
          locationId: opponent.photo.locationId,
          photographerKey: opponent.photo.authorKey,
          rating: opponent.rating,
          titleKey: opponent.photo.titleKey,
          votes: 0,
        },
      ],
      id: battleId,
      scope: "friend",
      statusKey: "battles.open",
      titleKey: "data.battle.localTitle",
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
      [challengeId]: selectedUploadedPhoto.id,
    }));
    setGlobalFeedback({ kind: "success", text: t("challenges.submitted") });
    pushNotification("notifications.challengeSubmitted");
  }

  function toggleWishlist(productId: string): void {
    setWishlistProductIds((current) =>
      current.includes(productId)
        ? current.filter((itemId) => itemId !== productId)
        : [...current, productId],
    );
  }

  const activeLanguage = languageOptions.find(
    (option) => option.locale === locale,
  )!;

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href={getSectionHref(locale, "home")}>
          <span className="brand-mark">{t("app.shortName").slice(0, 1)}</span>
          <span>{t("app.name")}</span>
        </Link>

        <button
          aria-expanded={isMobileMenuOpen}
          aria-label={t("nav.menu")}
          className="mobile-menu-button"
          onClick={() => {
            setMobileMenuOpen((isOpen) => !isOpen);
          }}
          type="button"
        >
          {isMobileMenuOpen ? (
            <X aria-hidden="true" size={20} />
          ) : (
            <Menu aria-hidden="true" size={20} />
          )}
        </button>

        <nav
          aria-label={t("nav.home")}
          className={`nav${isMobileMenuOpen ? " is-open" : ""}`}
        >
          {navItems.map(({ Icon, id, messageKey }) => (
            <Link
              aria-current={initialSection === id ? "page" : undefined}
              className={`nav-button${initialSection === id ? " is-active" : ""}`}
              href={getSectionHref(locale, id)}
              key={id}
              onClick={() => {
                setMobileMenuOpen(false);
              }}
            >
              <Icon aria-hidden="true" size={15} />
              <span>{t(messageKey)}</span>
            </Link>
          ))}
        </nav>

        <div className={`header-tools${isMobileMenuOpen ? " is-open" : ""}`}>
          <div className="language-picker" ref={languageMenuRef}>
            <button
              aria-expanded={isLanguageMenuOpen}
              aria-haspopup="menu"
              aria-label={`${t("language.label")}: ${t(activeLanguage.labelKey)}`}
              className="language-trigger"
              onClick={() => {
                setLanguageMenuOpen((isOpen) => !isOpen);
              }}
              type="button"
            >
              <img
                alt=""
                aria-hidden="true"
                className="language-flag"
                height="15"
                src={`https://flagcdn.com/w40/${activeLanguage.flagCode}.png`}
                width="22"
              />
              <span>{activeLanguage.locale.toUpperCase()}</span>
              <ChevronDown
                aria-hidden="true"
                className={isLanguageMenuOpen ? "is-open" : ""}
                size={14}
              />
            </button>

            {isLanguageMenuOpen ? (
              <div
                aria-label={t("language.label")}
                className="language-menu"
                role="menu"
              >
                {languageOptions.map((option) => (
                  <button
                    aria-checked={option.locale === locale}
                    className={option.locale === locale ? "is-active" : ""}
                    key={option.locale}
                    onClick={() => {
                      handleLanguageChange(option.locale);
                    }}
                    role="menuitemradio"
                    type="button"
                  >
                    <img
                      alt=""
                      aria-hidden="true"
                      className="language-flag"
                      height="15"
                      src={`https://flagcdn.com/w40/${option.flagCode}.png`}
                      width="22"
                    />
                    <span className="language-option-name">
                      {t(option.labelKey)}
                    </span>
                    <span className="language-code">
                      {option.locale.toUpperCase()}
                    </span>
                    {option.locale === locale ? (
                      <Check aria-hidden="true" size={15} strokeWidth={2.5} />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {currentProfile ? (
            <>
              <div className="header-notifications">
                <button
                  aria-expanded={isNotificationMenuOpen}
                  aria-label={t("notifications.title")}
                  className="header-icon-button"
                  onClick={() => {
                    setNotificationMenuOpen((current) => !current);
                  }}
                  title={t("notifications.title")}
                  type="button"
                >
                  <Bell aria-hidden="true" size={18} />
                  {notifications.some((notification) => !notification.read) ? (
                    <span className="notification-dot">
                      {
                        notifications.filter(
                          (notification) => !notification.read,
                        ).length
                      }
                    </span>
                  ) : null}
                </button>
                {isNotificationMenuOpen ? (
                  <div className="header-notification-menu">
                    <div className="notification-menu-head">
                      <strong>{t("notifications.title")}</strong>
                      <button
                        className="text-link-button"
                        onClick={() => {
                          setNotifications((current) =>
                            current.map((notification) => ({
                              ...notification,
                              read: true,
                            })),
                          );
                        }}
                        type="button"
                      >
                        {t("notifications.markRead")}
                      </button>
                    </div>
                    {notifications.length > 0 ? (
                      notifications.slice(0, 6).map((notification) => (
                        <div
                          className={`header-notification-item${notification.read ? "" : " is-unread"}`}
                          key={notification.id}
                        >
                          <span>{t(notification.messageKey)}</span>
                          <time>
                            {formatDate(locale, notification.createdAt)}
                          </time>
                        </div>
                      ))
                    ) : (
                      <p>{t("notifications.empty")}</p>
                    )}
                  </div>
                ) : null}
              </div>
              <Link
                className="user-pill"
                href={getSectionHref(locale, "profile")}
              >
                {currentProfile.avatarUrl ? (
                  <img
                    alt={t("profile.avatarAlt")}
                    src={currentProfile.avatarUrl}
                  />
                ) : (
                  <span>{getInitials(currentProfile.name)}</span>
                )}
                <strong>{currentProfile.name}</strong>
              </Link>
              <button
                className="icon-text-button"
                onClick={logOut}
                type="button"
              >
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

      {initialSection === "home"
        ? renderHomePage()
        : renderSectionPage(initialSection)}

      {renderFooter()}
      {isAuthOpen ? renderAuthDialog() : null}
      {isAddPhotoOpen ? renderAddPhotoDialog() : null}
      {commerceDialog ? renderCommerceDialog() : null}
      {imagePreview ? renderImagePreviewDialog() : null}
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
              <button
                className="primary-action"
                onClick={openAddPhoto}
                type="button"
              >
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
                ["240+", "home.metric.cities"],
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
              {renderPreviewableImage(
                selectedUploadedPhoto?.src ?? sampleImages.city,
                getPhotoTitle(
                  selectedUploadedPhoto ?? curatedPhotos[0],
                  locale,
                ),
              )}
              <div className="hero-photo-labels">
                <div className="hero-photo-label">
                  <ShieldCheck aria-hidden="true" size={16} />
                  <div>
                    <strong>{t("photo.provenanceTitle")}</strong>
                    <span>
                      {selectedUploadedPhoto?.checksum ??
                        t("status.originalSupported")}
                    </span>
                  </div>
                </div>
                <div className="hero-photo-label">
                  <Trophy aria-hidden="true" size={16} />
                  <div>
                    <strong>{t("section.battles.title")}</strong>
                    <span>{t("battles.open")}</span>
                  </div>
                </div>
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
          <button
            className="primary-action"
            onClick={openAddPhoto}
            type="button"
          >
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
                  <Link
                    className="feature-card"
                    href={getSectionHref(locale, id)}
                    key={id}
                  >
                    <Icon aria-hidden="true" size={22} />
                    <strong>{t(messageKey)}</strong>
                    <span>{t(meta.introKey)}</span>
                    <ChevronRight
                      aria-hidden="true"
                      className="feature-arrow"
                      size={18}
                    />
                  </Link>
                );
              })}
          </div>
        </section>

        <section className="sponsor-band">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("sponsors.eyebrow")}</span>
              <h2>{t("sponsors.title")}</h2>
              <p>{t("sponsors.copy")}</p>
            </div>
            {currentProfile && selectedUploadedPhoto ? (
              <button
                className="secondary-action compact"
                onClick={() => {
                  openCommerceDialog({
                    kind: "promotion",
                    photo: selectedUploadedPhoto,
                  });
                }}
                type="button"
              >
                <Megaphone aria-hidden="true" size={16} />
                {t("promotion.promote")}
              </button>
            ) : null}
          </div>
          <div className="sponsor-grid">
            {(promotions.some((promotion) => promotion.placement === "home")
              ? promotions
                  .filter((promotion) => promotion.placement === "home")
                  .flatMap((promotion) => {
                    const photo = allPhotos.find(
                      (candidate) => candidate.id === promotion.photoId,
                    );
                    return photo ? [{ photo, promotion }] : [];
                  })
              : curatedPhotos.slice(0, 3).map((photo, index) => ({
                  photo,
                  promotion: {
                    authorName: getPhotoAuthor(photo, locale),
                    createdAt: new Date().toISOString(),
                    id: `sample-sponsor-${index}`,
                    photoId: photo.id,
                    placement: "home" as const,
                    priceMinor: promotionPriceMinor.home,
                  },
                }))
            )
              .slice(0, 3)
              .map(({ photo, promotion }) => (
                <article className="sponsor-card" key={promotion.id}>
                  {renderPreviewableImage(
                    photo.src,
                    getPhotoTitle(photo, locale),
                    photo.id,
                  )}
                  <div className="sponsor-card-copy">
                    <span>
                      <Megaphone aria-hidden="true" size={13} />
                      {t("sponsors.sponsored")}
                    </span>
                    <strong>{getPhotoTitle(photo, locale)}</strong>
                    <small>{promotion.authorName}</small>
                  </div>
                </article>
              ))}
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
            {sectionId !== "profile" ? <p>{t(meta.introKey)}</p> : null}
          </div>
          {sectionId !== "admin" ? (
            <div className="intro-actions">
              <button
                className="primary-action"
                onClick={openAddPhoto}
                type="button"
              >
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
          ) : null}
        </section>

        {sectionId === "discover" ? renderDiscoverPage() : null}
        {sectionId === "battles" ? renderBattlesPage() : null}
        {sectionId === "challenges" ? renderChallengesPage() : null}
        {sectionId === "leaderboard" ? renderLeaderboardPage() : null}
        {sectionId === "map" ? renderMapPage() : null}
        {sectionId === "marketplace" ? renderMarketplacePage() : null}
        {sectionId === "experts" ? renderExpertsPage() : null}
        {sectionId === "profile" ? renderProfilePage() : null}
        {sectionId === "admin" ? renderAdminPage() : null}
      </>
    );
  }

  function renderDiscoverPage(): ReactNode {
    return (
      <section className="workspace-grid discover-workspace">
        <div className="main-column">
          <div className="toolbar discover-toolbar">
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
          </div>

          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("discover.featured")}</span>
              <h2>{t("section.discover.title")}</h2>
            </div>
            <span className="count-pill">
              {numberFormatter.format(visiblePhotos.length)}
            </span>
          </div>

          {visiblePhotos.length > 0 ? (
            <div className="photo-gallery">
              {visiblePhotos.map((photo) => renderPhotoCard(photo))}
            </div>
          ) : (
            <p className="empty-state">{t("discover.empty")}</p>
          )}
        </div>

        <div className="side-column discover-filter-column">
          <aside className="discover-filter-panel">
            <div className="panel-title">
              <Filter aria-hidden="true" size={20} />
              <h2>{t("discover.filters")}</h2>
            </div>

            <div className="discover-filter-fields">
              <div className="discover-filter-field">
                <span>{t("discover.category")}</span>
                <div
                  aria-label={t("discover.category")}
                  className="category-filter-tags"
                  role="group"
                >
                  {categoryFilters.map((filter) => (
                    <button
                      aria-pressed={categoryFilter === filter.id}
                      className={`filter-tag${
                        categoryFilter === filter.id ? " is-active" : ""
                      }`}
                      key={filter.id}
                      onClick={() => {
                        setCategoryFilter(filter.id);
                      }}
                      type="button"
                    >
                      {t(filter.key)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="discover-filter-field">
                <span>{t("discover.location")}</span>
                <select
                  onChange={(event) => {
                    setDiscoverLocationFilter(
                      event.target.value as LocationFilter,
                    );
                  }}
                  value={discoverLocationFilter}
                >
                  {locationFilters.map((filter) => (
                    <option key={filter.id} value={filter.id}>
                      {t(filter.key)}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="discover-date-filter">
                <legend>{t("discover.date")}</legend>
                <div className="discover-date-grid">
                  <label className="discover-filter-field discover-date-field">
                    <span className="discover-date-prefix">
                      {t("discover.dateFrom")}
                    </span>
                    <span
                      className={`discover-date-value${discoverDateFrom ? "" : " is-placeholder"}`}
                    >
                      {formatDateInputDisplay(locale, discoverDateFrom)}
                    </span>
                    <CalendarDays aria-hidden="true" size={17} />
                    <input
                      aria-label={t("discover.dateFrom")}
                      max={discoverDateTo || undefined}
                      onChange={(event) => {
                        setDiscoverDateFrom(event.target.value);
                      }}
                      type="date"
                      value={discoverDateFrom}
                    />
                  </label>
                  <label className="discover-filter-field discover-date-field">
                    <span className="discover-date-prefix">
                      {t("discover.dateTo")}
                    </span>
                    <span
                      className={`discover-date-value${discoverDateTo ? "" : " is-placeholder"}`}
                    >
                      {formatDateInputDisplay(locale, discoverDateTo)}
                    </span>
                    <CalendarDays aria-hidden="true" size={17} />
                    <input
                      aria-label={t("discover.dateTo")}
                      min={discoverDateFrom || undefined}
                      onChange={(event) => {
                        setDiscoverDateTo(event.target.value);
                      }}
                      type="date"
                      value={discoverDateTo}
                    />
                  </label>
                </div>
              </fieldset>
            </div>

            <div className="discover-filter-footer">
              <span>
                {t("discover.results").replace(
                  "{count}",
                  numberFormatter.format(visiblePhotos.length),
                )}
              </span>
              <button
                className="secondary-action compact-action"
                onClick={() => {
                  setSearchTerm("");
                  setCategoryFilter("all");
                  setDiscoverLocationFilter("all");
                  setDiscoverDateFrom("");
                  setDiscoverDateTo("");
                }}
                type="button"
              >
                <X aria-hidden="true" size={15} />
                {t("discover.clearFilters")}
              </button>
            </div>
          </aside>
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
            <dd>
              {selectedUploadedPhoto
                ? selectedUploadedPhoto.fileName
                : t("photo.empty")}
            </dd>
          </div>
          <div>
            <dt>{t("photo.metadata")}</dt>
            <dd>
              {selectedUploadedPhoto?.checksum ?? t("status.metadataPending")}
            </dd>
          </div>
          <div>
            <dt>{t("photo.captureLocation")}</dt>
            <dd>
              {selectedUploadedPhoto
                ? getLocationLabel(
                    selectedUploadedPhoto.locationId,
                    locale,
                    selectedUploadedPhoto.locationLabel,
                  )
                : t("map.location.note")}
            </dd>
          </div>
        </dl>
      </aside>
    );
  }

  function renderPhotoCard(photo: PhotoRecord): ReactNode {
    const isSaved = savedPhotoIds.includes(photo.id);
    const isLiked = likedPhotoIds.includes(photo.id);
    const isInMoodboard = moodboardPhotoIds.includes(photo.id);
    const authorProfile = publicAuthorProfiles.find(
      (author) => author.id === getPhotoAuthorId(photo),
    );

    const openDiscoverWithCategory = (): void => {
      setCategoryFilter(photo.categoryId);

      if (initialSection !== "discover") {
        router.push(
          `${getSectionHref(locale, "discover")}?category=${photo.categoryId}`,
        );
      }
    };

    const openDiscoverWithLocation = (): void => {
      setDiscoverLocationFilter(photo.locationId);

      if (initialSection !== "discover") {
        router.push(
          `${getSectionHref(locale, "discover")}?location=${photo.locationId}`,
        );
      }
    };

    return (
      <article className="photo-card" key={photo.id}>
        {renderPreviewableImage(
          photo.src,
          getPhotoTitle(photo, locale),
          photo.id,
        )}
        <div className="photo-card-body">
          <div>
            <strong>{getPhotoTitle(photo, locale)}</strong>
            <Link
              className="photo-author-link"
              href={
                photo.isMine
                  ? getSectionHref(locale, "profile")
                  : `${getSectionHref(locale, "profile")}?author=${encodeURIComponent(getPhotoAuthorId(photo))}`
              }
            >
              <span>{getPhotoAuthor(photo, locale)}</span>
              {authorProfile?.verified ? renderVerifiedBadge() : null}
            </Link>
          </div>
          <div className="meta-row">
            <button
              aria-pressed={
                initialSection === "discover" &&
                discoverLocationFilter === photo.locationId
              }
              className="photo-meta-tag"
              onClick={openDiscoverWithLocation}
              type="button"
            >
              <MapPin aria-hidden="true" size={14} />
              {getLocationLabel(photo.locationId, locale, photo.locationLabel)}
            </button>
            <button
              aria-pressed={
                initialSection === "discover" &&
                categoryFilter === photo.categoryId
              }
              className="photo-meta-tag"
              onClick={openDiscoverWithCategory}
              type="button"
            >
              {t(getCategoryKey(photo.categoryId))}
            </button>
          </div>
          {photo.isMine ? (
            <div className="photo-status-row">
              <span
                className={`photo-status ${photo.published ? "is-public" : "is-draft"}`}
              >
                {photo.published ? t("photo.public") : t("photo.draft")}
              </span>
            </div>
          ) : null}
          <div className="photo-actions">
            <button
              aria-label={isLiked ? t("photo.unlike") : t("photo.like")}
              aria-pressed={isLiked}
              className={`photo-counter-action${isLiked ? " is-active" : ""}`}
              onClick={() => {
                toggleLikePhoto(photo.id);
              }}
              title={isLiked ? t("photo.unlike") : t("photo.like")}
              type="button"
            >
              <Heart
                aria-hidden="true"
                fill={isLiked ? "currentColor" : "none"}
                size={17}
              />
              <span>
                {numberFormatter.format(photo.votes + (isLiked ? 1 : 0))}
              </span>
            </button>
            <button
              aria-label={isSaved ? t("discover.unsave") : t("discover.save")}
              aria-pressed={isSaved}
              className={`photo-counter-action${isSaved ? " is-active" : ""}`}
              onClick={() => {
                toggleSavePhoto(photo.id);
              }}
              title={isSaved ? t("discover.unsave") : t("discover.save")}
              type="button"
            >
              <Bookmark
                aria-hidden="true"
                fill={isSaved ? "currentColor" : "none"}
                size={17}
              />
              <span>
                {numberFormatter.format(
                  Math.max(3, Math.round(photo.votes * 0.18)) +
                    (isSaved ? 1 : 0),
                )}
              </span>
            </button>
            <button
              aria-label={
                isInMoodboard
                  ? t("photo.removeFromMoodboard")
                  : t("photo.addToMoodboard")
              }
              aria-pressed={isInMoodboard}
              className={`photo-counter-action${isInMoodboard ? " is-active" : ""}`}
              onClick={() => {
                toggleMoodboardPhoto(photo.id);
              }}
              title={
                isInMoodboard
                  ? t("photo.removeFromMoodboard")
                  : t("photo.addToMoodboard")
              }
              type="button"
            >
              <Images aria-hidden="true" size={17} />
              <span>
                {numberFormatter.format(
                  Math.max(1, Math.round(photo.votes * 0.07)) +
                    (isInMoodboard ? 1 : 0),
                )}
              </span>
            </button>
            <button
              aria-label={t("common.share")}
              className="icon-button"
              onClick={() => {
                void shareItem(
                  getPhotoTitle(photo, locale),
                  `/${locale}/discover?photo=${photo.id}`,
                );
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
                ) : (
                  <>
                    <button
                      className="secondary-action compact"
                      onClick={() => {
                        toggleMarketplaceListing(photo.id);
                      }}
                      type="button"
                    >
                      <ShoppingBag aria-hidden="true" size={15} />
                      {t(
                        listedPhotoIds.includes(photo.id)
                          ? "marketplace.unlist"
                          : "marketplace.list",
                      )}
                    </button>
                    <button
                      className="secondary-action compact"
                      onClick={() => {
                        openCommerceDialog({ kind: "promotion", photo });
                      }}
                      type="button"
                    >
                      <Megaphone aria-hidden="true" size={15} />
                      {t("promotion.promote")}
                    </button>
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  function renderBattlesPage(): ReactNode {
    return (
      <section className="page-section battles-workspace">
        <div className="battle-season-announcement">
          <span className="battle-season-icon" aria-hidden="true">
            <Trophy size={22} />
          </span>
          <div className="battle-season-copy">
            <span className="eyebrow">{t("battles.seasonEyebrow")}</span>
            <h2>{t("battles.seasonTitle")}</h2>
            <p>{t("battles.seasonCopy")}</p>
          </div>
          <span className="battle-season-finale">
            <Medal aria-hidden="true" size={17} />
            {t("battles.seasonFinale")}
          </span>
        </div>

        <div className="battle-controls">
          <div className="battle-create-row">
            <div className="panel-title">
              <Swords aria-hidden="true" size={20} />
              <div>
                <h2>{t("battles.joinTitle")}</h2>
                <p>{t("battles.joinCopy")}</p>
              </div>
            </div>

            <div className="battle-create-actions">
              <label className="select-box full-width">
                <Grid3X3 aria-hidden="true" size={18} />
                <span className="visually-hidden">
                  {t("common.selectPhoto")}
                </span>
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
                        {getPhotoTitle(photo, locale)} -{" "}
                        {photo.published ? t("photo.public") : t("photo.draft")}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <button
                className="primary-action"
                onClick={joinBattle}
                type="button"
              >
                <Trophy aria-hidden="true" size={18} />
                {t("battles.join")}
              </button>
            </div>
          </div>

          <div className="battle-filter-bar">
            <div className="battle-filter-label">
              <Filter aria-hidden="true" size={18} />
              <strong>{t("discover.filters")}</strong>
            </div>
            <div className="segmented battle-filter-options">
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
          </div>
        </div>

        {renderPromotedPlacement("battles")}

        <div className="battle-list">
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
    const submittedEvaluation = battleVotes[battle.id];
    const selectedEntryId = submittedEvaluation?.winnerEntryId;

    return (
      <article className="battle-card" key={battle.id}>
        <div className="battle-head">
          <div>
            <span className="eyebrow">
              {t(getBattleScopeKey(battle.scope))}
            </span>
            <h2>
              {battle.title ??
                (battle.titleKey
                  ? t(battle.titleKey)
                  : t("section.battles.title"))}
            </h2>
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
                  battle.title ??
                    (battle.titleKey
                      ? t(battle.titleKey)
                      : t("section.battles.title")),
                  `/${locale}/battles?battle=${battle.id}`,
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

            return (
              <div
                className={`battle-entry${isSelected ? " is-selected" : ""}`}
                key={entry.id}
              >
                {renderPreviewableImage(
                  entry.imageUrl,
                  entry.title ??
                    (entry.titleKey ? t(entry.titleKey) : t("photo.selected")),
                  entry.photoId ?? entry.id,
                )}
                <div className="battle-entry-body">
                  <div className="battle-entry-summary">
                    <div className="battle-entry-copy">
                      <div className="battle-entry-title">
                        <strong>
                          {entry.title ??
                            (entry.titleKey
                              ? t(entry.titleKey)
                              : t("photo.selected"))}
                        </strong>
                        <span>
                          {entry.photographerName ??
                            (entry.photographerKey
                              ? t(entry.photographerKey)
                              : t("common.you"))}
                        </span>
                      </div>
                      <div className="meta-row">
                        <span>
                          {getLocationLabel(entry.locationId, locale)}
                        </span>
                        <span>
                          {t("common.rating")}{" "}
                          {numberFormatter.format(entry.rating)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {submittedEvaluation ? (
                    <div className="battle-vote-result">
                      <Heart aria-hidden="true" size={16} />
                      <strong>{formatVoteCount(entry.votes)}</strong>
                    </div>
                  ) : (
                    <button
                      className="battle-vote-button"
                      onClick={() => {
                        voteForBattleEntry(battle, entry.id);
                      }}
                      type="button"
                    >
                      <Heart aria-hidden="true" size={17} />
                      {t("battles.vote")}
                    </button>
                  )}
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
              {t("season.status")}:{" "}
              {seasonJoined ? t("season.joined") : t("common.available")}
            </span>
          </div>
          <button
            className="primary-action compact"
            disabled={seasonJoined}
            onClick={joinSeason}
            type="button"
          >
            <Check aria-hidden="true" size={16} />
            {seasonJoined ? t("season.joined") : t("season.join")}
          </button>
        </div>

        <div className="challenge-grid">
          {challenges.map((challenge) => {
            const submittedPhotoId = challengeEntries[challenge.id];
            const submittedPhoto = uploadedPhotos.find(
              (photo) => photo.id === submittedPhotoId,
            );

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
                    {renderPreviewableImage(
                      submittedPhoto.src,
                      getPhotoTitle(submittedPhoto, locale),
                    )}
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
                  {submittedPhotoId
                    ? t("challenges.already")
                    : t("challenges.submit")}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderLeaderboardPage(): ReactNode {
    const scopeOffset =
      leaderboardScope === "global"
        ? 0
        : leaderboardScope === "city"
          ? -37
          : 24;
    const rows = [...leaderboardRows]
      .map((row, index) => ({
        ...row,
        rating: row.rating + scopeOffset - index * 3,
      }))
      .concat(
        currentProfile
          ? [
              {
                avatarUrl: currentProfile.avatarUrl ?? sampleImages.street,
                battles:
                  currentProfile.battles + Object.keys(battleVotes).length,
                change: 12,
                locationId: "kyiv" as LocationId,
                nameKey: "common.you" as MessageKey,
                rating:
                  currentProfile.rating + Object.keys(battleVotes).length * 8,
              },
            ]
          : [],
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
            <span className="leaderboard-rank">{t("leaderboard.rank")}</span>
            <span>{t("leaderboard.photographer")}</span>
            <span className="leaderboard-reputation">
              {t("leaderboard.reputation")}
            </span>
            <span className="leaderboard-change">
              {t("leaderboard.change")}
            </span>
            <span className="leaderboard-battles">
              {t("leaderboard.battles")}
            </span>
          </div>
          {rows.map((row, index) => (
            <div
              className={`leaderboard-row${row.nameKey === "common.you" ? " is-you" : ""}`}
              key={`${row.nameKey}-${index}`}
              role="row"
            >
              <span className="leaderboard-rank">{index + 1}</span>
              <span className="leaderboard-person">
                {renderPreviewableImage(row.avatarUrl, t(row.nameKey))}
                <strong>
                  {row.nameKey === "common.you" && currentProfile
                    ? currentProfile.name
                    : t(row.nameKey)}
                </strong>
                <small>{getLocationLabel(row.locationId, locale)}</small>
              </span>
              <span
                className="leaderboard-reputation"
                data-label={t("leaderboard.reputation")}
              >
                {numberFormatter.format(row.rating)}
              </span>
              <span
                className={`leaderboard-change ${row.change >= 0 ? "positive" : "negative"}`}
                data-label={t("leaderboard.change")}
              >
                {row.change >= 0 ? `+${row.change}` : row.change}
              </span>
              <span
                className="leaderboard-battles"
                data-label={t("leaderboard.battles")}
              >
                {numberFormatter.format(row.battles)}
              </span>
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
            onPhotoOpen={(src, alt) => {
              setImagePreview({ alt, src: getLargeImageSource(src) });
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
          <div className="photo-gallery">
            {visibleMapPhotos.map((photo) => renderPhotoCard(photo))}
          </div>
        </div>
      </section>
    );
  }

  function renderMarketplacePage(): ReactNode {
    return (
      <section className="page-section">
        <div className="marketplace-promo-strip">
          <div>
            <Megaphone aria-hidden="true" size={20} />
            <div>
              <strong>{t("promotion.marketplaceTitle")}</strong>
              <p>{t("promotion.marketplaceCopy")}</p>
            </div>
          </div>
          <span>{formatMoney(promotionPriceMinor.marketplace, locale)}</span>
          <button
            className="primary-action compact"
            disabled={!selectedUploadedPhoto}
            onClick={() => {
              if (selectedUploadedPhoto) {
                openCommerceDialog({
                  kind: "promotion",
                  photo: selectedUploadedPhoto,
                });
              }
            }}
            type="button"
          >
            {t("promotion.reserve")}
          </button>
        </div>

        {renderPromotedPlacement("marketplace")}

        <div className="product-grid">
          {marketplaceProducts.map((product) => {
            const isSaved = wishlistProductIds.includes(product.id);

            return (
              <article className="product-card" key={product.id}>
                {renderPreviewableImage(product.imageUrl, t(product.titleKey))}
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
                    <button
                      className="primary-action compact"
                      onClick={() => {
                        buyMarketplaceItem(
                          t(product.titleKey),
                          Math.round(
                            Number(product.price.replace(/[^0-9.]/g, "")) * 100,
                          ),
                        );
                      }}
                      type="button"
                    >
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
                      <Heart
                        aria-hidden="true"
                        fill={isSaved ? "currentColor" : "none"}
                        size={16}
                      />
                      {isSaved
                        ? t("marketplace.removeWishlist")
                        : t("marketplace.addWishlist")}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {uploadedPhotos
            .filter(
              (photo) => photo.published && listedPhotoIds.includes(photo.id),
            )
            .map((photo) => (
              <article className="product-card" key={`listing-${photo.id}`}>
                {renderPreviewableImage(
                  photo.src,
                  getPhotoTitle(photo, locale),
                  photo.id,
                )}
                <div className="product-body">
                  <span className="pill">{t("marketplace.license")}</span>
                  <h2>{getPhotoTitle(photo, locale)}</h2>
                  <p>{t("marketplace.creatorListing")}</p>
                  <dl className="definition-list compact-definition">
                    <div>
                      <dt>{t("marketplace.seller")}</dt>
                      <dd>{currentProfile?.name ?? t("common.you")}</dd>
                    </div>
                    <div>
                      <dt>{t("marketplace.price")}</dt>
                      <dd>{formatMoney(3500, locale)}</dd>
                    </div>
                  </dl>
                  <button
                    className="secondary-action compact"
                    onClick={() => {
                      toggleMarketplaceListing(photo.id);
                    }}
                    type="button"
                  >
                    <X aria-hidden="true" size={15} />
                    {t("marketplace.unlist")}
                  </button>
                </div>
              </article>
            ))}
        </div>
      </section>
    );
  }

  function renderPromotedPlacement(
    placement: Exclude<PromotionPlacement, "home">,
  ): ReactNode {
    const promotedItems = promotions
      .filter((promotion) => promotion.placement === placement)
      .flatMap((promotion) => {
        const photo = allPhotos.find(
          (candidate) => candidate.id === promotion.photoId,
        );
        return photo ? [{ photo, promotion }] : [];
      })
      .slice(0, 3);

    if (promotedItems.length === 0) return null;

    return (
      <section className={`promoted-placement is-${placement}`}>
        <div className="promoted-placement-heading">
          <Megaphone aria-hidden="true" size={16} />
          <span>{t("sponsors.sponsored")}</span>
        </div>
        <div className="promoted-placement-grid">
          {promotedItems.map(({ photo, promotion }) => (
            <article className="promoted-placement-item" key={promotion.id}>
              {renderPreviewableImage(
                photo.src,
                getPhotoTitle(photo, locale),
                photo.id,
              )}
              <div>
                <strong>{getPhotoTitle(photo, locale)}</strong>
                <span>{promotion.authorName}</span>
              </div>
            </article>
          ))}
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
            const expertAuthor: PublicAuthorProfile = {
              avatarUrl: expert.avatarUrl,
              availableForHire: true,
              bioKey: expert.headlineKey,
              completedOrders: expert.reviews,
              coverUrl: expert.avatarUrl,
              followers: expert.reviews * 12,
              id: expert.id,
              locationId: "paris",
              nameKey: expert.nameKey,
              rating: Math.round(Number(expert.rating) * 320),
              reviewPrice: 4500,
              serviceRating: Number(expert.rating),
              tier: "professional",
              username: expert.id,
              verified: true,
              wins: 0,
            };

            return (
              <article className="expert-card" key={expert.id}>
                <div className="expert-avatar-frame is-professional">
                  {renderPreviewableImage(expert.avatarUrl, t(expert.nameKey))}
                  {renderProfessionalBadge()}
                </div>
                <div>
                  <span className="pill">{t(expert.specialtyKey)}</span>
                  <h2 className="author-name-line">
                    {t(expert.nameKey)}
                    {renderVerifiedBadge()}
                  </h2>
                  <p>{t(expert.headlineKey)}</p>
                  <div className="meta-row">
                    <span>
                      <Star aria-hidden="true" size={14} />
                      {expert.rating} {t("experts.rating")}
                    </span>
                    <span>
                      {numberFormatter.format(expert.reviews)}{" "}
                      {t("experts.reviews")}
                    </span>
                  </div>
                  <div className="language-list">
                    {expert.languages.map((expertLocale) => (
                      <span key={expertLocale}>
                        {expertLocale.toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <div className="card-actions">
                    <button
                      className="primary-action compact"
                      onClick={() => {
                        openCommerceDialog({
                          author: expertAuthor,
                          kind: "review",
                        });
                      }}
                      type="button"
                    >
                      <ExternalLink aria-hidden="true" size={16} />
                      {t("experts.request")}
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

  function renderPublicAuthorProfile(author: PublicAuthorProfile): ReactNode {
    const authorPhotos = publicPhotos.filter(
      (photo) => getPhotoAuthorId(photo) === author.id,
    );
    const authorMoodboard = publicPhotos
      .filter((photo) => getPhotoAuthorId(photo) !== author.id)
      .slice(0, 3);

    return (
      <section className="profile-page">
        <div className="profile-cover has-image">
          {renderPreviewableImage(author.coverUrl, t(author.nameKey))}
        </div>

        <div className="profile-shell public-profile-shell">
          <section className="profile-main">
            <div className="profile-head">
              <div className={`profile-avatar-frame is-tier-${author.tier}`}>
                <div className="profile-avatar">
                  {renderPreviewableImage(author.avatarUrl, t(author.nameKey))}
                </div>
                {renderAccountTierBadge(author.tier)}
              </div>
              <div>
                <span className="eyebrow">{t("profile.publicProfile")}</span>
                <h2 className="author-name-line">
                  {t(author.nameKey)}
                  {author.verified ? renderVerifiedBadge() : null}
                </h2>
                <p>{t(author.bioKey)}</p>
                <div className="meta-row">
                  <span>
                    <MapPin aria-hidden="true" size={14} />
                    {getLocationLabel(author.locationId, locale)}
                  </span>
                  <span>@{author.username}</span>
                </div>
                <div className="profile-commerce-actions">
                  {author.tier !== "viewer" &&
                  (author.availableForHire ?? true) ? (
                    <button
                      className="primary-action compact"
                      onClick={() => {
                        openCommerceDialog({ author, kind: "service" });
                      }}
                      type="button"
                    >
                      <Send aria-hidden="true" size={16} />
                      {t("service.order")}
                    </button>
                  ) : null}
                  {["experienced", "professional", "star"].includes(
                    author.tier,
                  ) ? (
                    <button
                      className="secondary-action compact"
                      onClick={() => {
                        openCommerceDialog({ author, kind: "review" });
                      }}
                      type="button"
                    >
                      <Star aria-hidden="true" size={16} />
                      {t("review.order")}
                    </button>
                  ) : null}
                  {author.tier !== "viewer" ? (
                    <button
                      className="secondary-action compact"
                      onClick={() => {
                        openCommerceDialog({ author, kind: "donation" });
                      }}
                      type="button"
                    >
                      <HandCoins aria-hidden="true" size={16} />
                      {t("donation.support")}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="profile-stats">
              {[
                [author.rating, "common.rating"],
                [authorPhotos.length, "profile.photos"],
                [author.wins, "profile.wins"],
                [author.followers, "profile.followers"],
              ].map(([value, key]) => (
                <div key={key}>
                  <strong>{numberFormatter.format(Number(value))}</strong>
                  <span>{t(key as MessageKey)}</span>
                </div>
              ))}
            </div>

            {(author.completedOrders ?? 0) > 0 ? (
              <div className="service-reputation">
                <div>
                  <Star aria-hidden="true" size={17} />
                  <strong>{author.serviceRating?.toFixed(1) ?? "5.0"}</strong>
                  <span>{t("service.transactionRating")}</span>
                </div>
                <div>
                  <CheckCircle2 aria-hidden="true" size={17} />
                  <strong>
                    {numberFormatter.format(author.completedOrders ?? 0)}
                  </strong>
                  <span>{t("service.completedOrders")}</span>
                </div>
              </div>
            ) : null}

            <div className="section-heading">
              <div>
                <span className="eyebrow">{t("profile.authorWork")}</span>
                <h2>{t("profile.portfolio")}</h2>
              </div>
            </div>

            {authorPhotos.length > 0 ? (
              <div className="photo-gallery">
                {authorPhotos.map((photo) => renderPhotoCard(photo))}
              </div>
            ) : (
              <p className="empty-state">{t("profile.emptyAuthorPortfolio")}</p>
            )}

            <div className="section-heading profile-subsection-heading">
              <div>
                <span className="eyebrow">{t("profile.inspiration")}</span>
                <h2>{t("profile.moodboard")}</h2>
              </div>
            </div>
            <div className="photo-gallery moodboard-gallery">
              {authorMoodboard.map((photo) => renderPhotoCard(photo))}
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderProfilePage(): ReactNode {
    const publicAuthor = initialAuthorId
      ? publicAuthorProfiles.find((author) => author.id === initialAuthorId)
      : null;

    if (publicAuthor) {
      return renderPublicAuthorProfile(publicAuthor);
    }

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

    const connectedSocialCount = socialProviders.filter(
      (provider) => provider.connectionId,
    ).length;
    const currentTier = currentProfile.tier ?? "viewer";

    return (
      <section className="profile-page">
        <div
          className={`profile-cover${currentProfile.coverUrl ? " has-image" : ""}`}
        >
          {currentProfile.coverUrl
            ? renderPreviewableImage(
                currentProfile.coverUrl,
                t("profile.coverAlt"),
              )
            : null}
          <button
            className="cover-photo-action"
            onClick={openCoverPicker}
            type="button"
          >
            <ImagePlus aria-hidden="true" size={18} />
            {currentProfile.coverUrl
              ? t("profile.changeCover")
              : t("profile.addCover")}
          </button>
        </div>

        <div className="profile-shell">
          <section className="profile-main">
            <div className="profile-head">
              <div className={`profile-avatar-frame is-tier-${currentTier}`}>
                <div className="profile-avatar">
                  {currentProfile.avatarUrl ? (
                    renderPreviewableImage(
                      currentProfile.avatarUrl,
                      t("profile.avatarAlt"),
                    )
                  ) : (
                    <span>{getInitials(currentProfile.name)}</span>
                  )}
                  <button
                    aria-label={
                      currentProfile.avatarUrl
                        ? t("profile.changeAvatar")
                        : t("profile.addAvatar")
                    }
                    className="avatar-photo-action"
                    onClick={openAvatarPicker}
                    title={
                      currentProfile.avatarUrl
                        ? t("profile.changeAvatar")
                        : t("profile.addAvatar")
                    }
                    type="button"
                  >
                    <Camera aria-hidden="true" size={18} />
                  </button>
                </div>
                {renderAccountTierBadge(currentTier)}
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
              </div>
            </div>

            <div className="profile-stats">
              {[
                [currentProfile.rating, "common.rating"],
                [profilePhotos.length, "profile.photos"],
                [currentProfile.wins, "profile.wins"],
                [currentProfile.followers, "profile.followers"],
              ].map(([value, key]) => (
                <div key={key}>
                  <strong>{numberFormatter.format(Number(value))}</strong>
                  <span>{t(key as MessageKey)}</span>
                </div>
              ))}
            </div>

            {currentTier !== "viewer" ? (
              <>
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">{t("profile.content")}</span>
                    <h2>{t("profile.portfolio")}</h2>
                  </div>
                  <button
                    className="secondary-action compact"
                    onClick={openAddPhoto}
                    type="button"
                  >
                    <Camera aria-hidden="true" size={16} />
                    {t("photo.add")}
                  </button>
                </div>

                {profilePhotos.length > 0 ? (
                  <div className="photo-gallery">
                    {profilePhotos.map((photo) => renderPhotoCard(photo))}
                  </div>
                ) : (
                  <p className="empty-state">{t("profile.emptyPortfolio")}</p>
                )}
              </>
            ) : null}

            <div className="section-heading profile-subsection-heading">
              <div>
                <span className="eyebrow">{t("profile.inspiration")}</span>
                <h2>{t("profile.moodboard")}</h2>
              </div>
            </div>
            {moodboardPhotoIds.length > 0 ? (
              <div className="photo-gallery moodboard-gallery">
                {publicPhotos
                  .filter((photo) => moodboardPhotoIds.includes(photo.id))
                  .map((photo) => renderPhotoCard(photo))}
              </div>
            ) : (
              <p className="empty-state">{t("profile.emptyMoodboard")}</p>
            )}

            <div className="private-profile-section">
              <div className="section-heading profile-subsection-heading">
                <div>
                  <span className="eyebrow">{t("profile.private")}</span>
                  <h2>{t("profile.bookmarks")}</h2>
                </div>
                <LockKeyhole aria-hidden="true" size={18} />
              </div>
              {savedPhotoIds.length > 0 ? (
                <div className="photo-gallery moodboard-gallery">
                  {publicPhotos
                    .filter((photo) => savedPhotoIds.includes(photo.id))
                    .map((photo) => renderPhotoCard(photo))}
                </div>
              ) : (
                <p className="empty-state">{t("profile.emptyBookmarks")}</p>
              )}
            </div>

            <div className="orders-section">
              <div className="section-heading profile-subsection-heading">
                <div>
                  <span className="eyebrow">{t("service.workspace")}</span>
                  <h2>{t("service.orders")}</h2>
                </div>
              </div>
              {serviceOrders.length > 0 ? (
                <div className="order-list">
                  {serviceOrders.map((order) => {
                    const isProvider =
                      order.authorId === currentProfile?.username;
                    const myRating = isProvider
                      ? order.providerRating
                      : (order.customerRating ?? order.rating);

                    return (
                      <article className="order-card" key={order.id}>
                        <div className="order-card-head">
                          <div>
                            <span className="pill">
                              {t(
                                order.kind === "review"
                                  ? "review.order"
                                  : "service.order",
                              )}
                            </span>
                            <strong>{order.authorName}</strong>
                          </div>
                          <span className={`order-status is-${order.status}`}>
                            {t(`service.status.${order.status}` as MessageKey)}
                          </span>
                        </div>
                        <p>{order.message || t("review.defaultRequest")}</p>
                        {order.referenceUrl ? (
                          <a
                            className="inline-link"
                            href={order.referenceUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <ExternalLink aria-hidden="true" size={14} />
                            {t("service.reference")}
                          </a>
                        ) : null}
                        {order.referenceFiles.length > 0 ? (
                          <span className="order-files">
                            <Paperclip aria-hidden="true" size={14} />
                            {order.referenceFiles.join(", ")}
                          </span>
                        ) : null}
                        {isProvider &&
                        (order.status === "pending" ||
                          order.status === "accepted" ||
                          order.status === "inProgress") ? (
                          <label className="order-response-field">
                            <span>{t("service.response")}</span>
                            <textarea
                              onChange={(event) => {
                                const providerComment = event.target.value;
                                setServiceOrders((current) =>
                                  current.map((candidate) =>
                                    candidate.id === order.id
                                      ? { ...candidate, providerComment }
                                      : candidate,
                                  ),
                                );
                              }}
                              rows={2}
                              value={order.providerComment ?? ""}
                            />
                          </label>
                        ) : null}
                        <div className="order-card-footer">
                          <strong>
                            {formatMoney(order.priceMinor, locale)}
                          </strong>
                          {!isProvider && order.status === "pending" ? (
                            <button
                              className="secondary-action compact"
                              onClick={() => {
                                updateLocalOrder(order.id, "cancelled");
                              }}
                              type="button"
                            >
                              {t("common.cancel")}
                            </button>
                          ) : null}
                          {isProvider && order.status === "pending" ? (
                            <>
                              <button
                                className="secondary-action compact"
                                onClick={() => {
                                  updateLocalOrder(
                                    order.id,
                                    "declined",
                                    order.providerComment,
                                  );
                                }}
                                type="button"
                              >
                                {t("service.decline")}
                              </button>
                              <button
                                className="primary-action compact"
                                onClick={() => {
                                  updateLocalOrder(
                                    order.id,
                                    "accepted",
                                    order.providerComment,
                                  );
                                }}
                                type="button"
                              >
                                <Check aria-hidden="true" size={15} />
                                {t("service.accept")}
                              </button>
                            </>
                          ) : null}
                          {isProvider && order.status === "accepted" ? (
                            <button
                              className="primary-action compact"
                              onClick={() => {
                                updateLocalOrder(
                                  order.id,
                                  "inProgress",
                                  order.providerComment,
                                );
                              }}
                              type="button"
                            >
                              {t("service.start")}
                            </button>
                          ) : null}
                          {isProvider && order.status === "inProgress" ? (
                            <button
                              className="primary-action compact"
                              onClick={() => {
                                updateLocalOrder(
                                  order.id,
                                  "submitted",
                                  order.providerComment,
                                );
                              }}
                              type="button"
                            >
                              <Send aria-hidden="true" size={15} />
                              {t("service.deliver")}
                            </button>
                          ) : null}
                          {!isProvider && order.status === "submitted" ? (
                            <button
                              className="primary-action compact"
                              onClick={() => {
                                updateLocalOrder(order.id, "completed");
                              }}
                              type="button"
                            >
                              <CheckCircle2 aria-hidden="true" size={15} />
                              {t("service.confirmCompletion")}
                            </button>
                          ) : null}
                        </div>
                        {order.status === "completed" && !myRating ? (
                          <div className="order-rating">
                            <label>
                              <span>{t("service.ratingComment")}</span>
                              <textarea
                                onChange={(event) => {
                                  setOrderRatingComments((current) => ({
                                    ...current,
                                    [order.id]: event.target.value,
                                  }));
                                }}
                                rows={2}
                                value={orderRatingComments[order.id] ?? ""}
                              />
                            </label>
                            <span>{t("service.rateOrder")}</span>
                            <div>
                              {[1, 2, 3, 4, 5].map((rating) => (
                                <button
                                  aria-label={`${rating}/5`}
                                  key={rating}
                                  onClick={() => {
                                    rateLocalOrder(
                                      order.id,
                                      rating,
                                      isProvider,
                                    );
                                  }}
                                  title={`${rating}/5`}
                                  type="button"
                                >
                                  <Star aria-hidden="true" size={18} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-state">{t("service.emptyOrders")}</p>
              )}
            </div>

            <div className="achievement-grid">
              {[
                "achievement.firstUpload",
                "achievement.firstBattle",
                "achievement.cityExplorer",
              ].map((key, index) => (
                <div className="achievement-card" key={key}>
                  <Medal aria-hidden="true" size={20} />
                  <strong>{t(key as MessageKey)}</strong>
                  <span>
                    {index === 0 && profilePhotos.length > 0
                      ? t("common.active")
                      : t("common.comingSoon")}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <aside className="profile-edit">
            <section className="account-panel wallet-panel">
              <div className="wallet-balance">
                <span>{t("wallet.balance")}</span>
                <strong>{formatMoney(walletBalanceMinor, locale)}</strong>
              </div>
              <button
                className="primary-action full-width"
                onClick={() => {
                  openCommerceDialog({ kind: "wallet" });
                }}
                type="button"
              >
                <WalletCards aria-hidden="true" size={17} />
                {t("wallet.topUp")}
              </button>
              {walletTransactions.length > 0 ? (
                <div className="wallet-history">
                  {walletTransactions.slice(0, 5).map((transaction) => (
                    <div key={transaction.id}>
                      <span>{transaction.label}</span>
                      <strong
                        className={
                          transaction.amountMinor > 0 ? "is-credit" : "is-debit"
                        }
                      >
                        {transaction.amountMinor > 0 ? "+" : ""}
                        {formatMoney(transaction.amountMinor, locale)}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
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

              {["experienced", "professional", "star"].includes(
                currentTier,
              ) ? (
                <label className="form-field" htmlFor="profile-review-price">
                  <span>{t("review.pricePerPhoto")}</span>
                  <div className="review-price-input">
                    <span aria-hidden="true">$</span>
                    <input
                      id="profile-review-price"
                      min="1"
                      onChange={(event) => {
                        updateProfileField("reviewPrice", event.target.value);
                      }}
                      step="1"
                      type="number"
                      value={profileForm.reviewPrice}
                    />
                  </div>
                  <small>{t("review.pricePerPhotoHint")}</small>
                </label>
              ) : null}

              <fieldset className="social-editor">
                <legend>{t("profile.socials")}</legend>
                <p>{t("social.autoIntro")}</p>
                <div className="social-editor-list">
                  {socialPlatforms.map((platform) => {
                    const provider = socialProviders.find(
                      (candidate) => candidate.id === platform.id,
                    );
                    const socialLink =
                      currentProfile.socialLinks?.[platform.id] ??
                      provider?.profile ??
                      null;
                    const isConnected = Boolean(
                      provider?.connectionId && socialLink?.url,
                    );
                    const statusKey = getSocialProviderStatusKey(
                      provider,
                      isConnected,
                    );

                    return (
                      <div
                        className={`social-editor-row${isConnected ? " is-connected" : ""}`}
                        key={platform.id}
                      >
                        <span
                          className={`social-connection-avatar is-${platform.id}`}
                        >
                          {socialLink?.avatarUrl ? (
                            <img alt="" src={socialLink.avatarUrl} />
                          ) : (
                            platform.mark
                          )}
                        </span>
                        <div className="social-connection-copy">
                          <strong>{t(platform.key)}</strong>
                          <span>
                            {socialLink?.username
                              ? `@${socialLink.username}`
                              : t(statusKey)}
                          </span>
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
                    updateProfileField(
                      "availableForHire",
                      event.target.checked,
                    );
                  }}
                  type="checkbox"
                />
                <span>{t("profile.availableForHire")}</span>
              </label>

              <button className="primary-action full-width" type="submit">
                {t("profile.saveProfile")}
              </button>
            </form>

            <section
              className="account-panel"
              aria-labelledby="notifications-title"
            >
              <div className="panel-title">
                <Bell aria-hidden="true" size={20} />
                <div>
                  <h2 id="notifications-title">{t("notifications.title")}</h2>
                  <p>
                    {
                      notifications.filter((notification) => !notification.read)
                        .length
                    }
                  </p>
                </div>
              </div>
              {notifications.length > 0 ? (
                <>
                  <div className="notification-list">
                    {notifications.slice(0, 6).map((notification) => (
                      <div
                        className={
                          notification.read
                            ? "notification-item"
                            : "notification-item is-unread"
                        }
                        key={notification.id}
                      >
                        <span>{t(notification.messageKey)}</span>
                        <time dateTime={notification.createdAt}>
                          {formatDate(locale, notification.createdAt)}
                        </time>
                      </div>
                    ))}
                  </div>
                  <button
                    className="secondary-action full-width"
                    onClick={() => {
                      setNotifications((current) =>
                        current.map((notification) => ({
                          ...notification,
                          read: true,
                        })),
                      );
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
                <button
                  className="secondary-action full-width"
                  onClick={exportLocalData}
                  type="button"
                >
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
                  {deletionRequested
                    ? t("privacy.deleteRequested")
                    : t("privacy.deleteRequest")}
                </button>
              </div>
              <div className="connection-summary">
                <strong>{t("privacy.connections")}</strong>
                <span>
                  {t("profile.socialCount").replace(
                    "{count}",
                    numberFormatter.format(connectedSocialCount),
                  )}
                </span>
              </div>
            </section>
          </aside>
        </div>
      </section>
    );
  }

  function renderAdminPage(): ReactNode {
    if (!currentProfile) {
      return (
        <section className="page-section">
          <div className="auth-empty">
            <ShieldCheck aria-hidden="true" size={52} />
            <h2>{t("admin.signIn")}</h2>
            <button
              className="primary-action"
              onClick={() => {
                openAuth("login");
              }}
              type="button"
            >
              <LogIn aria-hidden="true" size={17} />
              {t("auth.login")}
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="page-section admin-dashboard">
        <div className="admin-metrics">
          {[
            [numberFormatter.format(uploadedPhotos.length), "admin.photos"],
            [numberFormatter.format(serviceOrders.length), "admin.orders"],
            [numberFormatter.format(promotions.length), "admin.promotions"],
            [formatMoney(walletBalanceMinor, locale), "admin.balance"],
          ].map(([value, label]) => (
            <div key={label}>
              <span>{t(label as MessageKey)}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <div className="admin-grid">
          <section className="admin-panel">
            <div className="panel-title">
              <CircleUserRound aria-hidden="true" size={20} />
              <div>
                <h2>{t("admin.accounts")}</h2>
                <p>{currentProfile.email}</p>
              </div>
            </div>
            <label className="form-field">
              <span>{t("admin.accountStatus")}</span>
              <select
                onChange={(event) => {
                  setAccount({
                    ...currentProfile,
                    tier: event.target.value as AccountTier,
                  });
                }}
                value={currentProfile.tier ?? "viewer"}
              >
                {(
                  [
                    "viewer",
                    "amateur",
                    "beginner",
                    "experienced",
                    "professional",
                    "star",
                  ] as const
                ).map((tier) => (
                  <option key={tier} value={tier}>
                    {t(getAccountTierKey(tier))}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-action-row">
              <button
                className="secondary-action compact"
                onClick={() => {
                  setAccount({
                    ...currentProfile,
                    rating: currentProfile.rating + 25,
                  });
                }}
                type="button"
              >
                +25 {t("common.rating")}
              </button>
              <button
                className="secondary-action compact"
                onClick={() => {
                  setAccount({
                    ...currentProfile,
                    rating: Math.max(0, currentProfile.rating - 25),
                  });
                }}
                type="button"
              >
                -25 {t("common.rating")}
              </button>
            </div>
            <div className="admin-action-row">
              <button
                className="secondary-action compact"
                onClick={() => {
                  setWalletBalanceMinor((current) => current + 2500);
                }}
                type="button"
              >
                +{formatMoney(2500, locale)}
              </button>
              <button
                className="secondary-action compact"
                onClick={() => {
                  setWalletBalanceMinor((current) =>
                    Math.max(0, current - 2500),
                  );
                }}
                type="button"
              >
                -{formatMoney(2500, locale)}
              </button>
            </div>
            <div className="admin-danger-row">
              <button
                className="danger-action"
                onClick={() => {
                  setDeletionRequested(true);
                  setGlobalFeedback({
                    kind: "success",
                    text: t("admin.profileBlocked"),
                  });
                }}
                type="button"
              >
                <LockKeyhole aria-hidden="true" size={15} />
                {t("admin.blockProfile")}
              </button>
            </div>
          </section>

          <section className="admin-panel">
            <div className="panel-title">
              <Images aria-hidden="true" size={20} />
              <div>
                <h2>{t("admin.content")}</h2>
                <p>{t("admin.contentCopy")}</p>
              </div>
            </div>
            <div className="admin-list">
              {uploadedPhotos.length > 0 ? (
                uploadedPhotos.map((photo) => (
                  <div key={photo.id}>
                    <span>{getPhotoTitle(photo, locale)}</span>
                    <button
                      aria-label={t("admin.deletePhoto")}
                      className="icon-button"
                      onClick={() => {
                        setUploadedPhotos((current) =>
                          current.filter((item) => item.id !== photo.id),
                        );
                      }}
                      title={t("admin.deletePhoto")}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <p>{t("admin.emptyContent")}</p>
              )}
            </div>
          </section>

          <section className="admin-panel">
            <div className="panel-title">
              <Megaphone aria-hidden="true" size={20} />
              <div>
                <h2>{t("admin.promotions")}</h2>
                <p>{t("admin.promotionCopy")}</p>
              </div>
            </div>
            <div className="admin-list">
              {promotions.length > 0 ? (
                promotions.map((promotion) => (
                  <div key={promotion.id}>
                    <span>
                      {t(getPromotionPlacementKey(promotion.placement))}
                    </span>
                    <button
                      className="secondary-action compact"
                      onClick={() => {
                        setPromotions((current) =>
                          current.filter((item) => item.id !== promotion.id),
                        );
                      }}
                      type="button"
                    >
                      {t("admin.remove")}
                    </button>
                  </div>
                ))
              ) : (
                <p>{t("admin.emptyPromotions")}</p>
              )}
            </div>
          </section>

          <section className="admin-panel admin-log-panel">
            <div className="panel-title">
              <BookOpen aria-hidden="true" size={20} />
              <div>
                <h2>{t("admin.logs")}</h2>
                <p>{t("admin.logsCopy")}</p>
              </div>
            </div>
            <div className="admin-log">
              {[...walletTransactions]
                .sort((left, right) =>
                  right.createdAt.localeCompare(left.createdAt),
                )
                .map((transaction) => (
                  <div key={transaction.id}>
                    <time>{formatDate(locale, transaction.createdAt)}</time>
                    <span>{transaction.label}</span>
                    <strong>
                      {formatMoney(transaction.amountMinor, locale)}
                    </strong>
                  </div>
                ))}
              {walletTransactions.length === 0 ? (
                <p>{t("admin.emptyLogs")}</p>
              ) : null}
            </div>
          </section>
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

  function renderImagePreviewDialog(): ReactNode {
    if (!imagePreview) return null;

    const reviews = imagePreview.photoId
      ? (photoReviews[imagePreview.photoId] ?? [])
      : [];
    const currentTier =
      currentProfile?.tier ?? (currentProfile ? "viewer" : null);

    return (
      <div
        className="image-lightbox"
        onMouseDown={() => {
          setImagePreview(null);
          setPhotoReviewOpen(false);
        }}
        role="presentation"
      >
        <figure
          aria-label={imagePreview.alt}
          aria-modal="true"
          className="image-lightbox-dialog"
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          role="dialog"
        >
          <button
            aria-label={t("auth.close")}
            className="image-lightbox-close"
            onClick={() => {
              setImagePreview(null);
              setPhotoReviewOpen(false);
            }}
            title={t("auth.close")}
            type="button"
          >
            <X aria-hidden="true" size={22} />
          </button>
          <img alt={imagePreview.alt} src={imagePreview.src} />
          <figcaption className="image-lightbox-caption">
            <strong>{imagePreview.alt}</strong>
            {imagePreview.photoId ? (
              <button
                className="secondary-action compact"
                onClick={openDetailedPhotoReview}
                type="button"
              >
                <Star aria-hidden="true" size={16} />
                {t("photo.detailedReview")}
              </button>
            ) : null}
          </figcaption>

          {isPhotoReviewOpen && imagePreview.photoId ? (
            <form className="photo-review-form" onSubmit={submitPhotoReview}>
              <div className="photo-review-heading">
                <div>
                  <strong>{t("photo.reviewTitle")}</strong>
                  <span>{t("photo.reviewCopy")}</span>
                </div>
                <button
                  aria-label={t("auth.close")}
                  className="icon-button"
                  onClick={() => {
                    setPhotoReviewOpen(false);
                  }}
                  type="button"
                >
                  <X aria-hidden="true" size={16} />
                </button>
              </div>
              <div className="photo-review-criteria">
                {battleCriteria.map((criterion) => {
                  const CriterionIcon = criterion.Icon;
                  const value = photoReviewScores[criterion.id];

                  return (
                    <label key={criterion.id}>
                      <span>
                        <CriterionIcon aria-hidden="true" size={15} />
                        {t(criterion.labelKey)}
                      </span>
                      <input
                        max="10"
                        min="1"
                        onChange={(event) => {
                          setPhotoReviewScores((current) => ({
                            ...current,
                            [criterion.id]: Number(event.target.value),
                          }));
                        }}
                        step="1"
                        type="range"
                        value={value}
                      />
                      <output>{value}</output>
                    </label>
                  );
                })}
              </div>
              {currentTier === "professional" || currentTier === "star" ? (
                <label className="form-field">
                  <span>{t("photo.publicComment")}</span>
                  <textarea
                    onChange={(event) => {
                      setPhotoReviewComment(event.target.value);
                    }}
                    rows={3}
                    value={photoReviewComment}
                  />
                </label>
              ) : null}
              <button className="primary-action" type="submit">
                <Check aria-hidden="true" size={16} />
                {t("photo.submitReview")}
              </button>
            </form>
          ) : null}

          {reviews.some((review) => review.comment) ? (
            <div className="photo-public-comments">
              <strong>{t("photo.starComments")}</strong>
              {reviews
                .filter((review) => review.comment)
                .map((review) => (
                  <blockquote key={review.createdAt}>
                    <p>{review.comment}</p>
                    <footer>
                      {review.reviewerName} ·{" "}
                      {t(getAccountTierKey(review.reviewerTier))}
                    </footer>
                  </blockquote>
                ))}
            </div>
          ) : null}
        </figure>
      </div>
    );
  }

  function renderCommerceDialog(): ReactNode {
    if (!commerceDialog) return null;

    const titleKey: MessageKey =
      commerceDialog.kind === "wallet"
        ? "wallet.topUp"
        : commerceDialog.kind === "promotion"
          ? "promotion.title"
          : commerceDialog.kind === "donation"
            ? "donation.title"
            : commerceDialog.kind === "review"
              ? "review.order"
              : "service.order";

    return (
      <div
        className="modal-backdrop"
        onMouseDown={() => {
          setCommerceDialog(null);
        }}
        role="presentation"
      >
        <section
          aria-labelledby="commerce-dialog-title"
          aria-modal="true"
          className="auth-dialog commerce-dialog"
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          role="dialog"
        >
          <div className="dialog-header">
            <div>
              <span className="eyebrow">{t("commerce.secure")}</span>
              <h2 id="commerce-dialog-title">{t(titleKey)}</h2>
              {"author" in commerceDialog ? (
                <p>{t(commerceDialog.author.nameKey)}</p>
              ) : null}
            </div>
            <button
              aria-label={t("auth.close")}
              className="icon-button"
              onClick={() => {
                setCommerceDialog(null);
              }}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
          </div>

          <form className="commerce-form" onSubmit={submitCommerce}>
            {commerceDialog.kind === "promotion" ? (
              <>
                <div className="commerce-photo-summary">
                  {renderPreviewableImage(
                    commerceDialog.photo.src,
                    getPhotoTitle(commerceDialog.photo, locale),
                  )}
                  <strong>{getPhotoTitle(commerceDialog.photo, locale)}</strong>
                </div>
                <fieldset className="commerce-options">
                  <legend>{t("promotion.choosePlacement")}</legend>
                  {(["home", "marketplace", "battles"] as const).map(
                    (placement) => (
                      <label key={placement}>
                        <input
                          checked={commerceForm.placement === placement}
                          name="promotion-placement"
                          onChange={() => {
                            updateCommerceField("placement", placement);
                          }}
                          type="radio"
                        />
                        <span>
                          <strong>
                            {t(getPromotionPlacementKey(placement))}
                          </strong>
                          <small>
                            {formatMoney(
                              promotionPriceMinor[placement],
                              locale,
                            )}
                            {" · "}7 {t("promotion.days")}
                          </small>
                        </span>
                      </label>
                    ),
                  )}
                </fieldset>
              </>
            ) : null}

            {commerceDialog.kind === "review" ? (
              <>
                <div className="price-callout">
                  <span>{t("review.price")}</span>
                  <strong>
                    {formatMoney(
                      commerceDialog.author.reviewPrice ?? 3500,
                      locale,
                    )}
                  </strong>
                </div>
                <label className="form-field">
                  <span>{t("review.choosePhoto")}</span>
                  <select
                    onChange={(event) => {
                      updateCommerceField("photoId", event.target.value);
                    }}
                    value={commerceForm.photoId}
                  >
                    <option value="">{t("common.selectPhoto")}</option>
                    {profilePhotos.map((photo) => (
                      <option key={photo.id} value={photo.id}>
                        {getPhotoTitle(photo, locale)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            {commerceDialog.kind === "wallet" ? (
              <fieldset className="commerce-options is-inline">
                <legend>{t("wallet.method")}</legend>
                {(["card", "crypto"] as const).map((method) => (
                  <label key={method}>
                    <input
                      checked={commerceForm.paymentMethod === method}
                      name="payment-method"
                      onChange={() => {
                        updateCommerceField("paymentMethod", method);
                      }}
                      type="radio"
                    />
                    {method === "card" ? (
                      <CreditCard aria-hidden="true" size={18} />
                    ) : (
                      <WalletCards aria-hidden="true" size={18} />
                    )}
                    <span>
                      <strong>
                        {t(method === "card" ? "wallet.card" : "wallet.crypto")}
                      </strong>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {commerceDialog.kind === "service" ||
            commerceDialog.kind === "donation" ||
            commerceDialog.kind === "wallet" ? (
              <label className="form-field">
                <span>
                  {commerceDialog.kind === "wallet"
                    ? t("wallet.amount")
                    : commerceDialog.kind === "donation"
                      ? t("donation.amount")
                      : t("service.budget")}
                </span>
                <div className="money-input">
                  <span>$</span>
                  <input
                    min="1"
                    onChange={(event) => {
                      updateCommerceField("amount", event.target.value);
                    }}
                    step="1"
                    type="number"
                    value={commerceForm.amount}
                  />
                </div>
              </label>
            ) : null}

            {commerceDialog.kind === "service" ||
            commerceDialog.kind === "review" ||
            commerceDialog.kind === "donation" ? (
              <label className="form-field">
                <span>
                  {commerceDialog.kind === "donation"
                    ? t("donation.message")
                    : commerceDialog.kind === "review"
                      ? t("review.question")
                      : t("service.brief")}
                </span>
                <textarea
                  onChange={(event) => {
                    updateCommerceField("message", event.target.value);
                  }}
                  required={commerceDialog.kind === "service"}
                  rows={4}
                  value={commerceForm.message}
                />
              </label>
            ) : null}

            {commerceDialog.kind === "service" ? (
              <div className="reference-grid">
                <label className="form-field">
                  <span>{t("service.referenceUrl")}</span>
                  <input
                    onChange={(event) => {
                      updateCommerceField("referenceUrl", event.target.value);
                    }}
                    placeholder="https://"
                    type="url"
                    value={commerceForm.referenceUrl}
                  />
                </label>
                <label className="file-drop-field">
                  <Paperclip aria-hidden="true" size={18} />
                  <span>{t("service.attachFiles")}</span>
                  <input
                    multiple
                    onChange={(event) => {
                      updateCommerceField(
                        "referenceFiles",
                        Array.from(event.target.files ?? []).map(
                          (file) => file.name,
                        ),
                      );
                    }}
                    type="file"
                  />
                </label>
              </div>
            ) : null}

            {commerceDialog.kind === "service" ? (
              <p className="fee-note">
                {t("service.feeNotice").replace("{fee}", "5%")}
              </p>
            ) : null}

            <div className="dialog-actions">
              <button
                className="secondary-action"
                onClick={() => {
                  setCommerceDialog(null);
                }}
                type="button"
              >
                {t("common.cancel")}
              </button>
              <button className="primary-action" type="submit">
                {commerceDialog.kind === "wallet" ? (
                  <CreditCard aria-hidden="true" size={17} />
                ) : commerceDialog.kind === "promotion" ? (
                  <Megaphone aria-hidden="true" size={17} />
                ) : (
                  <Send aria-hidden="true" size={17} />
                )}
                {t(
                  commerceDialog.kind === "wallet"
                    ? "wallet.topUp"
                    : commerceDialog.kind === "promotion"
                      ? "promotion.reserve"
                      : "common.submit",
                )}
              </button>
            </div>
          </form>
        </section>
      </div>
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
            <button
              className="provider-button is-enabled"
              onClick={chooseDeviceUpload}
              type="button"
            >
              <ImagePlus aria-hidden="true" size={18} />
              <span>{t("photo.uploadDevice")}</span>
              <small>{t("photo.deviceWorks")}</small>
            </button>
            {externalPhotoProviders.map((provider) => (
              <button
                className="provider-button"
                disabled
                key={provider.id}
                type="button"
              >
                <LockKeyhole aria-hidden="true" size={18} />
                <span>{t(provider.key)}</span>
                <small>{t("photo.connectWhenAvailable")}</small>
              </button>
            ))}
          </div>

          {photoFeedback ? (
            <p
              className={`dialog-feedback ${photoFeedback.kind}`}
              role="status"
            >
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
              <span className="eyebrow">
                {authMode === "login" ? t("auth.login") : t("auth.register")}
              </span>
              <h2 id="auth-title">
                {authMode === "login"
                  ? t("auth.loginTitle")
                  : t("auth.registerTitle")}
              </h2>
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
                autoComplete={
                  authMode === "login" ? "current-password" : "new-password"
                }
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
              {authMode === "login"
                ? t("auth.submitLogin")
                : t("auth.submitRegister")}
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

function normalizeStoredBattleVotes(
  storedVotes: Record<string, BattleEvaluationRecord | string>,
): Record<string, BattleEvaluationRecord> {
  return Object.fromEntries(
    Object.entries(storedVotes).flatMap(([battleId, storedVote]) => {
      if (typeof storedVote !== "string") return [[battleId, storedVote]];

      const battle = initialBattles.find(
        (candidate) => candidate.id === battleId,
      );
      if (!battle) return [];

      return [
        [
          battleId,
          {
            submittedAt: new Date(0).toISOString(),
            winnerEntryId: storedVote,
          },
        ],
      ];
    }),
  );
}

function getPhotoTitle(
  photo: PhotoRecord | null | undefined,
  locale: SupportedLocale,
): string {
  if (!photo) {
    return getMessage(locale, "photo.selected");
  }

  return (
    photo.title ??
    (photo.titleKey
      ? getMessage(locale, photo.titleKey)
      : getMessage(locale, "photo.selected"))
  );
}

function getPhotoAuthor(photo: PhotoRecord, locale: SupportedLocale): string {
  return (
    photo.authorName ??
    (photo.authorKey
      ? getMessage(locale, photo.authorKey)
      : getMessage(locale, "common.guest"))
  );
}

function getPhotoAuthorId(photo: PhotoRecord): string {
  if (photo.isMine) {
    return "me";
  }

  if (photo.authorKey?.startsWith("data.author.")) {
    return photo.authorKey.slice("data.author.".length);
  }

  return (photo.authorName ?? "guest")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getCategoryKey(categoryId: CategoryId): MessageKey {
  return `category.${categoryId}` as MessageKey;
}

function getBattleScopeKey(scope: BattleScope): MessageKey {
  return `battles.scope.${scope}` as MessageKey;
}

function getLocationLabel(
  locationId: LocationId,
  locale: SupportedLocale,
  fallback?: string,
): string {
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

function getLargeImageSource(src: string): string {
  if (!src.startsWith("https://images.unsplash.com/")) return src;

  const imageUrl = new URL(src);
  imageUrl.searchParams.set("fit", "max");
  imageUrl.searchParams.set("w", "2400");
  imageUrl.searchParams.set("q", "90");
  return imageUrl.toString();
}

function formatDate(locale: SupportedLocale, isoDate: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(new Date(isoDate));
}

function formatDateInputDisplay(
  locale: SupportedLocale,
  value: string,
): string {
  if (!value) return dateInputPlaceholders[locale];

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return dateInputPlaceholders[locale];

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatMoney(amountMinor: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale, {
    currency: "USD",
    style: "currency",
  }).format(amountMinor / 100);
}

function getPromotionPlacementKey(placement: PromotionPlacement): MessageKey {
  if (placement === "home") return "promotion.placement.home";
  if (placement === "battles") return "promotion.placement.battles";
  return "promotion.placement.marketplace";
}

function getAccountTierKey(tier: AccountTier): MessageKey {
  return `author.tier.${tier}` as MessageKey;
}

function getBattleVoteWeight(tier: AccountTier): number {
  if (tier === "star") return 10;
  if (tier === "professional") return 4;
  return 1;
}

function makePhotoTitle(fileName: string): string {
  return (
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim() || fileName
  );
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
      .replace(/\s+/g, "."),
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

function getSocialProviderStatusKey(
  provider: SocialProviderRecord | undefined,
  isConnected: boolean,
): MessageKey {
  if (isConnected) return "social.connected";
  if (!provider || provider.status === "NEEDS_CONFIGURATION")
    return "social.configurationRequired";
  if (provider.reason === "PROFESSIONAL_ACCOUNT_REQUIRED")
    return "social.professionalOnly";
  if (provider.reason === "ADOBE_PROFILE_UNAVAILABLE")
    return "social.adobeProfileUnavailable";
  if (provider.status === "AVAILABLE") return "social.readyToConnect";
  return "social.officialApiUnavailable";
}

function getApiRoot(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (configured) return configured;

  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  ) {
    return `${window.location.protocol}//${window.location.hostname}:4000/api/v1`;
  }

  return "/api/v1";
}

async function apiRequest<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");

  const response = await fetch(`${getApiRoot()}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!response.ok)
    throw new Error(`API request failed with ${response.status}.`);
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
  const shortHash = await hashText(
    `${file.name}:${file.size}:${file.type}:${file.lastModified}:${src.slice(0, 256)}`,
  );

  return shortHash.slice(0, 16);
}

async function hashText(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return Array.from(value).reduce(
      (hash, character) => `${hash}${character.charCodeAt(0).toString(16)}`,
      "",
    );
  }

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
