// ==========================================
// COPELAND / CONDORCET ALGORITHM
// ==========================================
// This module provides a pure scoring function: given a discussion
// with proposals and ballots, it returns computed Copeland scores,
// pairwise matchups, and sorted leaderboard data.  It does NOT touch
// the DOM — rendering is handled by callers.

/**
 * Compute Copeland scores, pairwise matchups, and determine the winner
 * (or winners in case of a tie / Condorcet paradox).
 *
 * @param {{ proposals: Array<{id: string}>, ballots: Object<string, Object> }} disc
 *   - `proposals`: array of proposal objects, each with at least an `id`.
 *   - `ballots`: object keyed by userId.  Each value is either a flat object
 *     mapping proposalId→rank (legacy format) or an object with shape
 *     `{ defaultRank: number|null, ranks: { [proposalId]: number|null } }`
 * @returns {{
 *   copelandPoints: Object<string,number>,
 *   winsCount:       Object<string,number>,
 *   matchups:        Object<string,Object<string,{myScore:number,theirScore:number}>>,
 *   sortedProposals: Array<{id:string}>,
 *   leaders:         Array<{id:string}>,
 *   highestScore:    number,
 *   isPureCondorcet: boolean|null
 * }}
 */
export function calculateCopelandScores(disc) {
  const proposals = disc.proposals;
  const n = proposals.length;
  const ballotValues = Object.values(disc.ballots);

  // Short-circuit when there is nothing to compute.
  if (n === 0) {
    return {
      copelandPoints: {},
      winsCount: {},
      matchups: {},
      sortedProposals: [],
      leaders: [],
      highestScore: 0,
      isPureCondorcet: null,
    };
  }
  if (ballotValues.length === 0) {
    return {
      copelandPoints: {},
      winsCount: {},
      matchups: {},
      sortedProposals: [],
      leaders: [],
      highestScore: 0,
      isPureCondorcet: null,
    };
  }

  const copelandPoints = {};
  const winsCount = {};
  const matchups = {};

  proposals.forEach((p) => {
    copelandPoints[p.id] = 0;
    winsCount[p.id] = 0;
    matchups[p.id] = {};
  });

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const p1 = proposals[i].id;
      const p2 = proposals[j].id;
      let p1Score = 0;
      let p2Score = 0;

      ballotValues.forEach((voteData) => {
        const r1 = resolveRank(voteData, p1);
        const r2 = resolveRank(voteData, p2);
        if (r1 < r2) p1Score++;
        else if (r2 < r1) p2Score++;
      });

      matchups[p1][p2] = { myScore: p1Score, theirScore: p2Score };
      matchups[p2][p1] = { myScore: p2Score, theirScore: p1Score };

      if (p1Score > p2Score) {
        copelandPoints[p1] += 1;
        copelandPoints[p2] -= 1;
        winsCount[p1]++;
      } else if (p2Score > p1Score) {
        copelandPoints[p2] += 1;
        copelandPoints[p1] -= 1;
        winsCount[p2]++;
      }
    }
  }

  const sortedProposals = [...proposals].sort(
    (a, b) => copelandPoints[b.id] - copelandPoints[a.id]
  );
  const highestScore = copelandPoints[sortedProposals[0].id];
  const leaders = sortedProposals.filter(
    (p) => copelandPoints[p.id] === highestScore
  );

  let isPureCondorcet = null;
  if (leaders.length === 1) {
    isPureCondorcet = winsCount[leaders[0].id] === n - 1;
  }

  return {
    copelandPoints,
    winsCount,
    matchups,
    sortedProposals,
    leaders,
    highestScore,
    isPureCondorcet,
  };
}

/**
 * Resolve a voter's rank for a specific proposal, considering the two
 * ballot-storage formats (legacy flat object vs. modern {ranks, defaultRank}).
 * @param {Object} voteData
 * @param {string} proposalId
 * @returns {number}  Lower = higher preference.  Infinity = unranked.
 */
function resolveRank(voteData, proposalId) {
  if (voteData.ranks !== undefined) {
    // Modern format
    const explicit = voteData.ranks[proposalId];
    if (explicit !== null && explicit !== undefined) return explicit;
    const def = voteData.defaultRank;
    return def !== null && def !== undefined ? def : Infinity;
  }
  // Legacy flat format
  const legacy = voteData[proposalId];
  return legacy !== null && legacy !== undefined ? legacy : Infinity;
}
