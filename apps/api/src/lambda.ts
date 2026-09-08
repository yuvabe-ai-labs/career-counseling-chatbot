import serverlessHttp from "serverless-http";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { createRuntimeApp } from "./app/create-runtime-app.js";

// Built by the `build:lambda` script (tsup, entry apps/api/src/lambda.ts) and deployed by
// .github/workflows/deploy.yml. Runs the same createRuntimeApp() wiring as server.ts, but as
// an AWS Lambda handler behind a Function URL instead of a long-running app.listen() process.
//
// The runtime app is built once per execution environment (module scope, not inside the
// handler) so a warm Lambda instance reuses its database pool and provider clients across
// invocations instead of reconnecting every request.
const runtimeAppPromise = createRuntimeApp({ docs: false });

let cachedHandler: ReturnType<typeof serverlessHttp> | undefined;

export const handler = async (event: APIGatewayProxyEventV2, context: Context) => {
  // Lambda reuses the execution environment across warm invocations but freezes it between
  // them; matches server.ts's `databasePool` staying open for the process lifetime rather than
  // per-request.
  context.callbackWaitsForEmptyEventLoop = false;

  if (!cachedHandler) {
    const { app } = await runtimeAppPromise;
    cachedHandler = serverlessHttp(app);
  }

  return cachedHandler(event, context);
};
