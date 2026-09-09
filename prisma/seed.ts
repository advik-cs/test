import {
  PrismaClient,
  Role,
  MemberCategory,
  DisasterType,
  AlertLevel,
  DisasterStatus,
  ExpectedLocationType,
  ShelterStatus,
  FacilityType,
  NotificationType,
  NotificationStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

let defaultPrisma: PrismaClient | null = null;
function getSeedPrisma(): PrismaClient {
  if (!defaultPrisma) {
    defaultPrisma = new PrismaClient();
  }
  return defaultPrisma;
}

/**
 * Stage 1 / Priority 31 Seed Script for Hackathon Prototype
 * ALL DATA IS FICTIONAL / DEMO DATA.
 * Demonstrates:
 * - 10+ Citizens with secure hashed fictional Aadhaar/national IDs & last-4 digits
 * - 2 Rescuers (with distinct login credentials)
 * - 4 Households across different locations (3 inside flood zone, 1 unaffected outside)
 * - Diverse household member categories (ADULT, CHILD, ELDERLY)
 * - 3 Shelters with dynamic occupancy states (AVAILABLE, NEAR_CAPACITY, OVER_CAPACITY)
 * - 8 Emergency Facilities (2 Hospitals, 2 Fire Stations, 2 Police Stations, 2 Checkpoints)
 * - Baseline road networks (Primary routes and Emergency evacuation corridors)
 * - 1 Flood Disaster with Red-alert Affected Zone polygon
 * - Expected location plans (HOME, SHELTER, OTHER_CITY, UNKNOWN)
 * - Audit trail (ExpectedLocationHistory) showing a 30h reconfirmation modification
 * - Evacuation alerts & reconfirmation notifications
 */
export async function seedDemoData(customClient?: PrismaClient) {
  const prisma = customClient || getSeedPrisma();
  console.log('--- Starting Disaster Management Stage 1 Demo Data Seed ---');

  // 1. Clean existing records in correct relation sequence
  console.log('Clearing existing records...');
  await prisma.notification.deleteMany();
  await prisma.expectedLocationHistory.deleteMany();
  await prisma.expectedLocation.deleteMany();
  await prisma.householdMember.deleteMany();
  await prisma.household.deleteMany();
  await prisma.location.deleteMany();
  await prisma.affectedZone.deleteMany();
  await prisma.disasterEvent.deleteMany();
  await prisma.shelter.deleteMany();
  await prisma.emergencyFacility.deleteMany();
  await prisma.road.deleteMany();
  await prisma.user.deleteMany();

  console.log('Previous records cleared.');

  // Pre-generate hashed passwords and IDs
  const citizenPasswordHash = await bcrypt.hash('Citizen@123', 10);
  const rescuerPasswordHash = await bcrypt.hash('Rescuer@123', 10);

  // Helper for fictional Aadhaar/ID hashing
  const hashIdentity = (fakeId: string) => ({
    identityNumberHash: bcrypt.hashSync(fakeId, 10),
    identityLast4: fakeId.slice(-4),
  });

  // 2. Seed Rescuers
  console.log('Seeding Rescuers...');
  const rescuer1 = await prisma.user.create({
    data: {
      name: 'Inspector Rajesh Kumar',
      mobileNumber: '+919876543101',
      passwordHash: rescuerPasswordHash,
      role: Role.RESCUER,
      ...hashIdentity('999900009901'),
    },
  });

  const rescuer2 = await prisma.user.create({
    data: {
      name: 'Commander Vikram Singh',
      mobileNumber: '+919876543102',
      passwordHash: rescuerPasswordHash,
      role: Role.RESCUER,
      ...hashIdentity('999900009902'),
    },
  });

  // 3. Seed 10 Citizens
  console.log('Seeding 10 Citizens...');
  const citizensData = [
    { name: 'Ramesh Sharma', mobile: '+919876543201', fakeId: '900000000001' },
    { name: 'Sunita Sharma', mobile: '+919876543202', fakeId: '900000000002' },
    { name: 'Priya Sharma', mobile: '+919876543203', fakeId: '900000000003' },
    { name: 'Arvind Patel', mobile: '+919876543204', fakeId: '900000000004' },
    { name: 'Meena Patel', mobile: '+919876543205', fakeId: '900000000005' },
    { name: 'Rohan Patel', mobile: '+919876543206', fakeId: '900000000006' },
    { name: 'Lakshmi Iyer', mobile: '+919876543207', fakeId: '900000000007' },
    { name: 'Suresh Iyer', mobile: '+919876543208', fakeId: '900000000008' },
    { name: 'Anand Verma', mobile: '+919876543209', fakeId: '900000000009' },
    { name: 'Kavita Verma', mobile: '+919876543210', fakeId: '900000000010' },
  ];

  const createdCitizens = [];
  for (const c of citizensData) {
    const user = await prisma.user.create({
      data: {
        name: c.name,
        mobileNumber: c.mobile,
        passwordHash: citizenPasswordHash,
        role: Role.CITIZEN,
        ...hashIdentity(c.fakeId),
      },
    });
    createdCitizens.push(user);
  }

  // 4. Seed Registered Home Locations
  console.log('Seeding Home Locations...');
  const locRiverside = await prisma.location.create({
    data: {
      buildingName: 'Riverside Enclave Apt 4B',
      address: '12 Riverbank Road, Sector 3',
      city: 'Bhubaneswar',
      state: 'Odisha',
      latitude: 20.298,
      longitude: 85.832,
    },
  });

  const locDeltaView = await prisma.location.create({
    data: {
      buildingName: 'Delta View Colony Villa 12',
      address: 'Plot 45 Delta Extension',
      city: 'Bhubaneswar',
      state: 'Odisha',
      latitude: 20.305,
      longitude: 85.825,
    },
  });

  const locGreenValley = await prisma.location.create({
    data: {
      buildingName: 'Green Valley Heights Flat 201',
      address: '88 Lowland Parkway',
      city: 'Bhubaneswar',
      state: 'Odisha',
      latitude: 20.291,
      longitude: 85.839,
    },
  });

  const locHighland = await prisma.location.create({
    data: {
      buildingName: 'Highland Ridge Residence',
      address: '7 Upper Ridge Avenue',
      city: 'Bhubaneswar',
      state: 'Odisha',
      latitude: 20.355, // Outside flood zone
      longitude: 85.875,
    },
  });

  // 5. Seed Households & Members
  console.log('Seeding Households & Diverse Family Members...');
  // Household 1 (Ramesh Sharma's Family - inside zone)
  const hh1 = await prisma.household.create({
    data: {
      householdCode: 'HH-OD-1001',
      createdByUserId: createdCitizens[0].id,
      registeredHomeLocationId: locRiverside.id,
      members: {
        create: [
          { name: 'Ramesh Sharma', age: 42, relationship: 'Self', category: MemberCategory.ADULT },
          { name: 'Sunita Sharma', age: 39, relationship: 'Spouse', category: MemberCategory.ADULT },
          { name: 'Aarav Sharma', age: 11, relationship: 'Son', category: MemberCategory.CHILD },
        ],
      },
    },
    include: { members: true },
  });

  // Household 2 (Arvind Patel's Family - inside zone with Elderly)
  const hh2 = await prisma.household.create({
    data: {
      householdCode: 'HH-OD-1002',
      createdByUserId: createdCitizens[3].id,
      registeredHomeLocationId: locDeltaView.id,
      members: {
        create: [
          { name: 'Arvind Patel', age: 46, relationship: 'Self', category: MemberCategory.ADULT },
          { name: 'Meena Patel', age: 43, relationship: 'Spouse', category: MemberCategory.ADULT },
          { name: 'Harish Patel', age: 74, relationship: 'Father', category: MemberCategory.ELDERLY },
          { name: 'Ananya Patel', age: 14, relationship: 'Daughter', category: MemberCategory.CHILD },
        ],
      },
    },
    include: { members: true },
  });

  // Household 3 (Lakshmi Iyer's Family - inside zone with two Elderly)
  const hh3 = await prisma.household.create({
    data: {
      householdCode: 'HH-OD-1003',
      createdByUserId: createdCitizens[6].id,
      registeredHomeLocationId: locGreenValley.id,
      members: {
        create: [
          { name: 'Lakshmi Iyer', age: 48, relationship: 'Self', category: MemberCategory.ADULT },
          { name: 'Venkataraman Iyer', age: 78, relationship: 'Father-in-law', category: MemberCategory.ELDERLY },
          { name: 'Kamala Iyer', age: 73, relationship: 'Mother-in-law', category: MemberCategory.ELDERLY },
        ],
      },
    },
    include: { members: true },
  });

  // Household 4 (Anand Verma's Family - UNAFFECTED Highland area)
  const hh4 = await prisma.household.create({
    data: {
      householdCode: 'HH-OD-1004',
      createdByUserId: createdCitizens[8].id,
      registeredHomeLocationId: locHighland.id,
      members: {
        create: [
          { name: 'Anand Verma', age: 38, relationship: 'Self', category: MemberCategory.ADULT },
          { name: 'Kavita Verma', age: 35, relationship: 'Spouse', category: MemberCategory.ADULT },
          { name: 'Dev Verma', age: 8, relationship: 'Son', category: MemberCategory.CHILD },
          { name: 'Diya Verma', age: 5, relationship: 'Daughter', category: MemberCategory.CHILD },
        ],
      },
    },
    include: { members: true },
  });

  // Extra independent members for testing full shelter scenarios
  const hhExtra = await prisma.household.create({
    data: {
      householdCode: 'HH-OD-1005',
      createdByUserId: createdCitizens[2].id, // Priya Sharma
      registeredHomeLocationId: locRiverside.id,
      members: {
        create: [
          { name: 'Priya Sharma', age: 24, relationship: 'Self', category: MemberCategory.ADULT },
          { name: 'Rohan Patel', age: 23, relationship: 'Cousin', category: MemberCategory.ADULT },
          { name: 'Suresh Iyer', age: 26, relationship: 'Friend', category: MemberCategory.ADULT },
          { name: 'Naveen Rao', age: 31, relationship: 'Neighbor', category: MemberCategory.ADULT },
          { name: 'Geeta Rao', age: 29, relationship: 'Neighbor', category: MemberCategory.ADULT },
          { name: 'Deepak Rao', age: 6, relationship: 'Child', category: MemberCategory.CHILD },
        ],
      },
    },
    include: { members: true },
  });

  // 6. Seed Shelters (Demonstrating Available, Near Capacity, and Over Capacity)
  console.log('Seeding Shelters with varied capacity states...');
  // Shelter 1: Capacity 10 (will have 4 arrivals -> 40% -> AVAILABLE)
  const shelter1 = await prisma.shelter.create({
    data: {
      name: 'Central Community Cyclone Shelter',
      address: 'Plot 10 Sector 5 Relief Complex',
      latitude: 20.312,
      longitude: 85.818,
      capacity: 10,
      contactNumber: '+91-674-2501001',
      status: ShelterStatus.AVAILABLE,
    },
  });

  // Shelter 2: Capacity 6 (will have 5 arrivals -> 83.3% -> NEAR_CAPACITY)
  const shelter2 = await prisma.shelter.create({
    data: {
      name: 'St. Xavier Multi-Purpose Hall',
      address: 'School Road Near Ring Road',
      latitude: 20.285,
      longitude: 85.845,
      capacity: 6,
      contactNumber: '+91-674-2502002',
      status: ShelterStatus.NEAR_CAPACITY,
    },
  });

  // Shelter 3: Capacity 4 (will have 5 arrivals -> 125% -> OVER_CAPACITY)
  const shelter3 = await prisma.shelter.create({
    data: {
      name: 'Municipal Relief Camp North',
      address: 'North Ward Community Hall',
      latitude: 20.328,
      longitude: 85.835,
      capacity: 4,
      contactNumber: '+91-674-2503003',
      status: ShelterStatus.OVER_CAPACITY,
    },
  });

  // 7. Seed Disaster Event & Affected Polygon Zone
  console.log('Seeding Disaster Event & Polygon Affected Zone...');
  const disaster = await prisma.disasterEvent.create({
    data: {
      type: DisasterType.FLOOD,
      title: 'Mahanadi River Surge & Lowland Inundation 2026',
      description:
        'Continuous torrential rainfall in upper catchment has triggered rapid river swell. Lowland delta sectors are placed under mandatory evacuation protocol.',
      alertLevel: AlertLevel.ORANGE,
      predictedStartTime: new Date(Date.now() + 18 * 60 * 60 * 1000), // +18 hours
      predictedEndTime: new Date(Date.now() + 72 * 60 * 60 * 1000), // +72 hours
      status: DisasterStatus.PREDICTED,
      createdByUserId: rescuer1.id,
      affectedZones: {
        create: [
          {
            name: 'Delta Sector Alpha Flood Basin',
            alertLevel: AlertLevel.RED,
            // GeoJSON Polygon enclosing Riverside (20.298, 85.832), Delta View (20.305, 85.825), Green Valley (20.291, 85.839)
            // But NOT Highland Ridge (20.355, 85.875)
            boundaryJson: JSON.stringify({
              type: 'Polygon',
              coordinates: [
                [
                  [85.81, 20.28],
                  [85.855, 20.28],
                  [85.855, 20.33],
                  [85.81, 20.33],
                  [85.81, 20.28],
                ],
              ],
            }),
          },
        ],
      },
    },
  });

  // 8. Seed Expected Locations (Demonstrating HOME, SHELTER, OTHER_CITY, UNKNOWN)
  console.log('Seeding Expected Locations...');
  const allMembers = [
    ...hh1.members,
    ...hh2.members,
    ...hh3.members,
    ...hh4.members,
    ...hhExtra.members,
  ];

  // Helper for expected location
  const createExpLoc = async (
    memberId: string,
    type: ExpectedLocationType,
    shelterId?: string,
    otherCity?: string
  ) => {
    return prisma.expectedLocation.create({
      data: {
        disasterEventId: disaster.id,
        householdMemberId: memberId,
        expectedLocationType: type,
        shelterId: shelterId || null,
        otherCity: otherCity || null,
      },
    });
  };

  // HH1: Ramesh (HOME), Sunita (HOME), Aarav (SHELTER 1)
  await createExpLoc(hh1.members[0].id, ExpectedLocationType.HOME);
  await createExpLoc(hh1.members[1].id, ExpectedLocationType.HOME);
  await createExpLoc(hh1.members[2].id, ExpectedLocationType.SHELTER, shelter1.id);

  // HH2: Arvind (SHELTER 1), Meena (SHELTER 1), Harish (SHELTER 1), Ananya (SHELTER 2)
  // Total to Shelter 1: Aarav (1) + Arvind (1) + Meena (1) + Harish (1) = 4 arrivals (Capacity 10 -> AVAILABLE)
  await createExpLoc(hh2.members[0].id, ExpectedLocationType.SHELTER, shelter1.id);
  await createExpLoc(hh2.members[1].id, ExpectedLocationType.SHELTER, shelter1.id);
  const harishExpLoc = await createExpLoc(hh2.members[2].id, ExpectedLocationType.SHELTER, shelter1.id);
  await createExpLoc(hh2.members[3].id, ExpectedLocationType.SHELTER, shelter2.id);

  // ExpectedLocationHistory demonstration: Harish initially thought HOME, then 30h reconfirmation to Shelter 1
  await prisma.expectedLocationHistory.create({
    data: {
      expectedLocationId: harishExpLoc.id,
      previousType: ExpectedLocationType.HOME,
      newType: ExpectedLocationType.SHELTER,
      shelterId: shelter1.id,
      reason: '30h reconfirmation: Elderly family member evacuated to cyclone shelter due to red alert.',
      changedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  });

  // HH3: Lakshmi (SHELTER 2), Venkataraman (SHELTER 2), Kamala (SHELTER 2)
  // Plus Ananya from HH2 (1) + Lakshmi (1) + Venkataraman (1) + Kamala (1) = 4 to Shelter 2
  await createExpLoc(hh3.members[0].id, ExpectedLocationType.SHELTER, shelter2.id);
  await createExpLoc(hh3.members[1].id, ExpectedLocationType.SHELTER, shelter2.id);
  await createExpLoc(hh3.members[2].id, ExpectedLocationType.SHELTER, shelter2.id);

  // HH4 (Highland): Anand (HOME), Kavita (HOME), Dev (OTHER_CITY -> Cuttack), Diya (UNKNOWN)
  await createExpLoc(hh4.members[0].id, ExpectedLocationType.HOME);
  await createExpLoc(hh4.members[1].id, ExpectedLocationType.HOME);
  await createExpLoc(hh4.members[2].id, ExpectedLocationType.OTHER_CITY, undefined, 'Cuttack Relative Home');
  await createExpLoc(hh4.members[3].id, ExpectedLocationType.UNKNOWN);

  // HHExtra:
  // Priya -> SHELTER 2 (Shelter 2 now has 5 arrivals, Capacity 6 -> 83% NEAR_CAPACITY)
  await createExpLoc(hhExtra.members[0].id, ExpectedLocationType.SHELTER, shelter2.id);

  // Rohan, Suresh, Naveen, Geeta, Deepak -> SHELTER 3 (5 arrivals, Capacity 4 -> 125% OVER_CAPACITY!)
  await createExpLoc(hhExtra.members[1].id, ExpectedLocationType.SHELTER, shelter3.id);
  await createExpLoc(hhExtra.members[2].id, ExpectedLocationType.SHELTER, shelter3.id);
  await createExpLoc(hhExtra.members[3].id, ExpectedLocationType.SHELTER, shelter3.id);
  await createExpLoc(hhExtra.members[4].id, ExpectedLocationType.SHELTER, shelter3.id);
  await createExpLoc(hhExtra.members[5].id, ExpectedLocationType.SHELTER, shelter3.id);

  // 9. Seed 8 Emergency Facilities (2 Hospitals, 2 Fire Stations, 2 Police Stations, 2 Checkpoints)
  console.log('Seeding 8 Emergency Facilities...');
  await prisma.emergencyFacility.createMany({
    data: [
      // 2 Hospitals
      {
        name: 'Capital Emergency General Hospital',
        type: FacilityType.HOSPITAL,
        address: 'Plot 120 Janpath Road, Unit 3',
        latitude: 20.301,
        longitude: 85.829,
        contactNumber: '+91-674-2401111',
      },
      {
        name: 'Apollo Trauma Care Center',
        type: FacilityType.HOSPITAL,
        address: 'Sainik School Road, Mancheswar',
        latitude: 20.315,
        longitude: 85.851,
        contactNumber: '+91-674-2402222',
      },
      // 2 Fire Stations
      {
        name: 'Mahanadi Central Fire Station',
        type: FacilityType.FIRE_STATION,
        address: 'Sector 4 Fire Brigade Complex',
        latitude: 20.294,
        longitude: 85.831,
        contactNumber: '+91-674-2403333',
      },
      {
        name: 'Industrial Area Fire & Rescue Post',
        type: FacilityType.FIRE_STATION,
        address: 'Mancheswar Industrial Estate Phase II',
        latitude: 20.32,
        longitude: 85.812,
        contactNumber: '+91-674-2404444',
      },
      // 2 Police Stations
      {
        name: 'Delta Sector Police Station',
        type: FacilityType.POLICE_STATION,
        address: 'Old River Bridge Outpost',
        latitude: 20.299,
        longitude: 85.836,
        contactNumber: '+91-674-2405555',
      },
      {
        name: 'North Suburb Police Station',
        type: FacilityType.POLICE_STATION,
        address: 'Chandrasekharpur Security Hub',
        latitude: 20.34,
        longitude: 85.86,
        contactNumber: '+91-674-2406666',
      },
      // 2 Checkpoints
      {
        name: 'River Bridge Evacuation Checkpoint CP-1',
        type: FacilityType.CHECKPOINT,
        address: 'Mahanadi South Embankment Gate',
        latitude: 20.29,
        longitude: 85.826,
        contactNumber: '+91-674-2407777',
      },
      {
        name: 'Highland Arterial Relief Checkpoint CP-2',
        type: FacilityType.CHECKPOINT,
        address: 'NH-16 Junction North Check',
        latitude: 20.345,
        longitude: 85.87,
        contactNumber: '+91-674-2408888',
      },
    ],
  });

  // 10. Seed Road Polylines
  console.log('Seeding Road Networks...');
  await prisma.road.createMany({
    data: [
      {
        name: 'Mahanadi Embankment Relief Corridor',
        roadType: 'PRIMARY',
        coordinatesJson: JSON.stringify([
          [20.285, 85.815],
          [20.295, 85.828],
          [20.305, 85.84],
          [20.32, 85.855],
        ]),
      },
      {
        name: 'Highland Highway Evacuation Arterial',
        roadType: 'EMERGENCY_ROUTE',
        coordinatesJson: JSON.stringify([
          [20.29, 85.84],
          [20.31, 85.85],
          [20.335, 85.865],
          [20.36, 85.88],
        ]),
      },
    ],
  });

  // 11. Seed Notifications
  console.log('Seeding In-App Notifications...');
  await prisma.notification.createMany({
    data: [
      {
        userId: createdCitizens[0].id,
        disasterEventId: disaster.id,
        type: NotificationType.DISASTER_ALERT,
        message:
          'ORANGE ALERT: Mahanadi river surge predicted in 18 hours. Lowland delta sectors are in evacuation zone. Please register expected locations for all household members.',
        status: NotificationStatus.UNREAD,
      },
      {
        userId: createdCitizens[3].id,
        disasterEventId: disaster.id,
        type: NotificationType.RECONFIRMATION,
        message:
          '30-Hour Reconfirmation: Please reconfirm or update the expected location of your household members before the surge.',
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
      {
        userId: createdCitizens[6].id,
        disasterEventId: disaster.id,
        type: NotificationType.SHELTER_UPDATE,
        message:
          'Shelter Update: Central Community Cyclone Shelter is AVAILABLE (40% capacity). Safe access via Embankment Relief Corridor.',
        status: NotificationStatus.UNREAD,
      },
    ],
  });

  console.log('--- Stage 1 Demo Data Seed Completed Successfully ---');
}

// Execute only when invoked directly via CLI (e.g. `npx tsx prisma/seed.ts` or `npm run seed`)
if (
  process.argv[1]?.endsWith('seed.ts') ||
  process.argv[1]?.includes('prisma/seed') ||
  process.argv[1]?.endsWith('seed.js')
) {
  const cliPrisma = new PrismaClient();
  cliPrisma
    .$connect()
    .then(() => seedDemoData(cliPrisma))
    .catch((err) => {
      console.error('Seed execution error:', err);
      process.exit(1);
    })
    .finally(() => cliPrisma.$disconnect());
}
