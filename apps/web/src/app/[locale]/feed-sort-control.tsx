"use client";

import { FEED_SORTS, type FeedSort } from "@gprn/domain";
import { getMessage, type SupportedLocale } from "@gprn/i18n";

export function FeedSortControl({
  value,
  locale,
  onChange,
}: {
  readonly value: FeedSort;
  readonly locale: SupportedLocale;
  readonly onChange: (sort: FeedSort) => void;
}) {
  return (
    <label className="discover-filter-field">
      <span>{getMessage(locale, "feed.sort")}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as FeedSort)}
      >
        {FEED_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {getMessage(locale, `feed.sort.${sort}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
