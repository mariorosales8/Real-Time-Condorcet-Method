// ==========================================
// BALLOT CONSTRUCTION
// ==========================================
// Pure helpers that build a vote object from UI state.  The callers
// (in main.js) are responsible for reading DOM values and passing
// them in as plain data, so these functions can be unit-tested
// without a browser.

/**
 * Scale values mapping for the simplified voting mode.
 * UI value 5 ("a lot")  → internal rank 1 (most preferred).
 * UI value 1 ("a bit")  → internal rank 5.
 * "Oppose"              → internal rank 7.
 * Unanswered            → internal rank 6 (neutral).
 */
export const SIMPLIFIED_SCALE = [
  { ui: 1, internal: 5 },
  { ui: 2, internal: 4 },
  { ui: 3, internal: 3 },
  { ui: 4, internal: 2 },
  { ui: 5, internal: 1 },
];

export const OPPOSE_RANK = 7;
export const NEUTRAL_RANK = 6;

/**
 * Convert a UI scale value (1–5) to the internal rank used for Copeland.
 * @param {number} uiValue
 * @returns {number|null}
 */
export function uiToInternal(uiValue) {
  const entry = SIMPLIFIED_SCALE.find((s) => s.ui === uiValue);
  return entry ? entry.internal : null;
}

/**
 * Convert an internal rank back to the UI scale value.
 * @param {number} internalRank
 * @returns {number|null}
 */
export function internalToUI(internalRank) {
  const entry = SIMPLIFIED_SCALE.find((s) => s.internal === internalRank);
  return entry ? entry.ui : null;
}

/**
 * Build a ballot from simplified-mode UI selections.
 *
 * @param {Array<{ propId: string, selectedValue: number|null }>} selections
 *   One entry per proposal.  `selectedValue` is the internal rank
 *   value (1–5 from scale, 7 for oppose), or null if nothing was checked.
 * @returns {{ defaultRank: number, ranks: Object<string,number> }}
 */
export function buildBallotFromSimplified(selections) {
  const ranks = {};
  for (const sel of selections) {
    ranks[sel.propId] =
      sel.selectedValue !== null ? sel.selectedValue : NEUTRAL_RANK;
  }
  return { defaultRank: NEUTRAL_RANK, ranks };
}

/**
 * Build a ballot from advanced-mode (numeric) inputs.
 *
 * @param {Array<{ propId: string, rank: string }>} inputValues
 *   `rank` is the raw input value (empty string = undefined).
 * @param {string} defaultRankRaw — raw value from the default-rank input.
 * @returns {{ defaultRank: number|null, ranks: Object<string,number|null> }}
 */
export function buildBallotFromAdvanced(inputValues, defaultRankRaw) {
  const defaultRank =
    defaultRankRaw === '' ? null : parseInt(defaultRankRaw, 10);
  const ranks = {};
  for (const iv of inputValues) {
    ranks[iv.propId] = iv.rank === '' ? null : parseInt(iv.rank, 10);
  }
  return { defaultRank, ranks };
}

/**
 * Normalise a ballot value that might be in legacy flat format
 * ({ propA: 1, propB: 2 }) into the modern shape
 * ({ defaultRank: null, ranks: { propA: 1, propB: 2 } }).
 *
 * @param {Object} ballot
 * @returns {{ defaultRank: number|null, ranks: Object<string,number|null> }}
 */
export function normaliseBallot(ballot) {
  if (ballot.ranks !== undefined) {
    return { defaultRank: ballot.defaultRank, ranks: { ...ballot.ranks } };
  }
  // Legacy flat format — all keys are proposal IDs.
  const ranks = {};
  for (const [key, val] of Object.entries(ballot)) {
    ranks[key] = val;
  }
  return { defaultRank: null, ranks };
}
