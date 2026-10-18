export interface MapCoordinates {
  lat: number;
  lng: number;
}

/** Return real, usable map coordinates; never invent a fallback location. */
export function getMapCoordinates(lat: unknown, lng: unknown): MapCoordinates | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function hasMapCoordinates(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const coordinates = value as Partial<MapCoordinates>;
  return getMapCoordinates(coordinates.lat, coordinates.lng) !== null;
}

export function getBestMapCenter(
  current: MapCoordinates | null | undefined,
  destination: MapCoordinates | null | undefined,
  fallback: MapCoordinates,
): [number, number] {
  const point =
    getMapCoordinates(current?.lat, current?.lng) ??
    getMapCoordinates(destination?.lat, destination?.lng) ??
    fallback;
  return [point.lat, point.lng];
}
