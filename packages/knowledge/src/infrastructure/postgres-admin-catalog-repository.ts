import { randomUUID } from "node:crypto";
import {
  AdminAidSchemeInputSchema,
  AdminAidSchemeSchema,
  AdminCollegeInputSchema,
  AdminCollegeSchema,
  AdminProgramSchema,
  type AdminAidListQuery,
  type AdminAidListResponse,
  type AdminAidScheme,
  type AdminAidSchemeInput,
  type AdminAidSchemePatch,
  type AdminBulkPublishResponse,
  type AdminBulkRequest,
  type AdminBulkValidateResponse,
  type AdminCollege,
  type AdminCollegeDetail,
  type AdminCollegeInput,
  type AdminCollegeListResponse,
  type AdminCollegePatch,
  type AdminDiscipline,
  type AdminListQuery,
  type AdminOverviewResponse,
  type AdminProgram,
  type AdminProgramInput,
  type AdminProgramPatch,
} from "@yuvapath/contracts";
import { withTransaction, type createDatabasePool } from "@yuvapath/database";
import {
  AdminCatalogError,
  type AdminCatalogRepository,
  type AdminScope,
} from "../domain/admin-catalog.js";

type DatabasePool = ReturnType<typeof createDatabasePool>;

type Row = Record<string, unknown>;

/** The slice of pg's Pool/PoolClient this repository uses. */
type Queryable = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
};

const iso = (value: unknown): string | null =>
  value instanceof Date ? value.toISOString() : typeof value === "string" ? value : null;

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

const COLLEGE_SELECT = `
  c.id::text as id, c.name, c.city, c.state, c.institution_type, c.tier,
  c.admission_route, c.fees_band, c.website_url, c.verification_status, c.last_verified_at,
  (select count(*) from knowledge.college_programs p where p.college_id = c.id)::int as program_count`;

const PROGRAM_SELECT = `
  p.id::text as id, p.college_id::text as college_id, p.discipline_id::text as discipline_id,
  d.title as discipline_title, p.program_name, p.qualification_level, p.duration_band,
  p.admission_route, p.fees_band, p.verification_status, p.last_verified_at`;

const AID_SELECT = `
  a.id::text as id, a.aid_code, a.name, a.aid_kind, a.provider_type, a.provider, a.level,
  coalesce(a.states, array[]::text[]) as states, a.eligibility_summary, a.benefit_summary,
  a.amount_text, a.application_url, a.portal_name, a.verification_status, a.last_verified_at`;

const mapCollege = (row: Row): AdminCollege =>
  AdminCollegeSchema.parse({
    id: row.id,
    name: row.name,
    city: row.city,
    state: row.state,
    institutionType: row.institution_type,
    tier: row.tier === null || row.tier === undefined ? null : Number(row.tier),
    admissionRoute: text(row.admission_route),
    feesBand: text(row.fees_band),
    websiteUrl: text(row.website_url),
    verificationStatus: row.verification_status,
    lastVerifiedAt: iso(row.last_verified_at),
    programCount: Number(row.program_count ?? 0),
  });

const mapProgram = (row: Row): AdminProgram =>
  AdminProgramSchema.parse({
    id: row.id,
    collegeId: row.college_id,
    disciplineId: row.discipline_id,
    disciplineTitle: row.discipline_title,
    programName: row.program_name,
    qualificationLevel: row.qualification_level,
    durationBand: text(row.duration_band),
    admissionRoute: text(row.admission_route),
    feesBand: text(row.fees_band),
    verificationStatus: row.verification_status,
    lastVerifiedAt: iso(row.last_verified_at),
  });

const mapAid = (row: Row): AdminAidScheme =>
  AdminAidSchemeSchema.parse({
    id: row.id,
    aidCode: row.aid_code,
    name: row.name,
    aidKind: row.aid_kind,
    providerType: text(row.provider_type),
    provider: row.provider,
    level: row.level,
    states: row.states,
    eligibilitySummary: text(row.eligibility_summary),
    benefitSummary: text(row.benefit_summary),
    amountText: text(row.amount_text),
    applicationUrl: row.application_url,
    portalName: text(row.portal_name),
    verificationStatus: row.verification_status,
    lastVerifiedAt: iso(row.last_verified_at),
  });

const COLLEGE_COLUMNS: Record<keyof AdminCollegeInput, string> = {
  name: "name",
  city: "city",
  state: "state",
  institutionType: "institution_type",
  tier: "tier",
  admissionRoute: "admission_route",
  feesBand: "fees_band",
  websiteUrl: "website_url",
  verificationStatus: "verification_status",
};

const PROGRAM_COLUMNS: Record<keyof AdminProgramInput, string> = {
  disciplineId: "discipline_id",
  programName: "program_name",
  qualificationLevel: "qualification_level",
  durationBand: "duration_band",
  admissionRoute: "admission_route",
  feesBand: "fees_band",
  verificationStatus: "verification_status",
};

const AID_COLUMNS: Record<keyof AdminAidSchemeInput, string> = {
  name: "name",
  aidKind: "aid_kind",
  providerType: "provider_type",
  provider: "provider",
  level: "level",
  states: "states",
  eligibilitySummary: "eligibility_summary",
  benefitSummary: "benefit_summary",
  amountText: "amount_text",
  applicationUrl: "application_url",
  portalName: "portal_name",
  verificationStatus: "verification_status",
};

const sameState = (left: string, right: string): boolean =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

const aidCodeFor = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `admin-${slug || "scheme"}-${randomUUID().slice(0, 8)}`;
};

/** SQL "set" fragments + values for a partial update, skipping undefined keys. */
const buildSet = <T extends object>(
  patch: T,
  columns: Record<string, string>,
  startIndex: number,
): { sets: string[]; values: unknown[] } => {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(columns)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${column} = $${startIndex + values.length - 1}`);
  }
  return { sets, values };
};

const emptyCounts = () => ({ all: 0, verified: 0, unverified: 0, stale: 0, retired: 0 });

export class PostgresAdminCatalogRepository implements AdminCatalogRepository {
  constructor(private readonly pool: DatabasePool) {}

  private get db(): Queryable {
    return this.pool;
  }

  // ----------------------------------------------------------- shared helpers

  private async audit(
    db: Queryable,
    scope: AdminScope,
    action: string,
    targetType: string,
    targetId: string | null,
    summary: string,
  ): Promise<void> {
    const id = randomUUID();
    await db.query(
      `insert into operations.audit_events
        (id, actor_type, actor_id, action, target_type, target_id, request_correlation_id,
         safe_metadata_json, ip_hash, occurred_at)
       values ($1, 'staff', $2, $3, $4, $5, $1, $6::jsonb, null, now())`,
      [id, scope.adminId, action, targetType, targetId, JSON.stringify({ summary, state: scope.state })],
    );
  }

  /**
   * Replays the stored response when the same Idempotency-Key was already used for this admin and
   * operation; otherwise runs `run` and stores its response under the key in the same transaction.
   */
  private idempotent<T>(
    scope: AdminScope,
    key: string,
    operation: string,
    run: (db: Queryable) => Promise<T>,
  ): Promise<T> {
    return withTransaction(this.pool, async (client) => {
      const db = client as unknown as Queryable;
      const inserted = await db.query(
        `insert into operations.admin_idempotency_keys
          (idempotency_key, admin_user_id, operation, response_json)
         values ($1, $2, $3, 'null'::jsonb)
         on conflict (idempotency_key) do nothing
         returning idempotency_key`,
        [key, scope.adminId, operation],
      );
      if (inserted.rows.length === 0) {
        const existing = await db.query(
          `select admin_user_id::text as admin_user_id, operation, response_json
           from operations.admin_idempotency_keys where idempotency_key = $1`,
          [key],
        );
        const row = existing.rows[0];
        if (!row || row.admin_user_id !== scope.adminId || row.operation !== operation) {
          throw new AdminCatalogError(
            "in_use",
            "This Idempotency-Key was already used for a different request.",
            409,
          );
        }
        return row.response_json as T;
      }
      const result = await run(db);
      await db.query(
        `update operations.admin_idempotency_keys set response_json = $2::jsonb where idempotency_key = $1`,
        [key, JSON.stringify(result)],
      );
      return result;
    });
  }

  /** New rows join the dataset version most of this state's existing rows already belong to, so
   *  they are served by the same published-dataset read paths as the imported data. */
  private async datasetVersionFor(
    db: Queryable,
    table: "colleges" | "aid_schemes",
    state: string,
  ): Promise<string> {
    const stateFilter =
      table === "colleges"
        ? "lower(trim(state)) = lower(trim($1))"
        : "(cardinality(states) = 0 or exists (select 1 from unnest(states) s where lower(trim(s)) = lower(trim($1))))";
    const scoped = await db.query(
      `select dataset_version_id::text as id from knowledge.${table}
       where ${stateFilter}
       group by dataset_version_id order by count(*) desc limit 1`,
      [state],
    );
    const fallback = scoped.rows[0]
      ? scoped
      : await db.query(
          `select dataset_version_id::text as id from knowledge.${table}
           group by dataset_version_id order by count(*) desc limit 1`,
        );
    const id = fallback.rows[0]?.id;
    if (typeof id !== "string") {
      throw new AdminCatalogError(
        "no_dataset",
        "No published catalog dataset exists yet to attach new records to.",
        503,
      );
    }
    return id;
  }

  private async requireCollege(db: Queryable, scope: AdminScope, id: string): Promise<AdminCollege> {
    const result = await db.query(
      `select ${COLLEGE_SELECT} from knowledge.colleges c where c.id = $1::uuid`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new AdminCatalogError("not_found", "College not found.", 404);
    const college = mapCollege(row);
    if (!sameState(college.state, scope.state)) {
      throw new AdminCatalogError("out_of_scope", "This college is outside your region.", 403);
    }
    return college;
  }

  private async collegeDetail(db: Queryable, scope: AdminScope, id: string): Promise<AdminCollegeDetail> {
    const college = await this.requireCollege(db, scope, id);
    const programs = await db.query(
      `select ${PROGRAM_SELECT}
       from knowledge.college_programs p
       join knowledge.disciplines d on d.id = p.discipline_id
       where p.college_id = $1::uuid
       order by lower(p.program_name), p.id`,
      [id],
    );
    return { ...college, programs: programs.rows.map(mapProgram) };
  }

  private async requireAid(db: Queryable, scope: AdminScope, id: string): Promise<AdminAidScheme> {
    const result = await db.query(`select ${AID_SELECT} from knowledge.aid_schemes a where a.id = $1::uuid`, [id]);
    const row = result.rows[0];
    if (!row) throw new AdminCatalogError("not_found", "Scheme not found.", 404);
    const aid = mapAid(row);
    if (!this.visibleToRegion(aid.states, scope.state)) {
      throw new AdminCatalogError("out_of_scope", "This scheme is not listed for your region.", 403);
    }
    return aid;
  }

  private visibleToRegion(states: readonly string[], state: string): boolean {
    return states.length === 0 || states.some((candidate) => sameState(candidate, state));
  }

  private assertCollegeState(scope: AdminScope, state: string | undefined): void {
    if (state !== undefined && !sameState(state, scope.state)) {
      throw new AdminCatalogError(
        "out_of_scope",
        `Colleges can only be managed in ${scope.state}.`,
        403,
      );
    }
  }

  // ----------------------------------------------------------------- overview

  async getOverview(scope: AdminScope): Promise<AdminOverviewResponse> {
    const [colleges, programs, aid, activity] = await Promise.all([
      this.db.query(
        `select count(*)::int as total,
                count(*) filter (where verification_status = 'unverified')::int as unverified
         from knowledge.colleges where lower(trim(state)) = lower(trim($1))`,
        [scope.state],
      ),
      this.db.query(
        `select count(*)::int as total
         from knowledge.college_programs p join knowledge.colleges c on c.id = p.college_id
         where lower(trim(c.state)) = lower(trim($1))`,
        [scope.state],
      ),
      this.db.query(
        `select count(*) filter (where aid_kind = 'aid')::int as aid,
                count(*) filter (where aid_kind = 'scholarship')::int as scholarship
         from knowledge.aid_schemes
         where cardinality(states) = 0
            or exists (select 1 from unnest(states) s where lower(trim(s)) = lower(trim($1)))`,
        [scope.state],
      ),
      this.db.query(
        `select occurred_at, safe_metadata_json->>'summary' as summary
         from operations.audit_events
         where actor_type = 'staff' and action like 'admin.%'
           and safe_metadata_json->>'state' = $1
         order by occurred_at desc limit 8`,
        [scope.state],
      ),
    ]);
    return {
      state: scope.state,
      displayName: scope.displayName,
      collegeCount: Number(colleges.rows[0]?.total ?? 0),
      programCount: Number(programs.rows[0]?.total ?? 0),
      aidCount: Number(aid.rows[0]?.aid ?? 0),
      scholarshipCount: Number(aid.rows[0]?.scholarship ?? 0),
      unverifiedColleges: Number(colleges.rows[0]?.unverified ?? 0),
      recentActivity: activity.rows.map((row) => ({
        at: iso(row.occurred_at)!,
        text: text(row.summary) ?? "Updated catalog",
      })),
    };
  }

  // ----------------------------------------------------------------- colleges

  async listColleges(scope: AdminScope, query: AdminListQuery): Promise<AdminCollegeListResponse> {
    const search = query.q?.toLowerCase() ?? null;
    const base = `
      from knowledge.colleges c
      where lower(trim(c.state)) = lower(trim($1))
        and ($2::text is null
             or position($2::text in lower(c.name)) > 0
             or position($2::text in lower(c.city)) > 0)`;
    const [rows, counts] = await Promise.all([
      this.db.query(
        `select ${COLLEGE_SELECT} ${base}
           and ($3::text is null or c.verification_status = $3::text)
         order by lower(c.name), c.id
         limit $4 offset $5`,
        [scope.state, search, query.status ?? null, query.pageSize, (query.page - 1) * query.pageSize],
      ),
      this.db.query(
        `select c.verification_status as status, count(*)::int as total ${base} group by c.verification_status`,
        [scope.state, search],
      ),
    ]);
    const statusCounts = emptyCounts();
    for (const row of counts.rows) {
      const status = String(row.status) as keyof typeof statusCounts;
      if (status in statusCounts) statusCounts[status] = Number(row.total);
      statusCounts.all += Number(row.total);
    }
    return {
      data: rows.rows.map(mapCollege),
      total: query.status ? statusCounts[query.status] : statusCounts.all,
      page: query.page,
      pageSize: query.pageSize,
      statusCounts,
    };
  }

  getCollege(scope: AdminScope, id: string): Promise<AdminCollegeDetail> {
    return this.collegeDetail(this.db, scope, id);
  }

  createCollege(scope: AdminScope, input: AdminCollegeInput, idempotencyKey: string): Promise<AdminCollegeDetail> {
    this.assertCollegeState(scope, input.state);
    return this.idempotent(scope, idempotencyKey, "college.create", async (db) => {
      const id = randomUUID();
      const datasetVersionId = await this.datasetVersionFor(db, "colleges", scope.state);
      await db.query(
        `insert into knowledge.colleges
          (id, external_code, name, city, state, institution_type, tier, admission_route, fees_band,
           website_url, verification_status, last_verified_at, dataset_version_id, created_at, updated_at)
         values ($1, null, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 case when $10 = 'unverified' then null else now() end, $11, now(), now())`,
        [
          id,
          input.name,
          input.city,
          scope.state,
          input.institutionType,
          input.tier,
          input.admissionRoute,
          input.feesBand,
          input.websiteUrl,
          input.verificationStatus,
          datasetVersionId,
        ],
      );
      await this.audit(db, scope, "admin.college.create", "college", id, `Added college ${input.name}.`);
      return this.collegeDetail(db, scope, id);
    });
  }

  async updateCollege(scope: AdminScope, id: string, patch: AdminCollegePatch): Promise<AdminCollegeDetail> {
    this.assertCollegeState(scope, patch.state);
    return withTransaction(this.pool, async (client) => {
      const db = client as unknown as Queryable;
      await this.requireCollege(db, scope, id);
      const { sets, values } = buildSet(patch, COLLEGE_COLUMNS, 2);
      if (patch.verificationStatus !== undefined && patch.verificationStatus !== "unverified") {
        sets.push("last_verified_at = now()");
      }
      if (sets.length > 0) {
        await db.query(
          `update knowledge.colleges set ${sets.join(", ")}, updated_at = now() where id = $1::uuid`,
          [id, ...values],
        );
      }
      const detail = await this.collegeDetail(db, scope, id);
      await this.audit(db, scope, "admin.college.update", "college", id, `Updated college ${detail.name}.`);
      return detail;
    });
  }

  async deleteCollege(scope: AdminScope, id: string): Promise<{ removedPrograms: number }> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const db = client as unknown as Queryable;
        const college = await this.requireCollege(db, scope, id);
        const removed = await db.query(`delete from knowledge.college_programs where college_id = $1::uuid`, [id]);
        await db.query(`delete from knowledge.colleges where id = $1::uuid`, [id]);
        await this.audit(db, scope, "admin.college.delete", "college", id, `Deleted college ${college.name}.`);
        return { removedPrograms: removed.rowCount ?? 0 };
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23503") {
        throw new AdminCatalogError("in_use", "This college is referenced by other records and cannot be deleted.", 409);
      }
      throw error;
    }
  }

  // ----------------------------------------------------------------- programs

  async listDisciplines(): Promise<readonly AdminDiscipline[]> {
    const result = await this.db.query(
      `select id::text as id, title from knowledge.disciplines where status = 'active' order by lower(title)`,
    );
    return result.rows.map((row) => ({ id: String(row.id), title: String(row.title) }));
  }

  private async requireProgram(db: Queryable, collegeId: string, programId: string): Promise<AdminProgram> {
    const result = await db.query(
      `select ${PROGRAM_SELECT}
       from knowledge.college_programs p join knowledge.disciplines d on d.id = p.discipline_id
       where p.id = $1::uuid and p.college_id = $2::uuid`,
      [programId, collegeId],
    );
    const row = result.rows[0];
    if (!row) throw new AdminCatalogError("not_found", "Program not found.", 404);
    return mapProgram(row);
  }

  createProgram(
    scope: AdminScope,
    collegeId: string,
    input: AdminProgramInput,
    idempotencyKey: string,
  ): Promise<AdminProgram> {
    return this.idempotent(scope, idempotencyKey, "program.create", async (db) => {
      await this.requireCollege(db, scope, collegeId);
      const id = randomUUID();
      await db.query(
        `insert into knowledge.college_programs
          (id, college_id, discipline_id, program_name, qualification_level, duration_band,
           admission_route, fees_band, verification_status, last_verified_at, dataset_version_id)
         select $1, c.id, $3::uuid, $4, $5, $6, $7, $8, $9,
                case when $9 = 'unverified' then null else now() end, c.dataset_version_id
         from knowledge.colleges c where c.id = $2::uuid`,
        [
          id,
          collegeId,
          input.disciplineId,
          input.programName,
          input.qualificationLevel,
          input.durationBand,
          input.admissionRoute,
          input.feesBand,
          input.verificationStatus,
        ],
      );
      await this.audit(db, scope, "admin.program.create", "college_program", id, `Added program ${input.programName}.`);
      return this.requireProgram(db, collegeId, id);
    });
  }

  async updateProgram(
    scope: AdminScope,
    collegeId: string,
    programId: string,
    patch: AdminProgramPatch,
  ): Promise<AdminProgram> {
    return withTransaction(this.pool, async (client) => {
      const db = client as unknown as Queryable;
      await this.requireCollege(db, scope, collegeId);
      await this.requireProgram(db, collegeId, programId);
      const { sets, values } = buildSet(patch, PROGRAM_COLUMNS, 3);
      if (patch.verificationStatus !== undefined && patch.verificationStatus !== "unverified") {
        sets.push("last_verified_at = now()");
      }
      if (sets.length > 0) {
        await db.query(
          `update knowledge.college_programs set ${sets.join(", ")}
           where id = $1::uuid and college_id = $2::uuid`,
          [programId, collegeId, ...values],
        );
      }
      const program = await this.requireProgram(db, collegeId, programId);
      await this.audit(db, scope, "admin.program.update", "college_program", programId, `Updated program ${program.programName}.`);
      return program;
    });
  }

  async deleteProgram(scope: AdminScope, collegeId: string, programId: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const db = client as unknown as Queryable;
      await this.requireCollege(db, scope, collegeId);
      const program = await this.requireProgram(db, collegeId, programId);
      await db.query(`delete from knowledge.college_programs where id = $1::uuid and college_id = $2::uuid`, [
        programId,
        collegeId,
      ]);
      await this.audit(db, scope, "admin.program.delete", "college_program", programId, `Deleted program ${program.programName}.`);
    });
  }

  // --------------------------------------------------------------------- aid

  async listAidSchemes(scope: AdminScope, query: AdminAidListQuery): Promise<AdminAidListResponse> {
    const search = query.q?.toLowerCase() ?? null;
    const base = `
      from knowledge.aid_schemes a
      where a.aid_kind = $1
        and (cardinality(a.states) = 0
             or exists (select 1 from unnest(a.states) s where lower(trim(s)) = lower(trim($2))))
        and ($3::text is null
             or position($3::text in lower(a.name)) > 0
             or position($3::text in lower(a.provider)) > 0)`;
    const [rows, counts] = await Promise.all([
      this.db.query(
        `select ${AID_SELECT} ${base}
           and ($4::text is null or a.verification_status = $4::text)
         order by lower(a.name), a.id
         limit $5 offset $6`,
        [query.aidKind, scope.state, search, query.status ?? null, query.pageSize, (query.page - 1) * query.pageSize],
      ),
      this.db.query(
        `select a.verification_status as status, count(*)::int as total ${base} group by a.verification_status`,
        [query.aidKind, scope.state, search],
      ),
    ]);
    const statusCounts = emptyCounts();
    for (const row of counts.rows) {
      const status = String(row.status) as keyof typeof statusCounts;
      if (status in statusCounts) statusCounts[status] = Number(row.total);
      statusCounts.all += Number(row.total);
    }
    return {
      data: rows.rows.map(mapAid),
      total: query.status ? statusCounts[query.status] : statusCounts.all,
      page: query.page,
      pageSize: query.pageSize,
      statusCounts,
    };
  }

  getAidScheme(scope: AdminScope, id: string): Promise<AdminAidScheme> {
    return this.requireAid(this.db, scope, id);
  }

  createAidScheme(scope: AdminScope, input: AdminAidSchemeInput, idempotencyKey: string): Promise<AdminAidScheme> {
    return this.idempotent(scope, idempotencyKey, "aid.create", async (db) => {
      const id = randomUUID();
      const datasetVersionId = await this.datasetVersionFor(db, "aid_schemes", scope.state);
      await db.query(
        `insert into knowledge.aid_schemes
          (id, aid_code, name, aid_kind, provider_type, provider, level, states, eligibility_summary,
           benefit_summary, amount_text, application_url, portal_name, apply_window_start,
           apply_window_end, verification_status, last_verified_at, dataset_version_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12, $13, null, null, $14, now(), $15)`,
        [
          id,
          aidCodeFor(input.name),
          input.name,
          input.aidKind,
          input.providerType,
          input.provider,
          input.level,
          input.states,
          input.eligibilitySummary,
          input.benefitSummary,
          input.amountText,
          input.applicationUrl,
          input.portalName,
          input.verificationStatus,
          datasetVersionId,
        ],
      );
      await this.audit(db, scope, "admin.aid.create", "aid_scheme", id, `Added ${input.aidKind} ${input.name}.`);
      return this.requireAid(db, scope, id);
    });
  }

  async updateAidScheme(scope: AdminScope, id: string, patch: AdminAidSchemePatch): Promise<AdminAidScheme> {
    return withTransaction(this.pool, async (client) => {
      const db = client as unknown as Queryable;
      await this.requireAid(db, scope, id);
      const { sets, values } = buildSet(patch, AID_COLUMNS, 2);
      if (patch.verificationStatus !== undefined && patch.verificationStatus !== "unverified") {
        sets.push("last_verified_at = now()");
      }
      if (sets.length > 0) {
        await db.query(`update knowledge.aid_schemes set ${sets.join(", ")} where id = $1::uuid`, [id, ...values]);
      }
      // States may have just been edited away from this region — read back without the scope check.
      const result = await db.query(`select ${AID_SELECT} from knowledge.aid_schemes a where a.id = $1::uuid`, [id]);
      const aid = mapAid(result.rows[0]!);
      await this.audit(db, scope, "admin.aid.update", "aid_scheme", id, `Updated ${aid.aidKind} ${aid.name}.`);
      return aid;
    });
  }

  async deleteAidScheme(scope: AdminScope, id: string): Promise<void> {
    try {
      await withTransaction(this.pool, async (client) => {
        const db = client as unknown as Queryable;
        const aid = await this.requireAid(db, scope, id);
        await db.query(`delete from knowledge.aid_criteria where aid_scheme_id = $1::uuid`, [id]);
        await db.query(`delete from knowledge.aid_schemes where id = $1::uuid`, [id]);
        await this.audit(db, scope, "admin.aid.delete", "aid_scheme", id, `Deleted ${aid.aidKind} ${aid.name}.`);
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23503") {
        throw new AdminCatalogError("in_use", "This scheme is referenced by other records and cannot be deleted.", 409);
      }
      throw error;
    }
  }

  // -------------------------------------------------------------- bulk upload

  private parseBulkRow(
    scope: AdminScope,
    category: AdminBulkRequest["category"],
    row: Record<string, string>,
  ): { name: string; errors: string[]; college?: AdminCollegeInput; aid?: AdminAidSchemeInput } {
    const name = (row.name ?? "").trim();
    if (category === "colleges") {
      const parsed = AdminCollegeInputSchema.safeParse({
        name,
        city: row.city ?? "",
        state: scope.state,
        institutionType: row.institutionType?.trim() || "College",
        tier: row.tier?.trim() ?? "",
        admissionRoute: row.admissionRoute ?? "",
        feesBand: row.feesBand ?? "",
        websiteUrl: row.websiteUrl ?? "",
        verificationStatus: row.verificationStatus?.trim().toLowerCase() || "unverified",
      });
      return parsed.success
        ? { name, errors: [], college: parsed.data }
        : { name, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
    }
    const parsed = AdminAidSchemeInputSchema.safeParse({
      name,
      aidKind: row.aidKind?.trim().toLowerCase() || "aid",
      providerType: row.providerType ?? "",
      provider: row.provider ?? "",
      level: row.level ?? "",
      states: [scope.state],
      eligibilitySummary: row.eligibilitySummary ?? "",
      benefitSummary: row.benefitSummary ?? "",
      amountText: row.amountText ?? "",
      applicationUrl: row.applicationUrl ?? "",
      portalName: row.portalName ?? "",
      verificationStatus: row.verificationStatus?.trim().toLowerCase() || "unverified",
    });
    return parsed.success
      ? { name, errors: [], aid: parsed.data }
      : { name, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  }

  async validateBulk(scope: AdminScope, request: AdminBulkRequest): Promise<AdminBulkValidateResponse> {
    const existing =
      request.category === "colleges"
        ? await this.db.query(
            `select lower(trim(name)) as name from knowledge.colleges where lower(trim(state)) = lower(trim($1))`,
            [scope.state],
          )
        : await this.db.query(`select lower(trim(name)) as name from knowledge.aid_schemes`);
    const names = new Set(existing.rows.map((row) => String(row.name)));
    return {
      rows: request.rows.map((row, index) => {
        const parsed = this.parseBulkRow(scope, request.category, row);
        return {
          index,
          name: parsed.name,
          duplicate: names.has(parsed.name.toLowerCase()),
          errors: parsed.errors,
        };
      }),
    };
  }

  publishBulk(scope: AdminScope, request: AdminBulkRequest, idempotencyKey: string): Promise<AdminBulkPublishResponse> {
    return this.idempotent(scope, idempotencyKey, `bulk.${request.category}`, async (db) => {
      const datasetVersionId = await this.datasetVersionFor(
        db,
        request.category === "colleges" ? "colleges" : "aid_schemes",
        scope.state,
      );
      let published = 0;
      let skipped = 0;
      for (const row of request.rows) {
        const parsed = this.parseBulkRow(scope, request.category, row);
        if (parsed.errors.length > 0) {
          skipped += 1;
          continue;
        }
        const id = randomUUID();
        if (parsed.college) {
          const input = parsed.college;
          await db.query(
            `insert into knowledge.colleges
              (id, external_code, name, city, state, institution_type, tier, admission_route, fees_band,
               website_url, verification_status, last_verified_at, dataset_version_id, created_at, updated_at)
             values ($1, null, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                     case when $10 = 'unverified' then null else now() end, $11, now(), now())`,
            [
              id,
              input.name,
              input.city,
              scope.state,
              input.institutionType,
              input.tier,
              input.admissionRoute,
              input.feesBand,
              input.websiteUrl,
              input.verificationStatus,
              datasetVersionId,
            ],
          );
        } else if (parsed.aid) {
          const input = parsed.aid;
          await db.query(
            `insert into knowledge.aid_schemes
              (id, aid_code, name, aid_kind, provider_type, provider, level, states, eligibility_summary,
               benefit_summary, amount_text, application_url, portal_name, apply_window_start,
               apply_window_end, verification_status, last_verified_at, dataset_version_id)
             values ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12, $13, null, null, $14, now(), $15)`,
            [
              id,
              aidCodeFor(input.name),
              input.name,
              input.aidKind,
              input.providerType,
              input.provider,
              input.level,
              input.states,
              input.eligibilitySummary,
              input.benefitSummary,
              input.amountText,
              input.applicationUrl,
              input.portalName,
              input.verificationStatus,
              datasetVersionId,
            ],
          );
        }
        published += 1;
      }
      await this.audit(
        db,
        scope,
        "admin.bulk.publish",
        request.category === "colleges" ? "college" : "aid_scheme",
        null,
        `Bulk published ${published} ${request.category} record(s).`,
      );
      return { published, skipped };
    });
  }
}
