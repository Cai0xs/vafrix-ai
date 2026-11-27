// frontend/js/app.js
const API_URL = '/api';

if (typeof mermaid !== 'undefined') {
  mermaid.initialize({ startOnLoad: false, theme: 'dark' });
}

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
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
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
const webSearchToggle = document.getElementById('webSearchToggle');

// Navegação mobile
function toggleSidebar(open) {
  if (!sidebar || !sidebarOverlay) return;
  sidebar.classList.toggle('open', open);
  sidebarOverlay.classList.toggle('open', open);
}

if (openSidebarBtn) openSidebarBtn.addEventListener('click', () => toggleSidebar(true));
if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', () => toggleSidebar(false));
if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => toggleSidebar(false));

// Troca de views e modos
function switchView(viewName, mode = null) {
  state.currentView = viewName;
  if (mode) state.currentMode = mode;

  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  const targetView = document.getElementById(`${viewName}View`);
  if (targetView) targetView.classList.add('active');

  document.querySelectorAll('.nav-item').forEach((btn) => {
    const btnView = btn.dataset.view;
    const btnMode = btn.dataset.mode;
    const isMatch = mode ? btnView === viewName && btnMode === mode : btnView === viewName;
    btn.classList.toggle('active', isMatch);
  });

  const modeNames = {
    chat: 'Modo: Conversação Geral',
    diagnostic: 'Modo: Diagnóstico Guiado',
    checklist: 'Modo: Checklists Operacionais',
    reports: 'Modo: Relatórios Técnicos',
  };
  if (modeBadge) modeBadge.textContent = modeNames[mode || viewName] || 'VAFRIX AI';
  if (viewTitle) {
    viewTitle.textContent =
      viewName === 'chat'
        ? 'VAFRIX AI'
        : viewName === 'checklist'
        ? 'Checklists de TI'
        : 'Relatórios Técnicos';
  }

  if (viewName === 'checklist') renderChecklist();
  if (viewName === 'reports') loadReports();
  toggleSidebar(false);
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view, btn.dataset.mode || null);
  });
});

// Escape seguro de HTML
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInline(escapedText) {
  return escapedText
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

function formatUserText(text) {
  return formatInline(escapeHtml(text)).replace(/\n/g, '<br>');
}

// Formata Markdown sem deixar '#' solto na tela e renderizando Mermaid
function formatAssistantMarkdown(text) {
  const normalized = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+---\s+/g, '\n\n---\n\n');

  const lines = normalized.split('\n');
  const html = [];
  let inCode = false;
  let codeLang = '';
  let codeLines = [];
  let inUl = false;
  let inOl = false;
  let paraLines = [];

  function flushPara() {
    if (!paraLines.length) return;
    html.push(`<p>${formatInline(paraLines.join('<br>'))}</p>`);
    paraLines = [];
  }

  function closeLists() {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine;
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushPara();
      closeLists();
      if (!inCode) {
        inCode = true;
        codeLang = trimmed.replace(/^```/, '').trim().toLowerCase();
        codeLines = [];
      } else {
        const blockContent = codeLines.join('\n');
        if (codeLang === 'mermaid') {
          html.push(`<div class="mermaid">${escapeHtml(blockContent)}</div>`);
        } else {
          html.push(`<pre><code>${escapeHtml(blockContent)}</code></pre>`);
        }
        inCode = false;
        codeLang = '';
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushPara();
      closeLists();
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      flushPara();
      closeLists();
      html.push('<hr />');
      continue;
    }

    const headingMatch = trimmed.match(/^#{1,6}\s*(.+)$/);
    if (headingMatch) {
      flushPara();
      closeLists();
      const level = (trimmed.match(/^#+/) || ['#'])[0].length;
      const tag = level <= 2 ? 'h2' : 'h3';
      html.push(`<${tag}>${formatInline(escapeHtml(headingMatch[1].trim()))}</${tag}>`);
      continue;
    }

    if (/^#{1,6}$/.test(trimmed)) {
      continue;
    }

    if (trimmed.startsWith('&gt;') || trimmed.startsWith('>')) {
      flushPara();
      closeLists();
      const quoteContent = trimmed.replace(/^(&gt;|>)\s?/, '');
      html.push(`<blockquote>${formatInline(escapeHtml(quoteContent))}</blockquote>`);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (ulMatch) {
      flushPara();
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul>');
        inUl = true;
      }
      html.push(`<li>${formatInline(escapeHtml(ulMatch[1]))}</li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (olMatch) {
      flushPara();
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol>');
        inOl = true;
      }
      html.push(`<li>${formatInline(escapeHtml(olMatch[1]))}</li>`);
      continue;
    }

    closeLists();
    paraLines.push(escapeHtml(trimmed));
  }

  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  flushPara();
  closeLists();

  return html.join('');
}

async function copyToClipboard(text, buttonEl) {
  try {
    await navigator.clipboard.writeText(text);
    const prev = buttonEl.textContent;
    buttonEl.textContent = 'Copiado!';
    setTimeout(() => {
      buttonEl.textContent = prev;
    }, 1500);
  } catch {
    buttonEl.textContent = 'Falha';
    setTimeout(() => {
      buttonEl.textContent = 'Copiar';
    }, 1500);
  }
}

function appendMessageBubble(role, initialText = '', attachmentName = null) {
  if (!messagesContainer) return null;
  const welcome = messagesContainer.querySelector('.welcome-card');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `message ${role}`;

  const label = role === 'user' ? 'VOCÊ' : 'VAFRIX AI';
  const badge = attachmentName ? ` • Anexo: ${escapeHtml(attachmentName)}` : '';
  const renderedBody =
    role === 'user' ? formatUserText(initialText) : formatAssistantMarkdown(initialText);

  div.innerHTML = `
    <div class="message-header">
      <span class="message-role">${label}${badge}</span>
      <button type="button" class="copy-btn">Copiar</button>
    </div>
    <div class="message-body">${renderedBody}</div>
  `;

  const copyBtn = div.querySelector('.copy-btn');
  const bodyEl = div.querySelector('.message-body');
  if (copyBtn && bodyEl) {
    copyBtn.addEventListener('click', () => copyToClipboard(bodyEl.innerText || initialText, copyBtn));
  }

  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return bodyEl;
}

function appendGeneratedImageBubble(promptText, imageUrl, provider = '') {
  if (!messagesContainer) return;
  const welcome = messagesContainer.querySelector('.welcome-card');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="message-header">
      <span class="message-role">VAFRIX AI • IMAGEM${provider ? ` (${escapeHtml(provider)})` : ''}</span>
      <a class="copy-btn" href="${imageUrl}" download="vafrix-imagem.png" style="text-decoration:none;">Baixar</a>
    </div>
    <div class="message-body">
      <div class="generated-image-wrap">
        <img src="${imageUrl}" alt="${escapeHtml(promptText)}" />
      </div>
    </div>
  `;

  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function extractImagePrompt(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return '';

  // Comando explícito /imagem ou /img
  const cmdMatch = text.match(/^\/(?:imagem|img)\s+([\s\S]+)/i);
  if (cmdMatch) {
    return cmdMatch[1].trim();
  }

  // Qualquer pedido com palavras-chave de imagem/arte/foto/desenho
  const hasImageKeyword =
    /\b(imagem|imagens|foto|fotos|desenh[aeo]|desenhar|ilustra[çc][aã]o|ilustrar|arte|wallpaper|capa|pintur[ae]|pintar|render|icone|ícone|logo|logotipo|avatar|retrato|paisagem|cena)\b/i.test(
      text
    );

  if (!hasImageKeyword) return '';

  const cleaned = text
    .replace(
      /^(?:por favor[, ]*)?(?:eu\s+(?:quero|queria|gostaria\s+de|preciso\s+(?:de\s+)?(?:uma?\s+)?(?:ver|ter|criar|gerar|fazer|baixar)))?\s*(?:cri[ae]|ger[ae]|faz(?:er)?|fa[çc]a|desenh[ae]|mont[ae]|mostr[ae]|coloc[ae]|bota)\s+(?:uma?\s+)?(?:imagem|foto|ilustra[çc][aã]o|arte|wallpaper|capa|pintura|render|ícone|icone|logo|logotipo|avatar|retrato|paisagem|cena)?(?:\s+(?:de|do|da|dos|das|sobre|com|pra|para))?\s+/i,
      ''
    )
    .trim();

  return cleaned || text;
}

async function handleGenerateImage(promptText) {
  const cleanPrompt = String(promptText || '').trim();
  if (!cleanPrompt) {
    if (messageInput) {
      messageInput.value = '';
      messageInput.placeholder = 'Digite o que você quer criar na imagem e aperte Enter...';
      messageInput.focus();
      autoResizeTextarea();
    }
    return;
  }

  appendMessageBubble('user', cleanPrompt);
  if (sendBtn) sendBtn.disabled = true;
  if (typingIndicator) typingIndicator.classList.remove('hidden');

  try {
    const res = await fetch(`${API_URL}/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: cleanPrompt }),
    });
    const data = await res.json();

    if (!res.ok || !data.imageUrl) {
      appendMessageBubble('assistant', `> **Erro:** ${data.error || 'Não foi possível gerar a imagem.'}`);
    } else {
      appendGeneratedImageBubble(cleanPrompt, data.imageUrl, data.provider);
    }
  } catch {
    appendMessageBubble('assistant', '> **Erro de conexão:** Falha ao chamar o gerador de imagens.');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    if (typingIndicator) typingIndicator.classList.add('hidden');
    if (messageInput) {
      messageInput.placeholder = 'Escreva sua pergunta ou peça uma imagem do seu jeito...';
      messageInput.focus();
    }
  }
}

document.querySelectorAll('.prompt-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const action = chip.dataset.action;
    if (action === 'image') {
      const currentVal = messageInput
        ? extractImagePrompt(messageInput.value) || messageInput.value.trim()
        : '';
      if (currentVal) {
        if (messageInput) {
          messageInput.value = '';
          autoResizeTextarea();
        }
        handleGenerateImage(currentVal);
      } else if (messageInput) {
        messageInput.value = '';
        messageInput.placeholder = 'Escreva a ideia da imagem do seu jeito e envie...';
        messageInput.focus();
        autoResizeTextarea();
      }
      return;
    }

    const template = chip.dataset.template || '';
    if (messageInput) {
      messageInput.value = template;
      autoResizeTextarea();
      messageInput.focus();
    }
  });
});

function renderEmptyWelcome(
  title = 'Como posso ajudar hoje?',
  subtitle = 'Pergunte qualquer coisa, envie arquivos (PDF, DOCX, CSV, Imagens), busque na web ou peça imagens e diagramas visuais.'
) {
  if (!messagesContainer) return;
  messagesContainer.innerHTML = `
    <div class="welcome-card">
      <div class="welcome-badge">VAFRIX AI • SISTEMA COMPLETO</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(subtitle)}</p>
    </div>
  `;
}

// Histórico
function renderEmptyHistory() {
  if (!historyList) return;
  historyList.innerHTML = `<div class="history-empty">Nenhuma conversa salva</div>`;
}

async function loadConversations() {
  if (!historyList) return;
  try {
    const res = await fetch(`${API_URL}/conversations`);
    if (!res.ok) return;
    const data = await res.json();
    const conversations = data.conversations || [];
    historyList.innerHTML = '';

    if (!conversations.length) {
      renderEmptyHistory();
      return;
    }

    conversations.forEach((conv) => {
      const item = document.createElement('div');
      item.className = `history-item ${conv.id === state.currentConversationId ? 'active' : ''}`;
      item.innerHTML = `
        <span class="conv-title">${escapeHtml(conv.title)}</span>
        <button type="button" class="del-btn" title="Excluir">✕</button>
      `;

      item.querySelector('.conv-title').addEventListener('click', () => selectConversation(conv.id, conv.mode));
      item.querySelector('.del-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch(`${API_URL}/conversations/${conv.id}`, { method: 'DELETE' });
        if (state.currentConversationId === conv.id) {
          state.currentConversationId = null;
          renderEmptyWelcome();
        }
        loadConversations();
      });

      historyList.appendChild(item);
    });
  } catch (err) {
    console.error('Erro ao carregar histórico:', err);
  }
}

async function clearHistory() {
  if (!window.confirm('Deseja apagar todo o histórico de conversas?')) return;

  try {
    await fetch(`${API_URL}/conversations`, { method: 'DELETE' });
  } catch (err) {
    console.error('Erro ao limpar histórico:', err);
  }

  state.currentConversationId = null;
  clearAttachments();
  renderEmptyHistory();
  renderEmptyWelcome(
    'Histórico limpo',
    'As conversas anteriores foram removidas. Inicie uma nova consulta quando quiser.'
  );
}

if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', clearHistory);
}

async function selectConversation(id, mode = 'chat') {
  state.currentConversationId = id;
  state.currentMode = mode;
  switchView('chat', mode);
  if (messagesContainer) messagesContainer.innerHTML = '';

  try {
    const res = await fetch(`${API_URL}/conversations/${id}/messages`);
    const data = await res.json();
    (data.messages || []).forEach((msg) => {
      const body = appendMessageBubble(msg.role, msg.content, msg.attachment_name);
      if (body && typeof mermaid !== 'undefined' && msg.content.includes('```mermaid')) {
        mermaid.run({ nodes: body.querySelectorAll('.mermaid') });
      }
    });
    await loadConversations();
  } catch (err) {
    console.error('Erro ao abrir conversa:', err);
  }
}

if (newChatBtn) {
  newChatBtn.addEventListener('click', () => {
    state.currentConversationId = null;
    clearAttachments();
    switchView('chat', state.currentMode === 'diagnostic' ? 'diagnostic' : 'chat');
    renderEmptyWelcome();
    loadConversations();
  });
}

// Auto-resize do composer
function autoResizeTextarea() {
  if (!messageInput) return;
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 180)}px`;
}

if (messageInput) {
  messageInput.addEventListener('input', autoResizeTextarea);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (chatForm) chatForm.requestSubmit();
    }
  });
}

// Anexos
function updateAttachmentPreview() {
  if (!attachmentPreview) return;
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

  const clearAttachBtn = document.getElementById('clearAttachBtn');
  if (clearAttachBtn) clearAttachBtn.addEventListener('click', clearAttachments);
}

function clearAttachments() {
  state.selectedImageFile = null;
  state.attachedFileText = '';
  state.attachedFileName = '';
  if (imageInput) imageInput.value = '';
  if (fileInput) fileInput.value = '';
  updateAttachmentPreview();
}

if (attachImageBtn && imageInput) {
  attachImageBtn.addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      state.selectedImageFile = file;
      updateAttachmentPreview();
    }
  });
}

if (attachFileBtn && fileInput) {
  attachFileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      state.attachedFileName = file.name;
      state.attachedFileText = await file.text();
      updateAttachmentPreview();
    }
  });
}

// Envio com animação suave das letras descendo e geração direta de imagem
if (chatForm) {
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput ? messageInput.value.trim() : '';
    const fileToSend = state.selectedImageFile || fileInput?.files?.[0] || null;
    if (!text && !fileToSend && !state.attachedFileText) return;

    const imagePromptToGenerate =
      !fileToSend && !state.attachedFileText ? extractImagePrompt(text) : '';

    if (imagePromptToGenerate) {
      if (messageInput) {
        messageInput.value = '';
        autoResizeTextarea();
      }
      await handleGenerateImage(imagePromptToGenerate);
      return;
    }

    const displayAttachment = fileToSend ? fileToSend.name : state.attachedFileName || null;
    appendMessageBubble('user', text || '(Anexo enviado para análise)', displayAttachment);

    const formData = new FormData();
    if (state.currentConversationId) formData.append('conversationId', state.currentConversationId);
    formData.append('message', text);
    formData.append('mode', state.currentMode);
    formData.append('enableSearch', webSearchToggle ? webSearchToggle.checked : false);
    if (state.attachedFileText) {
      formData.append('fileText', state.attachedFileText);
      formData.append('attachmentName', state.attachedFileName);
    }
    if (fileToSend) {
      formData.append('image', fileToSend);
    }

    if (messageInput) {
      messageInput.value = '';
      autoResizeTextarea();
    }
    clearAttachments();
    if (sendBtn) sendBtn.disabled = true;
    if (typingIndicator) typingIndicator.classList.remove('hidden');

    const assistantBody = appendMessageBubble('assistant', '');
    let displayedText = '';
    const charQueue = [];
    let streamFinished = false;

    const typingInterval = setInterval(() => {
      if (charQueue.length > 0) {
        const nextChar = charQueue.shift();
        displayedText += nextChar;
        if (assistantBody) {
          assistantBody.innerHTML = formatAssistantMarkdown(displayedText);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      } else if (streamFinished) {
        clearInterval(typingInterval);
        if (assistantBody && typeof mermaid !== 'undefined' && displayedText.includes('```mermaid')) {
          mermaid.run({ nodes: assistantBody.querySelectorAll('.mermaid') });
        }
        if (sendBtn) sendBtn.disabled = false;
        if (typingIndicator) typingIndicator.classList.add('hidden');
        if (messageInput) messageInput.focus();
        loadConversations();
      }
    }, 16);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        body: formData,
      });

      const newConvId = res.headers.get('X-Conversation-Id');
      if (newConvId) state.currentConversationId = Number(newConvId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = `> **Erro:** ${errData.error || 'Falha ao consultar a VAFRIX AI.'}`;
        charQueue.push(...errMsg);
        streamFinished = true;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        charQueue.push(...chunk);
      }

      streamFinished = true;
    } catch {
      const connErr = '> **Erro de conexão:** Não foi possível alcançar o servidor backend da VAFRIX AI.';
      charQueue.push(...connErr);
      streamFinished = true;
    }
  });
}

// Checklists
function renderChecklist() {
  const container = document.getElementById('checklistItems');
  if (!container) return;
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
    const checkbox = row.querySelector('input');
    if (checkbox) {
      checkbox.addEventListener('change', (ev) => {
        const next = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
        if (ev.target.checked) next.add(index);
        else next.delete(index);
        localStorage.setItem(storageKey, JSON.stringify([...next]));
        renderChecklist();
      });
    }
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
    'RELATÓRIO TÉCNICO — VAFRIX AI',
    `Título: ${rep.title}`,
    `Equipamento/Item: ${rep.equipment_involved || rep.equipment || 'Não informado'}`,
    `Descrição do problema: ${rep.problem_description}`,
    `Diagnóstico: ${rep.diagnosis || 'Não informado'}`,
    `Procedimentos realizados: ${rep.procedures || 'Não informado'}`,
    `Resultado: ${rep.result || 'Não informado'}`,
    `Recomendações: ${rep.recommendations || 'Não informado'}`,
  ].join('\n');
}

if (reportForm) {
  reportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      conversationId: state.currentConversationId,
      title: document.getElementById('repTitle')?.value.trim() || '',
      equipment: document.getElementById('repEquipment')?.value.trim() || '',
      problemDescription: document.getElementById('repProblem')?.value.trim() || '',
      diagnosis: document.getElementById('repDiagnosis')?.value.trim() || '',
      procedures: document.getElementById('repProcedures')?.value.trim() || '',
      result: document.getElementById('repResult')?.value.trim() || '',
      recommendations: document.getElementById('repRecommendations')?.value.trim() || '',
    };

    try {
      const res = await fetch(`${API_URL}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.report) {
        if (reportFormattedText) reportFormattedText.textContent = formatReport(data.report);
        if (reportOutputBox) reportOutputBox.classList.remove('hidden');
        reportForm.reset();
        await loadReports();
      }
    } catch (err) {
      console.error('Erro ao salvar relatório:', err);
    }
  });
}

if (copyReportBtn && reportFormattedText) {
  copyReportBtn.addEventListener('click', () => {
    copyToClipboard(reportFormattedText.textContent, copyReportBtn);
  });
}

async function loadReports() {
  if (!savedReportsList) return;
  try {
    const res = await fetch(`${API_URL}/reports`);
    const data = await res.json();
    savedReportsList.innerHTML = '';
    (data.reports || []).forEach((rep) => {
      const card = document.createElement('div');
      card.className = 'saved-report-card';
      card.innerHTML = `
        <strong>${escapeHtml(rep.title)}</strong>
        <div class="saved-report-desc">${escapeHtml(rep.problem_description)}</div>
      `;
      card.addEventListener('click', () => {
        if (reportFormattedText) reportFormattedText.textContent = formatReport(rep);
        if (reportOutputBox) reportOutputBox.classList.remove('hidden');
      });
      savedReportsList.appendChild(card);
    });
  } catch (err) {
    console.error('Erro ao carregar relatórios:', err);
  }
}

// Inicialização
loadConversations();