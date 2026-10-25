import { Resolver } from "node:dns";
import { Agent, fetch } from "undici";

type GitHubFetchOptions = {
  method?: "GET" | "POST";
  headers: Record<string, string>;
  body?: Record<string, unknown>;
};

let githubDispatcher: Agent | undefined;
let configuredDnsServers: string | undefined;

function dnsServers() {
  const config = useRuntimeConfig();
  return String(config.githubDnsServers || "")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);
}

function dispatcher() {
  const servers = dnsServers();
  const cacheKey = servers.join(",");
  if (githubDispatcher && configuredDnsServers === cacheKey) {
    return githubDispatcher;
  }

  const resolver = new Resolver();
  resolver.setServers(servers);

  githubDispatcher = new Agent({
    connect: {
      lookup(hostname, options, callback) {
        resolver.resolve4(hostname, (error, addresses) => {
          if (error) {
            callback(error, []);
            return;
          }

          const resolved = addresses.map((address) => ({
            address,
            family: 4 as const,
          }));
          if (options.all) {
            callback(null, resolved);
            return;
          }
          callback(null, resolved[0]!.address, resolved[0]!.family);
        });
      },
    },
  });
  configuredDnsServers = cacheKey;
  return githubDispatcher;
}

export function githubApiFetch<T>(url: string, options: GitHubFetchOptions) {
  return fetch(url, {
    method: options.method,
    headers: {
      ...options.headers,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    dispatcher: dispatcher(),
    signal: AbortSignal.timeout(15_000),
  }).then(async (response) => {
    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      throw Object.assign(
        new Error(
          typeof data?.message === "string"
            ? data.message
            : `GitHub API returned HTTP ${response.status}`,
        ),
        {
          status: response.status,
          statusCode: response.status,
          data,
        },
      );
    }

    return data as T;
  });
}
