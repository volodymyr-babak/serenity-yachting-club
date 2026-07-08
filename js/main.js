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

  /* ── payment (monobank via Cloudflare Worker) ── */
  var cfg = window.SERENITY_CONFIG || {};
  var modal = document.getElementById('payModal');
  var modalTitle = document.getElementById('modalTitle');
  var modalBody = document.getElementById('modalBody');

  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }
  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-close')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  function startPayment(btn) {
    var tour = btn.getAttribute('data-tour');
    var name = btn.getAttribute('data-name') || 'подорож';
    var api = (cfg.paymentApi || '').replace(/\/+$/, '');

    // Онлайн-оплата ще не налаштована — акуратно пояснюємо і ведемо до форми.
    if (!api) {
      openModal('Онлайн-оплата готується', [
        '<p>Прямо зараз бронювання туру <strong>«' + name + '»</strong> ми оформлюємо ',
        'персонально: залиште запит — і ми надішлемо посилання на оплату передоплати ',
        'через monobank та підтвердимо дати.</p>',
        '<a href="#contact" class="btn btn--gold" data-close>Залишити запит</a>'
      ].join(''));
      return;
    }

    btn.disabled = true;
    openModal('Готуємо оплату…',
      '<div class="modal__spinner"></div><p>Створюємо захищений рахунок monobank для туру ' +
      '<strong>«' + name + '»</strong>. Зачекайте секунду.</p>');

    fetch(api + '/invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tourId: tour })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); })
      .then(function (res) {
        if (res.ok && res.data && res.data.pageUrl) {
          window.location.href = res.data.pageUrl; // → сторінка оплати monobank
        } else {
          throw new Error((res.data && res.data.error) || 'Не вдалося створити рахунок');
        }
      })
      .catch(function (err) {
        openModal('Щось пішло не так', [
          '<p>' + (err.message || 'Помилка звʼязку з платіжним сервісом') + '.</p>',
          '<p>Спробуйте ще раз або залиште запит — ми оформимо бронювання вручну.</p>',
          '<a href="#contact" class="btn btn--dark" data-close>Залишити запит</a>'
        ].join(''));
      })
      .then(function () { btn.disabled = false; });
  }

  document.querySelectorAll('.voyage__pay').forEach(function (btn) {
    btn.addEventListener('click', function () { startPayment(btn); });
  });
})();
