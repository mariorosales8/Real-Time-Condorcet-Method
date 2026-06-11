import { describe, it, expect } from 'vitest';
import {
  buildBallotFromSimplified,
  buildBallotFromAdvanced,
  normaliseBallot,
  uiToInternal,
  internalToUI,
  SIMPLIFIED_SCALE,
  OPPOSE_RANK,
  NEUTRAL_RANK,
} from '../src/ballot.js';

describe('uiToInternal', () => {
  it('maps UI 5 → internal 1', () => {
    expect(uiToInternal(5)).toBe(1);
  });

  it('maps UI 1 → internal 5', () => {
    expect(uiToInternal(1)).toBe(5);
  });

  it('maps UI 3 → internal 3', () => {
    expect(uiToInternal(3)).toBe(3);
  });

  it('returns null for unknown values', () => {
    expect(uiToInternal(99)).toBeNull();
  });
});

describe('internalToUI', () => {
  it('maps internal 1 → UI 5', () => {
    expect(internalToUI(1)).toBe(5);
  });

  it('returns null for unknown values', () => {
    expect(internalToUI(99)).toBeNull();
  });
});

describe('SIMPLIFIED_SCALE', () => {
  it('has 5 entries covering UI 1–5', () => {
    expect(SIMPLIFIED_SCALE).toHaveLength(5);
    const uiValues = SIMPLIFIED_SCALE.map((s) => s.ui).sort();
    expect(uiValues).toEqual([1, 2, 3, 4, 5]);
  });

  it('maps each UI value to a unique internal rank', () => {
    const internalValues = SIMPLIFIED_SCALE.map((s) => s.internal);
    expect(new Set(internalValues).size).toBe(5);
  });
});

describe('buildBallotFromSimplified', () => {
  it('builds ranks from selected internal values', () => {
    const selections = [
      { propId: 'A', selectedValue: 1 }, // UI 5, most support
      { propId: 'B', selectedValue: 5 }, // UI 1, least support
      { propId: 'C', selectedValue: null }, // neutral
    ];
    const ballot = buildBallotFromSimplified(selections);
    expect(ballot.defaultRank).toBe(NEUTRAL_RANK);
    expect(ballot.ranks['A']).toBe(1);
    expect(ballot.ranks['B']).toBe(5);
    expect(ballot.ranks['C']).toBe(NEUTRAL_RANK);
  });

  it('handles oppose selection', () => {
    const selections = [
      { propId: 'A', selectedValue: OPPOSE_RANK },
    ];
    const ballot = buildBallotFromSimplified(selections);
    expect(ballot.ranks['A']).toBe(OPPOSE_RANK);
  });

  it('assigns neutral to all unchecked proposals', () => {
    const selections = [
      { propId: 'A', selectedValue: null },
      { propId: 'B', selectedValue: null },
    ];
    const ballot = buildBallotFromSimplified(selections);
    expect(ballot.ranks['A']).toBe(NEUTRAL_RANK);
    expect(ballot.ranks['B']).toBe(NEUTRAL_RANK);
  });
});

describe('buildBallotFromAdvanced', () => {
  it('parses numeric ranks from input values', () => {
    const inputs = [
      { propId: 'A', rank: '1' },
      { propId: 'B', rank: '2' },
      { propId: 'C', rank: '3' },
    ];
    const ballot = buildBallotFromAdvanced(inputs, '');
    expect(ballot.ranks['A']).toBe(1);
    expect(ballot.ranks['B']).toBe(2);
    expect(ballot.ranks['C']).toBe(3);
  });

  it('sets defaultRank from raw input', () => {
    const ballot = buildBallotFromAdvanced([], '5');
    expect(ballot.defaultRank).toBe(5);
  });

  it('sets null for empty default rank input', () => {
    const ballot = buildBallotFromAdvanced([], '');
    expect(ballot.defaultRank).toBeNull();
  });

  it('sets null for empty individual ranks', () => {
    const inputs = [{ propId: 'A', rank: '' }];
    const ballot = buildBallotFromAdvanced(inputs, '');
    expect(ballot.ranks['A']).toBeNull();
  });
});

describe('normaliseBallot', () => {
  it('passes through modern format unchanged', () => {
    const modern = { defaultRank: 3, ranks: { A: 1, B: 2 } };
    const result = normaliseBallot(modern);
    expect(result).toEqual({ defaultRank: 3, ranks: { A: 1, B: 2 } });
  });

  it('converts legacy flat format to modern shape', () => {
    const legacy = { A: 1, B: 2, C: 3 };
    const result = normaliseBallot(legacy);
    expect(result).toEqual({
      defaultRank: null,
      ranks: { A: 1, B: 2, C: 3 },
    });
  });
});
