// Gera assets/atividade.svg com dados públicos do GitHub.
// Roda pelo GitHub Actions (.github/workflows/atividade.yml) uma vez por dia.
import { writeFileSync } from 'node:fs';

const USUARIO = process.env.USUARIO || 'GabrielEvaristo77';
const TOKEN = process.env.GITHUB_TOKEN;
const SAIDA = process.env.SAIDA || 'assets/atividade.svg';

async function api(caminho) {
  const r = await fetch(`https://api.github.com${caminho}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!r.ok) throw new Error(`${caminho} -> ${r.status}`);
  return r.json();
}

function diaISO(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export async function coletar() {
  const repos = (await api(`/users/${USUARIO}/repos?per_page=100&type=owner`)).filter((r) => !r.fork);

  const linguagens = {};
  for (const repo of repos) {
    const ling = await api(`/repos/${USUARIO}/${repo.name}/languages`);
    for (const [nome, bytes] of Object.entries(ling)) linguagens[nome] = (linguagens[nome] || 0) + bytes;
  }

  const ano = new Date().getUTCFullYear();
  const datas = [];
  let total = 0;
  for (let pagina = 1; pagina <= 10; pagina++) {
    const busca = await api(
      `/search/commits?q=author:${USUARIO}+committer-date:>=${ano}-01-01&per_page=100&page=${pagina}&sort=committer-date`
    );
    total = busca.total_count;
    for (const item of busca.items) datas.push(diaISO(item.commit.committer.date));
    if (busca.items.length < 100) break;
  }

  return { repos: repos.length, commitsAno: total, ano, dias: [...new Set(datas)], linguagens };
}

export function calcularSequencia(dias, hoje = diaISO(Date.now())) {
  const set = new Set(dias);
  const um = 86400000;
  let cursor = new Date(hoje + 'T00:00:00Z').getTime();
  if (!set.has(diaISO(cursor))) cursor -= um; // ainda não estudou hoje: conta até ontem
  let seq = 0;
  while (set.has(diaISO(cursor))) { seq++; cursor -= um; }
  return seq;
}

const CORES = ['#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#bfdbfe'];
const FONTE = `font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function desenhar(d, hoje = diaISO(Date.now())) {
  const um = 86400000;
  const fim = new Date(hoje + 'T00:00:00Z').getTime();
  const ultimos30 = d.dias.filter((x) => fim - new Date(x + 'T00:00:00Z').getTime() < 30 * um).length;
  const seq = calcularSequencia(d.dias, hoje);

  const numeros = [
    [d.commitsAno, `commits em ${d.ano}`],
    [seq, seq === 1 ? 'dia seguido' : 'dias seguidos'],
    [ultimos30, 'dias ativos (30 dias)'],
    [d.repos, d.repos === 1 ? 'repositório' : 'repositórios'],
  ];

  const totalBytes = Object.values(d.linguagens).reduce((a, b) => a + b, 0) || 1;
  const top = Object.entries(d.linguagens).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const s = [];
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" width="840" height="230" viewBox="0 0 840 230">`);
  s.push(`<rect width="840" height="230" rx="14" fill="#0b1220" stroke="#1f3a68"/>`);
  s.push(`<text x="24" y="36" ${FONTE} font-size="13" fill="#60a5fa" letter-spacing="2">ATIVIDADE NO GITHUB</text>`);

  numeros.forEach(([valor, rotulo], i) => {
    const x = 24 + (i % 2) * 200;
    const y = 58 + Math.floor(i / 2) * 76;
    s.push(`<rect x="${x}" y="${y}" width="188" height="64" rx="10" fill="#0f1b33" stroke="#1d2b47"/>`);
    s.push(`<text x="${x + 16}" y="${y + 32}" ${FONTE} font-size="24" font-weight="700" fill="#f1f5f9">${esc(valor)}</text>`);
    s.push(`<text x="${x + 16}" y="${y + 52}" ${FONTE} font-size="12" fill="#94a3b8">${esc(rotulo)}</text>`);
  });

  const lx = 448;
  s.push(`<text x="${lx}" y="76" ${FONTE} font-size="13" font-weight="600" fill="#e2e8f0">Linguagens mais usadas</text>`);
  let barraX = lx;
  const barraW = 368;
  top.forEach(([, bytes], i) => {
    const w = (bytes / totalBytes) * barraW;
    s.push(`<rect x="${barraX.toFixed(1)}" y="90" width="${Math.max(w, 2).toFixed(1)}" height="10" fill="${CORES[i]}"/>`);
    barraX += w;
  });
  s.push(`<rect x="${lx}" y="90" width="${barraW}" height="10" rx="5" fill="none" stroke="#0b1220" stroke-width="2"/>`);
  top.forEach(([nome, bytes], i) => {
    const x = lx + (i % 2) * 190;
    const y = 128 + Math.floor(i / 2) * 26;
    const pct = ((bytes / totalBytes) * 100).toFixed(1).replace('.', ',');
    s.push(`<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${CORES[i]}"/>`);
    s.push(`<text x="${x + 16}" y="${y}" ${FONTE} font-size="13" fill="#cbd5e1">${esc(nome)} <tspan fill="#64748b">${pct}%</tspan></text>`);
  });
  if (!top.length) s.push(`<text x="${lx}" y="128" ${FONTE} font-size="13" fill="#64748b">Sem dados ainda</text>`);

  const [a, m, dd] = hoje.split('-');
  s.push(`<text x="816" y="214" text-anchor="end" ${FONTE} font-size="11" fill="#475569">atualizado em ${dd}/${m}/${a}</text>`);
  s.push(`</svg>`);
  return s.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dados = await coletar();
  writeFileSync(SAIDA, desenhar(dados));
  console.log('ok', JSON.stringify({ ...dados, dias: dados.dias.length }));
}
