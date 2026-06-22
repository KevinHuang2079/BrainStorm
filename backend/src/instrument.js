const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  profileSessionSampleRate: 1.0,
  enableLogs: true, // lets you send console-style logs to Sentry too, not just errors
});