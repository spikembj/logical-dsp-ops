/**
 * Fuzzy name matching for cross-source driver lookup.
 *
 * Used by the Netradyne import to handle the case where the safety report
 * lists a driver under their legal name (e.g. "Alexander Ritsche") while
 * Amazon's scorecards list the same person under whatever name they entered
 * (e.g. "Alex Ritsche"). Without this, Pass 3e's strict "skip if not found"
 * behavior silently drops their safety events.
 *
 * The matcher is deliberately conservative: it only auto-matches when there
 * is exactly *one* high-confidence candidate. Ambiguous cases (two existing
 * drivers both look like the query, or the only candidate is medium-conf)
 * fall back to the import's "skipped" path so a person reviews instead of
 * a silent wrong-attribution.
 */

/** Common English first-name nicknames. Bidirectional — both keys and values
 * are searched. Conservative on purpose; expand as real-world misses surface. */
const NICKNAMES: Record<string, string[]> = {
  michael: ["mike", "mick", "mikey"],
  robert: ["bob", "rob", "bobby", "robbie", "bert"],
  william: ["bill", "will", "billy", "willie", "liam"],
  richard: ["rick", "dick", "ricky", "rich"],
  joseph: ["joe", "joey"],
  john: ["jack", "johnny"],
  james: ["jim", "jimmy", "jamie"],
  thomas: ["tom", "tommy"],
  charles: ["chuck", "charlie", "chas"],
  christopher: ["chris", "christo"],
  daniel: ["dan", "danny"],
  david: ["dave", "davey"],
  edward: ["ed", "eddie", "ted", "ned"],
  matthew: ["matt", "matty"],
  nicholas: ["nick", "nicky"],
  anthony: ["tony"],
  benjamin: ["ben", "benny"],
  alexander: ["alex", "al", "xander"],
  patrick: ["pat", "paddy"],
  samuel: ["sam", "sammy"],
  steven: ["steve", "stevie"],
  stephen: ["steve", "stevie"],
  andrew: ["andy", "drew"],
  jonathan: ["jon", "jonny"],
  joshua: ["josh"],
  zachary: ["zach", "zack"],
  jeffrey: ["jeff", "jeffy"],
  kenneth: ["ken", "kenny"],
  ronald: ["ron", "ronnie"],
  donald: ["don", "donny"],
  timothy: ["tim", "timmy"],
  gerald: ["gerry", "jerry"],
  raymond: ["ray"],
  douglas: ["doug"],
  gregory: ["greg"],
  lawrence: ["larry"],
  vincent: ["vince", "vinny"],
  frederick: ["fred", "freddie"],
  // Female-leaning
  elizabeth: ["liz", "beth", "betty", "eliza", "lizzie"],
  margaret: ["maggie", "meg", "peggy"],
  katherine: ["kate", "katie", "kathy", "kat"],
  catherine: ["cathy", "kate", "katie", "cat"],
  jennifer: ["jen", "jenny", "jenn"],
  patricia: ["pat", "patty", "trish"],
  barbara: ["barb", "babs"],
  susan: ["sue", "susie", "suzy"],
  jessica: ["jess", "jessie"],
  rebecca: ["becca", "becky"],
  victoria: ["vicky", "tori"],
  veronica: ["vee", "vicky"],
  samantha: ["sam", "sammy"],
  alexandra: ["alex", "ali", "lexi", "sandy"],
  natalie: ["nat", "nattie"],
};

/** Build the reverse lookup once at module load. Maps any nickname OR full
 * name → the canonical full name(s) it maps to. Lowercased. */
const NICK_TO_CANON = new Map<string, Set<string>>();
for (const [full, nicks] of Object.entries(NICKNAMES)) {
  if (!NICK_TO_CANON.has(full)) NICK_TO_CANON.set(full, new Set());
  NICK_TO_CANON.get(full)!.add(full);
  for (const nick of nicks) {
    if (!NICK_TO_CANON.has(nick)) NICK_TO_CANON.set(nick, new Set());
    NICK_TO_CANON.get(nick)!.add(full);
  }
}

/** True if `a` and `b` could be the same first name via the nickname dict. */
function firstNamesNicknameEquivalent(a: string, b: string): boolean {
  if (a === b) return true;
  const aCanons = NICK_TO_CANON.get(a);
  const bCanons = NICK_TO_CANON.get(b);
  if (!aCanons || !bCanons) return false;
  for (const c of aCanons) if (bCanons.has(c)) return true;
  return false;
}

/** Lowercased, accent-stripped, single-spaced. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Split a normalized name into first-token and rest-tokens. */
function splitName(n: string): { first: string; rest: string[] } {
  const parts = n.split(" ");
  return { first: parts[0] ?? "", rest: parts.slice(1) };
}

export type FuzzyReason =
  | "exact"
  | "first_name_prefix"
  | "first_name_nickname"
  | "extra_last_name_token";

export interface FuzzyCandidate {
  driverId: string;
  fullName: string;
  reason: FuzzyReason;
}

/**
 * Find the single best fuzzy match for `query` among `candidates`.
 *
 * Returns null when:
 *   - no candidate scores at all, OR
 *   - more than one candidate scores (ambiguous — refuse to guess)
 *
 * Returns a candidate when exactly one candidate matches by any of:
 *   - exact normalized match
 *   - same last-name(s) AND first-name is a prefix of the other
 *     (e.g. "alex ritsche" / "alexander ritsche")
 *   - same last-name(s) AND first-names are nickname-equivalent
 *     (e.g. "mike smith" / "michael smith")
 *   - same first-name AND one's last-name token list is a strict prefix
 *     of the other's (e.g. "adriana salgado" / "adriana salgado melchor")
 */
export function findFuzzyMatch(
  query: string,
  candidates: { id: string; full_name: string }[],
): FuzzyCandidate | null {
  const q = normalizeName(query);
  if (!q) return null;
  const qParts = splitName(q);
  if (!qParts.first) return null;

  const matches: FuzzyCandidate[] = [];

  for (const c of candidates) {
    const cn = normalizeName(c.full_name);
    if (!cn) continue;

    if (cn === q) {
      matches.push({
        driverId: c.id,
        fullName: c.full_name,
        reason: "exact",
      });
      continue;
    }

    const cnParts = splitName(cn);
    if (!cnParts.first) continue;

    const sameLast =
      qParts.rest.length > 0 &&
      cnParts.rest.length > 0 &&
      qParts.rest.join(" ") === cnParts.rest.join(" ");

    if (sameLast) {
      // First-name prefix match. Avoid trivially-tiny prefixes (a single
      // letter would over-match). Require the shorter first name to be
      // at least 2 chars.
      const shorter =
        qParts.first.length <= cnParts.first.length
          ? qParts.first
          : cnParts.first;
      const longer =
        shorter === qParts.first ? cnParts.first : qParts.first;
      if (
        shorter.length >= 2 &&
        shorter !== longer &&
        longer.startsWith(shorter)
      ) {
        matches.push({
          driverId: c.id,
          fullName: c.full_name,
          reason: "first_name_prefix",
        });
        continue;
      }
      // Nickname equivalence.
      if (firstNamesNicknameEquivalent(qParts.first, cnParts.first)) {
        matches.push({
          driverId: c.id,
          fullName: c.full_name,
          reason: "first_name_nickname",
        });
        continue;
      }
    }

    // Same first name, one last-name list is a prefix of the other.
    if (
      qParts.first === cnParts.first &&
      qParts.rest.length > 0 &&
      cnParts.rest.length > 0 &&
      qParts.rest.length !== cnParts.rest.length
    ) {
      const [shorterRest, longerRest] =
        qParts.rest.length < cnParts.rest.length
          ? [qParts.rest, cnParts.rest]
          : [cnParts.rest, qParts.rest];
      const isPrefix = shorterRest.every(
        (tok, i) => tok === longerRest[i],
      );
      if (isPrefix) {
        matches.push({
          driverId: c.id,
          fullName: c.full_name,
          reason: "extra_last_name_token",
        });
        continue;
      }
    }
  }

  if (matches.length === 1) return matches[0]!;
  return null; // 0 or 2+ — refuse to guess
}
