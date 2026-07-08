/* Serenity Yachting Club — interactions */
(function () {
  'use strict';

  /* ── sticky nav ── */
  var nav = document.getElementById('nav');
  var onScroll = function () {
    if (window.scrollY > 40) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── mobile menu ── */
  var burger = document.getElementById('burger');
  var links = document.getElementById('navLinks');
  var toggle = function (open) {
    links.classList.toggle('open', open);
    nav.classList.toggle('menu-open', open);
  };
  burger.addEventListener('click', function () {
    toggle(!links.classList.contains('open'));
  });
  links.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') toggle(false);
  });

  /* ── scroll reveal ── */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('visible');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  }

  /* ── year ── */
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  /* ── booking form → mailto (static-site friendly) ── */
  var form = document.getElementById('bookingForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.name.value.trim();
      var contact = form.contactline.value.trim();
      var voyage = form.voyage.value;
      var msg = form.message.value.trim();
      var subject = 'Запит на подорож — ' + (name || 'новий гість');
      var body =
        'Ім’я: ' + name + '\n' +
        'Контакт: ' + contact + '\n' +
        'Напрям: ' + voyage + '\n' +
        'Побажання: ' + (msg || '—');
      window.location.href =
        'mailto:hello@serenityclub.com.ua' +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);

      form.innerHTML =
        '<p class="kicker kicker--light">Дякуємо</p>' +
        '<h3 style="font-family:var(--serif);font-weight:500;font-size:1.8rem;color:var(--ivory);margin-bottom:1rem;">' +
        'Запит майже готовий</h3>' +
        '<p style="color:rgba(246,241,231,.78);">Ми відкрили ваш поштовий застосунок з готовим листом. ' +
        'Надішліть його — і ми звʼяжемося з вами протягом робочого дня.</p>';
      form.classList.add('sent');
    });
  }
})();
