/**
 * Spatial / GIS Utilities for Disaster Zone Inundation and Evacuation Planning
 * Nullifies coordinate formatting and polygon structure assumptions by providing
 * strict GeoJSON schema parsing, point-in-polygon ray casting, and distance calculations.
 */

export type CoordinatePair = [number, number]; // [longitude, latitude]

/**
 * Validates whether an input represents a valid [longitude, latitude] coordinate pair.
 * Longitude: -180 to 180
 * Latitude: -90 to 90
 */
export function isValidCoordinate(coord: any): coord is CoordinatePair {
  return (
    Array.isArray(coord) &&
    coord.length === 2 &&
    typeof coord[0] === 'number' &&
    !isNaN(coord[0]) &&
    coord[0] >= -180 &&
    coord[0] <= 180 &&
    typeof coord[1] === 'number' &&
    !isNaN(coord[1]) &&
    coord[1] >= -90 &&
    coord[1] <= 90
  );
}

/**
 * Parses and normalizes GeoJSON Polygon coordinates from a JSON string or raw object.
 * Accepts:
 * - Simple array of coordinate pairs: [[lon, lat], [lon, lat], ...]
 * - GeoJSON Polygon coordinates array: [[[lon, lat], [lon, lat], ...]]
 * - Full GeoJSON Geometry object: { type: "Polygon", coordinates: [[[lon, lat], ...]] }
 */
export function parsePolygonCoordinates(input: string | object): CoordinatePair[] {
  let parsed: any;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      return [];
    }
  } else {
    parsed = input;
  }

  if (!parsed) return [];

  // Check if standard GeoJSON geometry object
  if (parsed.type === 'Polygon' && Array.isArray(parsed.coordinates)) {
    parsed = parsed.coordinates[0];
  } else if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0]) && Array.isArray(parsed[0][0])) {
    // GeoJSON coordinates array: [[[lon, lat], ...]]
    parsed = parsed[0];
  }

  if (!Array.isArray(parsed)) return [];

  // Filter and ensure valid coordinate pairs
  const validCoords: CoordinatePair[] = [];
  for (const item of parsed) {
    if (isValidCoordinate(item)) {
      validCoords.push([item[0], item[1]]);
    }
  }

  return validCoords;
}

/**
 * Parses and normalizes GeoJSON LineString (road/polyline) coordinates.
 * Accepts:
 * - Simple array of coordinate pairs: [[lon, lat], [lon, lat], ...]
 * - Full GeoJSON LineString geometry: { type: "LineString", coordinates: [[lon, lat], ...] }
 */
export function parseLineStringCoordinates(input: string | object): CoordinatePair[] {
  let parsed: any;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      return [];
    }
  } else {
    parsed = input;
  }

  if (!parsed) return [];

  if (parsed.type === 'LineString' && Array.isArray(parsed.coordinates)) {
    parsed = parsed.coordinates;
  }

  if (!Array.isArray(parsed)) return [];

  const validCoords: CoordinatePair[] = [];
  for (const item of parsed) {
    if (isValidCoordinate(item)) {
      validCoords.push([item[0], item[1]]);
    }
  }

  return validCoords;
}

/**
 * Standard Ray-Casting algorithm to determine if a point [longitude, latitude]
 * lies strictly inside or on the boundary of a closed polygon ring.
 */
export function isPointInPolygon(point: CoordinatePair, polygon: CoordinatePair[]): boolean {
  if (!isValidCoordinate(point) || !Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Calculates the great-circle distance between two points on the Earth
 * using the Haversine formula (returns distance in kilometers).
 */
export function calculateHaversineDistanceKm(
  point1: CoordinatePair,
  point2: CoordinatePair
): number {
  if (!isValidCoordinate(point1) || !isValidCoordinate(point2)) {
    return 0;
  }

  const [lon1, lat1] = point1;
  const [lon2, lat2] = point2;

  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Computes the minimum bounding box for a set of coordinates.
 * Returns [minLon, minLat, maxLon, maxLat].
 */
export function getBoundingBox(
  coordinates: CoordinatePair[]
): [number, number, number, number] | null {
  if (!coordinates || coordinates.length === 0) return null;

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const [lon, lat] of coordinates) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return [minLon, minLat, maxLon, maxLat];
}
