const fallbackIceServers: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

function isIceServer(value: unknown): value is RTCIceServer {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const urls = candidate.urls;
  const validUrls =
    (typeof urls === "string" && urls.length > 0) ||
    (Array.isArray(urls) &&
      urls.length > 0 &&
      urls.every((url) => typeof url === "string" && url.length > 0));

  return (
    validUrls &&
    (candidate.username === undefined || typeof candidate.username === "string") &&
    (candidate.credential === undefined || typeof candidate.credential === "string")
  );
}

export function getIceServers(): RTCIceServer[] {
  const configuredServers = process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS;
  if (!configuredServers) {
    return fallbackIceServers;
  }

  let parsedServers: unknown;
  try {
    parsedServers = JSON.parse(configuredServers);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_WEBRTC_ICE_SERVERS must contain a valid JSON array of ICE server configurations.",
    );
  }

  if (
    !Array.isArray(parsedServers) ||
    parsedServers.length === 0 ||
    !parsedServers.every(isIceServer)
  ) {
    throw new Error(
      "NEXT_PUBLIC_WEBRTC_ICE_SERVERS must be a non-empty JSON array with valid ICE server URLs.",
    );
  }

  return parsedServers;
}
