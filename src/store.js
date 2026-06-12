// ==========================================
// LOCAL STATE — Discussions store
// ==========================================
// Pure functions operating on the discussions array, plus localStorage
// persistence.  The store is intentionally agnostic about how data is
// synchronised with the cloud — that is the caller's concern.

const STORAGE_KEY = 'condorcet_data_en';

/**
 * Load discussions from localStorage (or return the default empty array).
 * @param {Storage} storage
 * @returns {Array}
 */
export function loadDiscussions(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
}

/**
 * Persist discussions to localStorage.
 * @param {Storage} storage
 * @param {Array} discussions
 */
export function saveDiscussions(storage, discussions) {
  storage.setItem(STORAGE_KEY, JSON.stringify(discussions));
}

/**
 * Generate a unique discussion id.
 * @returns {string}
 */
export function generateDiscussionId() {
  return 'disc_' + Math.random().toString(36).substring(2) + Date.now();
}

/**
 * Generate a unique proposal id.
 * @returns {string}
 */
let _propIdCounter = 0;
export function generateProposalId() {
  _propIdCounter++;
  return 'prop_' + Date.now() + '_' + _propIdCounter;
}

/**
 * Create a new discussion and append it to the list.
 * @param {Array} discussions — mutable array (caller owns it)
 * @param {string} title
 * @param {boolean} isPrivate
 * @returns {string} the new discussion id
 */
export function createDiscussion(discussions, title, isPrivate) {
  const id = generateDiscussionId();
  discussions.push({ id, title, proposals: [], ballots: {}, isPrivate });
  return id;
}

/**
 * Find a discussion by id.
 * @param {Array} discussions
 * @param {string} id
 * @returns {Object|undefined}
 */
export function findDiscussion(discussions, id) {
  return discussions.find((d) => d.id === id);
}

/**
 * Add a proposal to a discussion and auto-rank it #1 for the given user.
 * Mutates the discussion in place.
 *
 * @param {Object} disc — the discussion object (mutated)
 * @param {string} text — proposal text
 * @param {string} userId
 * @returns {string} the new proposal id
 */
export function addProposalToDiscussion(disc, text, userId) {
  const propId = generateProposalId();
  disc.proposals.push({ id: propId, text });

  if (!disc.ballots[userId]) {
    disc.ballots[userId] = { defaultRank: null, ranks: {} };
  } else if (disc.ballots[userId].ranks === undefined) {
    // Upgrade legacy flat ballot to modern shape
    const old = { ...disc.ballots[userId] };
    disc.ballots[userId] = { defaultRank: null, ranks: old };
  }

  disc.ballots[userId].ranks[propId] = 1;
  return propId;
}

/**
 * Save a user's vote into a discussion.
 * Mutates the discussion in place.
 *
 * @param {Object} disc
 * @param {string} userId
 * @param {{ defaultRank: number|null, ranks: Object<string,number|null> }} vote
 */
export function saveVoteToDiscussion(disc, userId, vote) {
  disc.ballots[userId] = vote;
}

/**
 * Migrate votes from an anonymous user-id to an authenticated one.
 * Mutates every discussion in place.
 *
 * @param {Array} discussions
 * @param {string} fromUserId — the anonymous "Voter_xxxxx" id
 * @param {string} toUserId   — the authenticated UUID
 */
export function migrateVotes(discussions, fromUserId, toUserId) {
  discussions.forEach((disc) => {
    if (!disc.ballots[fromUserId]) return;
    disc.ballots[toUserId] = structuredClone(disc.ballots[fromUserId]);
    delete disc.ballots[fromUserId];
  });
}
