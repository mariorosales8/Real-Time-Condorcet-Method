// ==========================================
// MAIN — DOM wiring, Supabase, sync, rendering
// ==========================================
// This module ties together the pure logic modules (copeland, i18n,
// ballot, store) with the browser DOM.  Event handlers are exposed
// on `window` so that the HTML `onclick` attributes continue to work.
//
// NOT unit-tested.  Tested via integration / manual browser testing.

import { calculateCopelandScores } from './copeland.js';
import { parseCSV, createT, loadLang, saveLang } from './i18n.js';
import {
  buildBallotFromSimplified,
  buildBallotFromAdvanced,
  SIMPLIFIED_SCALE,
  OPPOSE_RANK,
  NEUTRAL_RANK,
} from './ballot.js';
import {
  loadDiscussions,
  saveDiscussions,
  createDiscussion,
  findDiscussion,
  addProposalToDiscussion,
  saveVoteToDiscussion,
  migrateVotes,
} from './store.js';

// ==========================================
// HELPERS
// ==========================================
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================
// TRANSLATIONS STATE
// ==========================================
let translations = {};
let currentLang = loadLang(localStorage);
let t = (key) => key; // placeholder, replaced once CSV is loaded

async function loadIntro(lang) {
  try {
    const response = await fetch(`intro_${lang}.html`);
    if (response.ok) {
      document.getElementById('intro-section').innerHTML =
        await response.text();
    }
  } catch (error) {
    console.error('Error loading introduction:', error);
  }
}

async function initTranslations() {
  try {
    const response = await fetch('translations.csv');
    if (!response.ok) throw new Error('Could not load CSV file');
    const csvContent = await response.text();
    translations = parseCSV(csvContent);
    t = createT(translations, currentLang);
    document.getElementById('lang-selector').value = currentLang;
    applyTranslations();
  } catch (error) {
    console.error('Error loading translations:', error);
  }
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = translated;
    } else {
      el.innerHTML = translated;
    }
  });
  updateUserDisplay();
  renderDiscussions();
  if (currentDiscussionId) {
    renderDiscussionDetail();
  }
}

window.changeLanguage = function (lang) {
  currentLang = lang;
  t = createT(translations, currentLang);
  saveLang(localStorage, lang);
  applyTranslations();
  loadIntro(lang);
};

// ==========================================
// SUPABASE
// ==========================================
const isLocal = ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(
    window.location.hostname
  );
  const SUPABASE_URL = isLocal
    ? 'http://localhost:54321'
    : 'https://mrlracnknvhvxpgumkzn.supabase.co';
const SUPABASE_KEY = isLocal
    ? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
    : 'sb_publishable_0GKO2lN7KJb6PRioZkQoJg_RvokuU3z';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// LOCAL STATE & USER
// ==========================================
let currentUser = null;
let currentSession = null;
let isSimplifiedMode =
  JSON.parse(localStorage.getItem('condorcet_voting_mode')) ?? true;
let discussions = loadDiscussions(localStorage);
let currentDiscussionId = null;

function updateUserDisplay() {
  if (currentSession) {
    document.getElementById('user-id-display').innerText =
      t('logged_in_as') + currentSession.user.email;
  } else if (currentUser) {
    document.getElementById('user-id-display').innerText =
      t('your_id') + currentUser;
  }
}

async function initializeUser() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    currentSession = data.session;
    currentUser = data.session.user.id;
    document.getElementById('logout-btn').classList.remove('hidden');
  } else {
    if (!localStorage.getItem('condorcet_user_id')) {
      localStorage.setItem(
        'condorcet_user_id',
        'Voter_' + Math.random().toString(36).substr(2, 5)
      );
    }
    currentUser = localStorage.getItem('condorcet_user_id');
  }
  updateUserDisplay();
}

// ==========================================
// CLOUD LOGIC
// ==========================================
function setSyncStatus(status) {
  const el = document.getElementById('sync-status');
  if (status === 'loading') {
    el.className = 'sync-loading';
    el.innerText = t('status_connecting');
  }
  if (status === 'ok') {
    el.className = 'sync-ok';
    el.innerText = t('status_updated');
  }
  if (status === 'error') {
    el.className = 'sync-error';
    el.innerText = t('status_error');
  }
}

window.signUp = async function () {
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) return alert(error.message);
  alert(t('alert_account_created'));
};

window.signIn = async function () {
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  const localUserId = localStorage.getItem('condorcet_user_id');
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return alert(error.message);
  currentSession = data.session;
  await migrateAnonymousVotes(localUserId, data.user.id);
  currentUser = data.user.id;
  updateUserDisplay();
  document.getElementById('logout-btn').classList.remove('hidden');
};

window.signOut = async function () {
  await supabaseClient.auth.signOut();
  currentSession = null;
  if (!localStorage.getItem('condorcet_user_id')) {
    localStorage.setItem(
      'condorcet_user_id',
      'Voter_' + Math.random().toString(36).substr(2, 5)
    );
  }
  currentUser = localStorage.getItem('condorcet_user_id');
  updateUserDisplay();
  document.getElementById('logout-btn').classList.add('hidden');
};

async function migrateAnonymousVotes(localUserId, authUserId) {
  await pullAndMergeData();
  migrateVotes(discussions, localUserId, authUserId);
  saveDiscussions(localStorage, discussions);
  localStorage.setItem('condorcet_user_id', authUserId);
  await pushDataToCloud();
}

async function pullAndMergeData() {
  setSyncStatus('loading');
  try {
    const { data, error } = await supabaseClient
      .from('assemblies')
      .select('data')
      .eq('id', 1)
      .single();
    if (error) throw error;
    if (data && data.data) {
      const cloudDiscussions = data.data;
      cloudDiscussions.forEach((cloudDisc) => {
        const localDisc = findDiscussion(discussions, cloudDisc.id);
        if (!localDisc) {
          discussions.push(cloudDisc);
        } else {
          cloudDisc.proposals.forEach((cloudProp) => {
            if (!localDisc.proposals.find((p) => p.id === cloudProp.id)) {
              localDisc.proposals.push(cloudProp);
            }
          });
          localDisc.ballots = { ...localDisc.ballots, ...cloudDisc.ballots };
        }
      });
      saveDiscussions(localStorage, discussions);
      renderDiscussions();
      if (currentDiscussionId) renderDiscussionDetail();
    }
    setSyncStatus('ok');
  } catch (e) {
    console.error(e);
    setSyncStatus('error');
  }
}

async function pushDataToCloud() {
  setSyncStatus('loading');
  try {
    await pullAndMergeData();
    const { error } = await supabaseClient
      .from('assemblies')
      .update({ data: discussions })
      .eq('id', 1);
    if (error) throw error;
    setSyncStatus('ok');
  } catch (e) {
    console.error(e);
    setSyncStatus('error');
    alert(t('alert_sync_error'));
  }
}

window.forceSync = async function () {
  await pullAndMergeData();
};

function openDiscussionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const discussionId = params.get('discussion');
  if (!discussionId) return;
  const disc = findDiscussion(discussions, discussionId);
  if (!disc) return;
  currentDiscussionId = discussionId;
  renderDiscussionDetail();
  showView('view-discussion-detail');
}

window.onload = async () => {
  await initTranslations();
  loadIntro(currentLang);
  await initializeUser();
  await pullAndMergeData();
  openDiscussionFromUrl();
};

// ==========================================
// UI HELPERS
// ==========================================
function showView(viewId) {
  document.getElementById('view-discussions').classList.add('hidden');
  document.getElementById('view-discussion-detail').classList.add('hidden');
  document.getElementById(viewId).classList.remove('hidden');
}

window.goBack = function () {
  currentDiscussionId = null;
  renderDiscussions();
  showView('view-discussions');
};

window.toggleIntro = function () {
  document.getElementById('intro-section').classList.toggle('hidden');
};

window.toggleDetails = function (propId) {
  document.getElementById('details-' + propId).classList.toggle('hidden');
};

window.toggleVotingMode = function () {
  isSimplifiedMode = document.getElementById('mode-toggle').checked;
  localStorage.setItem('condorcet_voting_mode', isSimplifiedMode);
  renderDiscussionDetail();
};

window.handleSimplifiedVote = function (checkbox) {
  if (checkbox.checked) {
    const container = checkbox.closest('.simplified-vote-options');
    container
      .querySelectorAll('input[type="checkbox"]')
      .forEach((cb) => {
        if (cb !== checkbox) cb.checked = false;
      });
  }
};

window.copyLink = function (id) {
  const url = location.origin + location.pathname + '?discussion=' + id;
  navigator.clipboard.writeText(url).then(() => {
    alert(t('link_copied'));
  }).catch(() => {
    prompt(t('alert_link'), url);
  });
};

window.openDiscussion = function (id) {
  currentDiscussionId = id;
  renderDiscussionDetail();
  showView('view-discussion-detail');
};

// ==========================================
// CREATE DISCUSSION
// ==========================================
window.createDiscussion = async function (isPrivate) {
  const titleInput = document.getElementById('new-discussion-title');
  const title = titleInput.value.trim();
  if (!title) return alert(t('alert_title'));

  const discussionId = createDiscussion(discussions, title, isPrivate);

  if (isPrivate) {
    copyLink(discussionId);
  }

  titleInput.value = '';
  saveDiscussions(localStorage, discussions);
  renderDiscussions();
  await pushDataToCloud();
};

function renderDiscussions() {
  const list = document.getElementById('discussions-list');
  list.innerHTML = '';
  if (discussions.length === 0) {
    list.innerHTML = `<p style="color:#64748b;">${t('no_active_disc')}</p>`;
    return;
  }

  const sorted = discussions
    .filter((d) => !d.isPrivate)
    .sort((a, b) => {
      const aVotes = Object.keys(a.ballots || {}).length;
      const bVotes = Object.keys(b.ballots || {}).length;
      return bVotes - aVotes;
    });

  sorted.forEach((disc) => {
    const votesCount = Object.keys(disc.ballots || {}).length;
    const div = document.createElement('div');
    div.className = 'card';
    const linkUrl = location.origin + location.pathname + '?discussion=' + disc.id;
    div.innerHTML =
      `<h3>${escapeHtml(disc.title)}</h3>` +
      `<p style="font-size:0.9em;color:#64748b;">` +
      `${t('proposals_count')} ${disc.proposals.length} | ` +
      `${t('votes_cast')} ${votesCount}</p>` +
      `<div style="display:flex;gap:8px;">` +
      `<button onclick="openDiscussion('${disc.id}')">${t('enter_assembly')}</button>` +
      `<button class="btn-secondary" onclick="copyLink('${disc.id}')">${t('btn_copy_link')}</button>` +
      `</div>`;
    list.appendChild(div);
  });
}

// ==========================================
// ADD PROPOSAL
// ==========================================
window.addProposal = async function () {
  const textInput = document.getElementById('new-proposal-text');
  const text = textInput.value.trim();
  if (!text) return;

  await pullAndMergeData();

  const disc = findDiscussion(discussions, currentDiscussionId);
  addProposalToDiscussion(disc, text, currentUser);

  textInput.value = '';
  saveDiscussions(localStorage, discussions);
  renderDiscussionDetail();

  setSyncStatus('loading');
  try {
    const { error } = await supabaseClient
      .from('assemblies')
      .update({ data: discussions })
      .eq('id', 1);
    if (error) throw error;
    setSyncStatus('ok');
  } catch (e) {
    console.error(e);
    setSyncStatus('error');
    alert(t('alert_sync_error'));
  }
};

// ==========================================
// SUBMIT VOTE
// ==========================================
window.submitVote = async function () {
  let userVote;

  if (isSimplifiedMode) {
    const selections = [];
    document.querySelectorAll('.proposal-item').forEach((item) => {
      const propId = item.getAttribute('data-id');
      const checkedBox = item.querySelector(
        '.simplified-vote-options input:checked'
      );
      selections.push({
        propId,
        selectedValue: checkedBox ? parseInt(checkedBox.value) : null,
      });
    });
    userVote = buildBallotFromSimplified(selections);
  } else {
    const inputValues = [];
    document.querySelectorAll('.vote-input').forEach((input) => {
      inputValues.push({
        propId: input.getAttribute('data-id'),
        rank: input.value,
      });
    });
    const defaultRankRaw = document.getElementById('default-rank-input').value;
    userVote = buildBallotFromAdvanced(inputValues, defaultRankRaw);
  }

  await pullAndMergeData();
  const disc = findDiscussion(discussions, currentDiscussionId);
  saveVoteToDiscussion(disc, currentUser, userVote);

  saveDiscussions(localStorage, discussions);
  renderDiscussionDetail();

  setSyncStatus('loading');
  try {
    const { error } = await supabaseClient
      .from('assemblies')
      .update({ data: discussions })
      .eq('id', 1);
    if (error) throw error;
    setSyncStatus('ok');
  } catch (e) {
    console.error(e);
    setSyncStatus('error');
    alert(t('alert_sync_error'));
  }
};

// ==========================================
// RENDER DISCUSSION DETAIL & RESULTS
// ==========================================
function renderDiscussionDetail() {
  const disc = findDiscussion(discussions, currentDiscussionId);
  if (!disc) return;
  document.getElementById('discussion-title').innerText = disc.title;
  document.getElementById('mode-toggle').checked = isSimplifiedMode;

  const ballotDesc = document.getElementById('ballot-desc');
  const defaultRankContainer = document.getElementById('default-rank-container');

  if (isSimplifiedMode) {
    ballotDesc.innerHTML = t('p_ballot_desc_simplified');
    defaultRankContainer.classList.add('hidden');
  } else {
    ballotDesc.innerHTML = t('p_ballot_desc');
    defaultRankContainer.classList.remove('hidden');
  }

  const list = document.getElementById('proposals-list');
  list.innerHTML = '';

  const myVoteData = disc.ballots[currentUser] || {};
  const myRanks =
    myVoteData.ranks !== undefined ? myVoteData.ranks : myVoteData;
  const myDefault =
    myVoteData.defaultRank !== undefined && myVoteData.defaultRank !== null
      ? myVoteData.defaultRank
      : '';

  document.getElementById('default-rank-input').value = myDefault;

  if (disc.proposals.length === 0) {
    list.innerHTML = `<p style="color:#64748b;">${t('no_proposals_yet')}</p>`;
  }

  disc.proposals.forEach((prop) => {
    const div = document.createElement('div');
    div.className = 'proposal-item';
    div.setAttribute('data-id', prop.id);
    const prevRank =
      myRanks[prop.id] !== undefined && myRanks[prop.id] !== null
        ? myRanks[prop.id]
        : '';

    let inputUI = '';
    if (isSimplifiedMode) {
      const scaleHtml = SIMPLIFIED_SCALE.map((item) => {
        const checked = prevRank === item.internal ? 'checked' : '';
        return (
          `<label class="sim-vote-lbl" title="Support Level: ${item.ui}">` +
          `<input type="checkbox" value="${item.internal}" ${checked} onchange="handleSimplifiedVote(this)">` +
          `<span>${item.ui}</span></label>`
        );
      }).join('');

      const rejectChecked = prevRank === OPPOSE_RANK ? 'checked' : '';

      inputUI =
        `<div class="simplified-vote-options">` +
        `<span class="vote-label-text">${t('lbl_support')}:</span>` +
        `<div class="vote-scale-group">${scaleHtml}</div>` +
        `<label class="sim-vote-lbl reject-lbl" title="Ranking ${OPPOSE_RANK}">` +
        `<input type="checkbox" value="${OPPOSE_RANK}" ${rejectChecked} onchange="handleSimplifiedVote(this)">` +
        `<span>${t('lbl_oppose')}</span></label></div>`;
    } else {
      inputUI = `<input type="number" min="1" class="vote-input" data-id="${prop.id}" value="${prevRank}" placeholder="-">`;
    }

    div.innerHTML =
      `<span style="font-weight:500;flex:1;min-width:200px;">${escapeHtml(prop.text)}</span>${inputUI}`;
    list.appendChild(div);
  });

  renderCondorcetResults(disc);
}

function renderCondorcetResults(disc) {
  const statusDiv = document.getElementById('condorcet-status');
  const leaderBoardDiv = document.getElementById('leaderboard-section');

  const scores = calculateCopelandScores(disc);

  if (disc.proposals.length === 0) {
    statusDiv.innerHTML =
      `<div class="status-banner status-paradox" style="margin:0;">${t('status_not_enough')}</div>`;
    leaderBoardDiv.innerHTML = '';
    return;
  }
  if (Object.keys(disc.ballots).length === 0) {
    statusDiv.innerHTML =
      `<div class="status-banner status-paradox" style="margin:0;">${t('status_waiting')}</div>`;
    leaderBoardDiv.innerHTML = '';
    return;
  }

  const { sortedProposals, leaders, highestScore, isPureCondorcet, winsCount, copelandPoints, matchups } = scores;
  const proposals = disc.proposals;

  if (leaders.length === 1) {
    const winner = leaders[0];
    const key = isPureCondorcet ? 'status_absolute' : 'status_leader';
    statusDiv.innerHTML =
      `<div class="status-banner status-winner">🏆 ${t(key)}:<br>` +
      `<span style="font-size:1.1em;" class="preserve-lines">${escapeHtml(winner.text)}</span></div>`;
  } else {
    statusDiv.innerHTML =
      `<div class="status-banner status-paradox">⚠️ ${t('status_paradox')} (${highestScore} ${t('pts')}).</div>`;
  }

  let html = `<h4 style="margin-bottom:10px;color:#334155;">${t('standings_table')}</h4>`;
  sortedProposals.forEach((p) => {
    const pts = copelandPoints[p.id];
    html +=
      `<div class="leaderboard-item">` +
      `<div class="leaderboard-header" onclick="toggleDetails('${p.id}')">` +
      `<div style="display:flex;align-items:center;width:90%;">` +
      `<div class="badge-container">` +
      `<span class="score-badge">${pts >= 0 ? '+' : ''}${pts} ${t('pts')}</span>` +
      `<span class="win-badge">${winsCount[p.id]} ${t('wins')}</span>` +
      `</div><span style="font-weight:500;" class="preserve-lines">${escapeHtml(p.text)}</span>` +
      `</div><span style="color:#94a3b8;font-size:0.8em;">▼</span></div>` +
      `<div id="details-${p.id}" class="matchup-details hidden">` +
      `<table class="matchup-table"><thead><tr>` +
      `<th>vs...</th><th>${t('for')}</th><th>${t('against')}</th><th>${t('result')}</th>` +
      `</tr></thead><tbody>`;

    if (proposals.length === 1) {
      html += `<tr><td colspan="4">${t('no_proposals_yet')}</td></tr>`;
    } else {
      proposals.forEach((op) => {
        if (op.id === p.id) return;
        const m = matchups[p.id][op.id];
        let resClass, resText;
        if (m.myScore > m.theirScore) {
          resClass = 'res-win';
          resText = t('res_won');
        } else if (m.myScore < m.theirScore) {
          resClass = 'res-loss';
          resText = t('res_lost');
        } else {
          resClass = 'res-tie';
          resText = t('res_tie');
        }
        html +=
          `<tr><td>${escapeHtml(op.text)}</td><td>${m.myScore}</td>` +
          `<td>${m.theirScore}</td><td class="${resClass}">${resText}</td></tr>`;
      });
    }
    html += '</tbody></table></div></div>';
  });
  leaderBoardDiv.innerHTML = html;
}
