# Disaster Management Web Application — Backend Platform

A robust, beginner-friendly disaster preparedness and response backend built for hackathons using **Node.js, Express, TypeScript, PostgreSQL, and Prisma ORM**.

---

## 1. System Architecture

The platform provides a unified backend architecture with dual user roles and a strict lifecycle division:

```text
┌─────────────────────────────────────────────────────────────┐
│                       ROLES & LIFECYCLE                     │
├──────────────────────────────┬──────────────────────────────┤
│           CITIZEN            │     RESCUER / AUTHORITY      │
├──────────────────────────────┼──────────────────────────────┤
│  • Household Registration    │  • Disaster Creation         │
│  • Registered Home (GPS)     │  • Affected Zone Definition  │
│  • Disaster Expected Location│  • Shelter & Capacity Mgmt   │
│  • 30h Reconfirmation        │  • Emergency Facilities Mgmt │
│  • Citizen Map (5km around)  │  • Rescuer Map (All Houses)  │
│  • Household Occupancy Stats │  • Zone Occupancy Summary    │
└──────────────────────────────┴──────────────────────────────┘
```

### Phased Implementation Strategy
- **BEFORE (Current Scope)**: Pre-disaster preparedness, household composition, disaster threats, geometric zone calculation, expected locations, shelter capacities, notifications, and 5 km radius map analysis.
- **DURING (Future Scope)**: SOS dispatch, live emergency statuses, offline communication placeholders.
- **AFTER (Future Scope)**: Damage assessment, relief coordination placeholders.

---

## 2. Database / Entity-Relationship (ER) Model

```text
       ┌──────────┐
       │   User   │
       └────┬─────┘
            │ 1:N
            ▼
     ┌──────────────┐             ┌──────────────┐
     │  Household   │────────────►│   Location   │ (Registered Home)
     └──────┬───────┘ 1:1         └──────────────┘
            │ 1:N
            ▼
   ┌─────────────────┐
   │ HouseholdMember │
   └────────┬────────┘
            │ 1:N
            ▼
   ┌──────────────────┐           ┌───────────────┐
   │ ExpectedLocation │──────────►│    Shelter    │
   └────────┬─────────┘ N:1       └───────────────┘
            │ N:1
            ▼
   ┌──────────────────┐           ┌───────────────┐
   │  DisasterEvent   │──────────►│ AffectedZone  │
   └──────────────────┘ 1:N       └───────────────┘
```

---

## 3. Prisma Schema Entities

The PostgreSQL schema (`prisma/schema.prisma`) implements 11 core models:

1. **User**: Citizen or Rescuer accounts. Fictional test identity/Aadhaar numbers are hashed before storage.
2. **Location**: Registered home GPS coordinates, building name, address, city, state.
3. **Household**: Unique `householdCode`, creator user reference, registered home location link.
4. **HouseholdMember**: Individual members with categories (`ADULT`, `CHILD`, `ELDERLY`).
5. **DisasterEvent**: Hazards (`FLOOD`, `CYCLONE`, etc.) with alert levels and predicted timestamps.
6. **AffectedZone**: Geospatial polygon boundaries linking disasters to geographic areas.
7. **Shelter**: Facility details, total capacity, coordinates, and status.
8. **ExpectedLocation**: Disaster-specific member plans (`HOME`, `SHELTER`, `OTHER_CITY`, `UNKNOWN`).
9. **ExpectedLocationHistory**: Audit trail tracking location plan updates and 30h reconfirmations.
10. **EmergencyFacility**: Hospitals, fire stations, police stations, and checkpoints.
11. **Road**: Baseline polyline road geometries for map visualization.
12. **Notification**: In-app alerts for evacuation warnings and reconfirmations.

---

## 4. Project Folder Structure

```text
├── prisma/
│   ├── schema.prisma          # PostgreSQL schema definitions
│   └── seed.ts                # Demo data generator
├── src/
│   ├── config/
│   │   ├── env.ts             # Type-safe environment variables
│   │   └── db.ts              # PrismaClient singleton & health check
│   ├── controllers/           # HTTP controllers (Stages 1–4)
│   ├── middleware/
│   │   ├── errorHandler.ts    # Centralized error handler
│   │   ├── notFoundHandler.ts # 404 handler for unmatched routes
│   │   └── requestLogger.ts   # HTTP request logging middleware
│   ├── routes/
│   │   ├── health.routes.ts   # GET /api/health endpoint
│   │   └── index.ts           # Root API router
│   ├── services/              # Business logic & geospatial calculations
│   ├── types/                 # TypeScript interfaces & API contract
│   ├── utils/
│   │   └── logger.ts          # Structured logger
│   ├── validators/            # Zod input validation schemas
│   ├── app.ts                 # Express application configuration
│   └── server.ts              # HTTP listener & graceful shutdown
├── tests/                     # Test suite
├── .env.example               # Template environment configuration
├── package.json
└── README.md
```

---

## 5. API Structure Overview

### Health
- `GET /api/health` — Service health and database connection check.

### Authentication & Security (Stage 1)
- `POST /api/auth/signup` — Citizen or Rescuer signup (hashed test identity).
- `POST /api/auth/login` — Sign in and issue JWT token.
- `GET /api/auth/me` — Retrieve current authenticated session.

### Household & Location (Stage 2)
- `POST /api/households` — Register household with home GPS location.
- `GET /api/households/:id` — Get household and dynamic composition.
- `PUT /api/households/:id` — Update household data.
- `GET /api/households/:id/members` — List members.
- `POST /api/households/:id/members` — Add member (Adult / Child / Elderly).
- `PUT /api/households/:id/members/:memberId` — Update member.
- `DELETE /api/households/:id/members/:memberId` — Remove member.

### Disasters & Affected Zones (Stage 3)
- `POST /api/disasters` — Rescuer creates disaster event.
- `GET /api/disasters` — List active/predicted disasters.
- `GET /api/disasters/:id` — Get disaster details.
- `POST /api/disasters/:id/zones` — Add polygon affected zone.
- `GET /api/disasters/:id/affected-households` — Identify households inside polygon.

### Expected Locations & Occupancy (Stage 3)
- `POST /api/disasters/:id/expected-locations` — Submit member location plans.
- `GET /api/disasters/:id/expected-locations` — Retrieve plans.
- `GET /api/disasters/:id/shelter-occupancy` — Dynamic shelter occupancy calculations.
- `GET /api/disasters/:id/buildings` — Rescuer view of affected buildings.
- `GET /api/disasters/:id/zone-summary` — Rescuer aggregate zone stats.

### Map & Facilities (Stage 4)
- `GET /api/facilities` — List emergency facilities (hospitals, fire stations, etc.).
- `GET /api/map/citizen` — 5 km radius around citizen's registered house.
- `GET /api/map/rescuer` — All registered houses with 5 km nearby facilities each.

---

## 6. Authentication Design

- Passwords hashed using `bcryptjs` (salt rounds: 10).
- Test Aadhaar/identity numbers are hashed (`identityNumberHash`) with last-4 digits retained for demo validation (`identityLast4`).
- JWT tokens signed with `HS256` containing `{ userId, role, mobileNumber }`.
- Role-based middleware (`requireRole('RESCUER')`, `requireRole('CITIZEN')`) enforces authorization.
- Citizens can only access their own household (`createdByUserId === req.user.userId`).

---

## 7. Geographic / Map Design

- **Haversine Distance**: $d = 2r \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$ calculates exact distance in km.
- **Ray-Casting Algorithm**: Determines whether a house's GPS point `(lat, lng)` is within an affected zone polygon.
- **Citizen Map**: Focuses strictly on the citizen's single registered home, finding all facilities within 5 km.
- **Rescuer Map**: Iterates over **all registered houses**, attaching nearby facilities within 5 km for each house.

---

## 8. Dynamic Occupancy & Shelter Logic

- **Expected Occupancy Formula**:
  $$\text{Expected Occupancy} = \sum [\text{member.expectedLocationType} == \text{'HOME'}]$$
- **Shelter Expected Arrivals**:
  $$\text{Expected Arrivals} = \sum [\text{member.shelterId} == \text{shelter.id}]$$
- **Remaining Capacity**:
  $$\text{Remaining} = \text{Capacity} - \text{Expected Arrivals}$$
- **Dynamic Status**:
  - $< 80\%$: `AVAILABLE`
  - $80\% - < 100\%$: `NEAR_CAPACITY`
  - $100\%$: `FULL`
  - $> 100\%$: `OVER_CAPACITY`

---

## 9. Stage 0 Verification

### Prerequisites
- Node.js (v18+ or v20+)
- npm

### Installation & Run
```bash
npm install
npm run dev
```

### Health Check Endpoint
```bash
curl http://localhost:3000/api/health
```

Expected Response:
```json
{
  "status": "healthy",
  "service": "disaster-management-backend",
  "version": "1.0.0",
  "environment": "development",
  "timestamp": "2026-09-09T05:14:15.613Z",
  "uptimeSeconds": 12,
  "stage": "Stage 0 - Core Architecture & Prisma Setup",
  "database": {
    "configured": true,
    "provider": "postgresql",
    "status": "connected"
  }
}
```
