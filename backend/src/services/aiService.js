// backend/src/services/aiService.js
const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');

const SYSTEM_INSTRUCTION = `
Você é a VAFRIX AI, uma inteligência artificial assistente geral de altíssimo nível, versátil, precisa e didática.

Diretrizes de resposta:
1. Responda sobre qualquer assunto com clareza, tom amigável e estrutura profissional.
2. Quando solicitado código ou soluções técnicas, forneça explicações passo a passo detalhadas.
3. Se forem fornecidos resultados de pesquisa na web ou texto de arquivos anexados, utilize-os para formular uma resposta atualizada e precisa.
4. Quando o usuário pedir um diagrama, fluxo ou topologia de rede, gere o código usando a sintaxe Mermaid dentro de um bloco de código de linguagem \`mermaid\`.
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
    throw new Error('GEMINI_API_KEY não configurada no arquivo .env.');
  }
  return new GoogleGenAI({ apiKey });
}

async function searchWeb(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      },
      timeout: 4000,
    });
    const html = response.data;
    const regex = /<a class="result__snippet[^>]*>(.*?)<\/a>/g;
    let match;
    const results = [];
    while ((match = regex.exec(html)) !== null && results.length < 4) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text) results.push(text);
    }
    return results.join('\n- ');
  } catch (err) {
    console.warn('[VAFRIX Search] Erro ao buscar na web:', err.message);
    return null;
  }
}

function buildContents(history = [], prompt = '', webContext = '', imagePart = null) {
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

  let finalPrompt = prompt || '';
  if (webContext) {
    finalPrompt += `\n\n--- INFORMAÇÕES RECENTES OBTIDAS NA WEB ---\n- ${webContext}\n--- FIM DOS DADOS DA WEB ---`;
  }

  const userParts = [];
  if (finalPrompt.trim()) {
    userParts.push({ text: finalPrompt.trim() });
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
    userParts.push({ text: 'Olá!' });
  }

  contents.push({
    role: 'user',
    parts: userParts,
  });

  return contents;
}

async function generateVafrixStreamResponse({
  history = [],
  prompt,
  mode = 'chat',
  imagePart = null,
  enableSearch = false,
  onChunk,
}) {
  const ai = getAiClient();

  let webContext = '';
  if (enableSearch && prompt) {
    console.log('[VAFRIX AI] Realizando pesquisa na web para:', prompt);
    webContext = await searchWeb(prompt);
  }

  const modePrefix =
    mode === 'diagnostic'
      ? '[MODO DIAGNÓSTICO: Conduza uma investigação estruturada com hipóteses, testes e soluções.]\n\n'
      : mode === 'checklist'
      ? '[MODO CHECKLIST: Gere um passo a passo prático de verificação.]\n\n'
      : '';

  const contents = buildContents(history, `${modePrefix}${prompt}`, webContext, imagePart);
  const primaryModel = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').replace(/^models\//, '').trim();

  const responseStream = await ai.models.generateContentStream({
    contents,
    model: primaryModel,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.5,
    },
  });

  let fullText = '';
  for await (const chunk of responseStream) {
    const chunkText = chunk.text || '';
    if (chunkText) {
      fullText += chunkText;
      if (typeof onChunk === 'function') {
        onChunk(chunkText);
      }
    }
  }

  return fullText || 'Não foi possível obter resposta.';
}

module.exports = { generateVafrixStreamResponse };