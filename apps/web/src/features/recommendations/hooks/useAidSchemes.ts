import { useQuery } from "@tanstack/react-query";
import { getAidSchemes } from "../api/aid";

export function useAidSchemes() {
  return useQuery({
    queryKey: ["aid-schemes"],
    queryFn: getAidSchemes,
    retry: false,
  });
}
