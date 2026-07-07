import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import busboy from 'busboy';

type ParsedFile = {
  title: string;
  content: string;
  source_type: string;
  source_name: string;
  file_size: number;
};

type ExcelSheet = { name: string; data: any[][] };
type ExcelToJsonFn = (buffer: Buffer) => { sheets: ExcelSheet[] };
type JsonToExcelFn = (sheets: ExcelSheet[]) => Buffer;
type ParseFileFn = (buffer: Buffer, mimeType: string, originalName: string) => Promise<ParsedFile>;

type FileUploadResult = {
  buffer: Buffer | null;
  fileName: string;
  mimeType: string;
};

type KnowledgeFileRouteDeps = {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  knowledgeBase: any;
  readBody(req: http.IncomingMessage): Promise<string>;
  dataDir: string;
  parseMultipartUpload?: (req: http.IncomingMessage) => Promise<FileUploadResult>;
  fileOps?: {
    existsSync: typeof fs.existsSync;
    readdirSync: typeof fs.readdirSync;
    readFileSync: typeof fs.readFileSync;
    writeFileSync: typeof fs.writeFileSync;
  };
  excelToJsonFn?: ExcelToJsonFn;
  jsonToExcelFn?: JsonToExcelFn;
  parseFileFn?: ParseFileFn;
};

let fileUploadServicePromise: Promise<typeof import('../app/knowledge/FileUploadService.js')> | null = null;

async function loadFileUploadService() {
  if (!fileUploadServicePromise) {
    fileUploadServicePromise = import('../app/knowledge/FileUploadService.js');
  }
  return fileUploadServicePromise;
}

async function defaultParseMultipartUpload(req: http.IncomingMessage): Promise<FileUploadResult> {
  let fileBuffer: Buffer | null = null;
  let fileName = '';
  let mimeType = '';

  await new Promise<void>((resolve, reject) => {
    const bb = busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024 } });
    const uploadTimer = setTimeout(() => {
      bb.destroy();
      reject(new Error('upload timeout'));
    }, 30000);
    bb.on('file', (_fieldname: string, stream: any, info: { filename: string; mimeType: string }) => {
      fileName = info.filename;
      mimeType = info.mimeType;
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      stream.on('data', (chunk: any) => {
        totalBytes += chunk.length;
        if (totalBytes > 10 * 1024 * 1024) {
          stream.destroy();
          reject(new Error('file too large'));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      stream.on('end', () => { fileBuffer = Buffer.concat(chunks); });
    });
    bb.on('finish', () => { clearTimeout(uploadTimer); resolve(); });
    bb.on('error', (err: Error) => { clearTimeout(uploadTimer); reject(err); });
    req.pipe(bb);
  });

  return { buffer: fileBuffer, fileName, mimeType };
}

export async function handleKnowledgeFileRoutes(deps: KnowledgeFileRouteDeps): Promise<boolean> {
  const {
    req, res, url, knowledgeBase, readBody, dataDir,
    parseMultipartUpload = defaultParseMultipartUpload,
    fileOps = fs,
    excelToJsonFn,
    jsonToExcelFn,
    parseFileFn,
  } = deps;

  if (req.method === 'POST' && url.pathname === '/api/knowledge/upload') {
    try {
      const { buffer, fileName, mimeType } = await parseMultipartUpload(req);
      if (!buffer || buffer.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'empty file' }));
        return true;
      }

      const entry = await knowledgeBase.upload(buffer, fileName, mimeType);
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(entry));
    } catch (err: any) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message || 'upload failed' }));
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/knowledge/excel-query') {
    const body = JSON.parse(await readBody(req));
    const { knId, sheet, row, col, value } = body;
    const entry = knowledgeBase.getById(knId);
    if (!entry || !['xlsx', 'xls', 'csv'].includes(entry.source_type)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'not found or not an excel file' }));
      return true;
    }
    try {
      const uploadDir = path.join(dataDir, 'uploads');
      let excelBuffer: Buffer | null = null;
      if (fileOps.existsSync(uploadDir)) {
        const files = fileOps.readdirSync(uploadDir);
        const match = files.find((f: any) => String(f).includes(entry.title.replace(/[^a-zA-Z0-9._-]/g, '_')));
        if (match) excelBuffer = fileOps.readFileSync(path.join(uploadDir, String(match)));
      }
      if (!excelBuffer) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '原始Excel文件未找到，请重新上传' }));
        return true;
      }

      const service = (excelToJsonFn && jsonToExcelFn && parseFileFn)
        ? null
        : await loadFileUploadService();
      const parseExcelToJson = excelToJsonFn ?? service!.excelToJson;
      const stringifyExcel = jsonToExcelFn ?? service!.jsonToExcel;
      const parseUploadedFile = parseFileFn ?? service!.parseFile;

      const { sheets } = parseExcelToJson(excelBuffer);
      if (sheet !== undefined) {
        if (row !== undefined && col !== undefined && value !== undefined) {
          const ws = sheets[sheet];
          if (ws === undefined) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'sheet not found' }));
            return true;
          }
          while (ws.data.length <= row) ws.data.push([]);
          while (ws.data[row].length <= col) ws.data[row].push('');
          ws.data[row][col] = value;
          const newBuf = stringifyExcel(sheets);
          const files2 = fileOps.readdirSync(uploadDir);
          const match2 = files2.find((f: any) => String(f).includes(entry.title.replace(/[^a-zA-Z0-9._-]/g, '_')));
          if (match2) fileOps.writeFileSync(path.join(uploadDir, String(match2)), newBuf);
          const textContent = await parseUploadedFile(
            newBuf,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            entry.source_name || 'data.xlsx',
          );
          await knowledgeBase.update(knId, { title: entry.title, content: textContent.content });
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true }));
          return true;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ sheet: sheets[sheet] }));
        return true;
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ sheets }));
    } catch (err: any) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  return false;
}
