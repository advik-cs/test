import { MemberCategory } from '@prisma/client';

export interface DemographicCounts {
  population: number;
  totalMembers: number;
  adultCount: number;
  childCount: number;
  elderlyCount: number;
}

/**
 * Automatically determines the demographic category of a household member based on their age:
 * - CHILD: 0 - 17 years (< 18)
 * - ADULT: 18 - 59 years (>= 18 and < 60)
 * - ELDERLY: 60+ years (>= 60)
 */
export function determineMemberCategory(age: number): MemberCategory {
  if (age < 18) {
    return MemberCategory.CHILD;
  }
  if (age >= 60) {
    return MemberCategory.ELDERLY;
  }
  return MemberCategory.ADULT;
}

/**
 * Calculates aggregate demographic figures for a collection of household members.
 * Supports members with either explicit category or age.
 */
export function calculateHouseholdDemographics(
  members: Array<{ age: number; category?: MemberCategory | string | null }>
): DemographicCounts {
  let adultCount = 0;
  let childCount = 0;
  let elderlyCount = 0;

  for (const member of members) {
    let cat: MemberCategory;

    if (
      member.category === MemberCategory.ADULT ||
      member.category === MemberCategory.CHILD ||
      member.category === MemberCategory.ELDERLY
    ) {
      cat = member.category;
    } else {
      cat = determineMemberCategory(member.age);
    }

    if (cat === MemberCategory.ADULT) adultCount++;
    else if (cat === MemberCategory.CHILD) childCount++;
    else if (cat === MemberCategory.ELDERLY) elderlyCount++;
  }

  const population = members.length;

  return {
    population,
    totalMembers: population,
    adultCount,
    childCount,
    elderlyCount,
  };
}

/**
 * Formats a household database record with computed demographic statistics.
 */
export function formatHouseholdWithDemographics<T extends { members?: any[] }>(household: T) {
  const members = household.members || [];
  const demographics = calculateHouseholdDemographics(members);

  return {
    ...household,
    ...demographics,
    demographics,
  };
}
