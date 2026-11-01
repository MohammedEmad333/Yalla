// Flutter Web startup UI must run under script-src 'self' without unsafe-inline.
(function () {
  'use strict';
  var splash = document.getElementById('splash');
  if (!splash) return;
  var finished = false;
  var timer = null;
  function finish() {
    if (finished) return;
    finished = true;
    if (timer) clearTimeout(timer);
    splash.classList.add('splash-hidden');
    setTimeout(function () { splash.remove(); }, 400);
  }
  window.addEventListener('flutter-first-frame', finish, { once: true });
  // If Flutter fails to render, show an actionable recovery path instead of
  // leaving users watching an infinite spinner.
  timer = setTimeout(function () {
    if (finished) return;
    var ring = splash.querySelector('.ring');
    if (ring) ring.remove();
    var message = document.createElement('p');
    message.textContent = 'تعذر بدء التطبيق. يرجى تحديث الصفحة أو تنظيف ذاكرة التطبيق.';
    message.style.cssText = 'max-width:300px;text-align:center;line-height:1.8;padding:0 12px';
    var retry = document.createElement('a');
    retry.href = '/reset-cache.html';
    retry.textContent = 'إصلاح التحميل وإعادة المحاولة';
    retry.style.cssText = 'color:#fff;border:1px solid #fff;border-radius:12px;padding:12px 18px;text-decoration:none;font-weight:700';
    splash.appendChild(message);
    splash.appendChild(retry);
  }, 15000);
}());
