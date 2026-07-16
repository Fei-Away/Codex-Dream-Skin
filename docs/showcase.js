const header = document.querySelector("[data-header]");
const revealItems = document.querySelectorAll("[data-reveal]");
const parallaxItems = document.querySelectorAll("[data-parallax]");
const heroStage = document.querySelector("[data-hero-stage]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("is-visible");
    observer.unobserve(entry.target);
  });
}, {
  threshold: 0.12,
  rootMargin: "0px 0px -6% 0px"
});

revealItems.forEach((item) => revealObserver.observe(item));

const updateScrollEffects = () => {
  const scrollY = window.scrollY;
  header?.classList.toggle("is-scrolled", scrollY > 24);

  if (reduceMotion.matches) return;

  if (heroStage && scrollY < window.innerHeight * 1.2) {
    heroStage.style.transform = `translate3d(0, ${scrollY * 0.055}px, 0)`;
  }

  parallaxItems.forEach((item) => {
    const rect = item.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const strength = Number(item.dataset.parallax || 0.3);
    const progress = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
    const offset = (progress - 0.5) * 34 * strength;
    item.style.setProperty("--parallax-y", `${offset}px`);
  });
};

let ticking = false;

const requestScrollUpdate = () => {
  if (ticking) return;
  ticking = true;
  window.requestAnimationFrame(() => {
    updateScrollEffects();
    ticking = false;
  });
};

window.addEventListener("scroll", requestScrollUpdate, { passive: true });
window.addEventListener("resize", requestScrollUpdate);
reduceMotion.addEventListener?.("change", requestScrollUpdate);
updateScrollEffects();
