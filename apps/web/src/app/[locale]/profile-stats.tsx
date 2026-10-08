import { getMessage, type SupportedLocale } from "@gprn/i18n";
import type { CSSProperties } from "react";
import {
  visibleProfileMetrics,
  type ProfileMetricValues,
} from "../../lib/profile-metrics";

export function ProfileStats({
  locale,
  ...values
}: ProfileMetricValues & { readonly locale: SupportedLocale }) {
  const metrics = visibleProfileMetrics(values);
  if (!metrics.length) return null;
  const formatter = new Intl.NumberFormat(locale);
  return (
    <div
      className="profile-stats"
      data-count={metrics.length}
      style={{ "--stat-count": metrics.length } as CSSProperties}
    >
      {metrics.map(({ value, key }) => (
        <div key={key}>
          <strong>{formatter.format(value)}</strong>
          <span>{getMessage(locale, key)}</span>
        </div>
      ))}
    </div>
  );
}
