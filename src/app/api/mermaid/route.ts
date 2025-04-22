import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Helper to get the executable path depending on environment
async function getExecutablePath() {
  // If running on Vercel/serverless, use chromium
  const isServerless = !!process.env.AWS_LAMBDA_FUNCTION_VERSION || process.env.VERCEL;
  if (isServerless) {
    return await chromium.executablePath();
  }
  // Local development: use installed Chrome
  if (process.platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  } else if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else {
    return '/usr/bin/google-chrome';
  }
}

// POST function for generating and uploading the diagram
export async function POST(request: Request) {
  let browser;
  try {
    const body = await request.text();
    let mermaidCode: string;

    try {
      const jsonData = JSON.parse(body);
      mermaidCode = jsonData.mermaidCode || jsonData;
    } catch {
      mermaidCode = body;
    }

    if (!mermaidCode) {
      return NextResponse.json(
        { error: 'Mermaid code is required' },
        { status: 400 }
      );
    }

    // Launch Puppeteer with environment-aware configuration
    const executablePath = await getExecutablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    // ... existing code ...
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
          <script>
            mermaid.initialize({ startOnLoad: true });
          </script>
        </head>
        <body>
          <div class="mermaid">${mermaidCode}</div>
        </body>
      </html>
    `);

    await page.waitForSelector('.mermaid svg');
    const element = await page.$('.mermaid svg');
    
    if (!element) {
      throw new Error('Failed to generate diagram');
    }

    const buffer = await element.screenshot({
      type: 'png',
      omitBackground: true
    });

    await browser.close();

    const uploadResponse = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'mermaid-diagrams' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(buffer);
    });

    return NextResponse.json({
      success: true,
      url: (uploadResponse as { secure_url: string }).secure_url
    });

  } catch (error) {
    console.error('Error:', error);
    if (browser) {
      await browser.close();
    }
    return NextResponse.json(
      { error: 'Failed to generate diagram' },
      { status: 500 }
    );
  }
}