import { prisma } from "@gprn/db";
import { BadRequestException, Injectable } from "@nestjs/common";

import { asRecord, optionalString, requiredString } from "./validation.js";

export interface LocationSelection {
  readonly admin1?: string;
  readonly country: string;
  readonly countryCode: string;
  readonly externalId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
}

export interface ResolvedCity {
  readonly cityId: string;
  readonly countryId: string;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly regionId: string | null;
  readonly slug: string;
}

interface OpenMeteoLocation {
  readonly admin1?: string;
  readonly country?: string;
  readonly country_code?: string;
  readonly id?: number;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly name?: string;
}

@Injectable()
export class LocationsService {
  async search(
    search: string,
    language: string,
  ): Promise<{
    locations: readonly (LocationSelection & { readonly label: string })[];
  }> {
    const query = search.trim().slice(0, 100);
    if (query.length < 2) return { locations: [] };

    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", query);
    url.searchParams.set("count", "10");
    url.searchParams.set("format", "json");
    url.searchParams.set("language", normalizeLanguage(language));

    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return { locations: [] };

      const payload = (await response.json()) as {
        readonly results?: readonly OpenMeteoLocation[];
      };
      const locations = (payload.results ?? [])
        .filter(isCompleteLocation)
        .map((location) => {
          const selection: LocationSelection = {
            admin1: location.admin1,
            country: location.country,
            countryCode: location.country_code.toUpperCase(),
            externalId: String(location.id),
            latitude: location.latitude,
            longitude: location.longitude,
            name: location.name,
          };
          return { ...selection, label: formatLocationLabel(selection) };
        });

      return { locations };
    } catch {
      return { locations: [] };
    }
  }

  async resolveSelection(selection: LocationSelection): Promise<ResolvedCity> {
    const countryCode = selection.countryCode.toUpperCase();
    const country = await prisma.country.upsert({
      create: {
        iso2: countryCode,
        nameKey: selection.country,
        slug: slugify(selection.country) || countryCode.toLowerCase(),
      },
      update: {
        nameKey:
          selection.country.toUpperCase() === countryCode
            ? undefined
            : selection.country,
      },
      where: { iso2: countryCode },
    });

    if (!/^\d+$/.test(selection.externalId)) {
      const storedCity = await prisma.city.findFirst({
        where: { countryId: country.id, slug: selection.externalId },
      });
      if (storedCity?.latitude && storedCity.longitude) {
        return {
          cityId: storedCity.id,
          countryId: country.id,
          label: [selection.name, selection.country].filter(Boolean).join(", "),
          latitude: Number(storedCity.latitude),
          longitude: Number(storedCity.longitude),
          regionId: storedCity.regionId,
          slug: storedCity.slug,
        };
      }
    }

    let regionId: string | null = null;
    if (selection.admin1) {
      const regionSlug = slugify(selection.admin1);
      const existingRegion = await prisma.region.findFirst({
        where: { countryId: country.id, slug: regionSlug },
      });
      const region = existingRegion
        ? await prisma.region.update({
            data: { nameKey: selection.admin1 },
            where: { id: existingRegion.id },
          })
        : await prisma.region.create({
            data: {
              countryId: country.id,
              nameKey: selection.admin1,
              slug: regionSlug,
            },
          });
      regionId = region.id;
    }

    const citySlug = `geo-${selection.externalId}`;
    const existingCity = await prisma.city.findFirst({
      where: { countryId: country.id, slug: citySlug },
    });
    const city = existingCity
      ? await prisma.city.update({
          data: {
            latitude: selection.latitude,
            longitude: selection.longitude,
            nameKey: selection.name,
            regionId,
          },
          where: { id: existingCity.id },
        })
      : await prisma.city.create({
          data: {
            countryId: country.id,
            latitude: selection.latitude,
            longitude: selection.longitude,
            nameKey: selection.name,
            regionId,
            slug: citySlug,
          },
        });

    return {
      cityId: city.id,
      countryId: country.id,
      label: formatLocationLabel(selection),
      latitude: selection.latitude,
      longitude: selection.longitude,
      regionId,
      slug: city.slug,
    };
  }

  async nearestKnownCity(
    latitude: number,
    longitude: number,
    maximumDistanceKm = 75,
  ): Promise<ResolvedCity | null> {
    const cities = await prisma.city.findMany({
      include: { country: true },
      where: { latitude: { not: null }, longitude: { not: null } },
    });
    const candidates = cities
      .map((city) => {
        const cityLatitude = Number(city.latitude);
        const cityLongitude = Number(city.longitude);
        return {
          city,
          cityLatitude,
          cityLongitude,
          distance: haversineKm(
            latitude,
            longitude,
            cityLatitude,
            cityLongitude,
          ),
        };
      })
      .sort((left, right) => left.distance - right.distance);
    const nearest = candidates[0];
    if (!nearest || nearest.distance > maximumDistanceKm) return null;

    return {
      cityId: nearest.city.id,
      countryId: nearest.city.countryId,
      label: formatStoredCityLabel(
        nearest.city.nameKey,
        nearest.city.slug,
        nearest.city.country.nameKey,
      ),
      latitude: nearest.cityLatitude,
      longitude: nearest.cityLongitude,
      regionId: nearest.city.regionId,
      slug: nearest.city.slug,
    };
  }
}

export function parseLocationSelection(
  value: unknown,
): LocationSelection | undefined {
  if (value === undefined || value === null) return undefined;

  const record = asRecord(value, "INVALID_LOCATION");
  const latitude = record.latitude;
  const longitude = record.longitude;
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new BadRequestException({
      code: "INVALID_LOCATION_COORDINATES",
      message: "Location coordinates are invalid.",
    });
  }

  const countryCode = requiredString(record, "countryCode").toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new BadRequestException({
      code: "INVALID_LOCATION_COUNTRY",
      message: "Location country code is invalid.",
    });
  }

  return {
    admin1: optionalString(record, "admin1")?.slice(0, 160),
    country: requiredString(record, "country").slice(0, 160),
    countryCode,
    externalId: requiredString(record, "externalId").slice(0, 80),
    latitude,
    longitude,
    name: requiredString(record, "name").slice(0, 160),
  };
}

export function formatStoredCityLabel(
  nameKey: string,
  slug: string,
  countryNameKey?: string,
): string {
  const cityName = nameKey.includes(".") ? humanizeSlug(slug) : nameKey;
  const countryName =
    countryNameKey && !countryNameKey.includes(".") ? countryNameKey : "";
  return [cityName, countryName].filter(Boolean).join(", ");
}

function isCompleteLocation(
  location: OpenMeteoLocation,
): location is OpenMeteoLocation & {
  readonly country: string;
  readonly country_code: string;
  readonly id: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
} {
  return Boolean(
    location.country &&
    location.country_code &&
    location.id !== undefined &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    location.name,
  );
}

function formatLocationLabel(location: LocationSelection): string {
  return [location.name, location.admin1, location.country]
    .filter(Boolean)
    .join(", ");
}

function normalizeLanguage(language: string): string {
  const normalized = language.toLowerCase().slice(0, 2);
  return /^[a-z]{2}$/.test(normalized) ? normalized : "en";
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function humanizeSlug(slug: string): string {
  return slug
    .replace(/^geo-\d+$/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function haversineKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const toRadians = (value: number): number => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const startLatitude = toRadians(latitudeA);
  const endLatitude = toRadians(latitudeB);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(haversine));
}
