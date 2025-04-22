import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Specify Node.js runtime for Vercel
export const runtime = 'nodejs';
export const maxDuration = 60; // Increase function timeout to 60 seconds

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
        { error: 'Se requiere el código Mermaid' },
        { status: 400 }
      );
    }

    // Create a minimal browser-like environment first
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    
    // Set up the global objects needed by mermaid
    global.window = dom.window as unknown as Window & typeof globalThis;
    global.document = dom.window.document;
    global.SVGElement = dom.window.SVGElement;
    
    // Create a custom navigator object instead of trying to set the global one
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'node.js',
        language: 'en-US',
      },
      writable: true
    });
    
    // Now import mermaid after the environment is set up
    const { default: mermaid } = await import('mermaid');
    
    // Initialize mermaid with server-friendly settings
    mermaid.initialize({ 
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'default',
      logLevel: 1,
      flowchart: { htmlLabels: false }
    });
    
    // Render the diagram
    const { svg } = await mermaid.render('mermaid-diagram', mermaidCode);
    
    // Import sharp dynamically
    const { default: sharp } = await import('sharp');
    
    // Convert SVG to PNG
    const pngBuffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    // Upload to Cloudinary
    const uploadResponse = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'mermaid-diagrams', format: 'png' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(pngBuffer);
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