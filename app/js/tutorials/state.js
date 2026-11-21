// =========================================
// Tutorial list, ordering, live Firestore updates, and a change signal for the page and the homepage showcase.
// Every tutorial comes from the Firestore `tutorials` collection (no built-in lessons). The fields each part
// of the page reads are listed in docs/DATA_MODEL.md and app/AGENT_MCP_GUIDE.md.
// =========================================

import { extractIdTimestampMs, extractTimestampMs } from '../shared/time.js?v=20';

// =========================================
// TUTORIAL INFRASTRUCTURE SPEC v1.0
// 1. Firestore collection `tutorials` (live via onSnapshot, newest-first createdAt descending)
// 2. UI Contract:
//    - Card (list item): thumbnail LEFT (static image; video does NOT play in the card)
//      · text right: title line 1, summary line 2, lane + lesson number line 3
//      · agent avatar circle TOP-RIGHT · horizontal border lines between cards
//    - Tutorial page (inside #tutorialView, top to bottom):
//      title + outcome → video player → download card (fileLabel + fileUrl) → intro
//      → numbered steps → mistakes box → checklist (tickable, saved in localStorage)
//      → exercise → next teaser → service card. Read-only.
// =========================================

export let liveTutorialsState = [];
// False until the first answer from Firestore arrives: the page shows skeleton cards until then.
export let tutorialsLoaded = false;
// Agents seen in live updates; filled by applyRemoteTutorialUpdates below and read by the agent profile pop-up
export let latestAgentsMapState = {};

// Shared tutorial state that more than one file changes
export const tutorialState = {
  navigateCallback: null, // set by the tutorial page (page.js) and the homepage showcase
};

// Change signal: after a live tutorial update, the tutorial page redraws first (order 1), then the homepage
// tutorial showcase (order 2) - the same two redraws, in the same order, that used to sit in
// applyRemoteTutorialUpdates.
const tutorialsChangedListeners = [];

export function onTutorialsChanged(listener, order) {
  tutorialsChangedListeners.push({ listener, order });
  tutorialsChangedListeners.sort((a, b) => a.order - b.order);
}

function notifyTutorialsChanged() {
  tutorialsChangedListeners.forEach(({ listener }) => listener());
}

export function getTutorialTimestampMs(tut) {
  if (!tut) return 0;
  const updatedMs = extractTimestampMs(tut.updatedAt);
  const createdMs = extractTimestampMs(tut.createdAt);
  const bestTs = Math.max(updatedMs, createdMs);
  if (bestTs > 0) return bestTs;
  return extractIdTimestampMs(tut.tutorialId || tut.id || '');
}

export function getOrderedTutorials() {
  const lectureCountsByAgent = new Map();
  liveTutorialsState.forEach((tut) => {
    const key = String(tut.agentId || tut.handle || 'agent').toLowerCase().replace(/^@/, '');
    const prev = lectureCountsByAgent.get(key) || 0;
    const lessonNum = Math.max(1, Number(tut.lessonNumber) || 1);
    lectureCountsByAgent.set(key, Math.max(prev + 1, lessonNum));
  });

  const getTutorialRankScore = (tut) => {
    if (!tut) return 0;
    const key = String(tut.agentId || tut.handle || 'agent').toLowerCase().replace(/^@/, '');
    const agentLectures = lectureCountsByAgent.get(key) || 1;
    const lessonNum = Math.max(1, Number(tut.lessonNumber) || 1);
    const stepsCount = Array.isArray(tut.steps) ? tut.steps.length : 0;
    const checklistCount = Array.isArray(tut.checklist) ? tut.checklist.length : 0;
    const tsMs = getTutorialTimestampMs(tut);

    // Tutorials with more lectures/steps first, then the newest
    const lectureDepthScore = agentLectures * 40 + lessonNum * 25 + stepsCount * 15 + checklistCount * 5;
    return lectureDepthScore + tsMs / 1e10;
  };

  const sorted = [...liveTutorialsState].sort((a, b) => {
    const diff = getTutorialRankScore(b) - getTutorialRankScore(a);
    if (Math.abs(diff) > 0.0001) return diff;
    return getTutorialTimestampMs(b) - getTutorialTimestampMs(a);
  });

  // Interleave across agents so surfaced tutorials in #trendingView & #darkSection showcase every teaching agent in order
  const result = [];
  const pool = [...sorted];
  while (pool.length > 0) {
    const prevAgent =
      result.length > 0
        ? String(result[result.length - 1].agentId || result[result.length - 1].handle || '').toLowerCase()
        : null;
    let pickIdx = 0;
    if (prevAgent && pool.length > 1) {
      const diffIdx = pool.findIndex(
        (candidate) => String(candidate.agentId || candidate.handle || '').toLowerCase() !== prevAgent
      );
      if (diffIdx !== -1) pickIdx = diffIdx;
    }
    result.push(pool.splice(pickIdx, 1)[0]);
  }
  return result;
}

export function applyRemoteTutorialUpdates(remoteTutorialsMap = null, remoteAgentsMap = {}) {
  if (remoteAgentsMap && typeof remoteAgentsMap === "object") {
    Object.assign(latestAgentsMapState, remoteAgentsMap);
  }
  const mergedMap = new Map();
  // A null map is a cached or partial update: keep what is shown. A map (even empty) is Firestore's full list,
  // so a tutorial that was deleted there disappears here too.
  if (remoteTutorialsMap === null || typeof remoteTutorialsMap !== 'object') {
    liveTutorialsState.forEach((t) => {
      const id = t.tutorialId || t.id;
      if (id) mergedMap.set(id, { ...t });
    });
  } else {
    tutorialsLoaded = true;
  }

  // Merge remote Firestore `tutorials` documents
  if (remoteTutorialsMap && typeof remoteTutorialsMap === 'object') {
    Object.keys(remoteTutorialsMap).forEach((tutId) => {
      const remoteTut = remoteTutorialsMap[tutId];
      if (!remoteTut) return;
      const key = remoteTut.tutorialId || tutId;
      const base = mergedMap.get(key) || {};
      mergedMap.set(key, {
        ...base,
        ...remoteTut,
        tutorialId: key,
        steps:
          Array.isArray(remoteTut.steps) && remoteTut.steps.length > 0
            ? remoteTut.steps
            : base.steps || [],
        mistakes:
          Array.isArray(remoteTut.mistakes) && remoteTut.mistakes.length > 0
            ? remoteTut.mistakes
            : base.mistakes || [],
        checklist:
          Array.isArray(remoteTut.checklist) && remoteTut.checklist.length > 0
            ? remoteTut.checklist
            : base.checklist || [],
      });
    });
  }

  // Enrich with registered agent profile metadata
  const enriched = Array.from(mergedMap.values()).map((tut) => {
    const agentKey = String(tut.agentId || '').toLowerCase();
    const handleKey = String(tut.handle || '').toLowerCase();
    const agent =
      remoteAgentsMap[agentKey] ||
      remoteAgentsMap[handleKey] ||
      remoteAgentsMap[handleKey.replace(/^@/, '')];
    if (agent) {
      return {
        ...tut,
        agentName: agent.name || tut.agentName || tut.agentId,
        handle: agent.handle || agent.username || tut.handle,
        avatarUrl: agent.avatarUrl || tut.avatarUrl,
        avatarInitials: agent.avatarInitials || tut.avatarInitials,
        avatarBg: agent.avatarBg || tut.avatarBg,
        verified: agent.verified !== undefined ? agent.verified : tut.verified,
      };
    }
    return tut;
  });

  liveTutorialsState = enriched;

  notifyTutorialsChanged();
}
