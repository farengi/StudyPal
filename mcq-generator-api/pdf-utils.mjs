// Import necessary modules
import { promises as fs } from 'fs';
import pdfjsLib from 'pdfjs-dist';

// Set up the PDF.js worker
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.js?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Enhanced PDF text extraction with better handling of document structure
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} - Extracted text content
 */
export const extractPdfText = async (filePath) => {
  try {
    // Read the PDF file
    const data = new Uint8Array(await fs.readFile(filePath));

    // Load the PDF document
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    console.log(`PDF loaded successfully with ${pdf.numPages} pages`);

    let completeText = '';

    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);

      // Get text content with more detailed options
      const textContent = await page.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });

      // Process text content maintaining structure
      let lastY = null;
      let text = '';

      for (const item of textContent.items) {
        if (lastY !== item.transform[5] && lastY !== null) {
          text += '\n'; // Add newline for new vertical position (new line)
        }
        text += item.str;
        lastY = item.transform[5];
      }

      completeText += text + '\n\n'; // Add double newline between pages
      console.log(`Processed page ${pageNum}/${pdf.numPages}`);
    }

    // Clean up the text
    completeText = completeText
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s+/g, '\n') // Clean up whitespace after newlines
      .replace(/\n{3,}/g, '\n\n'); // Replace 3+ consecutive newlines with 2

    return completeText;
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
};

/**
 * Extract metadata from PDF
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<Object>} - PDF metadata
 */
export const extractPdfMetadata = async (filePath) => {
  try {
    const data = new Uint8Array(await fs.readFile(filePath));
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const metadata = await pdf.getMetadata();

    return {
      numPages: pdf.numPages,
      info: metadata.info,
      metadata: metadata.metadata ? metadata.metadata.getAll() : null,
    };
  } catch (error) {
    console.error('Error extracting PDF metadata:', error);
    return { error: error.message };
  }
};

/**
 * Get text from a specific page range
 * @param {string} filePath - Path to the PDF file
 * @param {number} startPage - Start page (1-based)
 * @param {number} endPage - End page (inclusive)
 * @returns {Promise<string>} - Extracted text content
 */
export const extractPdfPageRange = async (filePath, startPage = 1, endPage = null) => {
  try {
    const data = new Uint8Array(await fs.readFile(filePath));
    const pdf = await pdfjsLib.getDocument({ data }).promise;

    // Validate page range
    if (!endPage || endPage > pdf.numPages) {
      endPage = pdf.numPages;
    }
    if (startPage < 1) {
      startPage = 1;
    }

    let completeText = '';

    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(' ');
      completeText += pageText + '\n\n';
    }

    return completeText;
  } catch (error) {
    console.error('Error extracting PDF page range:', error);
    throw new Error(`Failed to extract page range from PDF: ${error.message}`);
  }
};