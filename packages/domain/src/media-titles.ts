const photoTitles = {
  en: [
    "One moment",
    "Impression",
    "A frozen moment",
    "A view",
    "Quiet light",
    "A new perspective",
    "Between the lines",
    "A passing glance",
    "Here and now",
    "A small story",
    "A pause",
    "Echoes",
    "A familiar place",
    "A fleeting encounter",
    "In focus",
    "A trace of time",
  ],
  ru: [
    "Один момент",
    "Впечатление",
    "Застывшее мгновение",
    "Вид",
    "Тихий свет",
    "Новый взгляд",
    "Между строк",
    "Мимолётный взгляд",
    "Здесь и сейчас",
    "Маленькая история",
    "Пауза",
    "Отголоски",
    "Знакомое место",
    "Мимолётная встреча",
    "В фокусе",
    "След времени",
  ],
  uk: [
    "Одна мить",
    "Враження",
    "Застигла мить",
    "Краєвид",
    "Тихе світло",
    "Новий погляд",
    "Між рядками",
    "Мимохідь",
    "Тут і зараз",
    "Маленька історія",
    "Пауза",
    "Відлуння",
    "Знайоме місце",
    "Миттєва зустріч",
    "У фокусі",
    "Слід часу",
  ],
} as const;
const videoTitles = {
  en: [
    "A story in motion",
    "A short story",
    "Life in the frame",
    "A few seconds",
    "On the move",
    "Another scene",
    "A living moment",
    "The rhythm of the day",
    "A new chapter",
    "Time flows",
    "A brief encounter",
    "Behind the scene",
    "Without words",
    "A turn of events",
    "In between",
    "A moving impression",
  ],
  ru: [
    "История в движении",
    "Короткая история",
    "Жизнь в кадре",
    "Несколько секунд",
    "На ходу",
    "Ещё одна сцена",
    "Живое мгновение",
    "Ритм дня",
    "Новая глава",
    "Течение времени",
    "Короткая встреча",
    "За кадром",
    "Без слов",
    "Поворот событий",
    "Между делом",
    "Движение впечатлений",
  ],
  uk: [
    "Історія в русі",
    "Коротка історія",
    "Життя в кадрі",
    "Кілька секунд",
    "На ходу",
    "Ще одна сцена",
    "Жива мить",
    "Ритм дня",
    "Новий розділ",
    "Плин часу",
    "Коротка зустріч",
    "За кадром",
    "Без слів",
    "Поворот подій",
    "Між справами",
    "Рух вражень",
  ],
} as const;
const titleSeries = {
  en: [
    "First impressions",
    "A new day",
    "Another perspective",
    "In the details",
    "A fresh start",
    "A personal story",
    "The present",
    "A journey",
  ],
  ru: [
    "Первые впечатления",
    "Новый день",
    "Другой ракурс",
    "В деталях",
    "Новое начало",
    "Личная история",
    "Настоящее",
    "Путешествие",
  ],
  uk: [
    "Перші враження",
    "Новий день",
    "Інший ракурс",
    "У деталях",
    "Новий початок",
    "Особиста історія",
    "Сьогодення",
    "Подорож",
  ],
} as const;

export function generateMediaTitle(
  locale: string,
  mediaType: "PHOTO" | "VIDEO",
  sequence: number,
): string {
  const language = locale === "ru" || locale === "uk" ? locale : "en";
  const titles = (mediaType === "VIDEO" ? videoTitles : photoTitles)[language];
  const index = Number.isFinite(sequence)
    ? Math.max(0, Math.floor(sequence))
    : 0;
  const title = titles[index % titles.length]!;
  const series = Math.floor(index / titles.length);
  return series === 0
    ? title
    : `${title} · ${titleSeries[language][(series - 1) % titleSeries[language].length]}`;
}

export function isTechnicalMediaTitle(title: string): boolean {
  const value = title.trim();
  return (
    /^[a-z]{0,4}\d{5,}$/i.test(value) ||
    /^[a-f\d]{16,}$/i.test(value) ||
    /^[a-f\d]{8}[ -][a-f\d]{4}[ -][a-f\d]{4}[ -][a-f\d]{4}[ -][a-f\d]{12}$/i.test(
      value,
    ) ||
    /^(?:img|dsc|dscf|pxl|vid|video|photo|image|file|screenshot)[ _-]*[\dT:. _-]+$/i.test(
      value,
    )
  );
}

export function titleFromFilename(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}
