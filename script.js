document.addEventListener('DOMContentLoaded', () => {
  const island = document.getElementById('dynamicIsland');
  const burgerBtn = document.getElementById('burgerBtn');

  // Dynamic Island Expansion Toggle
  if (island) {
    island.addEventListener('click', (e) => {
      e.stopPropagation();
      island.classList.toggle('expanded');
    });
  }

  // Sidebar Toggle (adjusts the borderline to open outside)
  if (burgerBtn) {
    burgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.body.classList.toggle('sidebar-open');
    });
  }
});
