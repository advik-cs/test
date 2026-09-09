import { PrismaClient } from '@prisma/client';
import { app } from '../src/app.js';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { ensurePostgresRunning } from '../src/config/embeddedPostgres.js';

export interface Stage4CheckResult {
  step: string;
  passed: boolean;
  details: string;
}

export interface Stage4VerificationSummary {
  allPassed: boolean;
  results: Stage4CheckResult[];
}

export async function verifyStage4(
  existingPrisma?: PrismaClient,
  serverPort?: number
): Promise<Stage4VerificationSummary> {
  const results: Stage4CheckResult[] = [];
  const addResult = (step: string, passed: boolean, details: string) => {
    results.push({ step, passed, details });
    const mark = passed ? '[PASS]' : '[FAIL]';
    console.log(`${mark} ${step}: ${details}`);
  };

  await ensurePostgresRunning();

  let testServer: Server | null = null;
  let baseUrl: string;

  if (serverPort) {
    baseUrl = `http://127.0.0.1:${serverPort}`;
  } else {
    await new Promise<void>((resolve) => {
      testServer = app.listen(0, '127.0.0.1', () => {
        const addr = testServer!.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  }

  const prisma = existingPrisma || new PrismaClient();

  try {
    // -------------------------------------------------------------
    // Setup Test Users: Citizen A, Citizen B, and Rescuer
    // -------------------------------------------------------------
    const timestamp = Date.now().toString().slice(-6);
    const citizenAPhone = `+919844${timestamp}`;
    const citizenBPhone = `+919855${timestamp}`;
    const rescuerPhone = `+919866${timestamp}`;

    // Register Citizen A
    const signupARes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Citizen A (Homeowner)',
        mobileNumber: citizenAPhone,
        password: 'Password@123',
        identityNumber: `12341234${timestamp}`,
        role: 'CITIZEN',
      }),
    });
    const signupAData = await signupARes.json();
    const citizenAToken = signupAData.token;

    // Register Citizen B
    const signupBRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Citizen B (Neighbor)',
        mobileNumber: citizenBPhone,
        password: 'Password@123',
        identityNumber: `56785678${timestamp}`,
        role: 'CITIZEN',
      }),
    });
    const signupBData = await signupBRes.json();
    const citizenBToken = signupBData.token;

    // Register Rescuer
    const signupRescuerRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Rescue Commander Nayak',
        mobileNumber: rescuerPhone,
        password: 'Password@123',
        identityNumber: `90129012${timestamp}`,
        role: 'RESCUER',
      }),
    });
    const signupRescuerData = await signupRescuerRes.json();
    const rescuerToken = signupRescuerData.token;

    const setupSuccess = Boolean(citizenAToken && citizenBToken && rescuerToken);
    addResult(
      'Test Identity Provisioning',
      setupSuccess,
      'Provisioned Citizen A, Citizen B, and Rescuer accounts with active JWTs'
    );

    // -------------------------------------------------------------
    // Register Household with Initial Home Location & GPS
    // -------------------------------------------------------------
    const regHhRes = await fetch(`${baseUrl}/api/households`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({
        householdCode: `HH-STG4-${timestamp}`,
        location: {
          buildingName: 'Mahanadi Palm Enclave Block B',
          address: 'Flat 402, Ring Road North',
          city: 'Bhubaneswar',
          state: 'Odisha',
          latitude: 20.301,
          longitude: 85.828,
        },
        members: [
          { name: 'Ramesh Sharma', age: 42, relationship: 'Self' },
          { name: 'Sunita Sharma', age: 39, relationship: 'Spouse' },
          { name: 'Aarav Sharma', age: 10, relationship: 'Son' },
        ],
      }),
    });
    const regHhData = await regHhRes.json();
    const householdId = regHhData.data?.id;
    const initialLocationId = regHhData.data?.registeredHomeLocation?.id;

    addResult(
      'Registered Home Location Creation (POST /api/households)',
      regHhRes.status === 201 && Boolean(householdId && initialLocationId),
      `Status: ${regHhRes.status}, Registered household with home location "${regHhData.data?.registeredHomeLocation?.buildingName}" at GPS (${regHhData.data?.registeredHomeLocation?.latitude}, ${regHhData.data?.registeredHomeLocation?.longitude})`
    );

    // -------------------------------------------------------------
    // Query Registered Home Location: GET /api/households/:id/location
    // -------------------------------------------------------------
    const getLocRes = await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    const getLocData = await getLocRes.json();
    const locPayload = getLocData.data?.location;

    addResult(
      'Query Registered Home Location (GET /api/households/:id/location)',
      getLocRes.status === 200 &&
        locPayload?.buildingName === 'Mahanadi Palm Enclave Block B' &&
        locPayload?.latitude === 20.301 &&
        locPayload?.longitude === 85.828,
      `Status: ${getLocRes.status}, Successfully fetched home location: "${locPayload?.buildingName}", Address: "${locPayload?.address}", GPS: [${locPayload?.latitude}, ${locPayload?.longitude}]`
    );

    // -------------------------------------------------------------
    // Query Registered Home Location via Alias: GET /api/households/my/location
    // -------------------------------------------------------------
    const getMyLocRes = await fetch(`${baseUrl}/api/households/my/location`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    const getMyLocData = await getMyLocRes.json();

    addResult(
      'Citizen Primary Home Location Alias (GET /api/households/my/location)',
      getMyLocRes.status === 200 && getMyLocData.data?.householdId === householdId,
      `Status: ${getMyLocRes.status}, Primary registered home location retrieved via /my/location alias`
    );

    // -------------------------------------------------------------
    // Update Registered Home Location with Address and GPS: PUT /api/households/:id/location
    // -------------------------------------------------------------
    const updateLocRes = await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({
        buildingName: 'River View Residency Tower A',
        address: 'Lane 5, Riverside Boulevard',
        city: 'Bhubaneswar',
        state: 'Odisha',
        latitude: 20.3155,
        longitude: 85.8421,
      }),
    });
    const updateLocData = await updateLocRes.json();
    const updatedLoc = updateLocData.data?.location;

    addResult(
      'Update Registered Home Location & GPS (PUT /api/households/:id/location)',
      updateLocRes.status === 200 &&
        updatedLoc?.buildingName === 'River View Residency Tower A' &&
        updatedLoc?.latitude === 20.3155 &&
        updatedLoc?.longitude === 85.8421,
      `Status: ${updateLocRes.status}, Updated buildingName to "${updatedLoc?.buildingName}", address to "${updatedLoc?.address}", GPS to [${updatedLoc?.latitude}, ${updatedLoc?.longitude}]`
    );

    // -------------------------------------------------------------
    // GPS Bounds Validation: Latitude > 90
    // -------------------------------------------------------------
    const invalidLatRes = await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({
        latitude: 95.5,
      }),
    });

    addResult(
      'GPS Boundary Validation: Latitude Out of Bounds (+95.5)',
      invalidLatRes.status === 400,
      `Status: ${invalidLatRes.status} (400 Bad Request returned for invalid latitude > 90)`
    );

    // -------------------------------------------------------------
    // GPS Bounds Validation: Latitude < -90
    // -------------------------------------------------------------
    const invalidLatNegRes = await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({
        latitude: -91.0,
      }),
    });

    addResult(
      'GPS Boundary Validation: Latitude Out of Bounds (-91.0)',
      invalidLatNegRes.status === 400,
      `Status: ${invalidLatNegRes.status} (400 Bad Request returned for invalid latitude < -90)`
    );

    // -------------------------------------------------------------
    // GPS Bounds Validation: Longitude > 180
    // -------------------------------------------------------------
    const invalidLngRes = await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({
        longitude: 195.0,
      }),
    });

    addResult(
      'GPS Boundary Validation: Longitude Out of Bounds (+195.0)',
      invalidLngRes.status === 400,
      `Status: ${invalidLngRes.status} (400 Bad Request returned for invalid longitude > 180)`
    );

    // -------------------------------------------------------------
    // GPS Bounds Validation: Longitude < -180
    // -------------------------------------------------------------
    const invalidLngNegRes = await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({
        longitude: -185.0,
      }),
    });

    addResult(
      'GPS Boundary Validation: Longitude Out of Bounds (-185.0)',
      invalidLngNegRes.status === 400,
      `Status: ${invalidLngNegRes.status} (400 Bad Request returned for invalid longitude < -180)`
    );

    // -------------------------------------------------------------
    // Citizen Ownership Protection: Read Guard (403 Forbidden)
    // -------------------------------------------------------------
    const crossReadRes = await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      headers: { Authorization: `Bearer ${citizenBToken}` },
    });

    addResult(
      'Citizen Ownership Protection: Read Guard (403 Forbidden)',
      crossReadRes.status === 403,
      `Status: ${crossReadRes.status}, Citizen B was correctly blocked from accessing Citizen A’s registered home location`
    );

    // -------------------------------------------------------------
    // Citizen Ownership Protection: Update Guard (403 Forbidden)
    // -------------------------------------------------------------
    const crossUpdateRes = await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenBToken}`,
      },
      body: JSON.stringify({
        buildingName: 'Tampered Landmark Name',
        latitude: 20.999,
      }),
    });

    addResult(
      'Citizen Ownership Protection: Update Guard (403 Forbidden)',
      crossUpdateRes.status === 403,
      `Status: ${crossUpdateRes.status}, Citizen B was correctly blocked from tampering with Citizen A’s home address/GPS`
    );

    // -------------------------------------------------------------
    // Rescuer Operational Inspection (200 OK)
    // -------------------------------------------------------------
    const rescuerReadRes = await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      headers: { Authorization: `Bearer ${rescuerToken}` },
    });
    const rescuerReadData = await rescuerReadRes.json();

    addResult(
      'Rescuer Operational Home Location Inspection (200 OK)',
      rescuerReadRes.status === 200 && Boolean(rescuerReadData.data?.location?.latitude),
      `Status: ${rescuerReadRes.status}, Rescuer authorized to view citizen home coordinates for search & rescue dispatch`
    );

    // -------------------------------------------------------------
    // Rescuer Modification Guard (403 Forbidden)
    // -------------------------------------------------------------
    const rescuerUpdateRes = await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rescuerToken}`,
      },
      body: JSON.stringify({
        buildingName: 'Unauthorized Rescuer Edit',
      }),
    });

    addResult(
      'Rescuer Modification Guard (403 Forbidden)',
      rescuerUpdateRes.status === 403,
      `Status: ${rescuerUpdateRes.status}, Rescuer prohibited from altering citizen registered home addresses/GPS`
    );

    // -------------------------------------------------------------
    // STRICT ARCHITECTURAL SEPARATION:
    // Setup a Disaster-Specific Expected Location for a family member
    // -------------------------------------------------------------
    // Find an existing or seeded disaster event and shelter
    let disaster = await prisma.disasterEvent.findFirst();
    let shelter = await prisma.shelter.findFirst();
    const members = await prisma.householdMember.findMany({ where: { householdId } });
    const member1 = members[0];
    const member2 = members[1];

    if (disaster && member1 && shelter) {
      // Create disaster-specific expected locations for members
      // Member 1 expects to evacuate to SHELTER
      await prisma.expectedLocation.upsert({
        where: {
          disasterEventId_householdMemberId: {
            disasterEventId: disaster.id,
            householdMemberId: member1.id,
          },
        },
        create: {
          disasterEventId: disaster.id,
          householdMemberId: member1.id,
          expectedLocationType: 'SHELTER',
          shelterId: shelter.id,
        },
        update: {
          expectedLocationType: 'SHELTER',
          shelterId: shelter.id,
        },
      });

      // Member 2 expects to travel to OTHER_CITY
      if (member2) {
        await prisma.expectedLocation.upsert({
          where: {
            disasterEventId_householdMemberId: {
              disasterEventId: disaster.id,
              householdMemberId: member2.id,
            },
          },
          create: {
            disasterEventId: disaster.id,
            householdMemberId: member2.id,
            expectedLocationType: 'OTHER_CITY',
            otherCity: 'Rourkela Safe Haven',
          },
          update: {
            expectedLocationType: 'OTHER_CITY',
            otherCity: 'Rourkela Safe Haven',
          },
        });
      }
    }

    // Capture the disaster-specific expected locations before updating home
    const expectedLocationsBefore = await prisma.expectedLocation.findMany({
      where: { householdMember: { householdId } },
      orderBy: { id: 'asc' },
    });

    // Now update registered home address and GPS coordinates again
    const sepUpdateRes = await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({
        buildingName: 'River View Residency Tower A (Renovated)',
        address: 'Lane 5, Riverside Boulevard, Block 3',
        latitude: 20.3201,
        longitude: 85.8455,
      }),
    });
    const sepUpdateData = await sepUpdateRes.json();

    // Verify disaster expected locations were UNTOUCHED
    const expectedLocationsAfter = await prisma.expectedLocation.findMany({
      where: { householdMember: { householdId } },
      orderBy: { id: 'asc' },
    });

    const isIdentical =
      JSON.stringify(expectedLocationsBefore) === JSON.stringify(expectedLocationsAfter);

    addResult(
      'Strict Separation: Registered Home Update Preserves Disaster Expected Locations',
      sepUpdateRes.status === 200 && isIdentical,
      `Updating registered home GPS to [20.3201, 85.8455] left all ${expectedLocationsAfter.length} disaster expected location record(s) completely unaltered and intact`
    );

    // -------------------------------------------------------------
    // Separation Verification Endpoint: GET /api/locations/verify-separation/:householdId
    // -------------------------------------------------------------
    const verifySepRes = await fetch(`${baseUrl}/api/locations/verify-separation/${householdId}`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    const verifySepData = await verifySepRes.json();

    addResult(
      'Architectural Separation Verification API (GET /api/locations/verify-separation)',
      verifySepRes.status === 200 && verifySepData.separationVerified === true,
      `Confirmed distinct models: Registered Home "${verifySepData.registeredHomeLocation?.buildingName}" (Permanent) vs Disaster Statuses (${verifySepData.disasterSpecificExpectedLocations?.memberEvacuationStatuses?.length} members tracked independently)`
    );

    // -------------------------------------------------------------
    // Direct Location Endpoint: GET & PUT /api/locations/:id
    // -------------------------------------------------------------
    const directLocRes = await fetch(`${baseUrl}/api/locations/${initialLocationId}`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    const directLocData = await directLocRes.json();

    addResult(
      'Direct Location Fetch (GET /api/locations/:id)',
      directLocRes.status === 200 && directLocData.data?.id === initialLocationId,
      `Status: ${directLocRes.status}, Successfully fetched location directly via /api/locations/:id`
    );

    // -------------------------------------------------------------
    // Robustness Check: Numeric String GPS Coordinate Coercion
    // -------------------------------------------------------------
    const stringCoordRes = await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({
        latitude: "20.3090",
        longitude: "85.8310",
      }),
    });
    const stringCoordData = await stringCoordRes.json();

    addResult(
      'GPS Coordinate Numeric String Coercion ("20.3090", "85.8310")',
      stringCoordRes.status === 200 &&
        stringCoordData.data?.location?.latitude === 20.309 &&
        stringCoordData.data?.location?.longitude === 85.831,
      `Status: ${stringCoordRes.status}, String-formatted coordinates safely parsed to numeric [${stringCoordData.data?.location?.latitude}, ${stringCoordData.data?.location?.longitude}]`
    );

    // -------------------------------------------------------------
    // Shared Location Decoupling Check: Multi-household branch safety
    // -------------------------------------------------------------
    // Create Household C with same locationId
    const hhCRes = await fetch(`${baseUrl}/api/households`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({
        registeredHomeLocationId: stringCoordData.data?.location?.id,
        members: [{ name: 'Dependent', age: 30, relationship: 'Sibling' }],
      }),
    });
    const hhCData = await hhCRes.json();
    const hhCId = hhCData.data?.id;

    // Now update household A's location: should decouple and NOT mutate Household C's location
    await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({
        buildingName: 'Decoupled Independent Tower',
        latitude: 20.3500,
        longitude: 85.8600,
      }),
    });

    const verifyHhCRes = await fetch(`${baseUrl}/api/households/${hhCId}/location`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    const verifyHhCData = await verifyHhCRes.json();

    const isHhCLocationUntouched =
      verifyHhCData.data?.location?.buildingName !== 'Decoupled Independent Tower' &&
      verifyHhCData.data?.location?.latitude === 20.309;

    addResult(
      'Shared Location Decoupling & Isolation',
      isHhCLocationUntouched,
      `Updating Household A created an isolated location record; Household C's location remained untouched at [${verifyHhCData.data?.location?.latitude}, ${verifyHhCData.data?.location?.longitude}]`
    );

    // Delete Household C
    await fetch(`${baseUrl}/api/households/${hhCId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });

    // -------------------------------------------------------------
    // Unauthenticated Endpoint Guard (401 Unauthorized)
    // -------------------------------------------------------------
    const unauthRes = await fetch(`${baseUrl}/api/households/${householdId}/location`);

    addResult(
      'Unauthenticated Endpoint Guard (401 Unauthorized)',
      unauthRes.status === 401,
      `Status: ${unauthRes.status}, Missing token blocked with 401 Unauthorized`
    );

    // -------------------------------------------------------------
    // Cleanup: Cascade delete household & locations created during test
    // -------------------------------------------------------------
    const finalLocationId = (
      await (
        await fetch(`${baseUrl}/api/households/${householdId}/location`, {
          headers: { Authorization: `Bearer ${citizenAToken}` },
        })
      ).json()
    ).data?.location?.id;

    await fetch(`${baseUrl}/api/households/${householdId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });

    const verifyCleanupRes = await fetch(`${baseUrl}/api/households/${householdId}/location`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });

    // Check if orphaned location was cleaned up
    const orphanCheck = await prisma.location.findUnique({
      where: { id: finalLocationId },
    });

    addResult(
      'Household Cascade & Orphaned Location Cleanup Verification',
      verifyCleanupRes.status === 404 && orphanCheck === null,
      `Status: ${verifyCleanupRes.status}, Household deleted successfully (404) and orphaned location record cleanly removed from database`
    );

    const allPassed = results.every((r) => r.passed);
    console.log(
      allPassed
        ? '=== STAGE 4 VERIFICATION RESULT: ALL TESTS PASSED ==='
        : '=== STAGE 4 VERIFICATION RESULT: SOME TESTS FAILED ==='
    );

    return { allPassed, results };
  } finally {
    if (testServer) {
      await new Promise<void>((resolve) => (testServer as Server).close(() => resolve()));
    }
    if (!existingPrisma) {
      await prisma.$disconnect();
    }
  }
}

// Standalone CLI runner
if (process.argv[1]?.endsWith('verify-stage4.ts') || process.argv[1]?.endsWith('verify-stage4.js')) {
  verifyStage4()
    .then((res) => {
      process.exit(res.allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal error during Stage 4 verification:', err);
      process.exit(1);
    });
}
