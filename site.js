const menuButton = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('.mobile-nav');

function closeMenu() {
  mobileNav.hidden = true;
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Открыть меню');
}

menuButton.addEventListener('click', () => {
  const open = mobileNav.hidden;
  mobileNav.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
});
mobileNav.addEventListener('click', event => {
  if (event.target.closest('a')) closeMenu();
});
window.addEventListener('resize', () => {
  if (innerWidth > 840) closeMenu();
});
document.getElementById('year').textContent = new Date().getFullYear();

if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { threshold: .06 });
  document.querySelectorAll('.idea-main,.workflow,.device-copy,.device-screen,.android-heading,.android-screen,.android-output,.editor-head,.editor-index,.origin-body,.examples-copy,.examples-screen,.faq-section h2,.faq-list,.download-section').forEach(el => {
    el.classList.add('reveal');
    observer.observe(el);
  });
}
