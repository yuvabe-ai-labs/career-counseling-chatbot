import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { AidKind } from "@yuvapath/contracts";
import {
  createAdminAidScheme,
  createAdminCollege,
  createAdminProgram,
  deleteAdminAidScheme,
  deleteAdminCollege,
  deleteAdminProgram,
  getAdminAidScheme,
  getAdminCollege,
  getAdminOverview,
  listAdminAidSchemes,
  listAdminColleges,
  listAdminDisciplines,
  publishAdminBulk,
  updateAdminAidScheme,
  updateAdminCollege,
  updateAdminProgram,
  validateAdminBulk,
  type ListParams,
} from "../api/admin-catalog";

const ROOT = ["admin"] as const;

/** Every mutation refreshes all admin queries — lists, details and dashboard counts all depend on
 *  the same few tables, and the data set per screen is small. */
function useInvalidateAdmin() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ROOT });
}

export const useAdminOverview = () =>
  useQuery({ queryKey: [...ROOT, "overview"], queryFn: getAdminOverview, retry: false });

export const useAdminColleges = (params: ListParams) =>
  useQuery({
    queryKey: [...ROOT, "colleges", params],
    queryFn: () => listAdminColleges(params),
    placeholderData: keepPreviousData,
    retry: false,
  });

export const useAdminCollege = (id: string | undefined) =>
  useQuery({
    queryKey: [...ROOT, "college", id],
    queryFn: () => getAdminCollege(id!),
    enabled: Boolean(id),
    retry: false,
  });

export const useAdminDisciplines = () =>
  useQuery({
    queryKey: [...ROOT, "disciplines"],
    queryFn: listAdminDisciplines,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

export function useCreateCollege() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ input, key }: { input: Parameters<typeof createAdminCollege>[0]; key: string }) =>
      createAdminCollege(input, key),
    onSuccess: invalidate,
  });
}

export function useUpdateCollege(id: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (patch: Parameters<typeof updateAdminCollege>[1]) => updateAdminCollege(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteCollege() {
  const invalidate = useInvalidateAdmin();
  return useMutation({ mutationFn: deleteAdminCollege, onSuccess: invalidate });
}

export function useCreateProgram(collegeId: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ input, key }: { input: Parameters<typeof createAdminProgram>[1]; key: string }) =>
      createAdminProgram(collegeId, input, key),
    onSuccess: invalidate,
  });
}

export function useUpdateProgram(collegeId: string, programId: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (patch: Parameters<typeof updateAdminProgram>[2]) =>
      updateAdminProgram(collegeId, programId, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteProgram(collegeId: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (programId: string) => deleteAdminProgram(collegeId, programId),
    onSuccess: invalidate,
  });
}

export const useAdminAidSchemes = (aidKind: AidKind, params: ListParams) =>
  useQuery({
    queryKey: [...ROOT, "aid", aidKind, params],
    queryFn: () => listAdminAidSchemes(aidKind, params),
    placeholderData: keepPreviousData,
    retry: false,
  });

export const useAdminAidScheme = (id: string | undefined) =>
  useQuery({
    queryKey: [...ROOT, "aid-scheme", id],
    queryFn: () => getAdminAidScheme(id!),
    enabled: Boolean(id),
    retry: false,
  });

export function useCreateAidScheme() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ input, key }: { input: Parameters<typeof createAdminAidScheme>[0]; key: string }) =>
      createAdminAidScheme(input, key),
    onSuccess: invalidate,
  });
}

export function useUpdateAidScheme(id: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (patch: Parameters<typeof updateAdminAidScheme>[1]) => updateAdminAidScheme(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteAidScheme() {
  const invalidate = useInvalidateAdmin();
  return useMutation({ mutationFn: deleteAdminAidScheme, onSuccess: invalidate });
}

export const useValidateBulk = () => useMutation({ mutationFn: validateAdminBulk });

export function usePublishBulk() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ request, key }: { request: Parameters<typeof publishAdminBulk>[0]; key: string }) =>
      publishAdminBulk(request, key),
    onSuccess: invalidate,
  });
}
