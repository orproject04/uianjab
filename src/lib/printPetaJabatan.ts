// Utility: Generate and open print-ready HTML for Peta Jabatan
// Layout: A3 landscape, card-based hierarchical tree
// Pelaksana/Fungsional ditampilkan sebagai baris tabel di dalam card induk (bukan node terpisah)

export type PrintAPIRow = {
  id: string;
  parent_id: string | null;
  nama_jabatan: string;
  slug: string;
  order_index: number | null;
  bezetting?: number | null;
  kebutuhan_pegawai?: number | null;
  is_pusat?: boolean;
  jenis_jabatan: string | null;
  kelas_jabatan?: string | null;
  pejabat?: Array<{ name: string; nip: string; role: string }>;
};

export type PrintSyntheticFlags = {
  addKJFforEselonII: boolean;
  addSKDPforSetjen: boolean;
  addKJFforEselonIII: boolean;
  kjfForInspekturAsE4: boolean;
};

type PrintNode = {
  row: PrintAPIRow;
  children: PrintNode[];
  isSynthetic?: boolean;
  syntheticLabel?: string;
};

function rankJenis(j: string | null | undefined): number {
  const t = (j || '').trim().toUpperCase();
  if (!t) return 99;
  if (/\bESELON\s*I\b/.test(t)) return 1;
  if (/\bESELON\s*II\b/.test(t)) return 2;
  if (/\bESELON\s*III\b/.test(t)) return 3;
  if (/\bESELON\s*IV\b/.test(t)) return 4;
  if (/JABATAN\s+FUNGSIONAL/.test(t)) return 5;
  if (/JABATAN\s+PELAKSANA/.test(t)) return 6;
  return 99;
}

// Returns a CSS class name for the title row background by eselon rank.
// Defined here so the linter does not inject inline styles instead.
function titleClass(rank: number): string {
  if (rank <= 1) return 'hdr-e1';
  if (rank === 2) return 'hdr-e2';
  if (rank === 3) return 'hdr-e3';
  if (rank === 4) return 'hdr-e4';
  return 'hdr-e4';
}

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrintTree(rows: PrintAPIRow[], flags: PrintSyntheticFlags): PrintNode[] {
  const byParent = new Map<string | null, PrintAPIRow[]>();
  for (const r of rows) {
    const arr = byParent.get(r.parent_id) || [];
    arr.push(r);
    byParent.set(r.parent_id, arr);
  }
  for (const [k, arr] of byParent.entries()) {
    arr.sort((a, b) =>
      (a.order_index ?? 0) - (b.order_index ?? 0) ||
      a.nama_jabatan.localeCompare(b.nama_jabatan, 'id')
    );
    byParent.set(k, arr);
  }

  const build = (r: PrintAPIRow): PrintNode => {
    const rawChildren = (byParent.get(r.id) || []).map(build);
    const rank = rankJenis(r.jenis_jabatan);
    const synthetic: PrintNode[] = [];

    let structuralChildren = rawChildren;
    let functionalChildren: PrintNode[] = [];

    if ((flags.addKJFforEselonII && rank === 2) || (flags.addKJFforEselonIII && rank === 3)) {
      structuralChildren = rawChildren.filter(c => rankJenis(c.row.jenis_jabatan) < 5);
      functionalChildren = rawChildren.filter(c => rankJenis(c.row.jenis_jabatan) >= 5);
    }

    if (flags.addKJFforEselonII && rank === 2) {
      const isInspektorat = /(inspektur|inspektorat)/i.test(r.nama_jabatan + r.slug);
      const kjfJenis = flags.kjfForInspekturAsE4 && isInspektorat ? 'ESELON IV' : 'ESELON III';
      const nameUpper = r.nama_jabatan.toUpperCase();
      const label = nameUpper.startsWith('KEPALA ')
        ? `KELOMPOK JABATAN FUNGSIONAL DI ${nameUpper.substring(7)}`
        : `KELOMPOK JABATAN FUNGSIONAL DI ${nameUpper}`;

      synthetic.push({
        row: {
          id: `syn-kjf-${r.id}`,
          parent_id: r.id,
          nama_jabatan: label,
          slug: 'kjf',
          order_index: 9999,
          bezetting: 0,
          kebutuhan_pegawai: 0,
          jenis_jabatan: kjfJenis,
          kelas_jabatan: null,
          pejabat: [],
        },
        children: functionalChildren,
        isSynthetic: true,
        syntheticLabel: label,
      });
    } else if (flags.addKJFforEselonIII && rank === 3) {
      const nameUpper = r.nama_jabatan.toUpperCase();
      const label = nameUpper.startsWith('KEPALA ')
        ? `KELOMPOK JABATAN FUNGSIONAL DI ${nameUpper.substring(7)}`
        : `KELOMPOK JABATAN FUNGSIONAL DI ${nameUpper}`;

      synthetic.push({
        row: {
          id: `syn-kjf-e3-${r.id}`,
          parent_id: r.id,
          nama_jabatan: label,
          slug: 'kjf',
          order_index: 9999,
          bezetting: 0,
          kebutuhan_pegawai: 0,
          jenis_jabatan: 'ESELON IV',
          kelas_jabatan: null,
          pejabat: [],
        },
        children: functionalChildren,
        isSynthetic: true,
        syntheticLabel: label,
      });
    }

    if ((flags.addKJFforEselonII && rank === 2) || (flags.addKJFforEselonIII && rank === 3)) {
      return { row: r, children: [...structuralChildren, ...synthetic] };
    }

    return { row: r, children: [...rawChildren, ...synthetic] };
  };

  return (byParent.get(null) || []).map(build);
}

// ── Render one pelaksana/fungsional table row (inline inside parent card) ──────
function inlineTableRow(c: PrintNode, index: number): string {
  const cb = c.row.bezetting ?? 0;
  const ck = c.row.kebutuhan_pegawai ?? 0;
  const cs = cb - ck;
  const csColor = '#111';
  return `<tr>
    <td class="tc">${index + 1}</td>
    <td class="tl">${esc(c.row.nama_jabatan)}</td>
    <td class="tc">${esc(c.row.kelas_jabatan || '-')}</td>
    <td class="tc">${cb}</td>
    <td class="tc">${ck}</td>
    <td class="tc" style="color:${csColor}">${cs >= 0 ? '' : ''}${cs}</td>
  </tr>`;
}

// ── Render a single card ──────────────────────────────────────────────────────
// Structural nodes (Eselon I-IV) use a 3-row table layout:
//   Row 1: job title (colspan 4, colored bg via CSS class)
//   Row 2: "Kelas Jabatan" | B | K | +/-
//   Row 3: kelas value     | b | k | sel
function renderCard(node: PrintNode): string {
  const r = node.row;
  const rank = rankJenis(r.jenis_jabatan);

  const inlineRows = node.children.filter(
    c => !c.isSynthetic && rankJenis(c.row.jenis_jabatan) >= 5
  );

  // Structural cards always show their own bezetting/kebutuhan.
  // KJF synthetic cards (bezetting=0 by construction) show the sum of their functional children.
  const childrenBez = inlineRows.reduce((s, c) => s + (c.row.bezetting ?? 0), 0);
  const childrenKeb = inlineRows.reduce((s, c) => s + (c.row.kebutuhan_pegawai ?? 0), 0);
  const totalBez = node.isSynthetic ? childrenBez : (r.bezetting ?? 0);
  const totalKeb = node.isSynthetic ? childrenKeb : (r.kebutuhan_pegawai ?? 0);
  const totalSel = totalBez - totalKeb;
  const totalSelColor = '#111';
  const selHtml = `<span style="color:${totalSelColor};font-weight:bold">${totalSel >= 0 ? '' : ''}${totalSel}</span>`;

  // ── KJF / synthetic card ────────────────────────────────────────────────────
  if (node.isSynthetic) {
    let tableHtml = '';
    if (inlineRows.length > 0) {
      const bodyRows = inlineRows.map((c, i) => inlineTableRow(c, i)).join('');
      tableHtml = `<table class="pos-tbl">
  <thead><tr>
    <th class="tc">No.</th><th class="tl">Nama Jabatan</th>
    <th class="tc">KLS</th><th class="tc">B</th><th class="tc">K</th><th class="tc">+/-</th>
  </tr></thead>
  <tbody>${bodyRows}</tbody>
</table>`;
    }
    return `<div class="card kjf-card">
  <div class="kjf-hdr">${esc(node.syntheticLabel || r.nama_jabatan)}</div>
  ${tableHtml}
</div>`;
  }

  // ── Structural card (Eselon I–IV) ───────────────────────────────────────────
  const tc = titleClass(rank);

  const pejabat = (r.pejabat || []).map(p => p.name).filter(Boolean);
  const pejabatRow = pejabat.length > 0
    ? `<tr><td colspan="4" class="str-pejabat">${pejabat.map(esc).join('<br>')}</td></tr>`
    : '';

  let inlineTableHtml = '';
  if (inlineRows.length > 0) {
    const bodyRows = inlineRows.map((c, i) => inlineTableRow(c, i)).join('');
    inlineTableHtml = `<table class="pos-tbl">
  <thead><tr>
    <th class="tc">No.</th><th class="tl">Nama Jabatan</th>
    <th class="tc">KLS</th><th class="tc">B</th><th class="tc">K</th><th class="tc">+/-</th>
  </tr></thead>
  <tbody>${bodyRows}</tbody>
</table>`;
  }

  return `<div class="card">
  <table class="str-tbl">
    <tbody>
      <tr><td colspan="4" class="str-title ${tc}">${esc(r.nama_jabatan.toUpperCase())}</td></tr>
      <tr>
        <th class="str-kelas-hdr">Kelas Jabatan</th>
        <th class="tc str-num-hdr">B</th>
        <th class="tc str-num-hdr">K</th>
        <th class="tc str-num-hdr">+/-</th>
      </tr>
      <tr>
        <td class="tc str-kelas-val">${esc(r.kelas_jabatan || '-')}</td>
        <td class="tc str-num-val">${totalBez}</td>
        <td class="tc str-num-val">${totalKeb}</td>
        <td class="tc str-num-val" style="color:${totalSelColor};font-weight:bold">${totalSel >= 0 ? '' : ''}${totalSel}</td>
      </tr>
    </tbody>
  </table>
  ${inlineTableHtml}
</div>`;
}

// ── Special layout: Pusat/Inspektorat (E2 with Subbag TU + KJF) ──────────────
function renderPusatNode(node: PrintNode, treeChildren: PrintNode[]): string {
  const e3Kids = treeChildren.filter(c => !c.isSynthetic && rankJenis(c.row.jenis_jabatan) === 3);
  const e4Kids = treeChildren.filter(c => !c.isSynthetic && rankJenis(c.row.jenis_jabatan) === 4);
  const kjfKids = treeChildren.filter(c => c.isSynthetic);

  const headCardHtml = renderCard(node);

  const subbagHtml = e4Kids.map(c => renderNode(c)).join('');

  // T-junction on the vertical connector: branch right to Subbag TU, continue down to bidangs/KJF.
  // When there is no Subbag TU, render a plain v-line instead.
  const tjuncHtml = subbagHtml
    ? `<div class="pusat-tjunc"><div class="pusat-tjunc-line"></div><div class="pusat-tjunc-branch"><div class="pusat-h-conn"></div>${subbagHtml}</div></div>`
    : `<div class="v-line"></div>`;

  let bidangSection = '';
  if (e3Kids.length > 0) {
    const mid = Math.ceil(e3Kids.length / 2);
    const leftKids = e3Kids.slice(0, mid);
    const rightKids = e3Kids.slice(mid);

    const leftCols = leftKids.map((c, i) =>
      `<div class="pusat-bcol${i === 0 ? ' left-edge' : ''}">${renderNode(c)}</div>`
    ).join('');
    const rightCols = rightKids.map((c, i) =>
      `<div class="pusat-bcol${i === rightKids.length - 1 ? ' right-edge' : ''}">${renderNode(c)}</div>`
    ).join('');

    bidangSection = `<div class="pusat-bidang-row">${leftCols}<div class="pusat-vpass"></div>${rightCols}</div>`;
  }

  const kjfCards = kjfKids.map(c => renderCard(c)).join('');
  // For Inspektorat (no bidangs), the tjunc v-line already connects HEAD→KJF.
  // For Pusat with bidangs, add an extra v-line between the bidang row bottom and KJF.
  const kjfSection = kjfCards
    ? (e3Kids.length > 0 ? `<div class="v-line"></div>${kjfCards}` : kjfCards)
    : '';

  return `<div class="pusat-node">
  <div class="pusat-head-wrap">${headCardHtml}</div>
  ${tjuncHtml}
  ${bidangSection}${kjfSection}
</div>`;
}

// ── Render a tree node (card + connector + children) ─────────────────────────
function renderNode(node: PrintNode): string {
  const treeChildren = node.children.filter(
    c => c.isSynthetic || rankJenis(c.row.jenis_jabatan) < 5
  );

  const rank = rankJenis(node.row.jenis_jabatan);
  const cardHtml = renderCard(node);

  // Special layout for Pusat/Inspektorat: E2 with direct E4 children (Subbag TU) + KJF synthetic
  if (rank === 2) {
    const hasE4 = treeChildren.some(c => !c.isSynthetic && rankJenis(c.row.jenis_jabatan) === 4);
    const hasKJF = treeChildren.some(c => c.isSynthetic);
    if (hasE4 && hasKJF) {
      return renderPusatNode(node, treeChildren);
    }
  }

  if (treeChildren.length === 0) {
    return `<div class="node">${cardHtml}</div>`;
  }

  // Biro (E2, no direct E4) / Kantor Provinsi (E3) layout:
  // KJF is placed to the right of children-row at Bagian card level.
  // L-connector: horizontal arm from v-line midpoint going right, then drops down to KJF card.
  // Arm width is calculated from number of structural children so it always reaches the KJF.
  // (Rank-2 Pusat with direct E4 is already handled above by renderPusatNode.)
  if (rank === 2 || rank === 3) {
    const kjfKids = treeChildren.filter(c => c.isSynthetic);
    const structKids = treeChildren.filter(c => !c.isSynthetic);
    if (kjfKids.length > 0 && structKids.length > 0) {
      const kjfBranchHtml = kjfKids.map(c => renderCard(c)).join('');
      const structCols = structKids.map((c, i) => {
        const isOnly = structKids.length === 1;
        const isFirst = i === 0;
        const isLast = i === structKids.length - 1;
        const cls = isOnly ? 'child-col only'
          : isFirst ? 'child-col first'
            : isLast ? 'child-col last'
              : 'child-col';
        return `<div class="${cls}">${renderNode(c)}</div>`;
      }).join('');
      // Each child-col: 170px card + 40px padding = 210px. Arm goes from center to right edge.
      // v-line is 30px; midpoint at 15px. Drop from midpoint to Bagian card top = 15 + 16 = 31px.
      const armH = Math.ceil(structKids.length * 210 / 2);
      return `<div class="node">
  ${cardHtml}
  <div class="biro-vl-tjunc">
    <div class="biro-l-h" style="width:${armH}px;"></div>
    <div class="biro-l-v" style="left:${armH + 1}px;height:31px;"></div>
  </div>
  <div class="biro-main-and-kjf">
    <div class="children-row">${structCols}</div>
    <div class="biro-kjf-side">${kjfBranchHtml}</div>
  </div>
</div>`;
    }
  }

  // Left-spine vertical layout for all-E4 children (Subbagian under Bagian)
  const allE4 = treeChildren.every(
    c => !c.isSynthetic && rankJenis(c.row.jenis_jabatan) === 4
  );

  if (allE4) {
    const branchItems = treeChildren
      .map((c) => `<div class="branch-item">
  <div class="h-conn"></div>
  <div class="branch-card">${renderNode(c)}</div>
</div>`)
      .join('');
    return `<div class="e3-node">
  ${cardHtml}
  <div class="e3-vline"></div>
  <div class="e3-hbridge"></div>
  <div class="branch-list">${branchItems}</div>
</div>`;
  }

  // Normal horizontal fan-out (Eselon II → Eselon III)
  const childCols = treeChildren.map((c, i) => {
    const isOnly = treeChildren.length === 1;
    const isFirst = i === 0;
    const isLast = i === treeChildren.length - 1;
    const cls = isOnly ? 'child-col only'
      : isFirst ? 'child-col first'
        : isLast ? 'child-col last'
          : 'child-col';
    return `<div class="${cls}">${renderNode(c)}</div>`;
  }).join('');

  return `<div class="node">
  ${cardHtml}
  <div class="v-line"></div>
  <div class="children-row">${childCols}</div>
</div>`;
}

// ── Summary table ─────────────────────────────────────────────────────────────
function buildSummary(rows: PrintAPIRow[]): string {
  type G = { b: number; k: number };
  const groups: Record<string, G> = {
    'ESELON II': { b: 0, k: 0 },
    'ESELON III': { b: 0, k: 0 },
    'ESELON IV': { b: 0, k: 0 },
    'JABATAN FUNGSIONAL': { b: 0, k: 0 },
    'JABATAN PELAKSANA': { b: 0, k: 0 },
  };
  let totalB = 0, totalK = 0;
  for (const r of rows) {
    const rank = rankJenis(r.jenis_jabatan);
    const b = r.bezetting ?? 0;
    const k = r.kebutuhan_pegawai ?? 0;
    const key = rank === 2 ? 'ESELON II'
      : rank === 3 ? 'ESELON III'
        : rank === 4 ? 'ESELON IV'
          : rank === 5 ? 'JABATAN FUNGSIONAL'
            : rank === 6 ? 'JABATAN PELAKSANA' : null;
    if (key && groups[key]) {
      groups[key].b += b;
      groups[key].k += k;
      totalB += b;
      totalK += k;
    }
  }
  const rowsHtml = Object.entries(groups)
    .filter(([, { b, k }]) => b !== 0 || k !== 0)
    .map(([jenis, { b, k }]) => {
      const s = b - k;
      const sc = '';
      return `<tr>
      <td class="sl">${jenis}</td><td>${b}</td><td>${k}</td>
      <td style="${sc}">${s >= 0 ? '' : ''}${s}</td>
    </tr>`;
    }).join('');
  const ts = totalB - totalK;
  const tsc = '';
  return `<table class="sum-tbl">
  <thead><tr><th class="sl">JENIS JABATAN</th><th>B</th><th>K</th><th>+/-</th></tr></thead>
  <tbody>
    ${rowsHtml}
    <tr class="sum-total">
      <td class="sl">JUMLAH TOTAL</td><td>${totalB}</td><td>${totalK}</td>
      <td style="${tsc}">${ts >= 0 ? '' : ''}${ts}</td>
    </tr>
  </tbody>
</table>`;
}

// ── Print CSS ─────────────────────────────────────────────────────────────────
const PRINT_CSS = `
/* ─── Page setup ─────────────────────────────────────────────── */
@page { size: A3 landscape; margin: 6mm; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: 100%;
  height: 100%;
}
body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 6.5pt;
  color: #111;
  background: #fff;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
}

/* ─── Page header ─────────────────────────────────────────────── */
.page-title {
  text-align: center;
  font-size: 9pt;
  font-weight: bold;
  letter-spacing: 0.5px;
  margin-bottom: 0px;
  margin-top: 14px;
}
.page-subtitle {
  text-align: center;
  font-size: 7pt;
  color: #444;
  margin-bottom: 1px;
  text-transform: uppercase;
}

/* ─── Summary table ───────────────────────────────────────────── */
.sum-tbl {
  border-collapse: collapse;
  font-size: 6.5pt;
  margin-bottom: 1px;
}
.sum-tbl th, .sum-tbl td {
  border: 1px solid #aaa;
  padding: 1px 5px;
  text-align: center;
  white-space: nowrap;
}
.sum-tbl th { background: #30a2cf; font-weight: bold; }
.sum-tbl td.sl { text-align: left; }
.sum-tbl th.sl { text-align: left; }
.sum-total td { font-weight: bold; background: #54b7de; }

/* ─── Org tree wrapper ────────────────────────────────────────── */
.org-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
}
.org-root {
  position: relative;
  margin-top: 16px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}
.sum-abs {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
}
.tree-center {
  display: flex;
  justify-content: center;
}
/* ─── Page header: summary pinned top-left, title centered ───────── */
.page-header {
  position: relative;
  width: 100%;
  margin-top: 1px;
  text-align: center;
}

/* ─── Single node (card + connector + children) ───────────────── */
.node {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.node-tjunc {
  position: relative;
}

.node-tjunc-line {
  width: 1px;
  height: 45px;
  background: #333;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
/* Branch emerges from the right side of the vertical connector */
.node-tjunc-branch {
  position: absolute;
  left: 1px;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
}

/* ─── Vertical connector line (explicit element, always prints) ── */
.v-line, .vert-conn {
  width: 1px;
  height: 30px;
  background: #333;
  flex-shrink: 0;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

/* ─── Horizontal fan-out row ─────────────────────────────────────── */
.children-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  position: relative;
  margin-top: 0;
}
/* Horizontal bar across the top of all children */
.children-row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: #333;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

/* ─── Each child column in horizontal fan-out ─────────────────── */
.child-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 20px;
  position: relative;
}
/* Vertical drop from horizontal bar to card top */
.child-col::before {
  content: '';
  display: block;
  width: 1px;
  height: 16px;
  background: #333;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
/* Mask left half of bar for first child — stop 1px before center so the drop-line isn't clipped */
.child-col.first::after {
  content: '';
  position: absolute;
  top: -1px;
  left: 0;
  width: calc(50% - 1px);
  height: 3px;
  background: #fff;
  z-index: 2;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
/* Mask right half of bar for last child */
.child-col.last::after {
  content: '';
  position: absolute;
  top: -1px;
  right: 0;
  width: calc(50% - 1px);
  height: 3px;
  background: #fff;
  z-index: 2;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.child-col.only::before { display: none; }
.child-col.only::after  { display: none; }

/* ─── Left-spine layout: Eselon IV (Subbagian) under Eselon III ── */
.e3-node {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 170px;
  overflow: visible;
}
/* Vertical drop from bottom-center of parent card (170px wide → center at x=84) */
.e3-vline {
  width: 1px;
  height: 10px;
  background: #333;
  margin-left: 84px;
  flex-shrink: 0;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
/* Horizontal bridge: goes left from vline (x=84) to spine (x=0) */
.e3-hbridge {
  width: 85px;
  height: 1px;
  background: #333;
  flex-shrink: 0;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
/* Vertical spine at left edge — no overflow into sibling columns */
.branch-list {
  border-left: 1px solid #333;
  margin-left: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.branch-item {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  margin-top: 16px;
  position: relative;
}
/* Cover spine below last connector so it ends cleanly at last Subbagian */
.branch-item:last-child::after {
  content: '';
  position: absolute;
  left: -2px;
  top: 10px;
  width: 4px;
  bottom: 0;
  background: #fff;
  z-index: 1;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
/* Horizontal connector from spine to card */
.h-conn {
  width: 12px;
  height: 1px;
  background: #333;
  flex-shrink: 0;
  margin-top: 8px;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.branch-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

/* ─── Card shell ──────────────────────────────────────────────── */
.card {
  width: 170px;
  border: 1px solid #333;
  overflow: hidden;
  background: #fff;
  page-break-inside: avoid;
  break-inside: avoid;
}

/* ─── Structural card table (Eselon I-IV): 3-row layout ──────── */
.str-tbl {
  width: 100%;
  border-collapse: collapse;
}
.str-tbl th, .str-tbl td {
  border: 1px solid #333;
  padding: 1px 2px;
  font-size: 6pt;
}

/* Title row: colored background by eselon level */
.str-title {
  text-align: center;
  font-weight: bold;
  font-size: 6.5pt;
  line-height: 1.25;
  padding: 3px 4px;
  color: #fff;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.hdr-e1 { background: #14532d; }
.hdr-e2 { background: #166534; }
.hdr-e3 { background: #15803d; }
.hdr-e4 { background: #16a34a; }

.str-pejabat {
  text-align: center;
  font-size: 5.5pt;
  font-style: italic;
  font-weight: bold;
  padding: 1px 3px;
  background: rgba(0,0,0,0.12);
  color: #fff;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.str-kelas-hdr {
  text-align: center;
  font-weight: bold;
  font-size: 5.5pt;
  background: #e8f5e9;
  width: 60%;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.str-num-hdr {
  font-weight: bold;
  font-size: 5.5pt;
  background: #e8f5e9;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.str-kelas-val { text-align: center; font-size: 6pt; }
.str-num-val   { text-align: center; font-size: 6pt; }

/* ─── Inline pelaksana/fungsional table inside card ──────────── */
.pos-tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 5pt;
}
.pos-tbl th, .pos-tbl td {
  border: 1px solid #ccc;
  padding: 1px 2px;
}
.pos-tbl th {
  background: #eeeeee;
  font-weight: bold;
  font-size: 5pt;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.tc { text-align: center; }
.tl { text-align: left; }

/* ─── Card footer — KJF cards only ───────────────────────────── */
.card-foot {
  display: flex;
  justify-content: space-around;
  align-items: center;
  font-size: 6pt;
  padding: 2px 3px;
  border-top: 1px solid #ccc;
  background: #f9f9f9;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

/* ─── KJF (Kelompok Jabatan Fungsional) card ─────────────────── */
.kjf-card {
  border: 1px solid #15803d;
  width: 170px;
  background-image: linear-gradient(to right, rgba(21,128,61,0.1) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(21,128,61,0.1) 1px, transparent 1px);
  background-size: 8px 8px;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.kjf-hdr {
  background: #dcfce7;
  color: #14532d;
  padding: 4px;
  text-align: center;
  font-size: 6pt;
  font-weight: bold;
  line-height: 1.3;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

/* ─── Pusat/Inspektorat special layout ───────────────────────── */
/* HEAD [-- SUBBAG TU]  /  T-bar  /  [BIDANG1] (gap) [BIDANG2]  /  [KJF] */
.pusat-node {
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* HEAD card wrapper: width equals HEAD card width so pusat-node centers it correctly */
.pusat-head-wrap {}
/* T-junction: 1px-wide vertical segment; branch extends right to Subbag TU */
.pusat-tjunc {
  position: relative;
}
.pusat-tjunc-line {
  width: 1px;
  height: 45px;
  background: #333;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
/* Branch emerges from the right side of the vertical connector */
.pusat-tjunc-branch {
  position: absolute;
  left: 1px;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
}
.pusat-h-conn {
  width: 240px;
  height: 1px;
  background: #333;
  flex-shrink: 0;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.pusat-bidang-row {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  position: relative;
}
.pusat-bidang-row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: #333;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.pusat-bcol {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 16px;
  position: relative;
}
.pusat-bcol::before {
  content: '';
  display: block;
  width: 1px;
  height: 25px;
  background: #333;
  flex-shrink: 0;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.pusat-bcol.left-edge::after {
  content: '';
  position: absolute;
  top: -1px;
  left: 0;
  width: calc(50% - 1px);
  height: 3px;
  background: #fff;
  z-index: 2;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.pusat-bcol.right-edge::after {
  content: '';
  position: absolute;
  top: -1px;
  right: 0;
  width: calc(50% - 1px);
  height: 3px;
  background: #fff;
  z-index: 2;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.pusat-vpass {
  width: 72px;
  flex-shrink: 0;
  position: relative;
  min-height: 16px;
}
.pusat-vpass::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  margin-left: -1px;
  width: 1px;
  background: #333;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

/* ─── Biro/Kantor Provinsi: L-connector from v-line midpoint to KJF ── */
/* The v-line doubles as the tjunc; biro-l-h and biro-l-v are the L arm (absolute) */
.biro-vl-tjunc {
  position: relative;
  width: 1px;
  height: 30px;
  background: #333;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
/* Horizontal part of L: starts at v-line midpoint, goes right (width set inline) */
.biro-l-h {
  position: absolute;
  top: 50%;
  left: 1px;
  height: 1px;
  background: #333;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
/* Vertical part of L: drops from midpoint down to KJF card level (left/height set inline) */
.biro-l-v {
  position: absolute;
  top: 50%;
  width: 1px;
  background: #333;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
/* Row wrapper: children-row + KJF side by side */
.biro-main-and-kjf {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
}
/* KJF side: padding-top aligns KJF card with Bagian card tops (child-col drops 16px) */
.biro-kjf-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 16px;
  padding-left: 20px;
}
`;

// ── Main export ───────────────────────────────────────────────────────────────
export function printPetaJabatan(
  rows: PrintAPIRow[],
  flags: PrintSyntheticFlags,
  unitName: string | null,
  orgName: string
): void {
  const trees = buildPrintTree(rows, flags);
  const treeHtml = trees.map(renderNode).join('');
  const summaryHtml = buildSummary(rows);

  // Estimate summary height: each row ≈ 11px (6.5pt + padding + border);
  // +2 for header & total rows; +10 for bottom margin.
  const nonZeroJenisCount = (() => {
    const totals: Record<number, number> = {};
    for (const r of rows) {
      const rank = rankJenis(r.jenis_jabatan);
      if (rank >= 2 && rank <= 6)
        totals[rank] = (totals[rank] ?? 0) + (r.bezetting ?? 0) + (r.kebutuhan_pegawai ?? 0);
    }
    return Object.values(totals).filter(v => v > 0).length;
  })();
  const summaryMinHeight = (nonZeroJenisCount + 2) * 11 + 10;

  let rawName = (unitName || orgName).toUpperCase();
  let titleHtml = `ANALISIS BEBAN KERJA (ABK) — ${esc(rawName)}`;
  const kdMatch = rawName.match(/^(?:KANTOR DAERAH|KANTOR DPD RI)\s+(?:DI IBU KOTA\s+)?(?:PROVINSI\s+)?(.+)$/);
  if (kdMatch) {
    const prov = kdMatch[1].trim();
    titleHtml = `ANALISIS BEBAN KERJA (ABK) — KANTOR DPD RI<br/>DI IBU KOTA PROVINSI ${esc(prov)}`;
  }

  // Used as the PDF filename: browsers use document.title when saving print-to-PDF
  const fileTitle = `ANALISIS BEBAN KERJA (ABK) - ${rawName}`;

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${esc(fileTitle)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <div class="page-header" style="position: relative; text-align: center;">
    <div style="position: absolute; top: 50%; right: 50%; transform: translateY(-50%); margin-right: 300px;">
      ${summaryHtml}
    </div>
    <div style="font-size:9pt;font-weight:bold;color:#333;margin-bottom:4px;">Pandawa - Ortala</div>
    <div class="page-title" style="margin-top: 0; line-height: 1.4;">${titleHtml}</div>
  </div>
  <div class="org-wrap">
    <div class="org-root">
      <div class="tree-center">${treeHtml}</div>
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:0;opacity:0;pointer-events:none';

  iframe.onload = () => {
    setTimeout(() => {
      const prevTitle = document.title;
      document.title = fileTitle;
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.title = prevTitle;
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 1000);
    }, 300);
  };

  iframe.src = url;
  document.body.appendChild(iframe);
}
