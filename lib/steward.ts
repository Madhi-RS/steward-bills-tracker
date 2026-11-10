import "server-only";

import { ClientCredentials, CoreClient, EventReceiver, SigningKey, StewardSessions, StewardSignIn } from "@pente-ai-inc/module-sdk";

type StewardConfiguration = {
  coreUrl: string;
  issuer: string;
  redirectUri: string;
  webClientId: string;
};

export class StewardConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StewardConfigurationError";
  }
}

function requiredEnvironment(name: "STEWARD_CLIENT_ID" | "STEWARD_CLIENT_SECRET" | "STEWARD_CORE_URL" | "STEWARD_ISSUER" | "STEWARD_REDIRECT_URI" | "STEWARD_WEB_CLIENT_ID") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new StewardConfigurationError(`${name} must be set before Steward sign-in can be used.`);
  }

  return value;
}

function readConfiguration(): StewardConfiguration {
  if (process.env.STEWARD_PAGE_MODE !== "linked") {
    throw new StewardConfigurationError("STEWARD_PAGE_MODE must be set to linked.");
  }

  return {
    coreUrl: requiredEnvironment("STEWARD_CORE_URL"),
    issuer: requiredEnvironment("STEWARD_ISSUER"),
    redirectUri: requiredEnvironment("STEWARD_REDIRECT_URI"),
    webClientId: requiredEnvironment("STEWARD_WEB_CLIENT_ID"),
  };
}

export function getStewardSignIn() {
  const configuration = readConfiguration();

  return new StewardSignIn({
    issuer: configuration.issuer,
    clientId: configuration.webClientId,
    redirectUri: configuration.redirectUri,
    core: configuration.coreUrl,
  });
}

type StewardRuntime = {
  sessions?: StewardSessions;
  receiver?: EventReceiver;
  core?: CoreClient;
};

const globalForSteward = globalThis as typeof globalThis & { stewardBillsRuntime?: StewardRuntime };
const runtime = globalForSteward.stewardBillsRuntime ?? {};

if (process.env.NODE_ENV !== "production") {
  globalForSteward.stewardBillsRuntime = runtime;
}

/** One server-side session manager for this linked module process. */
export function getStewardSessions() {
  if (!runtime.sessions) {
    runtime.sessions = new StewardSessions(getStewardSignIn());
  }

  return runtime.sessions;
}

/** Core client used for task proposals, directory reads, and proposal reconciliation. */
export function getStewardCore() {
  if (!runtime.core) {
    const configuration = readConfiguration();
    runtime.core = new CoreClient(
      configuration.coreUrl,
      new ClientCredentials(
        configuration.issuer,
        requiredEnvironment("STEWARD_CLIENT_ID"),
        requiredEnvironment("STEWARD_CLIENT_SECRET"),
      ),
    );
  }

  return runtime.core;
}

function signingKey() {
  const value = process.env.STEWARD_SIGNING_KEY?.trim();

  if (!value) {
    throw new StewardConfigurationError("STEWARD_SIGNING_KEY must be set before signed Steward events can be received.");
  }

  return SigningKey.fromBase64(value);
}

/** Build an event receiver wired to the same session manager (also useful to lifecycle tests). */
export function createStewardEventReceiver(key: SigningKey, sessions: Pick<StewardSessions, "endBusiness">) {
  const receiver = new EventReceiver(key);
  receiver.endsSessions(sessions);
  return receiver;
}

/** One signed-event receiver for this module process. */
export function getStewardEventReceiver() {
  if (!runtime.receiver) {
    runtime.receiver = createStewardEventReceiver(signingKey(), getStewardSessions());
  }

  return runtime.receiver;
}

export function shouldUseSecureCookies() {
  return readConfiguration().redirectUri.startsWith("https://");
}
