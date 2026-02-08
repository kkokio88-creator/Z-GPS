import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import crypto from 'crypto';

// 볼트 루트: VAULT_PATH 환경변수 또는 프로젝트 루트 기준 ./vault/
const VAULT_ROOT = path.resolve(process.env.VAULT_PATH || process.cwd(), 'vault');

/** 볼트 디렉토리 구조 생성 */
export async function ensureVaultStructure(): Promise<void> {
  const dirs = [
    '',
    'company',
    'company/documents',
    'programs',
    'analysis',
    'applications',
    'attachments/pdfs',
    'attachments/pdf-analysis',
    'templates',
  ];

  for (const dir of dirs) {
    const fullPath = path.join(VAULT_ROOT, dir);
    await fs.mkdir(fullPath, { recursive: true });
  }

  // .obsidian 기본 설정 생성 (존재하지 않을 때만)
  const obsidianDir = path.join(VAULT_ROOT, '.obsidian');
  try {
    await fs.access(obsidianDir);
  } catch {
    await fs.mkdir(obsidianDir, { recursive: true });
    await fs.writeFile(
      path.join(obsidianDir, 'app.json'),
      JSON.stringify({ showLineNumber: true, strictLineBreaks: false }, null, 2),
      'utf-8'
    );
  }

  // 대시보드 MOC 생성 (존재하지 않을 때만)
  const dashboardPath = path.join(VAULT_ROOT, '_대시보드.md');
  try {
    await fs.access(dashboardPath);
  } catch {
    const dashboardContent = `---
type: dashboard
updatedAt: "${new Date().toISOString()}"
---

# Z-GPS 공고 대시보드

## 프로그램 현황
\`\`\`dataview
TABLE status, fitScore, eligibility, officialEndDate as "마감일"
FROM "programs"
SORT fitScore DESC
\`\`\`

## 분석 완료
\`\`\`dataview
LIST
FROM "analysis"
SORT file.mtime DESC
\`\`\`

## 지원서
\`\`\`dataview
LIST
FROM "applications"
SORT file.mtime DESC
\`\`\`
`;
    await fs.writeFile(dashboardPath, dashboardContent, 'utf-8');
  }
}

/** gray-matter로 마크다운 파싱 (frontmatter + content) */
export async function readNote(filePath: string): Promise<{ frontmatter: Record<string, unknown>; content: string }> {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(VAULT_ROOT, filePath);
  const raw = await fs.readFile(fullPath, 'utf-8');
  const parsed = matter(raw);
  return {
    frontmatter: parsed.data as Record<string, unknown>,
    content: parsed.content,
  };
}

/** gray-matter로 마크다운 생성 후 저장 */
export async function writeNote(
  filePath: string,
  frontmatter: Record<string, unknown>,
  content: string
): Promise<void> {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(VAULT_ROOT, filePath);
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });

  const md = matter.stringify(content, frontmatter);
  await fs.writeFile(fullPath, md, 'utf-8');
}

/** fast-glob로 .md 파일 목록 반환 */
export async function listNotes(dirPath: string): Promise<string[]> {
  const fullDir = path.isAbsolute(dirPath) ? dirPath : path.join(VAULT_ROOT, dirPath);
  // fast-glob는 posix 경로 필요
  const pattern = fullDir.replace(/\\/g, '/') + '/**/*.md';
  const files = await fg(pattern, { onlyFiles: true });
  return files;
}

/** 안전한 파일명 생성 (프로그램 이름 sanitize + id 해시 6자) */
export function generateSlug(programName: string, id: string): string {
  // 특수문자 제거, 공백→하이픈, 최대 40자
  const sanitized = programName
    .replace(/[<>:"/\\|?*\[\](){}]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);

  const hash = crypto.createHash('md5').update(id).digest('hex').substring(0, 6);
  return `${sanitized}-${hash}`;
}

/** 볼트 루트 경로 반환 */
export function getVaultRoot(): string {
  return VAULT_ROOT;
}

/** 파일 존재 확인 */
export async function noteExists(filePath: string): Promise<boolean> {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(VAULT_ROOT, filePath);
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/** 바이너리 파일 저장 (PDF 등) */
export async function writeBinaryFile(filePath: string, data: Buffer): Promise<void> {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(VAULT_ROOT, filePath);
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, data);
}

/** 바이너리 파일 삭제 */
export async function deleteBinaryFile(filePath: string): Promise<void> {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(VAULT_ROOT, filePath);
  try {
    await fs.unlink(fullPath);
  } catch {
    // 파일이 이미 없는 경우 무시
  }
}

/** 디렉토리 내 모든 파일 목록 (md 외 바이너리 포함) */
export async function listFiles(dirPath: string): Promise<string[]> {
  const fullDir = path.isAbsolute(dirPath) ? dirPath : path.join(VAULT_ROOT, dirPath);
  const pattern = fullDir.replace(/\\/g, '/') + '/**/*';
  const files = await fg(pattern, { onlyFiles: true });
  return files;
}
