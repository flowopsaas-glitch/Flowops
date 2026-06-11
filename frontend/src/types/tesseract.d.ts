declare module 'tesseract.js' {
  export interface Worker {
    recognize(image: string | HTMLImageElement | HTMLCanvasElement | File | File, language?: string): Promise<{
      data: { text: string; confidence: number; words: any[]; lines: any[] };
    }>;
    terminate(): Promise<void>;
  }
  export function createWorker(options?: { logger?: (info: { status: string; progress: number }) => void }): Promise<Worker>;
  export function recognize(image: string | HTMLImageElement | HTMLCanvasElement | File | File, language?: string, options?: { logger?: (info: { status: string; progress: number }) => void }): Promise<{
    data: { text: string; confidence: number; words: any[]; lines: any[] };
  }>;
}
