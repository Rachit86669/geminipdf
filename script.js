// Tab Switching Logic
function switchTab(tabId, tabButton) {
    // Hide all tools
    document.querySelectorAll('.tool-card').forEach(card => {
        card.classList.remove('active-tab');
    });
    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    // Hide previous output
    document.getElementById('output').style.display = 'none';

    // Show selected tool
    document.getElementById(tabId).classList.add('active-tab');
    // Highlight selected tab button
    tabButton.classList.add('active');
}

// Helper: Show Download Link
function showDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.href = url;
    downloadBtn.download = fileName;
    document.getElementById('output').style.display = 'block';
}

// 1. Compress / Re-save PDF Logic
async function processCompress() {
    const input = document.getElementById('compressInput');
    if (!input.files[0]) {
        alert('Please select a PDF file first.');
        return;
    }

    const file = input.files[0];
    const arrayBuffer = await file.arrayBuffer();
    
    // Load PDF using PDFLib
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
    
    // Save PDF (Re-encoding reduces unnecessary metadata)
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    showDownload(blob, `compressed_${file.name}`);
}

// 2. Image to PDF Logic
async function processImgToPdf() {
    const input = document.getElementById('imgInput');
    if (input.files.length === 0) {
        alert('Please select at least one image.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const imageData = await readAsDataURL(file);

        if (i > 0) doc.addPage();
        
        // Add image to full page fit
        doc.addImage(imageData, 'JPEG', 10, 10, 190, 260);
    }

    const pdfBlob = doc.output('blob');
    showDownload(pdfBlob, 'converted_images.pdf');
}

// Helper: Read File as Data URL
function readAsDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

// 3. Merge PDFs Logic
async function processMerge() {
    const input = document.getElementById('mergeInput');
    if (input.files.length < 2) {
        alert('Please select at least two PDF files to merge.');
        return;
    }

    const mergedPdf = await PDFLib.PDFDocument.create();

    for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const pdfBytes = await mergedPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    showDownload(blob, 'merged_document.pdf');
}
// 4. Edit / Watermark PDF Logic
async function processEditPdf() {
    const input = document.getElementById('editInput');
    const text = document.getElementById('watermarkText').value;

    if (!input.files[0]) {
        alert('Please select a PDF file first.');
        return;
    }

    if (!text) {
        alert('Please enter watermark text.');
        return;
    }

    const file = input.files[0];
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
    
    const pages = pdfDoc.getPages();
    
    // Add the watermark to every page
    pages.forEach((page) => {
        const { width, height } = page.getSize();
        page.drawText(text, {
            x: width / 4,
            y: height / 2,
            size: 30,
            color: PDFLib.rgb(0.75, 0.75, 0.75),
            opacity: 0.5,
        });
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });

    showDownload(blob, `edited_${file.name}`);
}

// 5. Translate PDF Logic
if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

async function processTranslatePdf() {
    const input = document.getElementById('translateInput');
    const sourceLanguage = document.getElementById('sourceLanguage').value.trim() || 'Auto-detect';
    const targetLanguage = document.getElementById('targetLanguage').value.trim();
    const button = document.getElementById('translateButton');
    const errorBox = document.getElementById('translationError');

    errorBox.hidden = true;
    document.getElementById('output').style.display = 'none';

    if (!input.files[0]) {
        showTranslationError('Please choose a PDF file first.');
        return;
    }

    if (!targetLanguage || targetLanguage.toLowerCase() === 'auto-detect') {
        showTranslationError('Please enter the language you want for the translated PDF.');
        return;
    }

    const file = input.files[0];
    if (file.size > 15 * 1024 * 1024) {
        showTranslationError('Please choose a PDF smaller than 15 MB.');
        return;
    }

    button.disabled = true;
    button.querySelector('span').textContent = 'Translating…';
    updateTranslationStatus('Reading text from your PDF…', 5);

    try {
        const pages = await extractPdfPages(file);
        const textPages = pages.filter(page => page.trim().length > 0);

        if (textPages.length === 0) {
            throw new Error('No selectable text was found. This PDF may be scanned or image-only and needs OCR first.');
        }

        const translatedPages = [];
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
            const pageText = pages[pageIndex].trim();
            if (!pageText) {
                translatedPages.push('');
                continue;
            }

            const progress = 15 + Math.round((pageIndex / pages.length) * 65);
            updateTranslationStatus(`Translating page ${pageIndex + 1} of ${pages.length}…`, progress);
            translatedPages.push(await translatePageText(pageText, sourceLanguage, targetLanguage));
        }

        updateTranslationStatus('Creating your translated PDF…', 85);
        const pdfBlob = await createTranslatedPdf(translatedPages, file.name, targetLanguage);
        const safeLanguage = targetLanguage.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'translated';
        const baseName = file.name.replace(/\.pdf$/i, '');

        showDownload(pdfBlob, `${baseName}_${safeLanguage}.pdf`);
        updateTranslationStatus('Translation complete. Your PDF is ready.', 100);
    } catch (error) {
        showTranslationError(error.message || 'Translation failed. Please try again.');
        document.getElementById('translationStatus').hidden = true;
    } finally {
        button.disabled = false;
        button.querySelector('span').textContent = 'Translate & Download PDF';
    }
}

async function extractPdfPages(file) {
    if (!window.pdfjsLib) {
        throw new Error('The PDF reader did not load. Please refresh the page and try again.');
    }

    const documentData = new Uint8Array(await file.arrayBuffer());
    const pdf = await window.pdfjsLib.getDocument({ data: documentData }).promise;
    const pages = [];

    if (pdf.numPages > 75) {
        throw new Error('Please choose a PDF with 75 pages or fewer.');
    }

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        updateTranslationStatus(`Reading page ${pageNumber} of ${pdf.numPages}…`, 5 + Math.round((pageNumber / pdf.numPages) * 10));
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(joinPdfTextItems(content.items));
        if (pages.reduce((total, pageText) => total + pageText.length, 0) > 400000) {
            throw new Error('This PDF contains too much text for one translation. Please split it into smaller files.');
        }
        page.cleanup();
    }

    return pages;
}

function joinPdfTextItems(items) {
    let text = '';
    let previousY = null;

    items.forEach(item => {
        const currentY = Math.round(item.transform[5]);
        if (previousY !== null && Math.abs(currentY - previousY) > 4) {
            text += '\n';
        } else if (text && !text.endsWith('\n') && !text.endsWith(' ')) {
            text += ' ';
        }
        text += item.str;
        previousY = currentY;
    });

    return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function translatePageText(text, sourceLanguage, targetLanguage) {
    const chunks = splitTextIntoChunks(text, 8000);
    const translations = [];

    for (const chunk of chunks) {
        const response = await fetch('/api/translate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: chunk, sourceLanguage, targetLanguage })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'The translation service is temporarily unavailable.');
        }
        translations.push(data.translation);
    }

    return translations.join('\n\n');
}

function splitTextIntoChunks(text, maxLength) {
    const paragraphs = text.split(/\n{2,}/);
    const chunks = [];
    let currentChunk = '';

    paragraphs.forEach(paragraph => {
        if (paragraph.length > maxLength) {
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
            for (let start = 0; start < paragraph.length; start += maxLength) {
                chunks.push(paragraph.slice(start, start + maxLength));
            }
        } else if (`${currentChunk}\n\n${paragraph}`.trim().length > maxLength) {
            chunks.push(currentChunk);
            currentChunk = paragraph;
        } else {
            currentChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
        }
    });

    if (currentChunk) chunks.push(currentChunk);
    return chunks;
}

async function createTranslatedPdf(translatedPages, originalName, targetLanguage) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    const pageWidth = 1240;
    const pageHeight = 1754;
    let hasPdfPage = false;

    for (let sourcePageIndex = 0; sourcePageIndex < translatedPages.length; sourcePageIndex++) {
        const text = translatedPages[sourcePageIndex] || '[No extractable text on this page]';
        const renderedPages = renderTextToCanvases(text, {
            pageWidth,
            pageHeight,
            targetLanguage,
            sourcePageNumber: sourcePageIndex + 1,
            originalName
        });

        for (const canvas of renderedPages) {
            if (hasPdfPage) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 595.28, 841.89, undefined, 'FAST');
            hasPdfPage = true;
        }
    }

    return pdf.output('blob');
}

function renderTextToCanvases(text, options) {
    const { pageWidth, pageHeight, targetLanguage, sourcePageNumber, originalName } = options;
    const margin = 110;
    const bodyFontSize = 30;
    const lineHeight = 46;
    const contentBottom = pageHeight - 105;
    const isRtl = detectRtl(text, targetLanguage);
    const paragraphs = text.split(/\n+/);
    const canvases = [];
    let canvas;
    let context;
    let cursorY;
    let continuation = 0;

    function startPage() {
        canvas = document.createElement('canvas');
        canvas.width = pageWidth;
        canvas.height = pageHeight;
        context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, pageWidth, pageHeight);
        context.fillStyle = '#263ca4';
        context.fillRect(0, 0, 18, pageHeight);
        context.direction = isRtl ? 'rtl' : 'ltr';
        context.textAlign = isRtl ? 'right' : 'left';
        context.fillStyle = '#17203c';
        context.font = '700 34px system-ui, sans-serif';
        context.fillText(`Translated to ${targetLanguage}`, isRtl ? pageWidth - margin : margin, 92);
        context.fillStyle = '#77809a';
        context.font = '22px system-ui, sans-serif';
        const pageLabel = `Source page ${sourcePageNumber}${continuation ? ` · continued ${continuation}` : ''} · ${originalName}`;
        context.fillText(pageLabel, isRtl ? pageWidth - margin : margin, 132);
        context.strokeStyle = '#e4e7f1';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(margin, 162);
        context.lineTo(pageWidth - margin, 162);
        context.stroke();
        context.fillStyle = '#22283a';
        context.font = `${bodyFontSize}px system-ui, "Noto Sans", sans-serif`;
        cursorY = 220;
        continuation++;
    }

    startPage();
    paragraphs.forEach(paragraph => {
        const lines = wrapCanvasText(context, paragraph.trim(), pageWidth - (margin * 2));
        if (lines.length === 0) {
            cursorY += lineHeight;
            return;
        }

        lines.forEach(line => {
            if (cursorY + lineHeight > contentBottom) {
                canvases.push(canvas);
                startPage();
            }
            context.fillText(line, isRtl ? pageWidth - margin : margin, cursorY);
            cursorY += lineHeight;
        });
        cursorY += Math.round(lineHeight * 0.45);
    });

    canvases.push(canvas);
    return canvases;
}

function wrapCanvasText(context, text, maxWidth) {
    if (!text) return [];
    const segmenter = typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'word' })
        : null;
    const segments = segmenter
        ? Array.from(segmenter.segment(text), item => item.segment)
        : text.split(/(\s+)/);
    const lines = [];
    let line = '';

    segments.forEach(segment => {
        const candidate = line + segment;
        if (context.measureText(candidate).width <= maxWidth) {
            line = candidate;
            return;
        }

        if (line.trim()) lines.push(line.trim());
        if (context.measureText(segment).width <= maxWidth) {
            line = segment.trimStart();
            return;
        }

        const graphemes = typeof Intl.Segmenter === 'function'
            ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(segment), item => item.segment)
            : Array.from(segment);
        line = '';
        graphemes.forEach(grapheme => {
            if (context.measureText(line + grapheme).width > maxWidth && line) {
                lines.push(line);
                line = grapheme;
            } else {
                line += grapheme;
            }
        });
    });

    if (line.trim()) lines.push(line.trim());
    return lines;
}

function detectRtl(text, language) {
    const rtlLanguage = /arabic|hebrew|persian|farsi|urdu|pashto|kurdish|sindhi|yiddish/i.test(language);
    const rtlCharacters = (text.match(/[\u0590-\u08FF]/g) || []).length;
    return rtlLanguage || rtlCharacters > Math.max(5, text.length * 0.15);
}

function updateTranslationStatus(message, percent) {
    const status = document.getElementById('translationStatus');
    status.hidden = false;
    document.getElementById('translationStatusText').textContent = message;
    document.getElementById('translationPercent').textContent = `${percent}%`;
    document.getElementById('translationProgress').style.width = `${percent}%`;
}

function showTranslationError(message) {
    const errorBox = document.getElementById('translationError');
    errorBox.textContent = message;
    errorBox.hidden = false;
}
