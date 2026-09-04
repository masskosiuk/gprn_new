import { defaultLocale, isSupportedLocale, supportedLocales, type SupportedLocale } from "@gprn/i18n";
import { NextResponse, type NextRequest } from "next/server";

const localeCookieName = "gprn_locale";

export function middleware(request: NextRequest): NextResponse {
  const [, locale] = request.nextUrl.pathname.split("/");

  if (locale && isSupportedLocale(locale)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${detectLocale(request)}${request.nextUrl.pathname}`;
  return NextResponse.redirect(url);
}

function detectLocale(request: NextRequest): SupportedLocale {
  const cookieLocale = request.cookies.get(localeCookieName)?.value;

  if (cookieLocale && isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

  const acceptedLanguages = request.headers
    .get("accept-language")
    ?.split(",")
    .map((value) => value.trim().split(";")[0]?.toLocaleLowerCase())
    .filter((value): value is string => Boolean(value));

  for (const acceptedLanguage of acceptedLanguages ?? []) {
    const exactMatch = supportedLocales.find((supportedLocale) => supportedLocale === acceptedLanguage);

    if (exactMatch) {
      return exactMatch;
    }

    const baseLanguage = acceptedLanguage.split("-")[0];
    const baseMatch = supportedLocales.find((supportedLocale) => supportedLocale === baseLanguage);

    if (baseMatch) {
      return baseMatch;
    }
  }

  return defaultLocale;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"]
};
