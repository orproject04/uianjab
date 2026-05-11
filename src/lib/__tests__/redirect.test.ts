import { sanitizeInternalNext } from '@/lib/redirect';

describe('sanitizeInternalNext', () => {
  it('allows internal relative paths', () => {
    expect(sanitizeInternalNext('/dashboard')).toBe('/dashboard');
    expect(sanitizeInternalNext('/peta-jabatan?id=1')).toBe('/peta-jabatan?id=1');
    expect(sanitizeInternalNext('/anjab/master/edit')).toBe('/anjab/master/edit');
  });

  it('falls back for absolute or scheme-based URLs', () => {
    expect(sanitizeInternalNext('javascript:alert(1)')).toBe('/');
    expect(sanitizeInternalNext('https://evil.example')).toBe('/');
    expect(sanitizeInternalNext('//evil.example')).toBe('/');
  });

  it('falls back for disallowed internal paths', () => {
    expect(sanitizeInternalNext('/admin-only')).toBe('/');
    expect(sanitizeInternalNext('/signin?next=/dashboard')).toBe('/');
  });
});
