const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

const extractText = async (filepath, fileType) => {
  const absolutePath = path.resolve(filepath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error('File not found on disk: ' + absolutePath);
  }

  // Plain text
  if (fileType === 'text/plain') {
    return fs.readFileSync(absolutePath, 'utf-8');
  }

  // PDF
  if (fileType === 'application/pdf') {
    try {
      const dataBuffer = fs.readFileSync(absolutePath);
      const data = await pdfParse(dataBuffer);
      const text = (data.text || '').trim();
      if (!text) {
        return '[This PDF appears to be image-based or has no selectable text. AI features may be limited.]';
      }
      return text;
    } catch (err) {
      console.error('PDF parse error:', err.message);
      return '[PDF text extraction failed. The file may be corrupted or password-protected.]';
    }
  }

  // Word .docx
  if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileType === 'application/msword'
  ) {
    try {
      const result = await mammoth.extractRawText({ path: absolutePath });
      const text = (result.value || '').trim();
      if (!text) return '[Word document appears to be empty or has no extractable text.]';
      return text;
    } catch (err) {
      console.error('Word parse error:', err.message);
      return '[Word document text extraction failed.]';
    }
  }

  // Excel .xlsx / .xls
  if (
    fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    fileType === 'application/vnd.ms-excel'
  ) {
    try {
      const workbook = XLSX.readFile(absolutePath);
      let allText = '';
      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        allText += `\n--- Sheet: ${sheetName} ---\n${csv}\n`;
      });
      const text = allText.trim();
      if (!text) return '[Excel file appears to be empty.]';
      return text;
    } catch (err) {
      console.error('Excel parse error:', err.message);
      return '[Excel file text extraction failed.]';
    }
  }

  // PowerPoint .pptx
  if (fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    try {
      // Extract text from pptx XML (zip-based)
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(absolutePath);
      const slideEntries = zip.getEntries().filter(e => e.entryName.match(/ppt\/slides\/slide\d+\.xml/));
      let allText = '';
      slideEntries.forEach((entry, idx) => {
        const xml = entry.getData().toString('utf-8');
        const texts = [...xml.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g)].map(m => m[1]);
        allText += `\n--- Slide ${idx + 1} ---\n${texts.join(' ')}\n`;
      });
      return allText.trim() || '[PowerPoint appears to have no extractable text.]';
    } catch (err) {
      return '[PowerPoint text extraction failed.]';
    }
  }

  // Images (OCR)
  if (fileType.startsWith('image/')) {
    try {
      const Tesseract = require('tesseract.js');
      const { data: { text } } = await Tesseract.recognize(absolutePath, 'eng');
      const cleanedText = (text || '').trim();
      if (!cleanedText) return '[Image appears to have no readable text.]';
      return cleanedText;
    } catch (err) {
      console.error('OCR error:', err.message);
      return '[Image text extraction (OCR) failed. The image might be too low resolution or in an unsupported format.]';
    }
  }

  return `[Unsupported file type: ${fileType}]`;
};

module.exports = { extractText };
