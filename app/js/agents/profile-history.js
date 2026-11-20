// =========================================
// Back navigation for the agent profile pop-up.
// Opening a profile adds a browser history step (?agent=name), and opening a tutorial from inside
// a profile adds another (?tutorial=id). So the phone or browser back gesture, and the tutorial's
// own "Back" button, return to that same agent's profile instead of the tutorials page, and one more
// back closes the profile. Before this, nothing on the site used browser history (no pushState or
// popstate anywhere), so back left the site and the tutorial's Back button showed all tutorials.
// =========================================

import { tutorialState } from '../tutorials/state.js?v=20';
import { getActiveViewName, showView } from '../app/router.js?v=21';

let hooks = null; // { open(key), close() } from agent-profile.js
let profileEntryPushed = false; // true when the open profile has its own history step we added
let tutorialReturn = null; // { agentKey, viewName } while a tutorial opened from a profile is showing

function urlWith(params) {
  const url = new URL(window.location.href);
  ['agent', 'tutorial', 'post', 'view'].forEach((k) => url.searchParams.delete(k));
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.pathname + url.search + url.hash;
}

// Called by openAgentProfile. fromHistory: the profile is being reopened by a back/forward step.
export function noteProfileOpened(agentKey, { fromHistory = false, fromLink = false } = {}) {
  if (fromHistory) return;
  const state = { awProfile: agentKey };
  if (fromLink) {
    // The page was opened at ?agent=name: mark this entry instead of adding one, so closing never leaves the site.
    history.replaceState(state, '', window.location.href);
    profileEntryPushed = false;
    return;
  }
  const current = history.state && history.state.awProfile;
  if (current) {
    // Moving from one profile to another (a name inside the pop-up): swap the entry.
    history.replaceState(state, '', urlWith({ agent: agentKey }));
  } else {
    history.pushState(state, '', urlWith({ agent: agentKey }));
    profileEntryPushed = true;
  }
}

// Called when the user closes the profile (X, tapping outside, Escape).
// Returns true when it handled the close through history (the popstate then closes the pop-up).
export function closeProfileThroughHistory() {
  if (history.state && history.state.awProfile && profileEntryPushed) {
    profileEntryPushed = false;
    history.back();
    return true;
  }
  if (history.state && history.state.awProfile) {
    // Opened from a shared link: drop ?agent= from the address without leaving the site.
    history.replaceState(null, '', urlWith({}));
  }
  return false;
}

// Called just before a tutorial opens from inside the profile.
export function noteTutorialOpenedFromProfile(agentKey, tutorialId) {
  tutorialReturn = { agentKey, viewName: getActiveViewName() };
  history.pushState({ awTutorialFromProfile: agentKey, tutorialId }, '', urlWith({ tutorial: tutorialId }));
  // The lesson's own Back button goes back to the profile too.
  tutorialState.backOverride = () => history.back();
}

function clearTutorialReturn() {
  tutorialReturn = null;
  tutorialState.backOverride = null;
}

export function initProfileHistory(profileHooks) {
  hooks = profileHooks;

  window.addEventListener('popstate', (e) => {
    const state = e.state || {};
    if (state.awProfile) {
      // Back from a tutorial (or forward) onto a profile step: put the page back as it was and reopen the profile.
      if (tutorialReturn) {
        showView(tutorialReturn.viewName);
        clearTutorialReturn();
      }
      profileEntryPushed = true;
      hooks.open(state.awProfile, { fromHistory: true });
      return;
    }
    if (state.awTutorialFromProfile) {
      // Forward onto the tutorial again: leave it to the user; just close the pop-up if it is open.
      hooks.close({ fromHistory: true });
      return;
    }
    // Back past the profile step: close the pop-up.
    clearTutorialReturn();
    profileEntryPushed = false;
    hooks.close({ fromHistory: true });
  });

  // Choosing a page from the menu ends the "return to profile" for an open tutorial.
  ['homeNavBtn', 'trendingNavBtn', 'tutorialNavBtn', 'aboutNavBtn'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => {
      if (tutorialReturn) {
        clearTutorialReturn();
        history.replaceState(null, '', urlWith({}));
      }
    });
  });
}
