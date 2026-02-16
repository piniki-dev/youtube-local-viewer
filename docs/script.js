/* ===================================================
   YouTube Local Viewer — Landing Page Script
   =================================================== */

(function () {
  'use strict';

  // ---------- Scroll-reveal with IntersectionObserver ----------
  const revealElements = document.querySelectorAll('[data-reveal]');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target); // animate only once
          }
        });
      },
      { threshold: 0.15 }
    );

    revealElements.forEach((el) => observer.observe(el));
  } else {
    // Fallback: show all immediately
    revealElements.forEach((el) => el.classList.add('is-visible'));
  }

  // ---------- Smooth-scroll for in-page anchors ----------
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // ---------- Direct download via GitHub API ----------
  var downloadUrl = null;

  fetch('https://api.github.com/repos/piniki-dev/youtube-local-viewer/releases/latest')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var asset = (data.assets || []).find(function (a) {
        return a.name.endsWith('-setup.exe') || a.name.endsWith('_x64-setup.exe');
      });
      if (asset) {
        downloadUrl = asset.browser_download_url;
      }
    })
    .catch(function () { /* fallback to GitHub Releases page */ });

  document.querySelectorAll('[data-download]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      if (downloadUrl) {
        e.preventDefault();
        window.location.href = downloadUrl;
      }
      // If API failed, falls through to the default href (Releases page)
    });
  });
})();
