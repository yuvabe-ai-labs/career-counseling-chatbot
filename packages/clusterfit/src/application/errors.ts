export class ClusterfitApplicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

const error = (code: string, message: string, statusCode: number) => () =>
  new ClusterfitApplicationError(code, message, statusCode);

export const sessionNotFound = error(
  "clusterfit_session_not_found",
  "Clusterfit session was not found.",
  404,
);
export const profileNotFound = error(
  "clusterfit_profile_not_found",
  "Student profile was not found.",
  404,
);
export const gradeRequired = error(
  "clusterfit_grade_required",
  "Confirm the class first: it decides which puzzles are asked.",
  409,
);
export const sessionLocked = error(
  "clusterfit_session_scored",
  "This session has already been scored, so answers can no longer change.",
  409,
);
export const reattemptNotAllowed = error(
  "clusterfit_reattempt_not_allowed",
  "Only a finished test can be taken again.",
  409,
);
export const resultNotFound = error(
  "clusterfit_result_not_found",
  "No result yet for this session.",
  404,
);
export const liveUnavailable = error(
  "clusterfit_live_unavailable",
  "The voice chat is not available right now. You can continue with the form.",
  503,
);
export const liveTokenLimit = error(
  "clusterfit_live_token_limit",
  "This session has used all its chat connections. You can continue with the form.",
  429,
);
export const emptyTranscript = error(
  "clusterfit_empty_transcript",
  "The transcript has no student turns yet.",
  400,
);
export const extractionFailed = error(
  "clusterfit_extraction_failed",
  "We couldn't read the chat just now. Please check your answers in the form.",
  502,
);

export const invalidAnswer = (message: string): ClusterfitApplicationError =>
  new ClusterfitApplicationError("clusterfit_invalid_answer", message, 400);

export const notReadyToScore = (missing: string[]): ClusterfitApplicationError =>
  new ClusterfitApplicationError(
    "clusterfit_not_ready",
    `Not enough answers to score yet: ${missing.join("; ")}.`,
    409,
  );
