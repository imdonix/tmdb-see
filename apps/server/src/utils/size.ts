const UNIT_FACTORS: Record<string, number> = {
  b: 1,
  bytes: 1,
  kb: 1000,
  kib: 1024,
  mb: 1000 ** 2,
  mib: 1024 ** 2,
  gb: 1000 ** 3,
  gib: 1024 ** 3,
  tb: 1000 ** 4,
  tib: 1024 ** 4,
};

export function parseSize(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^([\d.,]+)\s*([a-zA-Z]+)?$/);
  if (!match) return undefined;
  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount)) return undefined;
  const unit = (match[2] ?? "b").toLowerCase();
  const factor = UNIT_FACTORS[unit] ?? 1;
  return Math.round(amount * factor);
}

export function humanSize(value: number | undefined): string {
  if (!value || value <= 0) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
}
