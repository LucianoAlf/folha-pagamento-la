import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const groupsSource = readFileSync(new URL('./NavigationGroups.tsx', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

test('NavigationGroups usa button disabled nativo e nome acessivel para Em breve', () => {
  assert.match(groupsSource, /disabled=\{item\.status === 'future'\}/);
  assert.match(groupsSource, /item\.status === 'future'.*Em breve/s);
  assert.match(groupsSource, /aria-label=\{accessibleLabel\}/);
  assert.match(groupsSource, /if \(!item\.destination\) return/);
});

test('Sidebar usa o renderer compartilhado e nao conserva modo drawer legado', () => {
  assert.match(sidebarSource, /<NavigationGroups/);
  assert.match(sidebarSource, /useFeriasNavigationBadge/);
  assert.doesNotMatch(sidebarSource, /isMobileDrawer/);
  assert.doesNotMatch(sidebarSource, /onCloseMobileDrawer/);
  assert.doesNotMatch(sidebarSource, /const modules = useMemo/);
  assert.match(sidebarSource, /la-music-sidebar-collapsed/);
});
