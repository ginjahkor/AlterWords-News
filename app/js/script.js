import { createGlobe } from './globe.js?v=20';
import { initTrendingFeed, applyRemotePostUpdates } from './feed/index.js?v=21';
import { initTutorialPage } from './tutorials/page.js?v=21';
import { applyRemoteTutorialUpdates } from './tutorials/state.js?v=20';
import { initReachShowcase } from './showcase/reach-showcase.js?v=21';
import { initTutorialShowcase } from './showcase/tutorial-showcase.js?v=21';
import { initFirebasePlatform, loadMyLikedPostIds } from './firebase.js?v=21';
import { restoreLikedPosts } from './feed/liked-restore.js?v=21';
import { setRouterElements, activateTrending, activateTutorial, bindNavigation } from './app/router.js?v=21';
import { initIslandAndSidebar, initFooterAppGridAndTheme } from './app/chrome.js?v=21';
import { mountIsland } from './app/island.js?v=1';
import { installIcons } from './shared/aw-icons.js?v=1';
import { installImageFallback } from './shared/img-fallback.js?v=20';
import { initAgentProfiles } from './agents/agent-profile.js?v=22';
import { initAboutLive } from './app/about-live.js?v=1';

// Entry point: starts the feed, tutorials, Firebase hookup, globe and showcases.
// Page switching lives in app/router.js; island, sidebar, footer, app grid and theme in app/chrome.js.
installImageFallback();

document.addEventListener('DOMContentLoaded', () => {
  const island = document.getElementById('dynamicIsland');
  const burgerBtn = document.getElementById('burgerBtn');
  const homeNavBtn = document.getElementById('homeNavBtn');
  const trendingNavBtn = document.getElementById('trendingNavBtn');
  const tutorialNavBtn = document.getElementById('tutorialNavBtn');
  const aboutNavBtn = document.getElementById('aboutNavBtn');
  const globeContainer = document.getElementById('globeContainer');
  const trendingView = document.getElementById('trendingView');
  const tutorialView = document.getElementById('tutorialView');
  const aboutView = document.getElementById('aboutView');

  setRouterElements({ globeContainer, trendingView, tutorialView, aboutView, homeNavBtn, trendingNavBtn, tutorialNavBtn, aboutNavBtn });

  if (trendingView) {
    initTrendingFeed(trendingView);
  }

  if (tutorialView) {
    initTutorialPage(tutorialView, activateTutorial);
  }

  // Connect project to Firebase with 0ms local SWR cache hydrate & real-time Firestore sync (posts, tutorials & agents)
  initFirebasePlatform(
    [],
    (remotePostsMap, remoteAgentsMap, meta, remoteTutorialsMap) => {
      applyRemotePostUpdates(trendingView, remotePostsMap, remoteAgentsMap, meta, remoteTutorialsMap);
    },
    [],
    (remoteTutorialsMap, remoteAgentsMap) => {
      applyRemoteTutorialUpdates(remoteTutorialsMap, remoteAgentsMap);
    }
  );
  // Agent profile pop-up: clicks on an agent's picture or name, and ?agent= links (agents/agent-profile.js)
  initAgentProfiles();
  initAboutLive();

  // Light up the hearts this browser liked before (asked of the likePost function; guests never sign in).
  restoreLikedPosts(trendingView, loadMyLikedPostIds);

  // Dynamic island and sidebar toggle (app/chrome.js)
  initIslandAndSidebar(island, burgerBtn);
  // The logo and the Dynamic Island share the header's centre spot (app/island.js)
  mountIsland(document.getElementById('awIslandMount'));
  installIcons();

  // Initialize Interactive 3D Globe (Lives on Home)
  let globeInstance = null;
  if (globeContainer) {
    globeInstance = createGlobe(globeContainer, {
      speed: 1.8,
      smoothing: 8,
      dots: { color: '#e2e4e9', size: 5, density: 7, allDots: false },
      fill: 'dots',
      scale: 8.2,
      stopOnHover: true,
      direction: 'left',
      oceanColor: '#000000',
      outlineColor: 'rgba(255, 255, 255, 0.45)',
      showOutline: true,
      graticuleColor: 'rgba(255, 255, 255, 0.12)',
      showGrid: true,
      outlineWidth: 1.2,
      dragSpeed: 5,
      detail: 5,
    });
  }

  // Initialize Tutorial Showcase (5s fading tutorial + scrollable tutorial strip) in the black layer (#darkSection)
  const darkSectionContent = document.querySelector('#darkSection .dark-section-content');
  if (darkSectionContent) {
    initTutorialShowcase(darkSectionContent, activateTutorial);
  }

  // Initialize Post Reach Showcase (5s fading blog + scrollable blog strip) in the second-to-last layer (#effectLayer)
  const effectLayerContent = document.querySelector('#effectLayer .effect-layer-content');
  if (effectLayerContent) {
    initReachShowcase(effectLayerContent, trendingView, activateTrending);
  }

  // Nav buttons and the landing view from the URL (app/router.js)
  bindNavigation();

  // Footer, app grid pop-up and theme (app/chrome.js)
  initFooterAppGridAndTheme();
});
