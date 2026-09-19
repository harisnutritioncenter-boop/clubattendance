# Implementation Plan: Junior Partner Perfect Transfer Blueprint

## Goal
Implement a robust, end-to-end data transfer sequence for Junior Partners moving between clubs. Ensure that:
1. Historical analytics (Attendance, Revenue, Trials, Memberships) remain completely locked to the Old Club Owner.
2. New records instantly and securely route to the New Club Owner.
3. The Junior Partner retains an uninterrupted combined view of their entire lifetime performance across all clubs.
4. Data remains immutable against accidental retroactive overwrites.

## User Review Required
- **Trial Ledger / Membership Ledger Introduction**: To prevent Old Club Owners from losing their historical count of trials and memberships when a customer is reassigned, we need to transition away from analyzing the "live" `CUSTOMERS` collection for historical data. 
- Are we comfortable introducing a lightweight `TRIAL_LEDGER` collection to permanently record "Trial Started" and "Trial Converted" events at the club where they occurred? (Alternatively, we can use the existing `ACTIVITY_LOGS`, but a dedicated ledger is vastly faster for querying).

## Proposed Changes

### 1. Database Tier & Immutability

#### [MODIFY] src/features/partners/services/partner.service.ts
- **Transfer History**: Add a `transferHistory` array field to the JP profile: `[{ oldClubId, newClubId, transferredAt }]`.
- **Chunked Customer Updates**: Update the customer reassignment logic (in `updatePartner`) to use Firebase batched writes in chunks of 500 to prevent crashing on large rosters.
- **Dedicated Transfer Method**: Create a new `transferPartner` method that handles the profile update, timestamp logging, and customer batch transfer in a single atomic-like sequence.

#### [MODIFY] src/features/ledger/services/ledger.service.ts
- **Server-Side Validation**: Update `logConsumption` and other write methods to fetch the user's *true* DB `clubId` as the fallback if the frontend provides a mismatched `branchId`.
- **Locking the Past**: Add an edit-guard when modifying old records. If a record's `createdAt` is older than the latest `transferredAt` in the JP's `transferHistory`, prevent the `branchId` from being updated to the JP's current club.

### 2. Analytics Fetching & Ledger Stitching

#### [MODIFY] src/features/ledger/services/ledger.service.ts
- **Update `getReportsData`**: 
  - Extend the existing "Virtual Copy" logic (currently used for `upgradedToClubOwnerAt`) to also trigger for standard lateral transfers found in `transferHistory`.
  - For each historical transfer epoch, clone the matching past shakes/payments in-memory and stamp them with the JP's new club ID *only* for the JP's personal dashboard view (`isHistoricalCopy: true`), ensuring their lifetime totals remain intact.

### 3. Analytics UI

#### [MODIFY] src/app/(dashboard)/analytics/components/trials-analytics.tsx
- Stop querying the live `CUSTOMERS` collection for past trial performance.
- Transition to querying a historical ledger (e.g., `TRIAL_LEDGER` or `ACTIVITY_LOGS` filtered by 'trial_created' and 'trial_converted') so the Old Club Owner retains visibility of the trials they successfully managed.

#### [MODIFY] src/app/(dashboard)/analytics/components/membership-analytics.tsx
- Similar to Trials, stop relying solely on the live `Customer` document for historical month counts.
- Enhance the query to count active memberships based on the `PAYMENT_LEDGER` (type = Membership) overlapping with the queried month/year, locking the metrics to the club where the membership was sold.

### 4. Frontend Failsafes

#### [MODIFY] src/components/layout/sidebar.tsx (or equivalent auth listener component)
- Add a real-time Firestore listener (or a periodic check) on the active user's document. If their `clubId` changes remotely (i.e., they were transferred by an Admin), instantly invalidate their session store (`activeBranchId`) and reload the app. This prevents the JP from accidentally stamping the Old Club's ID on brand-new shakes.

## Verification Plan
### Automated/Manual Verification
- Create a test Junior Partner in Club A.
- Assign 3 customers, mark 3 shakes, add 1 membership, and 1 trial.
- Log in as Super Admin and execute the "Transfer Partner" to Club B.
- **Verify Old Club Owner**: Ensure their Analytics still show 3 shakes, 1 membership, and 1 trial for that historical month.
- **Verify New Club Owner**: Ensure they see 0 shakes historically, but when the JP marks a new shake today, it correctly appears on Club B's dashboard.
- **Verify JP**: Ensure their personal dashboard shows 4 shakes total across both clubs, and their app auto-reloaded correctly to reflect the new `activeBranchId`.
