const API_URL = 'http://localhost:3000/api';

const state = {
  currentConversationId: null,
  currentMode: 'chat',
  currentView: 'chat',
  selectedImageFile: null,
  attachedFileText: '',
  attachedFileName: '',
  activeChecklist: 'rack',
};

const CHECKLIST_DATA = {
  rack: [
    'Identificar e etiquetar todos os cabos nas duas extremidades',
    'Organizar cabos com velcro (evitar abraçadeiras plásticas apertadas)',
    'Respeitar raio de curvatura mínimo de cabos UTP e fibra óptica',
    'Separar cabeamento de energia e dados para reduzir interferência',
    'Testar continuidade e mapeamento dos pontos no patch panel / switch',
    'Verificar ventilação, aterramento e energia redundante/nobreak do rack',
  ],
  cftv: [
    'Confirmar alimentação (12V ou PoE 802.3af/at) e orçamento de potência do switch/NVR',
    'Definir endereçamento IP válido e evitar conflitos de IP na rede',
    'Ajustar data, hora, NTP e fuso horário das câmeras e do NVR',
    'Configurar modo de gravação (contínua, detecção de movimento ou agenda) e retenção',
    'Testar visualização local e acesso remoto seguro (evitando exposição direta insegura)',
    'Validar foco, enquadramento e visão noturna (IR)',
  ],
  maintenance: [
    'Realizar backup de dados críticos antes de alterações ou formatação',
    'Limpar poeira de coolers, dissipadores e entradas de ar com segurança',
    'Verificar temperaturas de CPU/GPU e saúde do armazenamento (SMART)',
    'Testar memória RAM e integridade do sistema de arquivos',
    'Atualizar sistema operacional, drivers oficiais e antivírus/EDR',
    'Registrar estado final do equipamento no relatório técnico',
  ],
};

// Elementos DOM
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const openSidebarBtn = document.getElementById('openSidebarBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const newChatBtn = document.getElementById('newChatBtn');
const historyList = document.getElementById('historyList');
const messagesContainer = document.getElementById('messagesContainer');
const typingIndicator = document.getElementById('typingIndicator');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const attachImageBtn = document.getElementById('attachImageBtn');
const attachFileBtn = document.getElementById('attachFileBtn');
const imageInput = document.getElementById('imageInput');
const fileInput = document.getElementById('fileInput');
const attachmentPreview = document.getElementById('attachmentPreview');
const modeBadge = document.getElementById('modeBadge');
const viewTitle = document.getElementById('viewTitle');

// Navegação mobile
function toggleSidebar(open) {
  sidebar.classList.toggle('open', open);
  sidebarOverlay.classList.toggle('open', open);
}

openSidebarBtn.addEventListener('click', () => toggleSidebar(true));
closeSidebarBtn.addEventListener('click', () => toggleSidebar(false));
sidebarOverlay.addEventListener('click', () => toggleSidebar(false));

// Troca de views e modos
function switchView(viewName, mode = null) {
  state.currentView = viewName;
  if (mode) state.currentMode = mode;

  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(`${viewName}View`).classList.add('active');

  document.querySelectorAll('.nav-item').forEach((btn) => {
    const btnView = btn.dataset.view;
    const btnMode = btn.dataset.mode;
    const isMatch = mode ? (btnView === viewName && btnMode === mode) : btnView === viewName;
    btn.classList.toggle('active', isMatch);
  });

  const modeNames = {
    chat: 'Modo: Chat Técnico',
    diagnostic: 'Modo: Diagnóstico Guiado',
    checklist: 'Modo: Checklists Operacionais',
    reports: 'Modo: Relatórios Técnicos',
  };
  modeBadge.textContent = modeNames[mode || viewName] || 'VAFRIX AI';
  viewTitle.textContent =
    viewName === 'chat'
      ? 'VAFRIX AI'
      : viewName === 'checklist'
      ? 'Checklists de TI'
      : 'Relatórios Técnicos';

  if (viewName === 'checklist') renderChecklist();
  if (viewName === 'reports') loadReports();
  toggleSidebar(false);
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view, btn.dataset.mode || null);
  });
});

// Formatação simples e segura de texto/código
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMessageText(text) {
  const safe = escapeHtml(text);
  return safe.replace(/`([^`\n]+)`/g, '<code>$1</code>');
}

function appendMessageBubble(role, content, attachmentName = null) {
  const welcome = messagesContainer.querySelector('.welcome-card');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `message ${role}`;

  const label = role === 'user' ? 'VOCÊ' : 'VAFRIX AI';
  const badge = attachmentName ? ` • Anexo: ${escapeHtml(attachmentName)}` : '';

  div.innerHTML = `
    <div class="message-header">
      <span class="message-role">${label}${badge}</span>
      <button type="button" class="copy-btn">Copiar</button>
    </div>
    <div class="message-body">${formatMessageText(content)}</div>
  `;

  const copyBtn = div.querySelector('.copy-btn');
  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(content);
    copyBtn.textContent = 'Copiado!';
    setTimeout(() => {
      copyBtn.textContent = 'Copiar';
    }, 1500);
  });

  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Histórico
async function loadConversations() {
  try {
    const res = await fetch(`${API_URL}/conversations`);
    if (!res.ok) return;
    const data = await res.json();
    historyList.innerHTML = '';

    (data.conversations || []).forEach((conv) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `history-item ${conv.id === state.currentConversationId ? 'active' : ''}`;
      btn.textContent = conv.title;
      btn.title = conv.title;
      btn.addEventListener('click', () => selectConversation(conv.id, conv.mode));
      historyList.appendChild(btn);
    });
  } catch (err) {
    console.error('Erro ao carregar histórico:', err);
  }
}

async function selectConversation(id, mode = 'chat') {
  state.currentConversationId = id;
  state.currentMode = mode;
  switchView('chat', mode);
  messagesContainer.innerHTML = '';

  try {
    const res = await fetch(`${API_URL}/conversations/${id}/messages`);
    const data = await res.json();
    (data.messages || []).forEach((msg) => {
      appendMessageBubble(msg.role, msg.content, msg.attachment_name);
    });
    loadConversations();
  } catch (err) {
    console.error('Erro ao abrir conversa:', err);
  }
}

newChatBtn.addEventListener('click', () => {
  state.currentConversationId = null;
  clearAttachments();
  switchView('chat', state.currentMode === 'diagnostic' ? 'diagnostic' : 'chat');
  messagesContainer.innerHTML = `
    <div class="welcome-card">
      <h2>Nova conversa iniciada</h2>
      <p>Envie sua dúvida técnica, log de erro, imagem de equipamento ou inicie um diagnóstico.</p>
    </div>
  `;
  loadConversations();
});

// Atalhos rápidos
document.querySelectorAll('.quick-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    messageInput.value = btn.dataset.prompt;
    messageInput.focus();
  });
});

// Anexos (imagem e texto/log)
function updateAttachmentPreview() {
  if (!state.selectedImageFile && !state.attachedFileName) {
    attachmentPreview.classList.add('hidden');
    attachmentPreview.innerHTML = '';
    return;
  }

  const parts = [];
  if (state.selectedImageFile) parts.push(`Imagem: ${state.selectedImageFile.name}`);
  if (state.attachedFileName) parts.push(`Arquivo: ${state.attachedFileName}`);

  attachmentPreview.classList.remove('hidden');
  attachmentPreview.innerHTML = `
    <span>${escapeHtml(parts.join(' | '))}</span>
    <button type="button" id="clearAttachBtn" class="copy-btn">Remover</button>
  `;

  document.getElementById('clearAttachBtn').addEventListener('click', clearAttachments);
}

function clearAttachments() {
  state.selectedImageFile = null;
  state.attachedFileText = '';
  state.attachedFileName = '';
  imageInput.value = '';
  fileInput.value = '';
  updateAttachmentPreview();
}

attachImageBtn.addEventListener('click', () => imageInput.click());
attachFileBtn.addEventListener('click', () => fileInput.click());

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    state.selectedImageFile = file;
    updateAttachmentPreview();
  }
});

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    state.attachedFileName = file.name;
    state.attachedFileText = await file.text();
    updateAttachmentPreview();
  }
});

// Envio de mensagem
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text && !state.selectedImageFile && !state.attachedFileText) return;

  const displayAttachment = state.selectedImageFile
    ? state.selectedImageFile.name
    : state.attachedFileName || null;

  appendMessageBubble('user', text || '(Anexo enviado para análise)', displayAttachment);

  const formData = new FormData();
  if (state.currentConversationId) formData.append('conversationId', state.currentConversationId);
  formData.append('message', text);
  formData.append('mode', state.currentMode);
  if (state.attachedFileText) {
    formData.append('fileText', state.attachedFileText);
    formData.append('attachmentName', state.attachedFileName);
  }
  if (state.selectedImageFile) {
    formData.append('image', state.selectedImageFile);
  }

  messageInput.value = '';
  messageInput.style.height = 'auto';
  clearAttachments();
  sendBtn.disabled = true;
  typingIndicator.classList.remove('hidden');

  try {
    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      appendMessageBubble('assistant', `Erro: ${data.error || 'Falha ao consultar a VAFRIX AI.'}`);
    } else {
      state.currentConversationId = data.conversationId;
      appendMessageBubble('assistant', data.reply);
      await loadConversations();
    }
  } catch (err) {
    appendMessageBubble('assistant', 'Erro de conexão com o servidor backend em http://localhost:3000.');
  } finally {
    sendBtn.disabled = false;
    typingIndicator.classList.add('hidden');
  }
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

// Checklists
function renderChecklist() {
  const container = document.getElementById('checklistItems');
  const items = CHECKLIST_DATA[state.activeChecklist] || [];
  const storageKey = `vafrix_check_${state.activeChecklist}`;
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');

  container.innerHTML = '';
  items.forEach((item, index) => {
    const done = saved.includes(index);
    const row = document.createElement('label');
    row.className = `check-row ${done ? 'done' : ''}`;
    row.innerHTML = `
      <input type="checkbox" ${done ? 'checked' : ''} />
      <span>${escapeHtml(item)}</span>
    `;
    row.querySelector('input').addEventListener('change', (ev) => {
      const next = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
      if (ev.target.checked) next.add(index);
      else next.delete(index);
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      renderChecklist();
    });
    container.appendChild(row);
  });
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeChecklist = btn.dataset.checklist;
    renderChecklist();
  });
});

// Relatórios Técnicos
const reportForm = document.getElementById('reportForm');
const reportOutputBox = document.getElementById('reportOutputBox');
const reportFormattedText = document.getElementById('reportFormattedText');
const copyReportBtn = document.getElementById('copyReportBtn');
const savedReportsList = document.getElementById('savedReportsList');

function formatReport(rep) {
  return [
    `RELATÓRIO TÉCNICO — VAFRIX AI`,
    `Título: ${rep.title}`,
    `Equipamento envolvido: ${rep.equipment_involved || rep.equipment || 'Não informado'}`,
    `Descrição do problema: ${rep.problem_description}`,
    `Diagnóstico: ${rep.diagnosis || 'Não informado'}`,
    `Procedimentos realizados: ${rep.procedures || 'Não informado'}`,
    `Resultado: ${rep.result || 'Não informado'}`,
    `Recomendações: ${rep.recommendations || 'Não informado'}`,
  ].join('\n');
}

reportForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    conversationId: state.currentConversationId,
    title: document.getElementById('repTitle').value.trim(),
    equipment: document.getElementById('repEquipment').value.trim(),
    problemDescription: document.getElementById('repProblem').value.trim(),
    diagnosis: document.getElementById('repDiagnosis').value.trim(),
    procedures: document.getElementById('repProcedures').value.trim(),
    result: document.getElementById('repResult').value.trim(),
    recommendations: document.getElementById('repRecommendations').value.trim(),
  };

  try {
    const res = await fetch(`${API_URL}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.report) {
      reportFormattedText.textContent = formatReport(data.report);
      reportOutputBox.classList.remove('hidden');
      reportForm.reset();
      loadReports();
    }
  } catch (err) {
    console.error('Erro ao salvar relatório:', err);
  }
});

copyReportBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(reportFormattedText.textContent);
  copyReportBtn.textContent = 'Copiado!';
  setTimeout(() => {
    copyReportBtn.textContent = 'Copiar Relatório';
  }, 1500);
});

async function loadReports() {
  try {
    const res = await fetch(`${API_URL}/reports`);
    const data = await res.json();
    savedReportsList.innerHTML = '';
    (data.reports || []).forEach((rep) => {
      const card = document.createElement('div');
      card.className = 'saved-report-card';
      card.innerHTML = `
        <strong>${escapeHtml(rep.title)}</strong>
        <div style="font-size:0.82rem;color:#a1a1aa;margin-top:4px;">${escapeHtml(rep.problem_description)}</div>
      `;
      card.addEventListener('click', () => {
        reportFormattedText.textContent = formatReport(rep);
        reportOutputBox.classList.remove('hidden');
      });
      savedReportsList.appendChild(card);
    });
  } catch (err) {
    console.error('Erro ao carregar relatórios:', err);
  }
}

// Inicialização
loadConversations();