import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import { v2 as cloudinary } from 'cloudinary';
import chromium from '@sparticuz/chromium';

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const dynamic = 'force-dynamic';

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
        { error: 'Se requiere código Mermaid' },
        { status: 400 }
      );
    }

    // Lanzar Puppeteer con Chromium proporcionado por @sparticuz/chromium
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      acceptInsecureCerts: true,
    });

    const page = await browser.newPage();

    // Cargar el contenido de Mermaid
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

    // Esperar a que se renderice el SVG
    await page.waitForSelector('.mermaid svg');
    const element = await page.$('.mermaid svg');

    if (!element) {
      throw new Error('No se pudo generar el diagrama');
    }

    // Tomar una captura de pantalla
    const buffer = await element.screenshot({
      type: 'png',
      omitBackground: true,
    });

    await browser.close();

    // Subir a Cloudinary
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
      url: (uploadResponse as { secure_url: string }).secure_url,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'No se pudo generar el diagrama' },
      { status: 500 }
    );
  }
}
