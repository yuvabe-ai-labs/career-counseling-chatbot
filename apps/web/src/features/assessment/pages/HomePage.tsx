import { Navigate } from "react-router-dom";
import { useSession } from "../state/session-context";

/**
 * /home: where every sign-up, sign-in and guardian-consent path lands. A signed-in student goes
 * straight to the clusterfit journey (it resumes wherever they left off); anyone else goes to the
 * landing page.
 */
export function HomePage() {
  const session = useSession();
  if (!session.userId || !session.journeySessionId) return <Navigate to="/" replace />;
  return <Navigate to="/clusterfit" replace />;
}
