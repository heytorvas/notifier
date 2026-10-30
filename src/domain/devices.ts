import type { InstalledApp } from '../infrastructure/notifierGateway';

export function orderInstalledApps(
  apps: InstalledApp[],
  selected: ReadonlySet<string>,
  query: string,
): InstalledApp[] {
  const normalized = query.trim().toLowerCase();
  const visible = normalized
    ? apps.filter(
        (app) =>
          app.name.toLowerCase().includes(normalized) ||
          app.packageName.toLowerCase().includes(normalized),
      )
    : apps;

  return [...visible].sort((left, right) => {
    const leftSelected = selected.has(left.packageName) ? 0 : 1;
    const rightSelected = selected.has(right.packageName) ? 0 : 1;
    if (leftSelected !== rightSelected) return leftSelected - rightSelected;
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

export function formatDeviceName(brand: string, model: string): string {
  const brandText = brand.trim();
  const modelText = model.trim();
  const displayBrand =
    brandText === brandText.toLowerCase()
      ? `${brandText.charAt(0).toUpperCase()}${brandText.slice(1)}`
      : brandText;
  if (!displayBrand) return modelText;
  if (!modelText) return displayBrand;
  if (modelText.toLowerCase().startsWith(displayBrand.toLowerCase())) return modelText;
  return `${displayBrand} ${modelText}`;
}

export function formatPairedAt(pairedAt: number | null): string | null {
  if (!pairedAt) return null;
  return new Date(pairedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function pairingFingerprint(code: string): string | null {
  try {
    const parsed: unknown = JSON.parse(code);
    if (!parsed || typeof parsed !== 'object') return null;
    const inboxId = (parsed as { inboxId?: unknown }).inboxId;
    if (typeof inboxId !== 'string' || !/^[0-9a-f-]{8,}$/i.test(inboxId)) return null;
    return inboxId.replace(/-/g, '').slice(-6).toUpperCase();
  } catch {
    return null;
  }
}
