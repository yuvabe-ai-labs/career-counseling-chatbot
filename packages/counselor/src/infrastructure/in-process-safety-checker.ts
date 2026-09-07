import type { HandoffPacket, SafetyDecision } from "@yuvanext/contracts";
import type {
  RequestHandoffInput,
  SafetyChecker,
  SafetyPreCheckInput,
} from "../application/index.js";

/**
 * The narrow shape of Module 5's safety operations that this adapter depends on. Deliberately
 * declared locally (not imported from `@yuvanext/safety`) so Module 4 never depends on Module 5's
 * repository/database types directly — only the composition root needs to know that the concrete
 * value passed in happens to be a `SafetyOperationsRepository`. This keeps `packages/counselor`
 * self-contained per its module boundary rules (no upstream repository/database imports) while
 * still allowing an in-process wiring of the two modules.
 */
export type SafetyOperationsPort = {
  runSafetyCheck(request: {
    sourceEventId: string;
    message: string;
  }): Promise<{ decision: SafetyDecision }>;
  createHandoff(request: {
    idempotencyKey: string;
    sourceEventId: string;
  }): Promise<{ packet: HandoffPacket }>;
};

/**
 * Direct, same-process implementation of the `SafetyChecker` port. The POC spec (Module 5)
 * describes safety as "a synchronous pre-check port that Module 4 calls" — it does not require
 * a network hop. When the counselor and safety modules are composed into one server (as they are
 * here), this adapter calls Module 5's safety operations directly instead of the counselor
 * making an HTTP request to its own process (`HttpSafetyChecker`, still available/exported for a
 * real future split into a separately deployed safety service).
 */
export class InProcessSafetyChecker implements SafetyChecker {
  constructor(private readonly operations: SafetyOperationsPort) {}

  async preCheck(input: SafetyPreCheckInput): Promise<SafetyDecision> {
    const { decision } = await this.operations.runSafetyCheck({
      sourceEventId: input.sourceEventId,
      message: input.content,
    });
    return decision;
  }

  async requestHandoff(input: RequestHandoffInput): Promise<HandoffPacket> {
    const { packet } = await this.operations.createHandoff({
      idempotencyKey: input.idempotencyKey,
      sourceEventId: input.sourceEventId,
    });
    return packet;
  }
}
