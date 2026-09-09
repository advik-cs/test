import { PrismaClient, Role, MemberCategory, FacilityType, ExpectedLocationType, ShelterStatus } from '@prisma/client';
import { parsePolygonCoordinates, isPointInPolygon } from '../src/utils/geo.js';
import { analyzeShelterOccupancy } from '../src/utils/shelter.js';

let defaultVerifyPrisma: PrismaClient | null = null;
function getVerifyPrisma(): PrismaClient {
  if (!defaultVerifyPrisma) {
    defaultVerifyPrisma = new PrismaClient();
  }
  return defaultVerifyPrisma;
}

interface VerificationResult {
  step: string;
  passed: boolean;
  details: string;
}

export async function verifyStage1(customClient?: PrismaClient): Promise<{
  allPassed: boolean;
  results: VerificationResult[];
}> {
  const prisma = customClient || getVerifyPrisma();
  const results: VerificationResult[] = [];

  const addResult = (step: string, passed: boolean, details: string) => {
    results.push({ step, passed, details });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${step}: ${details}`);
  };

  try {
    // 1. Check User counts & Roles
    const citizenCount = await prisma.user.count({ where: { role: Role.CITIZEN } });
    const rescuerCount = await prisma.user.count({ where: { role: Role.RESCUER } });
    addResult(
      'User Accounts',
      citizenCount >= 10 && rescuerCount >= 1,
      `Found ${citizenCount} Citizens (req >= 10) and ${rescuerCount} Rescuers (req >= 1)`
    );

    // 2. Identity Security (Hashed test Aadhaar & Passwords)
    const sampleUser = await prisma.user.findFirst();
    const isSecure =
      sampleUser &&
      sampleUser.passwordHash.startsWith('$2') &&
      sampleUser.identityNumberHash.startsWith('$2') &&
      sampleUser.identityLast4.length === 4;
    addResult(
      'Data Privacy & Hashing',
      !!isSecure,
      'Test Aadhaar/national ID numbers and passwords are cryptographically hashed with last-4 retained'
    );

    // 3. Households & Diverse Member Compositions
    const householdCount = await prisma.household.count();
    const adultCount = await prisma.householdMember.count({ where: { category: MemberCategory.ADULT } });
    const childCount = await prisma.householdMember.count({ where: { category: MemberCategory.CHILD } });
    const elderlyCount = await prisma.householdMember.count({ where: { category: MemberCategory.ELDERLY } });
    addResult(
      'Household Compositions',
      householdCount >= 3 && adultCount > 0 && childCount > 0 && elderlyCount > 0,
      `Found ${householdCount} households with ${adultCount} adults, ${childCount} children, and ${elderlyCount} elderly members`
    );

    // 4. Disaster Event & Affected Zone Polygon
    const disaster = await prisma.disasterEvent.findFirst({
      include: { affectedZones: true },
    });
    const hasDisasterWithZone = disaster && disaster.affectedZones.length >= 1;
    addResult(
      'Disasters & Affected Zones',
      !!hasDisasterWithZone,
      disaster
        ? `Disaster "${disaster.title}" (${disaster.type}) with ${disaster.affectedZones.length} affected zone(s)`
        : 'No disaster event found'
    );

    // 5. Polygon Affected vs Unaffected Household Verification (Using geo utility)
    const householdsWithLoc = await prisma.household.findMany({
      include: { registeredHomeLocation: true },
    });
    let insideCount = 0;
    let outsideCount = 0;
    if (disaster && disaster.affectedZones[0]) {
      const polygonRing = parsePolygonCoordinates(disaster.affectedZones[0].boundaryJson);

      for (const hh of householdsWithLoc) {
        const point: [number, number] = [
          hh.registeredHomeLocation.longitude,
          hh.registeredHomeLocation.latitude,
        ];
        const isInside = isPointInPolygon(point, polygonRing);
        if (isInside) insideCount++;
        else outsideCount++;
      }
    }
    addResult(
      'Spatial Zone Identification',
      insideCount > 0 && outsideCount > 0,
      `Verified ${insideCount} households inside affected flood polygon and ${outsideCount} unaffected households outside`
    );

    // 6. Shelters & Dynamic Occupancy States (Using shelter utility)
    const shelters = await prisma.shelter.findMany({
      include: { expectedLocations: true },
    });
    const analyses = shelters.map((s) => analyzeShelterOccupancy(s, s.expectedLocations.length));
    const availableShelter = analyses.find((a) => a.status === 'AVAILABLE');
    const nearCapacityShelter = analyses.find((a) => a.status === 'NEAR_CAPACITY');
    const overCapacityShelter = analyses.find((a) => a.status === 'OVER_CAPACITY');

    addResult(
      'Shelter Dynamic Occupancies',
      shelters.length >= 3 && !!availableShelter && !!nearCapacityShelter && !!overCapacityShelter,
      `Verified ${shelters.length} shelters: Available ("${availableShelter?.shelterName}" ${availableShelter?.expectedCount}/${availableShelter?.maxCapacity}), Near Capacity ("${nearCapacityShelter?.shelterName}" ${nearCapacityShelter?.expectedCount}/${nearCapacityShelter?.maxCapacity}), Over Capacity ("${overCapacityShelter?.shelterName}" ${overCapacityShelter?.expectedCount}/${overCapacityShelter?.maxCapacity})`
    );

    // 7. Expected Location Plans (HOME, SHELTER, OTHER_CITY, UNKNOWN)
    const homeCount = await prisma.expectedLocation.count({ where: { expectedLocationType: ExpectedLocationType.HOME } });
    const shelterExpCount = await prisma.expectedLocation.count({ where: { expectedLocationType: ExpectedLocationType.SHELTER } });
    const otherCityCount = await prisma.expectedLocation.count({ where: { expectedLocationType: ExpectedLocationType.OTHER_CITY } });
    const unknownCount = await prisma.expectedLocation.count({ where: { expectedLocationType: ExpectedLocationType.UNKNOWN } });

    addResult(
      'Expected Location Coverage',
      homeCount > 0 && shelterExpCount > 0 && otherCityCount > 0 && unknownCount > 0,
      `Plans recorded: ${homeCount} HOME, ${shelterExpCount} SHELTER, ${otherCityCount} OTHER_CITY, ${unknownCount} UNKNOWN`
    );

    // 8. Reconfirmation Audit Trail (ExpectedLocationHistory)
    const historyCount = await prisma.expectedLocationHistory.count();
    addResult(
      '30h Reconfirmation History Audit',
      historyCount > 0,
      `Found ${historyCount} historical location modification record(s) tracking 30-hour reconfirmations`
    );

    // 9. Emergency Facilities (2 Hospitals, 2 Fire, 2 Police, 2 Checkpoints)
    const hospitals = await prisma.emergencyFacility.count({ where: { type: FacilityType.HOSPITAL } });
    const fireStations = await prisma.emergencyFacility.count({ where: { type: FacilityType.FIRE_STATION } });
    const policeStations = await prisma.emergencyFacility.count({ where: { type: FacilityType.POLICE_STATION } });
    const checkpoints = await prisma.emergencyFacility.count({ where: { type: FacilityType.CHECKPOINT } });

    addResult(
      'Emergency Facilities (8 required)',
      hospitals >= 2 && fireStations >= 2 && policeStations >= 2 && checkpoints >= 2,
      `Hospitals: ${hospitals}, Fire Stations: ${fireStations}, Police Stations: ${policeStations}, Checkpoints: ${checkpoints}`
    );

    // 10. Road Networks & Polyline Geometries
    const roadCount = await prisma.road.count();
    addResult(
      'Baseline Road Polyline Networks',
      roadCount >= 2,
      `Found ${roadCount} arterial road and evacuation corridor polylines`
    );

    // 11. In-App Notifications
    const notifCount = await prisma.notification.count();
    addResult(
      'Alert Notifications',
      notifCount >= 3,
      `Found ${notifCount} evacuation alerts and reconfirmation notifications`
    );

    const allPassed = results.every((r) => r.passed);
    return { allPassed, results };
  } catch (error: any) {
    console.error('Verification error:', error);
    addResult('Execution', false, error?.message || 'Database query error');
    return { allPassed: false, results };
  }
}

// Run when directly invoked via CLI (e.g. `npm run test:stage1`)
if (process.argv[1]?.endsWith('verify-stage1.ts') || process.argv[1]?.includes('verify-stage1')) {
  const cliPrisma = new PrismaClient();
  cliPrisma
    .$connect()
    .then(() => verifyStage1(cliPrisma))
    .then(({ allPassed }) => {
      console.log(`\n=== STAGE 1 VERIFICATION RESULT: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'} ===`);
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Verification failed:', err);
      process.exit(1);
    })
    .finally(() => cliPrisma.$disconnect());
}
