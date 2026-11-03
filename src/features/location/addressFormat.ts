import type { ResolvedAddress } from './locationTypes';

function uniqueParts(parts: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const value = part?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

/** Headline such as "Dhaka, Dhaka Division, Bangladesh". */
export function addressTitle(address: ResolvedAddress): string | null {
  const parts = uniqueParts([
    address.locality ?? address.subregion ?? address.district,
    address.region,
    address.country,
  ]);
  return parts.length ? parts.join(', ') : null;
}

/** Full single-line address. Prefers the platform's own formatted string when it has one. */
export function addressLine(address: ResolvedAddress): string | null {
  if (address.formatted?.trim()) return address.formatted.trim();
  const street = uniqueParts([
    [address.streetNumber, address.street].filter(Boolean).join(' ') || null,
  ]);
  // Geocoders often repeat the street (or just the house number) as the place name.
  const nameKey = address.name?.trim().toLowerCase();
  const name =
    nameKey && !street.some((s) => s.toLowerCase().includes(nameKey)) ? address.name : null;
  const cityLine = uniqueParts([address.locality, address.postalCode]).join(' ');
  const parts = uniqueParts([
    name,
    ...street,
    address.district,
    cityLine || null,
    address.region,
    address.country,
  ]);
  return parts.length ? parts.join(', ') : null;
}
