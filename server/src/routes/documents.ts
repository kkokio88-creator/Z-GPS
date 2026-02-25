import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import mammoth from 'mammoth';

const router = Router();

// multer: memory storage, 10MB limit, .docx only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
    ];
    const isDocx = file.originalname.toLowerCase().endsWith('.docx');
    if (allowed.includes(file.mimetype) || isDocx) {
      cb(null, true);
    } else {
      cb(new Error('UNSUPPORTED_FORMAT'));
    }
  },
});

/**
 * POST /api/documents/parse
 * multipart/form-data로 .docx 파일을 받아 텍스트/HTML로 변환
 */
router.post('/parse', (req: Request, res: Response) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.message === 'UNSUPPORTED_FORMAT') {
        return res.status(415).json({
          error: 'Unsupported Media Type',
          message: '현재 .docx 파일만 지원합니다. HWP, PDF 파일은 지원되지 않습니다.',
          supportedFormats: ['.docx'],
        });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'File Too Large',
          message: '파일 크기가 10MB를 초과합니다.',
        });
      }
      return res.status(400).json({ error: 'Upload Error', message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Bad Request', message: '파일이 첨부되지 않았습니다.' });
    }

    try {
      const buffer = req.file.buffer;
      const [htmlResult, textResult] = await Promise.all([
        mammoth.convertToHtml({ buffer }),
        mammoth.extractRawText({ buffer }),
      ]);

      // 구조화: 제목(h1~h6) 기준으로 섹션 분리
      const sections = extractSections(htmlResult.value);

      return res.json({
        fileName: req.file.originalname,
        fileSize: req.file.size,
        html: htmlResult.value,
        text: textResult.value,
        sections,
        warnings: htmlResult.messages
          .filter((m) => m.type === 'warning')
          .map((m) => m.message),
      });
    } catch (e) {
      console.error('[documents/parse] Error:', e);
      return res.status(500).json({
        error: 'Parse Error',
        message: 'DOCX 파일을 파싱하는 중 오류가 발생했습니다.',
      });
    }
  });
});

/** HTML에서 제목(h1~h6) 기준으로 섹션 추출 */
function extractSections(html: string): { title: string; content: string; level: number }[] {
  const sections: { title: string; content: string; level: number }[] = [];
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(html)) !== null) {
    // 이전 섹션의 content를 현재 heading 시작 전까지로 설정
    if (sections.length > 0) {
      sections[sections.length - 1].content = stripTags(html.slice(lastIndex, match.index)).trim();
    }
    sections.push({
      level: parseInt(match[1], 10),
      title: stripTags(match[2]).trim(),
      content: '',
    });
    lastIndex = match.index + match[0].length;
  }

  // 마지막 섹션의 content
  if (sections.length > 0) {
    sections[sections.length - 1].content = stripTags(html.slice(lastIndex)).trim();
  }

  // heading이 없으면 전체를 하나의 섹션으로
  if (sections.length === 0 && html.trim()) {
    sections.push({ level: 0, title: '(본문)', content: stripTags(html).trim() });
  }

  return sections;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

export default router;
