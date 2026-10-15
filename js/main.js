const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Header state */
const header = document.querySelector('.site-header');
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 20);
onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

/* Mobile menu */
const toggle = document.querySelector('.nav-toggle');
const links = document.getElementById('nav-links');
const setOpen = (o) => { toggle.setAttribute('aria-expanded', String(o)); links.classList.toggle('is-open', o); toggle.lastElementChild.textContent = o ? 'Close' : 'Menu'; };
toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

/* Staggered reveals */
document.querySelectorAll('.hero-title, .hero-main, .hero-side, .work, .pillars, .section-head, .lots, .contact-grid, .about-grid, .lot-text')
  .forEach((g) => g.querySelectorAll(':scope .reveal').forEach((el, i) => el.style.setProperty('--d', `${Math.min(0.08 * i, 0.5) + (g.closest('.hero') ? 0.12 : 0)}s`)));
requestAnimationFrame(() => document.querySelectorAll('.hero .reveal').forEach((el) => el.classList.add('is-visible')));
const reveals = document.querySelectorAll('.reveal:not(.hero .reveal)');
if (reduce || !('IntersectionObserver' in window)) reveals.forEach((el) => el.classList.add('is-visible'));
else {
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -6% 0px' });
  reveals.forEach((el) => io.observe(el));
}

/* Smooth page feel: soft fade between internal pages */
if (!reduce) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || a.target === '_blank') return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.protocol.startsWith('mailto') || (url.pathname === location.pathname && url.hash)) return;
    e.preventDefault();
    document.documentElement.classList.add('is-leaving');
    setTimeout(() => { location.href = url.href; }, 220);
  });
  window.addEventListener('pageshow', () => document.documentElement.classList.remove('is-leaving'));
}
