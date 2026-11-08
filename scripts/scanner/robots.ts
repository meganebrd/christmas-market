/**
 * robots.txt (RFC 9309): groups by user-agent, Allow/Disallow with `*` and `$`, longest match wins,
 * Allow wins ties. Also reads Crawl-delay and Sitemap lines.
 */

export interface Robots {
  allowed(url: string): boolean;
  /** Seconds, if the group sets one. */
  crawlDelay?: number;
  sitemaps: string[];
}

interface Rule {
  allow: boolean;
  pattern: string;
  re: RegExp;
}

interface Group {
  agents: string[];
  rules: Rule[];
  crawlDelay?: number;
}

function toRegex(pattern: string): RegExp {
  let src = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') src += '.*';
    else if (ch === '$' && i === pattern.length - 1) src += '$';
    else src += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + src);
}

export const ALLOW_ALL: Robots = { allowed: () => true, sitemaps: [] };

/** `agent`: our product token, e.g. "GivreluneScanner". */
export function parseRobots(txt: string, agent: string): Robots {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      if (!value) {
        if (key === 'disallow') continue; // "Disallow:" (empty) = allow everything
      }
      current.rules.push({ allow: key === 'allow', pattern: value, re: toRegex(value) });
    } else if (key === 'crawl-delay') {
      const d = parseFloat(value);
      if (Number.isFinite(d)) current.crawlDelay = d;
    }
  }
  const token = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && (token.includes(a) || a.includes(token))));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules);
  const crawlDelay = chosen.find((g) => g.crawlDelay !== undefined)?.crawlDelay;
  return {
    sitemaps,
    crawlDelay,
    allowed(url: string) {
      if (!rules.length) return true;
      let path: string;
      try {
        const u = new URL(url);
        path = u.pathname + u.search;
      } catch {
        path = url;
      }
      let best: Rule | null = null;
      for (const r of rules) {
        if (!r.re.test(path)) continue;
        if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow && !best.allow)) best = r;
      }
      return best ? best.allow : true;
    },
  };
}
