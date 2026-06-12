import { describe, it, expect } from 'vitest';
import { calculateCopelandScores } from '../src/copeland.js';

function mkDisc(proposals, ballots) {
  return { proposals, ballots };
}

function mkProp(id) {
  return { id, text: `Proposal ${id}` };
}

function mkBallot(ranks, defaultRank) {
  return { defaultRank: defaultRank !== undefined ? defaultRank : null, ranks };
}

function mkLegacyBallot(map) {
  return map;
}

describe('calculateCopelandScores', () => {
  it('returns empty results when there are no proposals', () => {
    const result = calculateCopelandScores(mkDisc([], { u1: mkBallot({}) }));
    expect(result.sortedProposals).toEqual([]);
    expect(result.leaders).toEqual([]);
    expect(result.isPureCondorcet).toBeNull();
  });

  it('returns empty results when there are no ballots', () => {
    const result = calculateCopelandScores(
      mkDisc([mkProp('A'), mkProp('B')], {})
    );
    expect(result.leaders).toEqual([]);
    expect(result.isPureCondorcet).toBeNull();
  });

  it('declares the only proposal as winner', () => {
    const result = calculateCopelandScores(
      mkDisc(
        [mkProp('A')],
        { u1: mkBallot({ A: 1 }), u2: mkBallot({ A: 1 }) }
      )
    );
    expect(result.sortedProposals[0].id).toBe('A');
    expect(result.leaders).toHaveLength(1);
    expect(result.leaders[0].id).toBe('A');
    expect(result.isPureCondorcet).toBe(true);
  });

  it('finds a clear Condorcet winner among three proposals', () => {
    // A beats B (2-1), A beats C (2-1) → A is Condorcet winner
    const ballots = {
      u1: mkBallot({ A: 1, B: 2, C: 3 }),
      u2: mkBallot({ A: 1, C: 2, B: 3 }),
      u3: mkBallot({ B: 1, C: 2, A: 3 }),
    };
    const result = calculateCopelandScores(
      mkDisc([mkProp('A'), mkProp('B'), mkProp('C')], ballots)
    );
    expect(result.leaders).toHaveLength(1);
    expect(result.leaders[0].id).toBe('A');
    expect(result.isPureCondorcet).toBe(true);
    expect(result.copelandPoints['A']).toBe(2);
    expect(result.winsCount['A']).toBe(2);
  });

  it('detects a Condorcet paradox (cycle)', () => {
    // A > B (2-1), B > C (2-1), C > A (2-1) → cycle
    const ballots = {
      u1: mkBallot({ A: 1, B: 2, C: 3 }),
      u2: mkBallot({ B: 1, C: 2, A: 3 }),
      u3: mkBallot({ C: 1, A: 2, B: 3 }),
    };
    const result = calculateCopelandScores(
      mkDisc([mkProp('A'), mkProp('B'), mkProp('C')], ballots)
    );
    expect(result.leaders.length).toBeGreaterThan(1);
    expect(result.isPureCondorcet).toBeNull();
    // In a perfect cycle, everyone has the same Copeland score (0)
    expect(result.copelandPoints['A']).toBe(result.copelandPoints['B']);
    expect(result.copelandPoints['B']).toBe(result.copelandPoints['C']);
  });

  it('handles a Copeland winner that is not a pure Condorcet winner', () => {
    // A beats B (2-1), A ties C (1-1, +1 default), B loses to C (1-2)
    // A: beats B (+1), ties C (0) → Copeland +1, winsCount 1
    // B: loses to A (-1), loses to C (-1) → Copeland -2, winsCount 0
    // C: ties A (0), beats B (+1) → Copeland +1, winsCount 1
    //
    // A and C tie on Copeland score, but A wins tiebreaker by win count?
    // Actually they tie on winsCount too (both 1).  Let's design a case
    // where A is the sole Copeland leader but not a pure Condorcet winner.
    //
    // u1: A=1, B=2, C=1   (A=C > B)
    // u2: A=1, B=2, C=3   (A > B > C)
    // u3: B=1, C=2, A=3   (B > C > A)
    //
    // A vs B: u1(A<B), u2(A<B), u3(B<A) → A=2, B=1  → A wins
    // A vs C: u1(tie 1=1), u2(A<C), u3(C<A) → A=1, C=1 → tie
    // B vs C: u1(C<B), u2(B<C), u3(B<C) → B=1, C=2  → C wins
    //
    // Copeland: A=+1, B=-2 (loses both), C=+0
    const ballots = {
      u1: mkBallot({ A: 1, B: 2, C: 1 }),
      u2: mkBallot({ A: 1, B: 2, C: 3 }),
      u3: mkBallot({ B: 1, C: 2, A: 3 }),
    };
    const result = calculateCopelandScores(
      mkDisc([mkProp('A'), mkProp('B'), mkProp('C')], ballots)
    );
    expect(result.leaders).toHaveLength(1);
    expect(result.leaders[0].id).toBe('A');
    expect(result.isPureCondorcet).toBe(false);  // A tied C
  });

  it('handles tied rankings within a single ballot', () => {
    // u1 ties A and B; u2 prefers B
    const ballots = {
      u1: mkBallot({ A: 1, B: 1 }),
      u2: mkBallot({ B: 1, A: 2 }),
    };
    const result = calculateCopelandScores(
      mkDisc([mkProp('A'), mkProp('B')], ballots)
    );
    expect(result.leaders).toHaveLength(1);
    expect(result.leaders[0].id).toBe('B');
    // B beats A 1-0 (u1's tie doesn't count for either)
    expect(result.matchups['B']['A']).toEqual({ myScore: 1, theirScore: 0 });
  });

  it('uses defaultRank when a proposal is not explicitly ranked', () => {
    // u1 ranks A=1, leaves B unranked → B gets defaultRank=3
    const ballots = {
      u1: mkBallot({ A: 1 }, 3),
    };
    const result = calculateCopelandScores(
      mkDisc([mkProp('A'), mkProp('B')], ballots)
    );
    // A(1) < B(3), so A beats B
    expect(result.matchups['A']['B']).toEqual({ myScore: 1, theirScore: 0 });
    expect(result.leaders[0].id).toBe('A');
  });

  it('uses Infinity when proposal is unranked and no defaultRank set', () => {
    const ballots = {
      u1: mkBallot({ A: 1 }, null),
    };
    const result = calculateCopelandScores(
      mkDisc([mkProp('A'), mkProp('B')], ballots)
    );
    // A(1) < B(Infinity), so A beats B
    expect(result.matchups['A']['B']).toEqual({ myScore: 1, theirScore: 0 });
  });

  it('handles legacy flat ballot format (no .ranks wrapper)', () => {
    // Legacy: { A: 1, B: 2 } instead of { ranks: { A: 1, B: 2 } }
    const ballots = {
      u1: mkLegacyBallot({ A: 1, B: 2 }),
      u2: mkLegacyBallot({ A: 2, B: 1 }),
    };
    const result = calculateCopelandScores(
      mkDisc([mkProp('A'), mkProp('B')], ballots)
    );
    expect(result.matchups['A']['B']).toEqual({ myScore: 1, theirScore: 1 });
  });

  it('handles mixed modern and legacy ballot formats', () => {
    const ballots = {
      u1: mkBallot({ A: 1, B: 2, C: 3 }),
      u2: mkLegacyBallot({ A: 3, B: 1, C: 2 }),
    };
    const result = calculateCopelandScores(
      mkDisc([mkProp('A'), mkProp('B'), mkProp('C')], ballots)
    );
    // A beats C 1-1 tie... let's just verify it doesn't crash
    expect(result.sortedProposals).toHaveLength(3);
    expect(result.leaders).toBeDefined();
  });

  it('computes correct pairwise scores with multiple voters', () => {
    // 3 voters: 2 prefer A>B, 1 prefers B>A
    const ballots = {
      u1: mkBallot({ A: 1, B: 2 }),
      u2: mkBallot({ A: 1, B: 2 }),
      u3: mkBallot({ B: 1, A: 2 }),
    };
    const result = calculateCopelandScores(
      mkDisc([mkProp('A'), mkProp('B')], ballots)
    );
    expect(result.matchups['A']['B']).toEqual({ myScore: 2, theirScore: 1 });
    expect(result.matchups['B']['A']).toEqual({ myScore: 1, theirScore: 2 });
    expect(result.winsCount['A']).toBe(1);
    expect(result.winsCount['B']).toBe(0);
  });
});
