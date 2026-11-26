// backend/src/services/aiService.js
const { GoogleGenAI } = require('@google/genai');

const SYSTEM_INSTRUCTION = `
Você é a VAFRIX AI, uma inteligência artificial especialista em Tecnologia da Informação (TI), atuando como engenheiro/técnico sênior de infraestrutura e suporte técnico, além de professor didático.

Especialidades principais:
- Redes de computadores (IPv4/IPv6, sub-redes, gateway, DNS, DHCP, VLAN, roteamento/switching, protocolos, cabeamento estruturado, roteadores/switches, Wi-Fi, diagnóstico de conectividade, Cisco Packet Tracer).
- Infraestrutura de TI (racks, patch panels, cabeamento, redes empresariais, servidores, virtualização, Windows Server, Linux, compartilhamento de arquivos, usuários e permissões).
- CFTV e monitoramento (câmeras IP e analógicas, DVR/NVR, PoE, configuração de câmeras, endereçamento IP, armazenamento, diagnóstico de falhas, acesso remoto).
- Manutenção de computadores (hardware, CPU, placa-mãe, RAM, SSD/HD, fonte, GPU, SO, drivers, formatação, preventiva/corretiva, lentidão e falhas).
- Suporte técnico (triagem, atendimento, resolução de erros, checklists, relatórios técnicos, orientação clara).
- Segurança da informação (segurança de redes, firewall, controle de acesso, proteção de dispositivos, boas práticas, vulnerabilidades, diagnóstico defensivo, backup e recuperação).

Regras de comportamento:
1. Entenda o cenário antes de dar a solução final; faça perguntas objetivas quando faltarem dados importantes (ex.: modelo, IPs, sintomas, logs).
2. Explique passo a passo, mostrando comandos/exemplos práticos e explicando a finalidade de cada comando.
3. Liste possíveis causas e alternativas de solução quando fizer sentido.
4. Adapte o nível técnico ao usuário com clareza, sem enrolação.
5. Nunca invente informações técnicas; admita quando não souber ou quando precisar de mais contexto.
6. Sempre alerte sobre riscos antes de comandos ou passos que possam causar perda de dados, queda de serviço ou dano a equipamentos. Nunca peça senhas, credenciais administrativas ou chaves privadas.
7. Quando estiver em MODO DIAGNÓSTICO, siga uma investigação estruturada: identifique o problema, faça perguntas-chave, indique testes seguros, analise resultados, aponte causas prováveis, recomende correções e explique como confirmar a resolução.
`;

const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
];

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'SUA_CHAVE_DO_GEMINI_AQUI') {
    throw new Error('GEMINI_API_KEY não configurada no arquivo .env do backend.');
  }
  return new GoogleGenAI({ apiKey });
}

function getErrorCode(err) {
  return err?.status || err?.error?.code || err?.code;
}

function isTransientError(err) {
  const code = getErrorCode(err);
  return code === 503 || code === 429 || code === 500 || code === 504;
}

function buildModelQueue() {
  const primary = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite')
    .replace(/^models\//, '')
    .trim();

  const queue = [primary];
  for (const candidate of FALLBACK_MODELS) {
    const clean = candidate.replace(/^models\//, '').trim();
    if (clean && !queue.includes(clean)) {
      queue.push(clean);
    }
  }
  return queue;
}

async function callModelWithRetry(ai, baseParams, modelName, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent({
        ...baseParams,
        model: modelName,
      });
    } catch (err) {
      const code = getErrorCode(err);
      const transient = isTransientError(err);

      if (!transient || attempt === maxRetries) {
        throw err;
      }

      // Em 429 (cota), espera um pouco mais antes de tentar novamente/trocar modelo
      const baseWait = code === 429 ? 2000 : 1000;
      const waitMs = baseWait * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

function extractResponseText(response) {
  const fromGetter = typeof response?.text === 'string' ? response.text : '';
  if (fromGetter.trim()) {
    return fromGetter.trim();
  }

  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const joined = parts
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    if (joined) {
      return joined;
    }
  }

  return '';
}

function buildContents(history = [], prompt = '', imagePart = null) {
  const contents = [];

  if (Array.isArray(history)) {
    for (const item of history) {
      const text = typeof item?.content === 'string' ? item.content.trim() : '';
      if (!text) continue;

      contents.push({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text }],
      });
    }
  }

  const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  const userParts = [];

  if (cleanPrompt) {
    userParts.push({ text: cleanPrompt });
  }

  if (imagePart && imagePart.base64 && imagePart.mimeType) {
    userParts.push({
      inlineData: {
        data: imagePart.base64,
        mimeType: imagePart.mimeType,
      },
    });
  }

  if (userParts.length === 0) {
    userParts.push({ text: 'Olá, preciso de suporte técnico.' });
  }

  contents.push({
    role: 'user',
    parts: userParts,
  });

  return contents;
}

async function generateVafrixResponse({ history = [], prompt, mode = 'chat', imagePart = null }) {
  const ai = getAiClient();

  const modePrefix =
    mode === 'diagnostic'
      ? '[MODO DIAGNÓSTICO ATIVO: Conduza uma investigação técnica estruturada com perguntas, testes seguros, causas prováveis, correções e validação.]\n\n'
      : mode === 'checklist'
      ? '[MODO CHECKLIST ATIVO: Gere um checklist prático e organizado por etapas.]\n\n'
      : '';

  const formattedPrompt = `${modePrefix}${typeof prompt === 'string' ? prompt : ''}`;
  const contents = buildContents(history, formattedPrompt, imagePart);
  const modelQueue = buildModelQueue();

  let lastError = null;

  for (let i = 0; i < modelQueue.length; i++) {
    const modelName = modelQueue[i];
    const hasNextFallback = i < modelQueue.length - 1;

    try {
      console.log('[VAFRIX AI] Usando modelo:', modelName);

      const response = await callModelWithRetry(
        ai,
        {
          contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.4,
          },
        },
        modelName,
        2
      );

      const text = extractResponseText(response);

      if (text) {
        return text;
      }

      console.warn('[VAFRIX AI] Resposta vazia do modelo:', modelName, {
        finishReason: response?.candidates?.[0]?.finishReason,
        blockReason: response?.promptFeedback?.blockReason,
      });

      if (!hasNextFallback) {
        return 'A IA retornou uma resposta vazia para essa solicitação. Tente reformular a pergunta ou enviar novamente.';
      }
    } catch (err) {
      lastError = err;
      const code = getErrorCode(err);

      console.error(
        `[VAFRIX AI] Falha no modelo ${modelName} (status: ${code || 'desconhecido'}):`,
        err?.message || err
      );

      // Se o erro for de chave/requisição inválida (400/401/403), não adianta trocar de modelo
      if (code === 400 || code === 401 || code === 403) {
        throw err;
      }

      // Se não há mais modelos na fila, propaga o último erro
      if (!hasNextFallback) {
        throw lastError;
      }

      console.log('[VAFRIX AI] Tentando modelo de fallback:', modelQueue[i + 1]);
    }
  }

  throw lastError || new Error('Não foi possível obter resposta de nenhum modelo configurado.');
}

module.exports = { generateVafrixResponse };