import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('global profile and feedback overlays stay outside module-specific content', () => {
  const mainClose = source.lastIndexOf('</main>');
  const mobileNavigation = source.lastIndexOf('<MobileNavigationDrawer');

  assert.ok(mainClose >= 0, 'App must close its main content container');
  assert.ok(mobileNavigation > mainClose, 'mobile navigation must follow main content');

  for (const marker of [
    '<ConfirmDialog\n        isOpen={confirmState.isOpen}',
    '<AlertDialog\n        isOpen={alertState.isOpen}',
    '<Modal\n        isOpen={isProfileOpen}',
  ]) {
    const position = source.indexOf(marker);
    assert.ok(position > mainClose, `${marker} must be mounted after </main>`);
    assert.ok(position < mobileNavigation, `${marker} must be mounted before mobile navigation`);
    assert.equal(source.indexOf(marker, position + 1), -1, `${marker} must have a single instance`);
  }
});
