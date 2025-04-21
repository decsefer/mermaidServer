import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { v2 as cloudinary } from 'cloudinary';

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export async function POST(request: Request) {
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

    // Launch Puppeteer
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Load Mermaid content
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

    // Wait for Mermaid to render
    await page.waitForSelector('.mermaid svg');
    const element = await page.$('.mermaid svg');
    
    if (!element) {
      throw new Error('Failed to generate diagram');
    }

    // Take screenshot
    const buffer = await element.screenshot({
      type: 'png',
      omitBackground: true
    });

    await browser.close();

    // Upload to Cloudinary
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
    return NextResponse.json(
      { error: 'Failed to generate diagram' },
      { status: 500 }
    );
  }
}