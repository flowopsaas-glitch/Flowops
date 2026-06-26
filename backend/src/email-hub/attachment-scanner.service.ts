import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as net from 'net';
import axios from 'axios';

export type ThreatLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ScanStatus = 'CLEAN' | 'THREAT' | 'SKIPPED' | 'ERROR';

export interface ScanInput {
  filename: string;
  mimeType?: string | null;
  size?: number;
  /** Raw bytes — enables magic-byte and AV-engine inspection. */
  buffer?: Buffer;
}

export interface ScanResult {
  scanStatus: ScanStatus;
  threatLevel: ThreatLevel;
  threatReason: string | null;
  scanEngine: string;
}

const LEVEL_RANK: Record<ThreatLevel, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/** Executable / script types that should never arrive as an email attachment. */
const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'scr', 'bat', 'cmd', 'com', 'pif', 'cpl', 'msi', 'msp', 'mst',
  'hta', 'jar', 'js', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1',
  'ps2', 'lnk', 'reg', 'dll', 'sys', 'scf', 'inf', 'gadget', 'application',
  'app', 'deb', 'rpm', 'sh', 'bash', 'bin', 'run', 'apk', 'dmg', 'iso',
]);

/** Office formats that can carry auto-executing macros. */
const MACRO_EXTENSIONS = new Set(['docm', 'xlsm', 'pptm', 'dotm', 'xltm', 'potm', 'xlam']);

/** Compressed containers whose contents cannot be inspected here. */
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'gz', 'tar', 'bz2', 'xz', 'cab', 'ace']);

/** Benign document extensions used to detect the "double extension" trick. */
const BENIGN_DOC_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'tif', 'tiff',
]);

@Injectable()
export class AttachmentScannerService {
  private readonly logger = new Logger(AttachmentScannerService.name);
  private readonly maxBytes: number;
  private readonly clamHost?: string;
  private readonly clamPort: number;
  private readonly vtApiKey?: string;

  constructor(private readonly config: ConfigService) {
    this.maxBytes = Number(this.config.get('EMAIL_ATTACHMENT_MAX_BYTES', 25 * 1024 * 1024));
    this.clamHost = this.config.get<string>('CLAMAV_HOST') || undefined;
    this.clamPort = Number(this.config.get('CLAMAV_PORT', 3310));
    this.vtApiKey = this.config.get<string>('VIRUSTOTAL_API_KEY') || undefined;
  }

  /**
   * Scan a single attachment. Always runs the built-in heuristic engine.
   * If CLAMAV_HOST or VIRUSTOTAL_API_KEY is configured AND raw bytes are
   * available, an external engine is consulted and the worst verdict wins.
   * Never throws — scan failures degrade to SKIPPED/ERROR so ingestion is
   * never blocked by the scanner itself.
   */
  async scan(input: ScanInput): Promise<ScanResult> {
    const engines: string[] = ['heuristic'];
    let level: ThreatLevel = 'NONE';
    const reasons: string[] = [];

    try {
      const h = this.heuristicScan(input);
      level = h.level;
      if (h.reason) reasons.push(h.reason);
    } catch (err: any) {
      this.logger.error(`Heuristic scan failed for ${input.filename}: ${err?.message}`);
      return {
        scanStatus: 'ERROR',
        threatLevel: 'NONE',
        threatReason: 'Heuristic scan error',
        scanEngine: 'heuristic',
      };
    }

    // Short-circuit: a CRITICAL heuristic verdict needs no external confirmation.
    if (LEVEL_RANK[level] < LEVEL_RANK.CRITICAL && input.buffer && input.buffer.length) {
      if (this.clamHost) {
        const c = await this.clamavScan(input.buffer);
        if (c) {
          engines.push('clamav');
          if (LEVEL_RANK[c.level] > LEVEL_RANK[level]) level = c.level;
          if (c.reason) reasons.push(c.reason);
        }
      }
      if (this.vtApiKey && LEVEL_RANK[level] < LEVEL_RANK.CRITICAL) {
        const v = await this.virusTotalScan(input.buffer);
        if (v) {
          engines.push('virustotal');
          if (LEVEL_RANK[v.level] > LEVEL_RANK[level]) level = v.level;
          if (v.reason) reasons.push(v.reason);
        }
      }
    }

    const scanStatus: ScanStatus = LEVEL_RANK[level] >= LEVEL_RANK.HIGH ? 'THREAT' : 'CLEAN';

    return {
      scanStatus,
      threatLevel: level,
      threatReason: reasons.length ? reasons.join('; ') : null,
      scanEngine: engines.join('+'),
    };
  }

  // ── Heuristic engine ────────────────────────────────────────────────────

  private heuristicScan(input: ScanInput): { level: ThreatLevel; reason: string | null } {
    const name = (input.filename || '').toLowerCase().trim();
    const segments = name.split('.').filter(Boolean);
    const ext = segments.length > 1 ? segments[segments.length - 1] : '';
    const prevExt = segments.length > 2 ? segments[segments.length - 2] : '';
    const findings: Array<{ level: ThreatLevel; reason: string }> = [];

    // 1. Dangerous executable/script extension.
    if (ext && DANGEROUS_EXTENSIONS.has(ext)) {
      findings.push({
        level: 'CRITICAL',
        reason: `Executable/script file type ".${ext}" is not permitted as an attachment`,
      });
    }

    // 2. Double-extension disguise (e.g. invoice.pdf.exe).
    if (
      segments.length >= 3 &&
      BENIGN_DOC_EXTENSIONS.has(prevExt) &&
      DANGEROUS_EXTENSIONS.has(ext)
    ) {
      findings.push({
        level: 'CRITICAL',
        reason: `Double-extension disguise detected (".${prevExt}.${ext}")`,
      });
    }

    // 3. Magic-byte inspection — catches a real executable disguised as a doc.
    if (input.buffer && input.buffer.length >= 4) {
      const b = input.buffer;
      const isMZ = b[0] === 0x4d && b[1] === 0x5a; // Windows PE "MZ"
      const isELF = b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46; // ELF
      const isShebang = b[0] === 0x23 && b[1] === 0x21; // "#!"
      const isMachO =
        (b[0] === 0xfe && b[1] === 0xed && b[2] === 0xfa) ||
        (b[0] === 0xcf && b[1] === 0xfa && b[2] === 0xed && b[3] === 0xfe);

      if (isMZ || isELF || isMachO) {
        const disguised = ext && BENIGN_DOC_EXTENSIONS.has(ext);
        findings.push({
          level: 'CRITICAL',
          reason: disguised
            ? `Executable binary disguised as ".${ext}" (magic-byte mismatch)`
            : 'File contains an executable binary signature',
        });
      } else if (isShebang && !DANGEROUS_EXTENSIONS.has(ext)) {
        findings.push({ level: 'HIGH', reason: 'File contains a script shebang (#!)' });
      }

      // PDF claimed but not a PDF.
      if (ext === 'pdf') {
        const isPdf = b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // "%PDF"
        if (!isPdf) {
          findings.push({
            level: 'MEDIUM',
            reason: 'Declared .pdf but file header is not a valid PDF',
          });
        }
      }
    }

    // 4. Macro-enabled Office document.
    if (ext && MACRO_EXTENSIONS.has(ext)) {
      findings.push({
        level: 'MEDIUM',
        reason: `Macro-enabled Office document (".${ext}") — review before opening`,
      });
    }

    // 5. MIME vs extension contradiction.
    const mime = (input.mimeType || '').toLowerCase();
    if (mime && this.mimeContradictsExtension(ext, mime)) {
      findings.push({
        level: 'HIGH',
        reason: `Declared type "${mime}" does not match extension ".${ext}"`,
      });
    }

    // 6. Uninspectable archive.
    if (ext && ARCHIVE_EXTENSIONS.has(ext)) {
      findings.push({
        level: 'LOW',
        reason: `Archive ".${ext}" — contents could not be inspected automatically`,
      });
    }

    // 7. Oversized.
    if (typeof input.size === 'number' && input.size > this.maxBytes) {
      findings.push({
        level: 'MEDIUM',
        reason: `Attachment exceeds the ${(this.maxBytes / (1024 * 1024)).toFixed(0)}MB size limit`,
      });
    }

    if (!findings.length) return { level: 'NONE', reason: null };
    findings.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
    return {
      level: findings[0].level,
      reason: findings.map((f) => f.reason).join('; '),
    };
  }

  private mimeContradictsExtension(ext: string, mime: string): boolean {
    if (!ext) return false;
    // Executable MIME types are always suspicious for non-executable extensions.
    const execMimes = [
      'application/x-msdownload',
      'application/x-msdos-program',
      'application/x-executable',
      'application/x-dosexec',
      'application/vnd.microsoft.portable-executable',
    ];
    if (execMimes.includes(mime) && BENIGN_DOC_EXTENSIONS.has(ext)) return true;
    return false;
  }

  // ── ClamAV (optional, via INSTREAM over TCP) ─────────────────────────────

  private clamavScan(buffer: Buffer): Promise<{ level: ThreatLevel; reason: string } | null> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let response = '';
      const done = (result: { level: ThreatLevel; reason: string } | null) => {
        try { socket.destroy(); } catch { /* noop */ }
        resolve(result);
      };

      socket.setTimeout(8000);
      socket.on('timeout', () => done(null));
      socket.on('error', (e) => {
        this.logger.warn(`ClamAV unreachable: ${e.message}`);
        done(null);
      });
      socket.on('data', (d) => { response += d.toString(); });
      socket.on('close', () => {
        if (/FOUND/.test(response)) {
          const sig = response.replace(/^stream:\s*/, '').replace(/\s*FOUND\s*$/, '').trim();
          done({ level: 'CRITICAL', reason: `ClamAV detected malware: ${sig || 'unknown signature'}` });
        } else {
          done(null);
        }
      });

      socket.connect(this.clamPort, this.clamHost as string, () => {
        socket.write('zINSTREAM\0');
        const CHUNK = 64 * 1024;
        for (let i = 0; i < buffer.length; i += CHUNK) {
          const slice = buffer.subarray(i, i + CHUNK);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(slice.length, 0);
          socket.write(len);
          socket.write(slice);
        }
        const term = Buffer.alloc(4);
        term.writeUInt32BE(0, 0);
        socket.write(term);
      });
    });
  }

  // ── VirusTotal (optional, hash lookup — no upload) ───────────────────────

  private async virusTotalScan(
    buffer: Buffer,
  ): Promise<{ level: ThreatLevel; reason: string } | null> {
    try {
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      const res = await axios.get(`https://www.virustotal.com/api/v3/files/${sha256}`, {
        headers: { 'x-apikey': this.vtApiKey as string },
        timeout: 8000,
        validateStatus: () => true,
      });
      if (res.status === 404) return null; // unknown to VT — no verdict
      if (res.status !== 200) return null;
      const stats = res.data?.data?.attributes?.last_analysis_stats ?? {};
      const malicious = Number(stats.malicious ?? 0);
      const suspicious = Number(stats.suspicious ?? 0);
      if (malicious > 0) {
        return { level: 'CRITICAL', reason: `VirusTotal: ${malicious} engines flagged this file as malicious` };
      }
      if (suspicious > 0) {
        return { level: 'HIGH', reason: `VirusTotal: ${suspicious} engines flagged this file as suspicious` };
      }
      return null;
    } catch (e: any) {
      this.logger.warn(`VirusTotal lookup failed: ${e?.message}`);
      return null;
    }
  }
}
