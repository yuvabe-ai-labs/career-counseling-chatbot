import type { LocationPreference } from "@yuvanext/contracts";
import { ALL_INDIAN_STATES, neighboringStatesOf } from "./state-adjacency.js";

export type GeoScope = {
  selectedState: string;
  neighboringStates: string[];
};

/**
 * Turns a student's `location_preference` intake answer + home state into the two inputs
 * `college-recommendations.ts`'s `scoreColleges()` already accepts (`selectedState`,
 * `neighboringStates`) — pure, deterministic, no Gemini/network/DB involved. This function is
 * the only piece that was missing; `resolveStateBand()` inside `college-recommendations.ts`
 * itself needed no change.
 *
 * - same_city / same_state: only the home state counts as "selected"; nothing is "neighboring"
 *   (a tighter list, not a broader one).
 * - not_sure / unanswered: home state selected, bordering states (from the static adjacency
 *   lookup) count as "neighboring".
 * - anywhere_in_india / remote: home state selected, every other Indian state/UT counts as
 *   "neighboring" — so state stops penalizing at all and ranking runs on discipline/tier/
 *   access-route instead.
 */
export function resolveGeoScope(
  locationPreference: LocationPreference | undefined,
  homeState: string,
): GeoScope {
  switch (locationPreference) {
    case "same_city":
    case "same_state":
      return { selectedState: homeState, neighboringStates: [] };

    case "anywhere_in_india":
    case "remote":
      return {
        selectedState: homeState,
        neighboringStates: ALL_INDIAN_STATES.filter((state) => state !== homeState),
      };

    case "not_sure":
    case undefined:
      return { selectedState: homeState, neighboringStates: [...neighboringStatesOf(homeState)] };

    default: {
      // Exhaustiveness guard — a new LocationPreference value must be handled above.
      const _exhaustive: never = locationPreference;
      return _exhaustive;
    }
  }
}
