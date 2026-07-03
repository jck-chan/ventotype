export function initTabs(): void {
  const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'));
  const tabPanels = Array.from(document.querySelectorAll<HTMLElement>('.tab-panel'));

  function activateTab(button: HTMLButtonElement): void {
    const targetId = button.dataset['tabTarget'];
    if (!targetId) return;

    for (const panel of tabPanels) {
      const isActive = panel.id === targetId;
      panel.hidden = !isActive;
      panel.classList.toggle('active', isActive);
    }

    for (const tab of tabButtons) {
      const isActive = tab === button;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    }
  }

  tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => activateTab(button));
    button.addEventListener('keydown', (e) => {
      const lastIndex = tabButtons.length - 1;
      let nextIndex = index;

      if (e.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
      else if (e.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
      else if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = lastIndex;
      else return;

      e.preventDefault();
      const nextButton = tabButtons[nextIndex];
      if (!nextButton) return;
      activateTab(nextButton);
      nextButton.focus();
    });
  });
}
