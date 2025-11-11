export type APIRow = {
  id: string;
  parent_id: string | null;
  nama_jabatan: string;
  slug: string;
  unit_kerja: string | null;
  level: number;
  order_index: number;
};

export type SearchItem = {
  id: string;
  name: string;
  unit_kerja: string | null;
  path: string;
  searchable: string;
};

// Build flat rows into search items with calculated path
export function buildItemsFromFlat(rows: APIRow[]): SearchItem[] {
  const byId = new Map<string, APIRow>();
  const children = new Map<string | null, APIRow[]>();

  for (const r of rows) {
    byId.set(r.id, r);
    const arr = children.get(r.parent_id) || [];
    arr.push(r);
    children.set(r.parent_id, arr);
  }

  for (const [k, arr] of children.entries()) {
    arr.sort(
      (a, b) =>
        (a.order_index ?? 0) - (b.order_index ?? 0) ||
        a.nama_jabatan.localeCompare(b.nama_jabatan, "id")
    );
    children.set(k, arr);
  }

  const calcPath = (node: APIRow): string => {
    const segs: string[] = [];
    let cur: APIRow | null | undefined = node;
    while (cur) {
      segs.push(cur.slug);
      cur = cur.parent_id ? byId.get(cur.parent_id) ?? null : null;
    }
    segs.reverse();
    return `anjab/${segs.join("/")}`;
  };

  return rows.map((r) => ({
    id: r.id,
    name: r.nama_jabatan,
    unit_kerja: r.unit_kerja,
    path: calcPath(r),
    searchable: [r.nama_jabatan, r.unit_kerja ?? "", r.slug, calcPath(r)].join(" ").toLowerCase(),
  }));
}
