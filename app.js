(() => {
  let swRegistration = null;
  let subscription = null;
  let endpoint = null;
  let horarios = [];

  const btnNotificacoes = document.getElementById('btn-notificacoes');
  const notifStatus = document.getElementById('notif-status');
  const formRemedio = document.getElementById('form-remedio');
  const nomeRemedio = document.getElementById('nome-remedio');
  const inputHorario = document.getElementById('input-horario');
  const btnAddHorario = document.getElementById('btn-add-horario');
  const horariosList = document.getElementById('horarios-list');
  const listaRemedios = document.getElementById('lista-remedios');
  const btnCheckNow = document.getElementById('btn-check-now');
  const cronResult = document.getElementById('cron-result');

  async function init() {
    if ('serviceWorker' in navigator) {
      swRegistration = await navigator.serviceWorker.register('/sw.js');
      console.log('SW registered');
    }

    await restoreSession();

    btnNotificacoes.style.display = subscription ? 'none' : 'block';

    btnNotificacoes.addEventListener('click', requestNotificationPermission);
    formRemedio.addEventListener('submit', handleAddRemedio);
    btnAddHorario.addEventListener('click', addHorario);
    btnCheckNow.addEventListener('click', checkNow);

    if (subscription) {
      await loadRemedios();
    }
  }

  async function restoreSession() {
    const saved = localStorage.getItem('push_endpoint');
    if (saved) {
      endpoint = saved;
      subscription = saved;
    }
  }

  async function requestNotificationPermission() {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showStatus(notifStatus, 'Permissão negada', 'error');
      return;
    }

    try {
      const reg = swRegistration || await navigator.serviceWorker.register('/sw.js');
      const existingSubscription = await reg.pushManager.getSubscription();

      if (existingSubscription) {
        subscription = existingSubscription;
      } else {
        const resp = await fetch('/api/config');
        let vapidKey;
        if (resp.ok) {
          const config = await resp.json();
          vapidKey = config.vapidPublicKey;
        } else {
          vapidKey = localStorage.getItem('vapid_public_key');
        }

        if (!vapidKey) {
          showStatus(notifStatus, 'Chave VAPID não configurada', 'error');
          return;
        }

        const applicationServerKey = urlBase64ToUint8Array(vapidKey);
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      endpoint = subscription.endpoint;
      localStorage.setItem('push_endpoint', endpoint);

      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });

      btnNotificacoes.style.display = 'none';
      showStatus(notifStatus, 'Notificações ativadas!', 'ok');
      await loadRemedios();
    } catch (err) {
      console.error('Push subscribe error:', err);
      showStatus(notifStatus, 'Erro ao ativar notificações', 'error');
    }
  }

  function addHorario() {
    const time = inputHorario.value;
    if (!time || horarios.includes(time)) return;
    horarios.push(time);
    horarios.sort();
    renderHorarios();
  }

  function removeHorario(time) {
    horarios = horarios.filter((h) => h !== time);
    renderHorarios();
  }

  function renderHorarios() {
    horariosList.innerHTML = '';
    if (horarios.length === 0) {
      horariosList.innerHTML = '<p class="empty-state" style="padding:8px;font-size:0.85rem;">Nenhum horário adicionado</p>';
      return;
    }
    horariosList.innerHTML = '<div class="horarios-tags">' +
      horarios.map((h) =>
        `<span class="horario-tag">${h} <button type="button" onclick="window._removeHorario('${h}')">&times;</button></span>`
      ).join('') +
      '</div>';
  }

  window._removeHorario = removeHorario;

  async function handleAddRemedio(e) {
    e.preventDefault();

    if (!endpoint) {
      alert('Ative as notificações primeiro.');
      return;
    }

    if (horarios.length === 0) {
      alert('Adicione pelo menos um horário.');
      return;
    }

    const nome = nomeRemedio.value.trim();
    if (!nome) return;

    const resp = await fetch(`/api/remedios?endpoint=${encodeURIComponent(endpoint)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, horarios }),
    });

    if (resp.ok) {
      nomeRemedio.value = '';
      horarios = [];
      renderHorarios();
      await loadRemedios();
    } else {
      const err = await resp.json();
      alert(err.error || 'Erro ao salvar');
    }
  }

  async function loadRemedios() {
    if (!endpoint) return;

    const resp = await fetch(`/api/remedios?endpoint=${encodeURIComponent(endpoint)}`);
    if (!resp.ok) return;

    const remedios = await resp.json();

    if (remedios.length === 0) {
      listaRemedios.innerHTML = '<p class="empty-state">Nenhum remédio cadastrado ainda.</p>';
      return;
    }

    listaRemedios.innerHTML = remedios.map((r) => `
      <div class="remedio-card">
        <div class="remedio-card-header">
          <h3>${escapeHtml(r.nome)}</h3>
          <button class="btn-delete" onclick="window._deleteRemedio('${r.id}')" title="Excluir">🗑</button>
        </div>
        <div class="horarios-tags">
          ${r.horarios.map((h) => `<span class="horario-tag">${h}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }

  window._deleteRemedio = async (id) => {
    if (!confirm('Excluir este remédio?')) return;

    await fetch(`/api/remedios?endpoint=${encodeURIComponent(endpoint)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    await loadRemedios();
  };

  async function checkNow() {
    btnCheckNow.disabled = true;
    btnCheckNow.textContent = 'Verificando...';

    try {
      const resp = await fetch('/api/check-schedules', { method: 'POST' });
      const data = await resp.json();
      cronResult.textContent = JSON.stringify(data, null, 2);
      cronResult.classList.add('visible');
    } catch (err) {
      cronResult.textContent = 'Erro: ' + err.message;
      cronResult.classList.add('visible');
    }

    btnCheckNow.disabled = false;
    btnCheckNow.textContent = 'Verificar agora';
  }

  function showStatus(el, msg, type) {
    el.textContent = msg;
    el.className = 'status-badge ' + type;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  init();
})();
