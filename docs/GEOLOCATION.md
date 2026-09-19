# Geolocation and GPS Privacy

Photo location and photographer profile location are separate concepts.

## Stored data

- `PhotoMetadata.gpsLatitudePrivate` and `gpsLongitudePrivate` preserve private EXIF evidence.
- `PhotoLocation.latitudePrivate` and `longitudePrivate` preserve the normalized private capture point.
- `PhotoLocation.publicLatitude` and `publicLongitude` contain only the explicitly selected public representation.
- Country, region, city and place use normalized database records suitable for localized labels and filtering.

## Visibility rules

- `HIDDEN`: return no public coordinate or label.
- `COUNTRY`: return country-level identity only.
- `CITY`: return city identity and a coarse public point if configured.
- `APPROXIMATE`: return a deliberately reduced-precision point.
- `EXACT`: return an exact public point only after an explicit user choice.

Private coordinates must never be copied into public fields by default. Public API serializers must check `PhotoLocation.visibility` before returning a label or coordinate.

## Processing

EXIF extraction occurs in the worker pipeline. The original file remains private, while display and thumbnail variants may become public after publication and moderation approval. Removing EXIF from public derivatives does not remove the private evidence record.

## Search and map

Map and discovery filters operate on normalized country/region/city IDs and public coordinates. Profile location must not be used as a substitute for capture location. PostGIS indexes support future radius and bounding-box queries without changing this privacy model.
