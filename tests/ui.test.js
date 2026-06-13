import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('discussion detail copy link button', () => {
  it('uses the global copyLink handler without an undefined currentDiscussionId argument', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

    expect(html).toContain('onclick="copyLink()"');
    expect(html).not.toContain('onclick="copyLink(currentDiscussionId)"');
  });
});
