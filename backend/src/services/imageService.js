// backend/src/services/imageService.js
const axios = require('axios');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanPrompt(rawPrompt) {
  return String(rawPrompt || '').trim();
}

function toDataUrlFromBuffer(buffer, contentType = 'image/png') {
  const mime = String(contentType || 'image/png').split(';')[0].trim() || 'image/png';
  const safeMime = mime.startsWith('image/') ? mime : 'image/png';
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:${safeMime};base64,${base64}`;
}

async function fetchImageUrlWithRetry(url, providerName, maxRetries = 2) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 VAFRIX-AI/2.0',
          Accept: 'image/*,*/*;q=0.8',
        },
      });

      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      if (!response.data || response.data.byteLength < 500) {
        throw new Error('Resposta de imagem vazia ou inválida.');
      }

      if (contentType && !contentType.startsWith('image/')) {
        throw new Error(`Conteúdo não é imagem (${contentType}).`);
      }

      return {
        imageUrl: toDataUrlFromBuffer(response.data, contentType || 'image/png'),
        provider: providerName,
      };
    } catch (err) {
      lastError = err;
      const status = err?.response?.status;
      const retryable = !status || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;

      if (!retryable || attempt === maxRetries) {
        break;
      }

      await sleep(attempt * 1200);
    }
  }

  throw lastError || new Error(`Falha no provedor ${providerName}`);
}

async function tryPollinations(prompt) {
  const encoded = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 1000000);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1280&height=720&seed=${seed}&nologo=true&nofeed=true`;
  return await fetchImageUrlWithRetry(url, 'VAFRIX HD', 2);
}

async function tryHuggingFace(prompt) {
  const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (!hfToken) {
    return null;
  }

  const modelUrl = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';
  const response = await axios.post(
    modelUrl,
    { inputs: prompt },
    {
      responseType: 'arraybuffer',
      timeout: 45000,
      headers: {
        Authorization: `Bearer ${hfToken}`,
        Accept: 'image/png',
        'Content-Type': 'application/json',
      },
    }
  );

  const contentType = response.headers['content-type'] || 'image/png';
  return {
    imageUrl: toDataUrlFromBuffer(response.data, contentType),
    provider: 'FLUX.1 Schnell',
  };
}

async function generateImageFromPrompt(rawPrompt) {
  const prompt = cleanPrompt(rawPrompt);
  if (!prompt) {
    throw new Error('Informe uma descrição para gerar a imagem.');
  }

  const errors = [];

  // 1. Tenta provedor principal sem chave
  try {
    return await tryPollinations(prompt);
  } catch (err) {
    const status = err?.response?.status || err?.code || 'erro';
    errors.push(`Pollinations (${status})`);
    console.warn(`[VAFRIX Image] Pollinations falhou (${status}): ${err?.message || err}`);
  }

  // 2. Se houver token do Hugging Face no .env, tenta FLUX.1-schnell
  try {
    const hfResult = await tryHuggingFace(prompt);
    if (hfResult) return hfResult;
  } catch (err) {
    const status = err?.response?.status || err?.code || 'erro';
    errors.push(`HuggingFace (${status})`);
    console.warn(`[VAFRIX Image] HuggingFace falhou (${status}): ${err?.message || err}`);
  }

  throw new Error(
    `Não foi possível gerar a imagem agora (${errors.join(' | ')}). Tente novamente em alguns segundos.`
  );
}

module.exports = { generateImageFromPrompt };