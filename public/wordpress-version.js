export const VERSION_API = "https://api.wordpress.org/core/version-check/1.7/";

// WordPress calls the first two components the major release (7.1, not 7).
export function majorVersion(version) {
  const match = String(version ?? "")
    .trim()
    .match(/^(\d+)\.(\d+)(?:\.\d+)?$/);
  return match ? `${Number(match[1])}.${Number(match[2])}` : null;
}

export async function latestWordPressMajor(fetcher = fetch) {
  const response = await fetcher(VERSION_API, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-cache",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("WordPress version lookup unavailable.");
  const data = await response.json();
  const versions = (Array.isArray(data.offers) ? data.offers : [])
    .filter((offer) => ["upgrade", "current"].includes(offer?.response))
    .map((offer) => majorVersion(offer.current || offer.version))
    .filter(Boolean)
    .sort((a, b) => {
      const [ax, ay] = a.split(".").map(Number);
      const [bx, by] = b.split(".").map(Number);
      return bx - ax || by - ay;
    });
  if (!versions.length)
    throw new Error("No stable WordPress release returned.");
  return versions[0];
}

export function testedVersionCheck(tested, latest) {
  const major = majorVersion(tested);
  if (!major)
    return [
      "warn",
      `Set “Tested up to” to ${latest} after testing with WordPress ${latest}, the latest major release.`,
    ];
  if (major === latest)
    return [
      "good",
      `Tested up to ${latest}, the latest WordPress major release.`,
    ];
  return [
    "warn",
    `“Tested up to” is ${major}; the latest WordPress major release is ${latest}. Test with ${latest} and update the header.`,
  ];
}
