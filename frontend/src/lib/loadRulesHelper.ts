import type { MetaResponse } from "@/api/schemas";

/**
 * Build helper text for the current load from /api/meta load_rules.
 * No hardcoded threshold numbers in the UI — all values come from meta.
 */
export function loadRulesHelperText(
  loadLb: number,
  meta: MetaResponse | undefined,
): string {
  if (!meta) {
    return "Load rules load with risk thresholds…";
  }
  const withLoad = meta.load_rules.filter((rule) => rule.load_gt_lb != null);
  const always = meta.load_rules.filter((rule) => rule.load_gt_lb == null);

  const parts: string[] = [];
  for (const rule of always) {
    parts.push(rule.description);
  }

  if (withLoad.length === 0) {
    return parts.join(" ") || "No load-dependent rules.";
  }

  const applicable = withLoad.filter(
    (rule) => rule.load_gt_lb != null && loadLb > rule.load_gt_lb,
  );
  const upcoming = withLoad
    .filter((rule) => rule.load_gt_lb != null && loadLb <= rule.load_gt_lb)
    .sort((a, b) => (a.load_gt_lb ?? 0) - (b.load_gt_lb ?? 0));

  if (applicable.length === 0) {
    const next = upcoming[0];
    if (next && next.load_gt_lb != null) {
      const formatted = next.load_gt_lb.toLocaleString("en-US");
      parts.push(
        `At this weight, load-based upgrades do not apply yet. Above ${formatted} lb: ${next.description}`,
      );
    } else {
      parts.push("No load-based upgrades apply at this weight.");
    }
  } else {
    parts.push(
      `At ${loadLb.toLocaleString("en-US")} lb, these load rules can raise risk: ${applicable
        .map((r) => r.description)
        .join("; ")}.`,
    );
  }

  return parts.join(" ");
}
