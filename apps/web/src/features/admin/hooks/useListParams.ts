import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { VerificationStatusSchema, type VerificationStatus } from "@yuvapath/contracts";
import type { ListParams } from "../api/admin-catalog";

export const ADMIN_PAGE_SIZE = 20;

/**
 * Search / status / page live in the URL, so going into a record and pressing Back lands on the
 * same filtered page of the list instead of resetting it.
 */
export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const parsedStatus = VerificationStatusSchema.safeParse(searchParams.get("status"));
  const status: VerificationStatus | "all" = parsedStatus.success ? parsedStatus.data : "all";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const update = useCallback(
    (next: { q?: string; status?: VerificationStatus | "all"; page?: number }) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          const assign = (key: string, value: string | undefined) => {
            if (value) params.set(key, value);
            else params.delete(key);
          };
          if (next.q !== undefined) assign("q", next.q);
          if (next.status !== undefined) assign("status", next.status === "all" ? undefined : next.status);
          // Any filter change returns to page 1; an explicit page wins.
          if (next.q !== undefined || next.status !== undefined) params.delete("page");
          if (next.page !== undefined) assign("page", next.page > 1 ? String(next.page) : undefined);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const params: ListParams = {
    page,
    pageSize: ADMIN_PAGE_SIZE,
    ...(q ? { q } : {}),
    ...(status === "all" ? {} : { status }),
  };

  return { q, status, page, params, update };
}
