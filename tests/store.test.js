import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadDiscussions,
  saveDiscussions,
  createDiscussion,
  findDiscussion,
  addProposalToDiscussion,
  saveVoteToDiscussion,
  migrateVotes,
  generateDiscussionId,
  generateProposalId,
} from '../src/store.js';

function makeStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    _data: data,
  };
}

describe('loadDiscussions', () => {
  it('returns an empty array when nothing is stored', () => {
    const storage = makeStorage();
    expect(loadDiscussions(storage)).toEqual([]);
  });

  it('returns parsed discussions from storage', () => {
    const storage = makeStorage();
    const disc = [{ id: 'd1', title: 'Test', proposals: [], ballots: {} }];
    storage.setItem('condorcet_data_en', JSON.stringify(disc));
    expect(loadDiscussions(storage)).toEqual(disc);
  });

  it('returns empty array on corrupt JSON', () => {
    const storage = makeStorage();
    storage.setItem('condorcet_data_en', 'not-json');
    expect(loadDiscussions(storage)).toEqual([]);
  });
});

describe('saveDiscussions', () => {
  it('persists discussions to storage', () => {
    const storage = makeStorage();
    const disc = [{ id: 'd1', title: 'T' }];
    saveDiscussions(storage, disc);
    expect(storage._data.get('condorcet_data_en')).toBe(JSON.stringify(disc));
  });
});

describe('createDiscussion', () => {
  it('appends a new discussion and returns its id', () => {
    const discussions = [];
    const id = createDiscussion(discussions, 'My Discussion', false);
    expect(id).toMatch(/^disc_/);
    expect(discussions).toHaveLength(1);
    expect(discussions[0].title).toBe('My Discussion');
    expect(discussions[0].isPrivate).toBe(false);
    expect(discussions[0].proposals).toEqual([]);
    expect(discussions[0].ballots).toEqual({});
  });

  it('creates a private discussion', () => {
    const discussions = [];
    createDiscussion(discussions, 'Secret', true);
    expect(discussions[0].isPrivate).toBe(true);
  });
});

describe('findDiscussion', () => {
  it('finds an existing discussion by id', () => {
    const discussions = [{ id: 'd1', title: 'One' }];
    expect(findDiscussion(discussions, 'd1')).toEqual(discussions[0]);
  });

  it('returns undefined for unknown id', () => {
    expect(findDiscussion([], 'nope')).toBeUndefined();
  });
});

describe('addProposalToDiscussion', () => {
  it('adds a proposal and auto-ranks it #1 for the user', () => {
    const disc = { proposals: [], ballots: {} };
    const propId = addProposalToDiscussion(disc, 'My proposal', 'user1');
    expect(propId).toMatch(/^prop_/);
    expect(disc.proposals).toHaveLength(1);
    expect(disc.proposals[0].text).toBe('My proposal');
    expect(disc.ballots['user1'].ranks[propId]).toBe(1);
  });

  it('upgrades a legacy flat ballot when adding a proposal', () => {
    const disc = {
      proposals: [],
      ballots: { user1: { oldProp: '2' } },
    };
    const propId = addProposalToDiscussion(disc, 'New prop', 'user1');
    // Should have been upgraded to { defaultRank, ranks }
    expect(disc.ballots['user1'].ranks.oldProp).toBe('2');
    expect(disc.ballots['user1'].ranks[propId]).toBe(1);
    expect(disc.ballots['user1'].defaultRank).toBeNull();
  });

  it('preserves existing modern ballot when adding a proposal', () => {
    const disc = {
      proposals: [],
      ballots: { user1: { defaultRank: 5, ranks: { oldProp: 3 } } },
    };
    const propId = addProposalToDiscussion(disc, 'New prop', 'user1');
    expect(disc.ballots['user1'].ranks.oldProp).toBe(3);
    expect(disc.ballots['user1'].ranks[propId]).toBe(1);
    expect(disc.ballots['user1'].defaultRank).toBe(5);
  });
});

describe('saveVoteToDiscussion', () => {
  it('saves a vote into the discussion ballots', () => {
    const disc = { ballots: {} };
    const vote = { defaultRank: 3, ranks: { A: 1, B: 2 } };
    saveVoteToDiscussion(disc, 'user1', vote);
    expect(disc.ballots['user1']).toEqual(vote);
  });
});

describe('migrateVotes', () => {
  it('moves votes from anonymous to authenticated user', () => {
    const discussions = [
      {
        id: 'd1',
        ballots: {
          'Voter_abc': { defaultRank: null, ranks: { A: 1 } },
          'other_user': { defaultRank: null, ranks: { A: 2 } },
        },
      },
    ];
    migrateVotes(discussions, 'Voter_abc', 'uuid-123');
    expect(discussions[0].ballots['uuid-123']).toEqual({
      defaultRank: null,
      ranks: { A: 1 },
    });
    expect(discussions[0].ballots['Voter_abc']).toBeUndefined();
    expect(discussions[0].ballots['other_user']).toBeDefined();
  });

  it('does nothing when the from-user has no votes', () => {
    const discussions = [
      { id: 'd1', ballots: {} },
    ];
    migrateVotes(discussions, 'Voter_xyz', 'uuid-456');
    expect(discussions[0].ballots).toEqual({});
  });
});

describe('ID generators', () => {
  it('generateDiscussionId produces unique prefixed ids', () => {
    const a = generateDiscussionId();
    const b = generateDiscussionId();
    expect(a).toMatch(/^disc_/);
    expect(a).not.toBe(b);
  });

  it('generateProposalId produces unique prefixed ids', () => {
    const a = generateProposalId();
    const b = generateProposalId();
    expect(a).toMatch(/^prop_/);
    expect(a).not.toBe(b);
  });
});
