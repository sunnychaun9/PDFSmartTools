import { generatePDF, type PDFOptions } from 'react-native-html-to-pdf';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

export type ImageSource = {
  uri: string;
  width?: number;
  height?: number;
};

export type PdfGenerationOptions = {
  fileName?: string;
  pageSize?: 'A4' | 'LETTER' | 'LEGAL';
  fitImageToPage?: boolean;
  quality?: number; // 0-100
};

export type PdfGenerationResult = {
  filePath: string;
  fileName: string;
  pageCount: number;
};

/**
 * Get the base64 data from an image URI
 */
async function getImageBase64(uri: string): Promise<string> {
  try {
    // Handle file:// URIs
    const filePath = uri.startsWith('file://') ? uri.slice(7) : uri;

    // Check if file exists
    const exists = await RNFS.exists(filePath);
    if (!exists) {
      throw new Error(`Image file not found: ${filePath}`);
    }

    // Read file as base64
    const base64 = await RNFS.readFile(filePath, 'base64');
    return base64;
  } catch (error) {
    throw new Error(`Failed to read image: ${error}`);
  }
}

/**
 * Get the MIME type from file extension
 */
function getMimeType(uri: string): string {
  const extension = uri.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'bmp':
      return 'image/bmp';
    default:
      return 'image/jpeg';
  }
}

/**
 * Generate HTML content for PDF with images
 */
async function generateHtmlContent(
  images: ImageSource[],
  options: PdfGenerationOptions,
  isPro: boolean
): Promise<string> {
  const imageHtmlParts: string[] = [];

  const watermarkHtml = !isPro
    ? '<div class="watermark">PDF Smart Tools – Free Version</div>'
    : '';

  for (const image of images) {
    const base64 = await getImageBase64(image.uri);
    const mimeType = getMimeType(image.uri);
    const dataUri = `data:${mimeType};base64,${base64}`;

    const imgStyle = options.fitImageToPage
      ? 'max-width: 100%; max-height: 100%; object-fit: contain;'
      : 'width: 100%; height: auto;';

    imageHtmlParts.push(`
      <div class="page">
        ${watermarkHtml}
        <img src="${dataUri}" style="${imgStyle}" />
      </div>
    `);
  }

  const watermarkStyles = !isPro
    ? `
        .watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-30deg);
          font-size: 48px;
          font-family: Arial, sans-serif;
          font-weight: bold;
          color: rgba(128, 128, 128, 0.15);
          white-space: nowrap;
          pointer-events: none;
          z-index: 1000;
          user-select: none;
        }
      `
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body {
          width: 100%;
          height: 100%;
        }
        .page {
          position: relative;
          width: 100%;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          page-break-after: always;
          padding: 10mm;
        }
        .page:last-child {
          page-break-after: auto;
        }
        img {
          display: block;
        }
        ${watermarkStyles}
      </style>
    </head>
    <body>
      ${imageHtmlParts.join('\n')}
    </body>
    </html>
  `;
}

/**
 * Get the output directory for PDFs
 */
function getPdfOutputDirectory(): string {
  if (Platform.OS === 'android') {
    // Use Downloads directory on Android for easier access
    return RNFS.DownloadDirectoryPath;
  }
  // Use Documents directory on iOS
  return RNFS.DocumentDirectoryPath;
}

/**
 * Generate a unique filename for the PDF
 */
function generateFileName(customName?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseName = customName || 'Images';
  return `${baseName}_${timestamp}`;
}

/**
 * Convert multiple images to a single PDF file
 */
export async function generatePdfFromImages(
  images: ImageSource[],
  options: PdfGenerationOptions = {},
  isPro: boolean = false
): Promise<PdfGenerationResult> {
  if (images.length === 0) {
    throw new Error('No images provided');
  }

  const {
    fileName,
    pageSize = 'A4',
    fitImageToPage = true,
    quality = 90,
  } = options;

  const outputDir = getPdfOutputDirectory();
  const pdfFileName = generateFileName(fileName);

  // Generate HTML content with all images
  const htmlContent = await generateHtmlContent(images, { fitImageToPage }, isPro);

  // Convert HTML to PDF
  const pdfOptions = {
    html: htmlContent,
    fileName: pdfFileName,
    directory: Platform.OS === 'android' ? 'Download' : 'Documents',
    base64: false,
    width: pageSize === 'A4' ? 595 : pageSize === 'LETTER' ? 612 : 612,
    height: pageSize === 'A4' ? 842 : pageSize === 'LETTER' ? 792 : 1008,
  };

  const result = await generatePDF(pdfOptions);

  if (!result.filePath) {
    throw new Error('PDF generation failed: No file path returned');
  }

  return {
    filePath: result.filePath,
    fileName: `${pdfFileName}.pdf`,
    pageCount: images.length,
  };
}

/**
 * Check if a PDF file exists
 */
export async function pdfExists(filePath: string): Promise<boolean> {
  try {
    return await RNFS.exists(filePath);
  } catch {
    return false;
  }
}

/**
 * Delete a PDF file
 */
export async function deletePdf(filePath: string): Promise<void> {
  try {
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
    }
  } catch (error) {
    throw new Error(`Failed to delete PDF: ${error}`);
  }
}

/**
 * Get file info for a PDF
 */
export async function getPdfInfo(filePath: string): Promise<{
  size: number;
  lastModified: Date;
}> {
  try {
    const stat = await RNFS.stat(filePath);
    return {
      size: stat.size,
      lastModified: new Date(stat.mtime),
    };
  } catch (error) {
    throw new Error(`Failed to get PDF info: ${error}`);
  }
}
