import { describe, expect, it } from 'vitest';
import { appPath, siteHref } from '../../src/lib/site-path';

describe('local and GitHub Pages URLs', () => {
  it.each(['/', '/login', '/dashboard', '/settle', '/tabs/abc/new'])(
    'round trips routes under both bases: %s',
    (path) => {
      for (const base of ['/', '/FamilySplitter/'])
        expect(appPath(siteHref(path, base), base)).toBe(path);
    },
  );
  it('keeps redirects inside the project and rejects paths outside its base', () => {
    expect(siteHref('/', '/FamilySplitter/')).toBe('/FamilySplitter/');
    expect(appPath('/FamilySplitter', '/FamilySplitter/')).toBe('/');
    expect(appPath('/OtherProject/dashboard', '/FamilySplitter/')).toBe(
      '/unknown',
    );
    expect(appPath('/FamilySplitterExtra', '/FamilySplitter/')).toBe(
      '/unknown',
    );
  });
});
