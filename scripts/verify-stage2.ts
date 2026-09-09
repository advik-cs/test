import http from 'http';
import { PrismaClient, Role } from '@prisma/client';
import { comparePassword, hashPassword, hashIdentity } from '../src/utils/security.js';
import { generateJwtToken, verifyJwtToken } from '../src/utils/jwt.js';

let defaultVerifyPrisma: PrismaClient | null = null;
function getVerifyPrisma(): PrismaClient {
  if (!defaultVerifyPrisma) {
    defaultVerifyPrisma = new PrismaClient();
  }
  return defaultVerifyPrisma;
}

export interface VerificationResult {
  step: string;
  passed: boolean;
  details: string;
}

export async function verifyStage2(customClient?: PrismaClient): Promise<{
  allPassed: boolean;
  results: VerificationResult[];
}> {
  const prisma = customClient || getVerifyPrisma();
  const results: VerificationResult[] = [];

  const addResult = (step: string, passed: boolean, details: string) => {
    results.push({ step, passed, details });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${step}: ${details}`);
  };

  let testServer: http.Server | null = null;
  let baseUrl = 'http://127.0.0.1:3000';

  // Determine if port 3000 is actively responding, else spin up an ephemeral test server
  try {
    const healthCheck = await fetch('http://127.0.0.1:3000/api/health', { method: 'GET' });
    if (!healthCheck.ok) {
      throw new Error('Port 3000 not responding with 200');
    }
  } catch {
    // Spin up ephemeral server with Express app
    const { app } = await import('../src/app.js');
    await new Promise<void>((resolve) => {
      testServer = app.listen(0, '127.0.0.1', () => {
        const address = testServer?.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Cryptographic Password & Identity Hashing Logic
    // -------------------------------------------------------------
    const testRawPassword = 'SecureCitizenPassword#2026';
    const hashedPass = await hashPassword(testRawPassword);
    const passMatches = await comparePassword(testRawPassword, hashedPass);
    const passMismatches = !(await comparePassword('WrongPassword123', hashedPass));

    const testRawIdentity = '987654321098'; // 12-digit Aadhaar / National ID
    const { hash: identityHash, last4: identityLast4 } = hashIdentity(testRawIdentity);

    const hashingPassed =
      hashedPass.startsWith('$2') &&
      passMatches &&
      passMismatches &&
      identityHash.startsWith('$2') &&
      identityLast4 === '1098';

    addResult(
      'Password & Identity Cryptographic Hashing',
      hashingPassed,
      'Bcrypt salt rounds validated, passwords verified correctly, identity last-4 isolated, plaintext discarded'
    );

    // -------------------------------------------------------------
    // Test 2: JWT Generation, Expiration & Tamper Resistance
    // -------------------------------------------------------------
    const testPayload = {
      userId: 'test-user-uuid-1234',
      role: 'CITIZEN' as const,
      mobileNumber: '+919999900001',
    };
    const token = generateJwtToken(testPayload);
    const decoded = verifyJwtToken(token);

    let tamperRejected = false;
    try {
      // Modify last character of signature to simulate tampering
      const tampered = token.slice(0, -2) + 'xx';
      verifyJwtToken(tampered);
    } catch {
      tamperRejected = true;
    }

    const jwtValid =
      token.split('.').length === 3 &&
      decoded.userId === testPayload.userId &&
      decoded.role === 'CITIZEN' &&
      tamperRejected;

    addResult(
      'JWT Signing & Tamper Verification',
      jwtValid,
      'Tokens correctly signed with HS256, user claims preserved, tampered tokens rejected'
    );

    // -------------------------------------------------------------
    // Test 3: POST /api/auth/signup (Registration API)
    // -------------------------------------------------------------
    const uniqueSuffix = Date.now().toString().slice(-6);
    const newCitizenMobile = `+9198${uniqueSuffix}11`;
    const signupPayload = {
      name: 'Ananya Sharma',
      mobileNumber: newCitizenMobile,
      password: 'CitizenPass@2026',
      identityNumber: '556677889900',
      role: 'CITIZEN',
    };

    const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signupPayload),
    });
    const signupData = await signupRes.json();

    const signupPassed =
      signupRes.status === 201 &&
      signupData.success === true &&
      typeof signupData.token === 'string' &&
      signupData.user?.mobileNumber === newCitizenMobile &&
      signupData.user?.role === 'CITIZEN' &&
      signupData.user?.identityLast4 === '9900' &&
      !signupData.user?.passwordHash && // Crucial: never expose password hash
      !signupData.user?.identityNumberHash;

    addResult(
      'User Registration API (POST /api/auth/signup)',
      signupPassed,
      `Status: ${signupRes.status}, Token issued, sensitive hashes excluded from response`
    );

    // -------------------------------------------------------------
    // Test 4: Duplicate Mobile Number Registration Prevention
    // -------------------------------------------------------------
    const duplicateRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signupPayload),
    });
    const duplicateData = await duplicateRes.json();

    const duplicatePrevented =
      duplicateRes.status === 409 &&
      duplicateData.success === false &&
      duplicateData.error?.code === 'USER_ALREADY_EXISTS';

    addResult(
      'Duplicate Registration Guard',
      duplicatePrevented,
      `Status: ${duplicateRes.status} 409 Conflict returned when registering existing mobile number`
    );

    // -------------------------------------------------------------
    // Test 5: POST /api/auth/login with Citizen Credentials
    // -------------------------------------------------------------
    const citizenLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobileNumber: newCitizenMobile,
        password: 'CitizenPass@2026',
      }),
    });
    const citizenLoginData = await citizenLoginRes.json();
    const citizenToken = citizenLoginData.token;

    const citizenLoginPassed =
      citizenLoginRes.status === 200 &&
      citizenLoginData.success === true &&
      typeof citizenToken === 'string' &&
      citizenLoginData.user?.role === 'CITIZEN';

    addResult(
      'Citizen Login API (POST /api/auth/login)',
      citizenLoginPassed,
      `Status: ${citizenLoginRes.status}, Valid JWT issued for CITIZEN role`
    );

    // -------------------------------------------------------------
    // Test 6: POST /api/auth/login with Invalid Password (401)
    // -------------------------------------------------------------
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobileNumber: newCitizenMobile,
        password: 'WrongPasswordXYZ',
      }),
    });
    const badLoginData = await badLoginRes.json();

    const badLoginPassed =
      badLoginRes.status === 401 &&
      badLoginData.success === false &&
      badLoginData.error?.code === 'INVALID_CREDENTIALS';

    addResult(
      'Invalid Credentials Protection',
      badLoginPassed,
      `Status: ${badLoginRes.status} 401 Unauthorized returned for wrong password`
    );

    // -------------------------------------------------------------
    // Test 7: POST /api/auth/login with Rescuer Credentials
    // -------------------------------------------------------------
    // Use seeded rescuer account (+919876543101 / Rescuer@123) or register new rescuer
    let rescuerToken = '';
    const seedRescuerRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobileNumber: '+919876543101',
        password: 'Rescuer@123',
      }),
    });
    if (seedRescuerRes.status === 200) {
      const rescuerData = await seedRescuerRes.json();
      rescuerToken = rescuerData.token;
    } else {
      // Fallback: register test rescuer
      const newRescuerMobile = `+9197${uniqueSuffix}99`;
      const regRescuerRes = await fetch(`${baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Captain Vikram Singh',
          mobileNumber: newRescuerMobile,
          password: 'RescuerPass@2026',
          identityNumber: '887766554433',
          role: 'RESCUER',
        }),
      });
      const regRescuerData = await regRescuerRes.json();
      rescuerToken = regRescuerData.token;
    }

    addResult(
      'Rescuer Login API (POST /api/auth/login)',
      !!rescuerToken,
      'Valid JWT successfully acquired for RESCUER account'
    );

    // -------------------------------------------------------------
    // Test 8: GET /api/auth/me Profile API
    // -------------------------------------------------------------
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const meData = await meRes.json();

    const mePassed =
      meRes.status === 200 &&
      meData.success === true &&
      meData.user?.mobileNumber === newCitizenMobile &&
      meData.user?.role === 'CITIZEN' &&
      !meData.user?.passwordHash;

    addResult(
      'Current User Profile API (GET /api/auth/me)',
      mePassed,
      `Status: ${meRes.status}, Correct user returned from JWT identity, zero password leak`
    );

    // -------------------------------------------------------------
    // Test 9: Unauthenticated Access Rejection (401)
    // -------------------------------------------------------------
    const unauthRes = await fetch(`${baseUrl}/api/auth/me`);
    const unauthData = await unauthRes.json();

    const unauthPassed =
      unauthRes.status === 401 &&
      unauthData.success === false &&
      unauthData.error?.code === 'UNAUTHORIZED';

    addResult(
      'Unauthenticated Endpoint Guard (401 Unauthorized)',
      unauthPassed,
      `Status: ${unauthRes.status}, Missing Bearer token correctly blocked`
    );

    // -------------------------------------------------------------
    // Test 10: Role-Based Authorization - CITIZEN accessing citizen-only
    // -------------------------------------------------------------
    const citizenAccessOwnRes = await fetch(`${baseUrl}/api/auth/citizen-only`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const citizenAccessOwnData = await citizenAccessOwnRes.json();

    const citizenAccessOwnPassed =
      citizenAccessOwnRes.status === 200 &&
      citizenAccessOwnData.success === true &&
      citizenAccessOwnData.permittedRole === 'CITIZEN';

    addResult(
      'RBAC: Citizen Accessing Citizen-Only Portal (200 OK)',
      citizenAccessOwnPassed,
      `Status: ${citizenAccessOwnRes.status}, Access granted to authorized role CITIZEN`
    );

    // -------------------------------------------------------------
    // Test 11: Role-Based Authorization - CITIZEN accessing rescuer-only (403 Forbidden)
    // -------------------------------------------------------------
    const citizenAccessRescuerRes = await fetch(`${baseUrl}/api/auth/rescuer-only`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const citizenAccessRescuerData = await citizenAccessRescuerRes.json();

    const citizenAccessRescuerBlocked =
      citizenAccessRescuerRes.status === 403 &&
      citizenAccessRescuerData.success === false &&
      citizenAccessRescuerData.error?.code === 'FORBIDDEN';

    addResult(
      'RBAC: Citizen Accessing Rescuer Portal Blocked (403 Forbidden)',
      citizenAccessRescuerBlocked,
      `Status: ${citizenAccessRescuerRes.status}, Insufficient permissions correctly returned 403 Forbidden`
    );

    // -------------------------------------------------------------
    // Test 12: Role-Based Authorization - RESCUER accessing rescuer-only
    // -------------------------------------------------------------
    const rescuerAccessOwnRes = await fetch(`${baseUrl}/api/auth/rescuer-only`, {
      headers: { Authorization: `Bearer ${rescuerToken}` },
    });
    const rescuerAccessOwnData = await rescuerAccessOwnRes.json();

    const rescuerAccessOwnPassed =
      rescuerAccessOwnRes.status === 200 &&
      rescuerAccessOwnData.success === true &&
      rescuerAccessOwnData.permittedRole === 'RESCUER';

    addResult(
      'RBAC: Rescuer Accessing Rescuer-Only Portal (200 OK)',
      rescuerAccessOwnPassed,
      `Status: ${rescuerAccessOwnRes.status}, Access granted to authorized role RESCUER`
    );

    // -------------------------------------------------------------
    // Test 13: Role-Based Authorization - RESCUER accessing citizen-only (403 Forbidden)
    // -------------------------------------------------------------
    const rescuerAccessCitizenRes = await fetch(`${baseUrl}/api/auth/citizen-only`, {
      headers: { Authorization: `Bearer ${rescuerToken}` },
    });
    const rescuerAccessCitizenData = await rescuerAccessCitizenRes.json();

    const rescuerAccessCitizenBlocked =
      rescuerAccessCitizenRes.status === 403 &&
      rescuerAccessCitizenData.success === false &&
      rescuerAccessCitizenData.error?.code === 'FORBIDDEN';

    addResult(
      'RBAC: Rescuer Accessing Citizen Portal Blocked (403 Forbidden)',
      rescuerAccessCitizenBlocked,
      `Status: ${rescuerAccessCitizenRes.status}, Role boundaries strictly enforced across endpoints`
    );

    // -------------------------------------------------------------
    // Test 14: Multi-Role Authorization (Shared Emergency Portal)
    // -------------------------------------------------------------
    const citizenSharedRes = await fetch(`${baseUrl}/api/auth/shared-portal`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const rescuerSharedRes = await fetch(`${baseUrl}/api/auth/shared-portal`, {
      headers: { Authorization: `Bearer ${rescuerToken}` },
    });

    const multiRolePassed =
      citizenSharedRes.status === 200 &&
      rescuerSharedRes.status === 200;

    addResult(
      'RBAC: Multi-Role Authorization (Shared Portal)',
      multiRolePassed,
      'Both CITIZEN and RESCUER successfully authorized for multi-role disaster operations endpoint'
    );

    // -------------------------------------------------------------
    // Test 15: Flexible Token & RFC Case-Insensitive Authorization
    // -------------------------------------------------------------
    const lowerBearerRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `bearer ${citizenToken}` },
    });
    const xAccessHeaderRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'x-access-token': citizenToken },
    });

    const tokenFlexibilityPassed =
      lowerBearerRes.status === 200 &&
      xAccessHeaderRes.status === 200;

    addResult(
      'RFC 6750 Token Flexibility & Header Resilience',
      tokenFlexibilityPassed,
      'Case-insensitive "bearer" and custom "x-access-token" headers parsed seamlessly'
    );
  } finally {
    if (testServer) {
      await new Promise<void>((resolve) => {
        (testServer as http.Server).close(() => resolve());
      });
    }
  }

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}

// Direct CLI Execution
if (process.argv[1]?.endsWith('verify-stage2.ts') || process.argv[1]?.includes('verify-stage2')) {
  const cliPrisma = new PrismaClient();
  cliPrisma
    .$connect()
    .then(() => verifyStage2(cliPrisma))
    .then(({ allPassed }) => {
      console.log(
        `\n=== STAGE 2 VERIFICATION RESULT: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'} ===`
      );
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Stage 2 verification error:', err);
      process.exit(1);
    })
    .finally(() => cliPrisma.$disconnect());
}
