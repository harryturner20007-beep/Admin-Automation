// Production error reporting: every server error is logged as one JSON line (Vercel keeps these in its
// logs and can forward them with a log drain, e.g. to Sentry or Better Stack). Only the error, route and
// digest are logged: never request bodies, cookies or customer records.
export function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath?: string; routeType?: string }) {
  const e = err as Error & { digest?: string };
  console.error(JSON.stringify({ level: "error", message: e.message, digest: e.digest, method: request.method, route: context.routePath ?? request.path.split("?")[0], type: context.routeType }));
}
