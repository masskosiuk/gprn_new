import { defaultLocale, type SupportedLocale } from "./locales.js";

export type MessageKey =
  | "app.name"
  | "auth.close"
  | "auth.email"
  | "auth.join"
  | "auth.name"
  | "auth.note"
  | "auth.password"
  | "auth.submit"
  | "auth.success"
  | "auth.title"
  | "auth.validation"
  | "common.comingSoon"
  | "nav.home"
  | "nav.discover"
  | "nav.battles"
  | "nav.challenges"
  | "nav.leaderboard"
  | "nav.map"
  | "nav.marketplace"
  | "nav.experts"
  | "nav.profile"
  | "home.headline"
  | "home.subhead"
  | "photo.add"
  | "photo.change"
  | "photo.empty"
  | "photo.invalid"
  | "photo.note"
  | "photo.saved"
  | "photo.saveDraft"
  | "photo.selected"
  | "sections.active"
  | "sections.placeholder"
  | "sections.profilePrompt";

const sharedInteractionMessages = {
  "auth.close": "Close",
  "auth.email": "Email",
  "auth.join": "Join",
  "auth.name": "Name",
  "auth.note": "Your details stay on this device until account creation is connected.",
  "auth.password": "Password",
  "auth.submit": "Create account",
  "auth.success": "Profile draft created. Account publishing is not connected yet.",
  "auth.title": "Create your photographer profile",
  "auth.validation": "Enter a name, a valid email and a password with at least 8 characters.",
  "photo.change": "Choose another",
  "photo.empty": "No photo selected yet.",
  "photo.invalid": "Choose an image file.",
  "photo.note": "Drafts stay on this device until photo publishing is connected.",
  "photo.saved": "Photo draft saved locally.",
  "photo.saveDraft": "Save draft",
  "photo.selected": "Selected photo",
  "sections.active": "Selected section",
  "sections.placeholder": "This area is selected. Live content is not connected yet.",
  "sections.profilePrompt": "Create a profile to see your registration draft here."
} satisfies Record<
  Exclude<
    MessageKey,
    | "app.name"
    | "common.comingSoon"
    | "home.headline"
    | "home.subhead"
    | "nav.home"
    | "nav.discover"
    | "nav.battles"
    | "nav.challenges"
    | "nav.leaderboard"
    | "nav.map"
    | "nav.marketplace"
    | "nav.experts"
    | "nav.profile"
    | "photo.add"
  >,
  string
>;

const russianInteractionMessages: Partial<Record<MessageKey, string>> = {
  "auth.close": "Закрыть",
  "auth.email": "Email",
  "auth.join": "Регистрация",
  "auth.name": "Имя",
  "auth.note": "Данные остаются на этом устройстве, пока создание аккаунта не подключено.",
  "auth.password": "Пароль",
  "auth.submit": "Создать аккаунт",
  "auth.success": "Черновик профиля создан. Публикация аккаунта пока не подключена.",
  "auth.title": "Создайте профиль фотографа",
  "auth.validation": "Введите имя, корректный email и пароль минимум из 8 символов.",
  "photo.change": "Выбрать другое",
  "photo.empty": "Фото пока не выбрано.",
  "photo.invalid": "Выберите файл изображения.",
  "photo.note": "Черновики остаются на этом устройстве, пока публикация фото не подключена.",
  "photo.saved": "Черновик фото сохранен локально.",
  "photo.saveDraft": "Сохранить черновик",
  "photo.selected": "Выбранное фото",
  "sections.active": "Выбранный раздел",
  "sections.placeholder": "Этот раздел выбран. Живой контент пока не подключен.",
  "sections.profilePrompt": "Создайте профиль, чтобы увидеть здесь черновик регистрации."
};

const ukrainianInteractionMessages: Partial<Record<MessageKey, string>> = {
  "auth.close": "Закрити",
  "auth.email": "Email",
  "auth.join": "Реєстрація",
  "auth.name": "Ім'я",
  "auth.note": "Дані залишаються на цьому пристрої, поки створення акаунта не підключене.",
  "auth.password": "Пароль",
  "auth.submit": "Створити акаунт",
  "auth.success": "Чернетку профілю створено. Публікація акаунта поки не підключена.",
  "auth.title": "Створіть профіль фотографа",
  "auth.validation": "Введіть ім'я, коректний email і пароль щонайменше з 8 символів.",
  "photo.change": "Вибрати інше",
  "photo.empty": "Фото ще не вибрано.",
  "photo.invalid": "Виберіть файл зображення.",
  "photo.note": "Чернетки залишаються на цьому пристрої, поки публікація фото не підключена.",
  "photo.saved": "Чернетку фото збережено локально.",
  "photo.saveDraft": "Зберегти чернетку",
  "photo.selected": "Вибране фото",
  "sections.active": "Вибраний розділ",
  "sections.placeholder": "Цей розділ вибрано. Живий контент поки не підключений.",
  "sections.profilePrompt": "Створіть профіль, щоб побачити тут чернетку реєстрації."
};

export const messages: Record<SupportedLocale, Record<MessageKey, string>> = {
  de: {
    ...sharedInteractionMessages,
    "app.name": "Global Photographer Reputation Network",
    "common.comingSoon": "Bald verfugbar",
    "home.headline": "Das globale Wettbewerbsnetzwerk fur Fotografen.",
    "home.subhead": "Veröffentliche echte Fotos, bewahre Herkunftsnachweise und baue Reputation durch Wettbewerb auf.",
    "nav.battles": "Battles",
    "nav.challenges": "Challenges",
    "nav.discover": "Entdecken",
    "nav.experts": "Experten",
    "nav.home": "Home",
    "nav.leaderboard": "Rangliste",
    "nav.map": "Karte",
    "nav.marketplace": "Marketplace",
    "nav.profile": "Profil",
    "photo.add": "Foto hinzufügen"
  },
  en: {
    ...sharedInteractionMessages,
    "app.name": "Global Photographer Reputation Network",
    "common.comingSoon": "Coming soon",
    "home.headline": "The global competitive network for photographers.",
    "home.subhead": "Publish real photographs, preserve provenance, compete, build reputation and get discovered.",
    "nav.battles": "Battles",
    "nav.challenges": "Challenges",
    "nav.discover": "Discover",
    "nav.experts": "Experts",
    "nav.home": "Home",
    "nav.leaderboard": "Leaderboard",
    "nav.map": "Map",
    "nav.marketplace": "Marketplace",
    "nav.profile": "Profile",
    "photo.add": "Add Photo"
  },
  es: {
    ...sharedInteractionMessages,
    "app.name": "Global Photographer Reputation Network",
    "common.comingSoon": "Próximamente",
    "home.headline": "La red competitiva global para fotógrafos.",
    "home.subhead": "Publica fotos reales, conserva procedencia y construye reputación compitiendo.",
    "nav.battles": "Batallas",
    "nav.challenges": "Retos",
    "nav.discover": "Descubrir",
    "nav.experts": "Expertos",
    "nav.home": "Inicio",
    "nav.leaderboard": "Clasificación",
    "nav.map": "Mapa",
    "nav.marketplace": "Marketplace",
    "nav.profile": "Perfil",
    "photo.add": "Añadir foto"
  },
  fr: {
    ...sharedInteractionMessages,
    "app.name": "Global Photographer Reputation Network",
    "common.comingSoon": "Bientôt disponible",
    "home.headline": "Le réseau mondial compétitif pour photographes.",
    "home.subhead": "Publiez de vraies photos, préservez leur provenance et bâtissez votre réputation.",
    "nav.battles": "Battles",
    "nav.challenges": "Défis",
    "nav.discover": "Découvrir",
    "nav.experts": "Experts",
    "nav.home": "Accueil",
    "nav.leaderboard": "Classement",
    "nav.map": "Carte",
    "nav.marketplace": "Marketplace",
    "nav.profile": "Profil",
    "photo.add": "Ajouter une photo"
  },
  it: {
    ...sharedInteractionMessages,
    "app.name": "Global Photographer Reputation Network",
    "common.comingSoon": "Prossimamente",
    "home.headline": "La rete competitiva globale per fotografi.",
    "home.subhead": "Pubblica fotografie reali, conserva la provenienza e costruisci reputazione.",
    "nav.battles": "Battle",
    "nav.challenges": "Sfide",
    "nav.discover": "Scopri",
    "nav.experts": "Esperti",
    "nav.home": "Home",
    "nav.leaderboard": "Classifica",
    "nav.map": "Mappa",
    "nav.marketplace": "Marketplace",
    "nav.profile": "Profilo",
    "photo.add": "Aggiungi foto"
  },
  nl: {
    ...sharedInteractionMessages,
    "app.name": "Global Photographer Reputation Network",
    "common.comingSoon": "Binnenkort",
    "home.headline": "Het wereldwijde competitieve netwerk voor fotografen.",
    "home.subhead": "Publiceer echte foto's, bewaar herkomst en bouw reputatie op.",
    "nav.battles": "Battles",
    "nav.challenges": "Challenges",
    "nav.discover": "Ontdekken",
    "nav.experts": "Experts",
    "nav.home": "Home",
    "nav.leaderboard": "Ranglijst",
    "nav.map": "Kaart",
    "nav.marketplace": "Marketplace",
    "nav.profile": "Profiel",
    "photo.add": "Foto toevoegen"
  },
  pl: {
    ...sharedInteractionMessages,
    "app.name": "Global Photographer Reputation Network",
    "common.comingSoon": "Wkrótce",
    "home.headline": "Globalna sieć rywalizacji dla fotografów.",
    "home.subhead": "Publikuj prawdziwe zdjęcia, zachowuj pochodzenie i buduj reputację.",
    "nav.battles": "Bitwy",
    "nav.challenges": "Wyzwania",
    "nav.discover": "Odkrywaj",
    "nav.experts": "Eksperci",
    "nav.home": "Start",
    "nav.leaderboard": "Ranking",
    "nav.map": "Mapa",
    "nav.marketplace": "Marketplace",
    "nav.profile": "Profil",
    "photo.add": "Dodaj zdjęcie"
  },
  pt: {
    ...sharedInteractionMessages,
    "app.name": "Global Photographer Reputation Network",
    "common.comingSoon": "Em breve",
    "home.headline": "A rede competitiva global para fotógrafos.",
    "home.subhead": "Publique fotos reais, preserve proveniência e construa reputação.",
    "nav.battles": "Batalhas",
    "nav.challenges": "Desafios",
    "nav.discover": "Descobrir",
    "nav.experts": "Especialistas",
    "nav.home": "Início",
    "nav.leaderboard": "Ranking",
    "nav.map": "Mapa",
    "nav.marketplace": "Marketplace",
    "nav.profile": "Perfil",
    "photo.add": "Adicionar foto"
  },
  ru: {
    ...sharedInteractionMessages,
    ...russianInteractionMessages,
    "app.name": "Global Photographer Reputation Network",
    "common.comingSoon": "Скоро будет доступно",
    "home.headline": "Глобальная соревновательная сеть для фотографов.",
    "home.subhead": "Публикуйте реальные фотографии, сохраняйте происхождение и развивайте репутацию.",
    "nav.battles": "Батлы",
    "nav.challenges": "Челленджи",
    "nav.discover": "Обзор",
    "nav.experts": "Эксперты",
    "nav.home": "Главная",
    "nav.leaderboard": "Рейтинг",
    "nav.map": "Карта",
    "nav.marketplace": "Маркетплейс",
    "nav.profile": "Профиль",
    "photo.add": "Добавить фото"
  },
  tr: {
    ...sharedInteractionMessages,
    "app.name": "Global Photographer Reputation Network",
    "common.comingSoon": "Yakında",
    "home.headline": "Fotoğrafçılar için küresel rekabet ağı.",
    "home.subhead": "Gerçek fotoğraflar yayınlayın, kaynak geçmişini koruyun ve itibar oluşturun.",
    "nav.battles": "Battles",
    "nav.challenges": "Meydan okumalar",
    "nav.discover": "Keşfet",
    "nav.experts": "Uzmanlar",
    "nav.home": "Ana sayfa",
    "nav.leaderboard": "Liderlik",
    "nav.map": "Harita",
    "nav.marketplace": "Marketplace",
    "nav.profile": "Profil",
    "photo.add": "Fotoğraf ekle"
  },
  uk: {
    ...sharedInteractionMessages,
    ...ukrainianInteractionMessages,
    "app.name": "Global Photographer Reputation Network",
    "common.comingSoon": "Скоро буде доступно",
    "home.headline": "Глобальна змагальна мережа для фотографів.",
    "home.subhead": "Публікуйте реальні фотографії, зберігайте походження і будуйте репутацію.",
    "nav.battles": "Батли",
    "nav.challenges": "Челенджі",
    "nav.discover": "Огляд",
    "nav.experts": "Експерти",
    "nav.home": "Головна",
    "nav.leaderboard": "Рейтинг",
    "nav.map": "Мапа",
    "nav.marketplace": "Маркетплейс",
    "nav.profile": "Профіль",
    "photo.add": "Додати фото"
  }
};

export function getMessage(locale: SupportedLocale, key: MessageKey): string {
  return messages[locale]?.[key] ?? messages[defaultLocale][key];
}
