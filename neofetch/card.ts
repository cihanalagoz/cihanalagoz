// Draws the neofetch-style profile card (dark.svg and light.svg) from the GitHub contribution calendar.
// Run: GITHUB_TOKEN=... USERNAME=cihanalagoz node neofetch/card.ts
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL(".", import.meta.url);
const user = process.env.USERNAME ?? "cihanalagoz";
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");

type Day = { date: string; contributionCount: number };

async function fetchDays(): Promise<{ createdAt: string; days: Day[] }> {
  const graphql = async (query: string) => {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { authorization: `bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const body = await res.json();
    if (!res.ok || body.errors) throw new Error(JSON.stringify(body.errors ?? body));
    return body.data.user;
  };
  const { createdAt } = await graphql(`{ user(login: "${user}") { createdAt } }`);
  const now = new Date();
  const years: string[] = [];
  for (let y = new Date(createdAt).getUTCFullYear(); y <= now.getUTCFullYear(); y++) {
    const to = y === now.getUTCFullYear() ? now.toISOString() : `${y}-12-31T23:59:59Z`;
    years.push(`y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${to}") {
      contributionCalendar { weeks { contributionDays { date contributionCount } } } }`);
  }
  const data = await graphql(`{ user(login: "${user}") { ${years.join("\n")} } }`);
  const days: Day[] = Object.values(data).flatMap((c: any) =>
    c.contributionCalendar.weeks.flatMap((w: any) => w.contributionDays),
  );
  return { createdAt, days: days.filter((d) => d.date <= now.toISOString().slice(0, 10)) };
}

function stats(days: Day[]) {
  const total = days.reduce((s, d) => s + d.contributionCount, 0);
  const lastYear = days.slice(-365).reduce((s, d) => s + d.contributionCount, 0);
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Today may still be empty; the streak counts until yesterday in that case.
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) current++;
    else if (i < days.length - 1) break;
  }
  const busiest = days.reduce((a, b) => (b.contributionCount > a.contributionCount ? b : a));
  return { total, lastYear, longest, current, busiest };
}

function uptime(since: string): string {
  const from = new Date(since);
  const now = new Date();
  let years = now.getUTCFullYear() - from.getUTCFullYear();
  let months = now.getUTCMonth() - from.getUTCMonth();
  let days = now.getUTCDate() - from.getUTCDate();
  if (days < 0) {
    months--;
    days += new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${plural(years, "year")}, ${plural(months, "month")}, ${plural(days, "day")}`;
}

const n = (x: number) => x.toLocaleString("en-US");

type Line = { key: string; value: string } | { section: string } | null;

function info(createdAt: string, s: ReturnType<typeof stats>): Line[] {
  return [
    { key: "OS", value: "macOS, Linux containers" },
    { key: "Uptime", value: uptime(createdAt) },
    { key: "Host", value: "Ankara, Türkiye" },
    { key: "Kernel", value: "Full-stack TypeScript" },
    { key: "IDE", value: "VS Code, Claude Code" },
    null,
    { key: "Languages.Code", value: "TypeScript, JavaScript, Python, C#" },
    { key: "Languages.Real", value: "Türkçe, English" },
    null,
    { key: "Stack.Frontend", value: "React, Next.js, Vite, Tailwind" },
    { key: "Stack.Backend", value: "Node.js, Fastify, .NET, Postgres" },
    { key: "Stack.AI", value: "LLMs, AI agents, MCP, RAG" },
    { key: "Stack.Ops", value: "Docker, Kubernetes, Helm" },
    null,
    { section: "GitHub Stats" },
    { key: "Contributions", value: `${n(s.lastYear)} past year · ${n(s.total)} total` },
    { key: "Streak", value: `${n(s.current)} days now · ${n(s.longest)} best` },
    { key: "Busiest day", value: `${s.busiest.date} (${n(s.busiest.contributionCount)})` },
    null,
    { section: "Contact" },
    { key: "X", value: "@cihanalagoz" },
  ];
}

const themes = {
  dark: { bg: "#0d1117", bar: "#161b22", border: "#30363d", text: "#e6edf3", key: "#ffa657", value: "#a5d6ff", dots: "#484f58", prompt: "#7ee787", path: "#79c0ff" },
  light: { bg: "#ffffff", bar: "#f6f8fa", border: "#d0d7de", text: "#1f2328", key: "#953800", value: "#0a3069", dots: "#afb8c1", prompt: "#116329", path: "#0550ae" },
};
const swatches = ["#f85149", "#ffa657", "#e3b341", "#3fb950", "#39c5cf", "#58a6ff", "#bc8cff", "#ff7b72"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const WIDTH = 57; // characters in an info line
const INFO_X = 455;
const INFO_LH = 21;

function render(mode: keyof typeof themes, lines: Line[]): string {
  const t = themes[mode];
  const art: [string, string][][] = JSON.parse(readFileSync(new URL("portrait.json", dir), "utf8"))[mode];
  const top = 92;
  const rows: string[] = [];
  let y = top;
  const title = `cihan@github `;
  rows.push(`<text x="${INFO_X}" y="${y}" class="line"><tspan class="key">cihan</tspan>@<tspan class="key">github</tspan><tspan class="dots"> ${"─".repeat(WIDTH - title.length)}</tspan></text>`);
  lines.forEach((line, i) => {
    y += INFO_LH;
    const delay = `style="animation-delay:${(0.15 + i * 0.06).toFixed(2)}s"`;
    if (line === null) return;
    if ("section" in line) {
      const head = `- ${line.section} `;
      rows.push(`<text x="${INFO_X}" y="${y}" class="line" ${delay}>- <tspan class="key">${esc(line.section)}</tspan><tspan class="dots"> ${"─".repeat(WIDTH - head.length - 1)}</tspan></text>`);
      return;
    }
    const dots = ".".repeat(Math.max(1, WIDTH - line.key.length - line.value.length - 4));
    rows.push(`<text x="${INFO_X}" y="${y}" class="line" ${delay}><tspan class="key">${esc(line.key)}</tspan>:<tspan class="dots"> ${dots} </tspan><tspan class="value">${esc(line.value)}</tspan></text>`);
  });
  y += INFO_LH + 8;
  const blocks = swatches.map((c, i) => `<rect x="${INFO_X + i * 30}" y="${y - 14}" width="30" height="18" fill="${c}"/>`).join("");
  const height = Math.max(y + 24, top + art.length * 13) + 50;
  const artRows = art
    .map((runs, i) => {
      const spans = runs.map(([text, fill]) => (fill ? `<tspan fill="${fill}">${esc(text)}</tspan>` : text)).join("");
      return `<text x="24" y="${top + i * 13}" class="art">${spans}</text>`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="985" height="${height}" viewBox="0 0 985 ${height}" font-family="ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace">
<title>cihan@github: neofetch</title>
<style>
.line{font-size:15px;fill:${t.text};white-space:pre;opacity:0;animation:in .4s ease-out forwards}
.key{fill:${t.key}}.value{fill:${t.value}}.dots{fill:${t.dots}}
.art{font-size:11px;white-space:pre}
.prompt{font-size:15px;fill:${t.text};white-space:pre}
.cursor{animation:blink 1.1s steps(1) infinite}
@keyframes in{to{opacity:1}}
@keyframes blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){.line{animation:none;opacity:1}.cursor{animation:none}}
</style>
<rect x="0.5" y="0.5" width="984" height="${height - 1}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
<path d="M10.5 0.5h964a10 10 0 0 1 10 10v24h-984v-24a10 10 0 0 1 10-10z" fill="${t.bar}" stroke="${t.border}"/>
<circle cx="22" cy="18" r="6" fill="#ff5f57"/><circle cx="42" cy="18" r="6" fill="#febc2e"/><circle cx="62" cy="18" r="6" fill="#28c840"/>
<text x="492" y="23" text-anchor="middle" font-size="13" fill="${t.dots}">cihan@github: ~</text>
<text x="24" y="64" class="prompt"><tspan fill="${t.prompt}">cihan@github</tspan>:<tspan fill="${t.path}">~</tspan>$ neofetch</text>
${artRows}
${rows.join("\n")}
<g class="line" style="animation-delay:${(0.15 + lines.length * 0.06).toFixed(2)}s">${blocks}</g>
<text x="24" y="${height - 22}" class="prompt"><tspan fill="${t.prompt}">cihan@github</tspan>:<tspan fill="${t.path}">~</tspan>$ <tspan class="cursor">█</tspan></text>
</svg>
`;
}

const { createdAt, days } = await fetchDays();
const lines = info(createdAt, stats(days));
for (const mode of ["dark", "light"] as const) {
  writeFileSync(new URL(`${mode}.svg`, dir), render(mode, lines));
}
console.log(`neofetch card: ${days.length} days`);
