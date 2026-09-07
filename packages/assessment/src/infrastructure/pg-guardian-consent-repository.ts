import { GuardianConsentSchema, type GuardianConsent } from "@yuvanext/contracts";
import type { Pool } from "pg";
import type {
  GuardianConsentRepository,
  NewGuardianConsent,
  NewPendingSessionGuardianConsent,
  PendingSessionGuardianConsent,
} from "../application/guardian-consent-repository.js";

type GuardianConsentRow = {
  id: string;
  user_id: string | null;
  pending_session_id: string | null;
  consent_type: "guardian";
  guardian_email_hash: string;
  guardian_email_masked: string | null;
  status: "pending" | "granted" | "declined" | "expired" | "revoked";
  text_version: string;
  requested_at: Date;
  verified_at: Date | null;
  declined_at: Date | null;
  expired_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

const mapGuardianConsentRow = (row: GuardianConsentRow): GuardianConsent =>
  GuardianConsentSchema.parse({
    id: row.id,
    userId: row.user_id,
    consentType: row.consent_type,
    guardianEmailMasked: row.guardian_email_masked ?? "unknown@unknown",
    status: row.status,
    textVersion: row.text_version,
    requestedAt: row.requested_at.toISOString(),
    verifiedAt: row.verified_at?.toISOString() ?? null,
    declinedAt: row.declined_at?.toISOString() ?? null,
    expiredAt: row.expired_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  });

const mapPendingSessionGuardianConsentRow = (
  row: GuardianConsentRow,
): PendingSessionGuardianConsent => ({
  id: row.id,
  pendingSessionId: row.pending_session_id ?? "",
  consentType: row.consent_type,
  guardianEmailMasked: row.guardian_email_masked ?? "unknown@unknown",
  status: row.status,
  textVersion: row.text_version,
  requestedAt: row.requested_at.toISOString(),
  verifiedAt: row.verified_at?.toISOString() ?? null,
  declinedAt: row.declined_at?.toISOString() ?? null,
  expiredAt: row.expired_at?.toISOString() ?? null,
  revokedAt: row.revoked_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
});

export class PgGuardianConsentRepository implements GuardianConsentRepository {
  constructor(private readonly pool: Pool) {}

  async createPending(input: NewGuardianConsent): Promise<GuardianConsent> {
    const result = await this.pool.query<GuardianConsentRow>(
      `
        insert into assessment.guardian_consents (
          id,
          user_id,
          consent_type,
          guardian_email_hash,
          guardian_email_masked,
          status,
          text_version,
          requested_at,
          verified_at,
          declined_at,
          expired_at,
          revoked_at,
          provider_reference_hash,
          created_at
        )
        values ($1, $2, 'guardian', $3, $4, $5, $6, $7, null, null, null, null, $8, $7)
        returning *
      `,
      [
        input.id,
        input.userId,
        input.guardianEmailHash,
        input.guardianEmailMasked,
        input.status,
        input.textVersion,
        input.now,
        input.providerReferenceHash,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Guardian consent insert returned no row.");
    }
    return mapGuardianConsentRow(row);
  }

  async findByIdForUser(input: {
    consentId: string;
    userId: string;
  }): Promise<GuardianConsent | null> {
    const result = await this.pool.query<GuardianConsentRow>(
      `
        select *
        from assessment.guardian_consents
        where id = $1 and user_id = $2
        limit 1
      `,
      [input.consentId, input.userId],
    );

    const row = result.rows[0];
    return row ? mapGuardianConsentRow(row) : null;
  }

  async findById(consentId: string): Promise<GuardianConsent | null> {
    const result = await this.pool.query<GuardianConsentRow>(
      `
        select *
        from assessment.guardian_consents
        where id = $1
        limit 1
      `,
      [consentId],
    );

    const row = result.rows[0];
    return row ? mapGuardianConsentRow(row) : null;
  }

  async findLatestForUser(userId: string): Promise<GuardianConsent | null> {
    const result = await this.pool.query<GuardianConsentRow>(
      `
        select *
        from assessment.guardian_consents
        where user_id = $1 and consent_type = 'guardian'
        order by created_at desc
        limit 1
      `,
      [userId],
    );

    const row = result.rows[0];
    return row ? mapGuardianConsentRow(row) : null;
  }

  async hasGrantedForUser(userId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `
        select exists (
          select 1
          from assessment.guardian_consents
          where user_id = $1
            and consent_type = 'guardian'
            and status = 'granted'
        )
      `,
      [userId],
    );

    return result.rows[0]?.exists ?? false;
  }

  async grant(input: { consentId: string; userId: string; now: string }): Promise<GuardianConsent> {
    const result = await this.pool.query<GuardianConsentRow>(
      `
        update assessment.guardian_consents
        set status = 'granted', verified_at = $3
        where id = $1 and user_id = $2
        returning *
      `,
      [input.consentId, input.userId, input.now],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Guardian consent grant returned no row.");
    }
    return mapGuardianConsentRow(row);
  }

  async expire(input: {
    consentId: string;
    userId: string;
    now: string;
  }): Promise<GuardianConsent> {
    const result = await this.pool.query<GuardianConsentRow>(
      `
        update assessment.guardian_consents
        set status = 'expired', expired_at = $3
        where id = $1 and user_id = $2
        returning *
      `,
      [input.consentId, input.userId, input.now],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Guardian consent expire returned no row.");
    }
    return mapGuardianConsentRow(row);
  }

  async decline(input: {
    consentId: string;
    userId: string;
    now: string;
  }): Promise<GuardianConsent> {
    const result = await this.pool.query<GuardianConsentRow>(
      `
        update assessment.guardian_consents
        set status = 'declined', declined_at = $3
        where id = $1 and user_id = $2
        returning *
      `,
      [input.consentId, input.userId, input.now],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Guardian consent decline returned no row.");
    }
    return mapGuardianConsentRow(row);
  }

  async createPendingForSession(
    input: NewPendingSessionGuardianConsent,
  ): Promise<PendingSessionGuardianConsent> {
    const result = await this.pool.query<GuardianConsentRow>(
      `
        insert into assessment.guardian_consents (
          id,
          pending_session_id,
          consent_type,
          guardian_email_hash,
          guardian_email_masked,
          status,
          text_version,
          requested_at,
          verified_at,
          declined_at,
          expired_at,
          revoked_at,
          provider_reference_hash,
          created_at
        )
        values ($1, $2, 'guardian', $3, $4, $5, $6, $7, null, null, null, null, $8, $7)
        returning *
      `,
      [
        input.id,
        input.pendingSessionId,
        input.guardianEmailHash,
        input.guardianEmailMasked,
        input.status,
        input.textVersion,
        input.now,
        input.providerReferenceHash,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Guardian consent insert returned no row.");
    }
    return mapPendingSessionGuardianConsentRow(row);
  }

  async findByIdForSession(input: {
    consentId: string;
    pendingSessionId: string;
  }): Promise<PendingSessionGuardianConsent | null> {
    const result = await this.pool.query<GuardianConsentRow>(
      `
        select *
        from assessment.guardian_consents
        where id = $1 and pending_session_id = $2
        limit 1
      `,
      [input.consentId, input.pendingSessionId],
    );

    const row = result.rows[0];
    return row ? mapPendingSessionGuardianConsentRow(row) : null;
  }

  async grantForSession(input: {
    consentId: string;
    pendingSessionId: string;
    now: string;
  }): Promise<PendingSessionGuardianConsent> {
    const result = await this.pool.query<GuardianConsentRow>(
      `
        update assessment.guardian_consents
        set status = 'granted', verified_at = $3
        where id = $1 and pending_session_id = $2
        returning *
      `,
      [input.consentId, input.pendingSessionId, input.now],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Guardian consent grant (pending session) returned no row.");
    }
    return mapPendingSessionGuardianConsentRow(row);
  }

  async expireForSession(input: {
    consentId: string;
    pendingSessionId: string;
    now: string;
  }): Promise<PendingSessionGuardianConsent> {
    const result = await this.pool.query<GuardianConsentRow>(
      `
        update assessment.guardian_consents
        set status = 'expired', expired_at = $3
        where id = $1 and pending_session_id = $2
        returning *
      `,
      [input.consentId, input.pendingSessionId, input.now],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Guardian consent expire (pending session) returned no row.");
    }
    return mapPendingSessionGuardianConsentRow(row);
  }

  async findGrantedForPendingSession(
    pendingSessionId: string,
  ): Promise<{ consentId: string; guardianEmailHash: string } | null> {
    const result = await this.pool.query<{ id: string; guardian_email_hash: string }>(
      `
        select id, guardian_email_hash
        from assessment.guardian_consents
        where pending_session_id = $1 and status = 'granted'
        order by created_at desc
        limit 1
      `,
      [pendingSessionId],
    );

    const row = result.rows[0];
    return row ? { consentId: row.id, guardianEmailHash: row.guardian_email_hash } : null;
  }

  async attachToUser(input: {
    consentId: string;
    userId: string;
    now: string;
  }): Promise<GuardianConsent> {
    const result = await this.pool.query<GuardianConsentRow>(
      `
        update assessment.guardian_consents
        set user_id = $2, pending_session_id = null
        where id = $1 and status = 'granted'
        returning *
      `,
      [input.consentId, input.userId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Guardian consent attach-to-user returned no row.");
    }
    return mapGuardianConsentRow(row);
  }
}
