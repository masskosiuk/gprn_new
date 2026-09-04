import { BadRequestException } from "@nestjs/common";

export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown, code = "INVALID_BODY"): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException({
      code,
      message: "Request body must be an object."
    });
  }

  return value as JsonRecord;
}

export function optionalString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new BadRequestException({
      code: "INVALID_FIELD",
      field: key,
      message: `${key} must be a string.`
    });
  }

  return value.trim();
}

export function requiredString(record: JsonRecord, key: string): string {
  const value = optionalString(record, key);

  if (!value) {
    throw new BadRequestException({
      code: "REQUIRED_FIELD",
      field: key,
      message: `${key} is required.`
    });
  }

  return value;
}

export function optionalEnum<T extends string>(
  record: JsonRecord,
  key: string,
  values: readonly T[]
): T | undefined {
  const value = optionalString(record, key);

  if (!value) {
    return undefined;
  }

  if (!values.includes(value as T)) {
    throw new BadRequestException({
      code: "INVALID_FIELD",
      field: key,
      message: `${key} is not supported.`
    });
  }

  return value as T;
}

