import { buildItemsFromFlat } from '@/lib/search';

describe('buildItemsFromFlat', () => {
  it('builds paths for nested items', () => {
    const rows = [
      { id: '1', parent_id: null, nama_jabatan: 'Root', slug: 'root', unit_kerja: null, level: 1, order_index: 1 },
      { id: '2', parent_id: '1', nama_jabatan: 'Child', slug: 'child', unit_kerja: null, level: 2, order_index: 1 },
      { id: '3', parent_id: '2', nama_jabatan: 'Grand', slug: 'grand', unit_kerja: null, level: 3, order_index: 1 },
    ];

    const items = buildItemsFromFlat(rows as any);
    const byId = new Map(items.map(i => [i.id, i]));
    expect(byId.get('1')?.path).toBe('anjab/root');
    expect(byId.get('2')?.path).toBe('anjab/root/child');
    expect(byId.get('3')?.path).toBe('anjab/root/child/grand');
  });

  it('returns empty array for empty input', () => {
    expect(buildItemsFromFlat([])).toEqual([]);
  });
});
