declare module 'tesseract.js' {
  export interface TesseractBox {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }
  export interface TesseractWord {
    text: string;
    confidence: number;
    bbox?: TesseractBox;
  }
  export interface TesseractLine {
    text: string;
    confidence?: number;
    words?: TesseractWord[];
    bbox?: TesseractBox;
  }
  export interface TesseractResultData {
    text: string;
    confidence: number;
    words: TesseractWord[];
    lines: TesseractLine[];
  }
  export interface Worker {
    recognize(image: string | HTMLImageElement | HTMLCanvasElement | File | File, language?: string): Promise<{
      data: TesseractResultData;
    }>;
    terminate(): Promise<void>;
  }
  export function createWorker(options?: { logger?: (info: { status: string; progress: number }) => void }): Promise<Worker>;
  export function recognize(image: string | HTMLImageElement | HTMLCanvasElement | File | File, language?: string, options?: { logger?: (info: { status: string; progress: number }) => void }): Promise<{
    data: TesseractResultData;
  }>;
}
