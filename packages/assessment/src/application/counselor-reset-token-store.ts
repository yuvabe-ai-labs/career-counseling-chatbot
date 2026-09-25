export type CounselorResetTokenRecord = {
  resetToken: string;
  userId: string;
  expiresAt: string;
};

export type CounselorResetTokenStore = {
  save(record: CounselorResetTokenRecord): void;
  get(resetToken: string): CounselorResetTokenRecord | null;
  delete(resetToken: string): void;
};

/** In-process — same tradeoffs as every other short-lived challenge store in this package. */
export class InMemoryCounselorResetTokenStore implements CounselorResetTokenStore {
  private readonly records = new Map<string, CounselorResetTokenRecord>();

  save(record: CounselorResetTokenRecord): void {
    this.records.set(record.resetToken, record);
  }

  get(resetToken: string): CounselorResetTokenRecord | null {
    return this.records.get(resetToken) ?? null;
  }

  delete(resetToken: string): void {
    this.records.delete(resetToken);
  }
}
