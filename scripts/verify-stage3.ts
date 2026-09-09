import { PrismaClient } from '@prisma/client';
import { app } from '../src/app.js';
import { Server } from 'http';
import { AddressInfo } from 'net';

export interface Stage3CheckResult {
  step: string;
  passed: boolean;
  details: string;
}

export interface Stage3VerificationSummary {
  allPassed: boolean;
  results: Stage3CheckResult[];
}

export async function verifyStage3(
  existingPrisma?: PrismaClient,
  serverPort?: number
): Promise<Stage3VerificationSummary> {
  const results: Stage3CheckResult[] = [];
  const addResult = (step: string, passed: boolean, details: string) => {
    results.push({ step, passed, details });
    const mark = passed ? '[PASS]' : '[FAIL]';
    console.log(`${mark} ${step}: ${details}`);
  };

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

  try {
    // -------------------------------------------------------------
    // Setup Test Users: Citizen A, Citizen B, and Rescuer
    // -------------------------------------------------------------
    const timestamp = Date.now().toString().slice(-6);
    const citizenAPhone = `+919811${timestamp}`;
    const citizenBPhone = `+919822${timestamp}`;
    const rescuerPhone = `+919833${timestamp}`;

    // Register Citizen A
    const signupARes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Citizen Alpha Sharma',
        mobileNumber: citizenAPhone,
        password: 'Password@123',
        identityNumber: `11112222${timestamp}`,
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
        name: 'Citizen Beta Patel',
        mobileNumber: citizenBPhone,
        password: 'Password@123',
        identityNumber: `33334444${timestamp}`,
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
        name: 'Officer Rescuer Rao',
        mobileNumber: rescuerPhone,
        password: 'Password@123',
        identityNumber: `55556666${timestamp}`,
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
    // Test 1: Household Registration (POST /api/households)
    // -------------------------------------------------------------
    const createHhPayload = {
      householdCode: `HH-TEST-${timestamp}`,
      location: {
        buildingName: 'Lake View Towers Flat 402',
        address: '22 Dam Site Boulevard',
        city: 'Bhubaneswar',
        state: 'Odisha',
        latitude: 20.301,
        longitude: 85.828,
      },
      members: [
        { name: 'Ramesh Sharma', age: 42, relationship: 'Self' }, // Adult (18-59)
        { name: 'Sunita Sharma', age: 39, relationship: 'Spouse' }, // Adult (18-59)
        { name: 'Aarav Sharma', age: 11, relationship: 'Son' }, // Child (<18)
        { name: 'Harish Sharma', age: 72, relationship: 'Father' }, // Elderly (>=60)
      ],
    };

    const createHhRes = await fetch(`${baseUrl}/api/households`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify(createHhPayload),
    });

    const createHhData = await createHhRes.json();
    const createdHousehold = createHhData.data;

    const createHhPassed =
      createHhRes.status === 201 &&
      createHhData.success === true &&
      createdHousehold?.householdCode === createHhPayload.householdCode &&
      createdHousehold?.members?.length === 4;

    addResult(
      'Household Registration (POST /api/households)',
      createHhPassed,
      `Status: ${createHhRes.status}, Registered household with location and 4 family members`
    );

    const householdId = createdHousehold?.id;

    // -------------------------------------------------------------
    // Test 2: Automatic Demographics Calculation
    // -------------------------------------------------------------
    const demoPassed =
      createdHousehold?.population === 4 &&
      createdHousehold?.adultCount === 2 &&
      createdHousehold?.childCount === 1 &&
      createdHousehold?.elderlyCount === 1;

    addResult(
      'Automatic Demographics Calculation',
      demoPassed,
      `Calculated: Population=${createdHousehold?.population}, Adults=${createdHousehold?.adultCount}, Children=${createdHousehold?.childCount}, Elderly=${createdHousehold?.elderlyCount}`
    );

    // -------------------------------------------------------------
    // Test 3: Citizen Querying Own Household (GET /api/households/:id & /api/households/my)
    // -------------------------------------------------------------
    const getOwnHhRes = await fetch(`${baseUrl}/api/households/${householdId}`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    const getMyHhRes = await fetch(`${baseUrl}/api/households/my`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });

    const getOwnHhData = await getOwnHhRes.json();
    const getMyHhData = await getMyHhRes.json();

    const readOwnPassed =
      getOwnHhRes.status === 200 &&
      getMyHhRes.status === 200 &&
      getOwnHhData.data?.id === householdId &&
      getMyHhData.data?.id === householdId;

    addResult(
      'Citizen Accessing Own Household (200 OK)',
      readOwnPassed,
      'Citizen A successfully accessed their registered household via ID and /my alias'
    );

    // -------------------------------------------------------------
    // Test 4: Citizen Ownership Protection - Unauthorized Read (403 Forbidden)
    // Citizen B attempts to read Citizen A's household
    // -------------------------------------------------------------
    const unauthorizedReadRes = await fetch(`${baseUrl}/api/households/${householdId}`, {
      headers: { Authorization: `Bearer ${citizenBToken}` },
    });

    const unauthorizedReadPassed = unauthorizedReadRes.status === 403;
    addResult(
      'Citizen Ownership Protection: Read Guard (403 Forbidden)',
      unauthorizedReadPassed,
      `Status: ${unauthorizedReadRes.status}, Citizen B blocked from reading Citizen A’s household`
    );

    // -------------------------------------------------------------
    // Test 5: Citizen Ownership Protection - Unauthorized Update (403 Forbidden)
    // Citizen B attempts to modify Citizen A's household
    // -------------------------------------------------------------
    const unauthorizedUpdateRes = await fetch(`${baseUrl}/api/households/${householdId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenBToken}`,
      },
      body: JSON.stringify({ householdCode: 'HH-HACKED-CODE' }),
    });

    const unauthorizedUpdatePassed = unauthorizedUpdateRes.status === 403;
    addResult(
      'Citizen Ownership Protection: Update Guard (403 Forbidden)',
      unauthorizedUpdatePassed,
      `Status: ${unauthorizedUpdateRes.status}, Citizen B blocked from modifying Citizen A’s household`
    );

    // -------------------------------------------------------------
    // Test 6: Citizen Ownership Protection - Unauthorized Delete (403 Forbidden)
    // Citizen B attempts to delete Citizen A's household
    // -------------------------------------------------------------
    const unauthorizedDeleteRes = await fetch(`${baseUrl}/api/households/${householdId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${citizenBToken}` },
    });

    const unauthorizedDeletePassed = unauthorizedDeleteRes.status === 403;
    addResult(
      'Citizen Ownership Protection: Delete Guard (403 Forbidden)',
      unauthorizedDeletePassed,
      `Status: ${unauthorizedDeleteRes.status}, Citizen B blocked from deleting Citizen A’s household`
    );

    // -------------------------------------------------------------
    // Test 7: Rescuer Operational Read Access (200 OK)
    // Rescuers are authorized to inspect household demographics for rescue ops
    // -------------------------------------------------------------
    const rescuerReadRes = await fetch(`${baseUrl}/api/households/${householdId}`, {
      headers: { Authorization: `Bearer ${rescuerToken}` },
    });
    const rescuerReadData = await rescuerReadRes.json();

    const rescuerReadPassed =
      rescuerReadRes.status === 200 &&
      rescuerReadData.data?.population === 4;

    addResult(
      'Rescuer Operational Household Inspection (200 OK)',
      rescuerReadPassed,
      'Rescuer permitted to read household composition and vulnerability metrics for evacuation ops'
    );

    // -------------------------------------------------------------
    // Test 8: Rescuer Modification Restriction (403 Forbidden)
    // Rescuers cannot alter citizen's private household data
    // -------------------------------------------------------------
    const rescuerModifyRes = await fetch(`${baseUrl}/api/households/${householdId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rescuerToken}`,
      },
      body: JSON.stringify({ householdCode: 'HH-RESCUER-EDIT' }),
    });

    const rescuerModifyPassed = rescuerModifyRes.status === 403;
    addResult(
      'Rescuer Modification Restriction (403 Forbidden)',
      rescuerModifyPassed,
      `Status: ${rescuerModifyRes.status}, Rescuer blocked from unauthorized edit to citizen household`
    );

    // -------------------------------------------------------------
    // Test 9: Add Household Member with Auto-Category (POST /members)
    // Add child (<18) without supplying category
    // -------------------------------------------------------------
    const addChildRes = await fetch(`${baseUrl}/api/households/${householdId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({
        name: 'Tara Sharma',
        age: 3,
        relationship: 'Daughter',
      }),
    });
    const addChildData = await addChildRes.json();
    const createdChild = addChildData.data?.member;

    const addChildPassed =
      addChildRes.status === 201 &&
      createdChild?.category === 'CHILD' &&
      addChildData.data?.population === 5 &&
      addChildData.data?.childCount === 2;

    addResult(
      'Member Creation & Auto-Category: CHILD (POST /members)',
      addChildPassed,
      `Status: ${addChildRes.status}, Age 3 auto-assigned category "CHILD". Population updated to 5 (Children: 2)`
    );

    // -------------------------------------------------------------
    // Test 10: Add Elderly Member with Auto-Category (POST /members)
    // Add elderly (>=60) without supplying category
    // -------------------------------------------------------------
    const addElderlyRes = await fetch(`${baseUrl}/api/households/${householdId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({
        name: 'Kamala Sharma',
        age: 68,
        relationship: 'Mother',
      }),
    });
    const addElderlyData = await addElderlyRes.json();
    const createdElderly = addElderlyData.data?.member;

    const addElderlyPassed =
      addElderlyRes.status === 201 &&
      createdElderly?.category === 'ELDERLY' &&
      addElderlyData.data?.population === 6 &&
      addElderlyData.data?.elderlyCount === 2;

    addResult(
      'Member Creation & Auto-Category: ELDERLY (POST /members)',
      addElderlyPassed,
      `Status: ${addElderlyRes.status}, Age 68 auto-assigned category "ELDERLY". Population updated to 6 (Elderly: 2)`
    );

    // -------------------------------------------------------------
    // Test 11: Member Ownership Protection (Add Member)
    // Citizen B tries to add member into Citizen A's household
    // -------------------------------------------------------------
    const unauthorizedAddMemberRes = await fetch(`${baseUrl}/api/households/${householdId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenBToken}`,
      },
      body: JSON.stringify({
        name: 'Intruder Member',
        age: 25,
        relationship: 'None',
      }),
    });

    const unauthorizedAddMemberPassed = unauthorizedAddMemberRes.status === 403;
    addResult(
      'Member Ownership Protection: Add Member Guard (403 Forbidden)',
      unauthorizedAddMemberPassed,
      `Status: ${unauthorizedAddMemberRes.status}, Citizen B blocked from adding member to Citizen A’s household`
    );

    // -------------------------------------------------------------
    // Test 12: Member Update & Demographic Re-Calculation (PUT /members/:id)
    // Update Tara's age from 3 to 19 (transitions from CHILD to ADULT)
    // -------------------------------------------------------------
    const childId = createdChild?.id;
    const updateMemberRes = await fetch(`${baseUrl}/api/households/${householdId}/members/${childId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({
        age: 19, // Now adult
      }),
    });
    const updateMemberData = await updateMemberRes.json();
    const updatedMember = updateMemberData.data?.member;

    const updateMemberPassed =
      updateMemberRes.status === 200 &&
      updatedMember?.category === 'ADULT' &&
      updateMemberData.data?.adultCount === 3 &&
      updateMemberData.data?.childCount === 1;

    addResult(
      'Member Age Transition & Category Re-calculation',
      updateMemberPassed,
      `Updated age to 19: Category transitioned to "ADULT", AdultCount increased to 3, ChildCount decreased to 1`
    );

    // -------------------------------------------------------------
    // Test 13: Member Ownership Protection (Update Member)
    // Citizen B tries to update Citizen A's member
    // -------------------------------------------------------------
    const unauthorizedUpdateMemberRes = await fetch(
      `${baseUrl}/api/households/${householdId}/members/${childId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenBToken}`,
        },
        body: JSON.stringify({ name: 'Tampered Name' }),
      }
    );

    const unauthorizedUpdateMemberPassed = unauthorizedUpdateMemberRes.status === 403;
    addResult(
      'Member Ownership Protection: Update Member Guard (403 Forbidden)',
      unauthorizedUpdateMemberPassed,
      `Status: ${unauthorizedUpdateMemberRes.status}, Citizen B blocked from updating Citizen A’s member`
    );

    // -------------------------------------------------------------
    // Test 14: Member Deletion & Demographic Recount (DELETE /members/:id)
    // Delete Kamala Sharma (the elderly member added earlier)
    // -------------------------------------------------------------
    const elderlyId = createdElderly?.id;
    const deleteMemberRes = await fetch(
      `${baseUrl}/api/households/${householdId}/members/${elderlyId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${citizenAToken}` },
      }
    );
    const deleteMemberData = await deleteMemberRes.json();

    const deleteMemberPassed =
      deleteMemberRes.status === 200 &&
      deleteMemberData.data?.population === 5 &&
      deleteMemberData.data?.elderlyCount === 1;

    addResult(
      'Member Deletion & Demographic Recount',
      deleteMemberPassed,
      `Status: ${deleteMemberRes.status}, Member deleted. Population updated to 5, Elderly count reduced to 1`
    );

    // -------------------------------------------------------------
    // Test 15: Member Ownership Protection (Delete Member)
    // Citizen B tries to delete Citizen A's member
    // -------------------------------------------------------------
    const unauthorizedDeleteMemberRes = await fetch(
      `${baseUrl}/api/households/${householdId}/members/${childId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${citizenBToken}` },
      }
    );

    const unauthorizedDeleteMemberPassed = unauthorizedDeleteMemberRes.status === 403;
    addResult(
      'Member Ownership Protection: Delete Member Guard (403 Forbidden)',
      unauthorizedDeleteMemberPassed,
      `Status: ${unauthorizedDeleteMemberRes.status}, Citizen B blocked from deleting Citizen A’s member`
    );

    // -------------------------------------------------------------
    // Test 16: Unauthenticated Request Guard (401 Unauthorized)
    // -------------------------------------------------------------
    const unauthenticatedRes = await fetch(`${baseUrl}/api/households`);
    const unauthenticatedPassed = unauthenticatedRes.status === 401;

    addResult(
      'Unauthenticated Endpoint Guard (401 Unauthorized)',
      unauthenticatedPassed,
      `Status: ${unauthenticatedRes.status}, Missing token blocked with 401 Unauthorized`
    );

    // -------------------------------------------------------------
    // Test 17: Household Cascading Deletion by Owner
    // -------------------------------------------------------------
    const deleteHhRes = await fetch(`${baseUrl}/api/households/${householdId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });

    const verifyDeletedRes = await fetch(`${baseUrl}/api/households/${householdId}`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });

    const deleteHhPassed = deleteHhRes.status === 200 && verifyDeletedRes.status === 404;
    addResult(
      'Household Deletion by Owner (Cascade Cleanup)',
      deleteHhPassed,
      `Status: ${deleteHhRes.status}, Household and members deleted. Follow-up query returned 404 Not Found`
    );
  } finally {
    if (testServer) {
      await new Promise<void>((resolve) => {
        (testServer as Server).close(() => resolve());
      });
    }
  }

  const allPassed = results.every((r) => r.passed);
  console.log(
    `\n=== STAGE 3 VERIFICATION RESULT: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'} ===`
  );

  return { allPassed, results };
}

// CLI runner if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyStage3()
    .then((result) => {
      process.exit(result.allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal Stage 3 verification error:', err);
      process.exit(1);
    });
}
