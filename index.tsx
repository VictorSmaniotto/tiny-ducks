/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {GoogleGenAI, Modality} from '@google/genai';
import {marked} from 'marked';

// Função utilitária para baixar arquivo
function downloadFile(filename: string, blob: Blob) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Exporta todas as imagens do slideshow em um ZIP
async function exportImages() {
  const slideDivs = slideshow.querySelectorAll('.slide');
  if (slideDivs.length === 0) {
    alert('Nenhuma imagem para exportar!');
    return;
  }
  // Carrega JSZip dinamicamente
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  let idx = 1;
  for (const slide of slideDivs) {
    const img = slide.querySelector('img');
    const caption = slide.querySelector('div');
    if (img && img.src.startsWith('data:image')) {
      // Cria canvas para compor imagem + texto
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      // Tamanhos baseados na imagem e espaço para texto
      const imgEl = new window.Image();
      imgEl.src = img.src;
      await new Promise((resolve) => { imgEl.onload = resolve; });
      const width = imgEl.width;
      const height = imgEl.height;
      const text = caption ? (caption.innerText || caption.textContent || '') : '';
      const fontSize = 24;
      const padding = 24;
      canvas.width = width;
      canvas.height = height + fontSize * 2 + padding;
      // Fundo branco
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Desenha imagem
      ctx.drawImage(imgEl, 0, 0, width, height);
      // Desenha texto
      ctx.font = `${fontSize}px 'Comic Sans MS', 'Arial', sans-serif`;
      ctx.fillStyle = '#3a4a5a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      // Quebra de linha simples
      const lines = text.split(/\r?\n/);
      let y = height + padding / 2;
      for (const line of lines) {
        ctx.fillText(line, width / 2, y);
        y += fontSize + 4;
      }
      // Salva como PNG
      const composedBase64 = canvas.toDataURL('image/png').split(',')[1];
      zip.file(`patinho${idx}.png`, composedBase64, {base64: true});
      idx++;
    }
  }
  const content = await zip.generateAsync({type: 'blob'});
  downloadFile('patinhos.zip', content);
}

document.getElementById('export-images')?.addEventListener('click', exportImages);

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

const chat = ai.chats.create({
  model: 'gemini-2.0-flash-preview-image-generation',
  config: {
    responseModalities: [Modality.TEXT, Modality.IMAGE],
  },
  history: [],
});

const userInput = document.querySelector('#input') as HTMLTextAreaElement;
const modelOutput = document.querySelector('#output') as HTMLDivElement;
const slideshow = document.querySelector('#slideshow') as HTMLDivElement;
const error = document.querySelector('#error') as HTMLDivElement;

const additionalInstructions = `
Use uma história divertida sobre muitos patinhos pequenos como metáfora.
Mantenha frases curtas, conversacionais, casuais e envolventes.
Gere uma ilustração fofa e minimalista para cada frase, usando tinta preta em fundo branco.
Sem comentários extras, apenas comece a explicação.
Continue até terminar.`;

async function addSlide(text: string, image: HTMLImageElement) {
  const slide = document.createElement('div');
  slide.className = 'slide';
  const caption = document.createElement('div') as HTMLDivElement;
  caption.innerHTML = await marked.parse(text);
  slide.append(image);
  slide.append(caption);
  slideshow.append(slide);
}

function parseError(error: string) {
  const regex = /{"error":(.*)}/gm;
  const m = regex.exec(error);
  try {
    const e = m[1];
    const err = JSON.parse(e);
    return err.message;
  } catch (e) {
    return error;
  }
}

async function generate(message: string) {
  userInput.disabled = true;

  chat.history.length = 0;
  modelOutput.innerHTML = '';
  slideshow.innerHTML = '';
  error.innerHTML = '';
  error.toggleAttribute('hidden', true);

  try {
    const userTurn = document.createElement('div') as HTMLDivElement;
    userTurn.innerHTML = await marked.parse(message);
    userTurn.className = 'user-turn';
    modelOutput.append(userTurn);
    userInput.value = '';

    const result = await chat.sendMessageStream({
      message: message + additionalInstructions,
    });

    let text = '';
    let img = null;

    for await (const chunk of result) {
      for (const candidate of chunk.candidates) {
        for (const part of candidate.content.parts ?? []) {
          if (part.text) {
            text += part.text;
          } else {
            try {
              const data = part.inlineData;
              if (data) {
                img = document.createElement('img');
                img.src = `data:image/png;base64,` + data.data;
              } else {
                console.log('no data', chunk);
              }
            } catch (e) {
              console.log('no data', chunk);
            }
          }
          if (text && img) {
            await addSlide(text, img);
            slideshow.removeAttribute('hidden');
            text = '';
            img = null;
          }
        }
      }
    }
    if (img) {
      await addSlide(text, img);
      slideshow.removeAttribute('hidden');
      text = '';
    }
  } catch (e) {
    const msg = parseError(e);
    error.innerHTML = `Something went wrong: ${msg}`;
    error.removeAttribute('hidden');
  }
  userInput.disabled = false;
  userInput.focus();
}

userInput.addEventListener('keydown', async (e: KeyboardEvent) => {
  if (e.code === 'Enter') {
    e.preventDefault();
    const message = userInput.value;
    await generate(message);
  }
});

const examples = document.querySelectorAll('#examples li');
examples.forEach((li) =>
  li.addEventListener('click', async (e) => {
    await generate(li.textContent);
  }),
);
