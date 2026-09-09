/**
 * Shelter Dynamic Capacity & Occupancy Calculator
 * Nullifies capacity and occupancy assumptions by standardizing occupancy percentage,
 * overflow detection, and status categorizations.
 */

export type ShelterOccupancyStatus = 'AVAILABLE' | 'NEAR_CAPACITY' | 'OVER_CAPACITY';

export interface ShelterOccupancyAnalysis {
  shelterId: string;
  shelterName: string;
  maxCapacity: number;
  expectedCount: number;
  remainingCapacity: number;
  occupancyPercentage: number;
  isOverCapacity: boolean;
  isNearCapacity: boolean;
  status: ShelterOccupancyStatus;
}

/**
 * Evaluates dynamic shelter occupancy with safe division and strict status thresholds:
 * - OVER_CAPACITY: expectedCount > maxCapacity
 * - NEAR_CAPACITY: expectedCount / maxCapacity >= 0.8 && expectedCount <= maxCapacity
 * - AVAILABLE: expectedCount / maxCapacity < 0.8
 */
export function analyzeShelterOccupancy(
  shelter: { id: string; name: string; capacity: number },
  expectedCount: number
): ShelterOccupancyAnalysis {
  const safeCapacity = Math.max(1, shelter.capacity);
  const safeExpected = Math.max(0, expectedCount);
  const remainingCapacity = Math.max(0, safeCapacity - safeExpected);
  const occupancyPercentage = Math.round((safeExpected / safeCapacity) * 100);

  let status: ShelterOccupancyStatus = 'AVAILABLE';
  let isOverCapacity = false;
  let isNearCapacity = false;

  if (safeExpected > safeCapacity) {
    status = 'OVER_CAPACITY';
    isOverCapacity = true;
  } else if (safeExpected / safeCapacity >= 0.8) {
    status = 'NEAR_CAPACITY';
    isNearCapacity = true;
  }

  return {
    shelterId: shelter.id,
    shelterName: shelter.name,
    maxCapacity: safeCapacity,
    expectedCount: safeExpected,
    remainingCapacity,
    occupancyPercentage,
    isOverCapacity,
    isNearCapacity,
    status,
  };
}
