// 문서 내보내기 서비스
// DOCX 및 PDF 형식으로 사업계획서를 생성하는 유틸리티

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} from 'docx';
import { saveAs } from 'file-saver';

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

export interface ExportCompany {
  name: string;
  businessNumber: string;
  industry: string;
}

export interface ExportSection {
  id: string;
  title: string;
}

export interface ExportToDocxParams {
  company: ExportCompany;
  programName: string;
  sections: ExportSection[];
  draftSections: Record<string, string>;
}

// ─────────────────────────────────────────────
// PDF 내보내기 (인쇄 대화상자 활용)
// ─────────────────────────────────────────────

/**
 * 지정된 요소 ID의 미리보기 콘텐츠를 새 창에서 인쇄하여 PDF로 저장할 수 있게 합니다.
 * @param previewElementId - A4 형식 div의 DOM 요소 ID
 */
export function exportToPdf(previewElementId: string): void {
  const previewElement = document.getElementById(previewElementId);
  if (!previewElement) {
    console.error(`[documentExport] 요소를 찾을 수 없습니다: #${previewElementId}`);
    return;
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('팝업 차단이 활성화되어 있습니다. 팝업을 허용한 후 다시 시도해 주세요.');
    return;
  }

  // 콘텐츠 복제
  const clonedContent = previewElement.cloneNode(true) as HTMLElement;

  // 인쇄 스타일 정의
  const printStyles = `
    <style>
      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body {
        margin: 0;
        padding: 0;
        font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif;
        font-size: 12pt;
        color: #000;
        background: #fff;
      }
      @page {
        size: A4;
        margin: 20mm 25mm 20mm 25mm;
      }
      @media print {
        html, body {
          width: 210mm;
          height: 297mm;
        }
        .no-print {
          display: none !important;
        }
        table {
          page-break-inside: avoid;
        }
        h1, h2, h3 {
          page-break-after: avoid;
        }
        p {
          orphans: 3;
          widows: 3;
        }
      }
    </style>
  `;

  // 부모 문서의 스타일시트를 복사하여 Tailwind CSS 등 스타일 유지
  const parentStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => el.outerHTML)
    .join('\n');

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>사업계획서</title>
  ${parentStyles}
  ${printStyles}
</head>
<body>
  ${clonedContent.outerHTML}
</body>
</html>`);
  printWindow.document.close();

  // 리소스 로드 완료 후 인쇄 실행
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
    // 인쇄 대화상자 닫힘 후 창 자동 닫기
    printWindow.onafterprint = () => {
      printWindow.close();
    };
  };
}

// ─────────────────────────────────────────────
// DOCX 내보내기
// ─────────────────────────────────────────────

// 공통 테두리 스타일
const TABLE_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
};

/**
 * 요약 정보 테이블 셀을 생성합니다.
 */
function createTableCell(text: string, isHeader: boolean = false): TableCell {
  return new TableCell({
    borders: TABLE_BORDER,
    shading: isHeader ? { fill: 'F2F2F2' } : undefined,
    width: { size: isHeader ? 20 : 30, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            bold: isHeader,
            size: 20, // 10pt
            font: '맑은 고딕',
          }),
        ],
      }),
    ],
  });
}

/**
 * 본문 단락 텍스트를 줄바꿈 기준으로 분리하여 Paragraph 배열로 변환합니다.
 */
function contentToParagraphs(text: string): Paragraph[] {
  if (!text || text.trim() === '') {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: '(내용이 작성되지 않았습니다)',
            color: '999999',
            italics: true,
            size: 20,
            font: '맑은 고딕',
          }),
        ],
        spacing: { after: 120 },
      }),
    ];
  }

  return text.split('\n').map((line) => {
    const trimmed = line.trimEnd();
    return new Paragraph({
      children: [
        new TextRun({
          text: trimmed,
          size: 20, // 10pt
          font: '맑은 고딕',
        }),
      ],
      spacing: { after: 80, line: 360 }, // 1.5줄 간격
    });
  });
}

/**
 * 사업계획서 DOCX 파일을 생성하고 다운로드합니다.
 * @param params - 기업 정보, 지원사업명, 섹션 목록, 작성된 초안 내용
 */
export async function exportToDocx(params: ExportToDocxParams): Promise<void> {
  const { company, programName, sections, draftSections } = params;

  // ── 제목 단락 ──
  const titleParagraph = new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 200 },
    children: [
      new TextRun({
        text: '[사업계획서]',
        bold: true,
        size: 48, // 24pt
        font: '맑은 고딕',
        color: '1A1A2E',
      }),
    ],
  });

  const programNameParagraph = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 600 },
    children: [
      new TextRun({
        text: programName,
        bold: true,
        size: 32, // 16pt
        font: '맑은 고딕',
        color: '2563EB',
      }),
    ],
  });

  // ── 기업 요약 테이블 ──
  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          createTableCell('기업명', true),
          createTableCell(company.name),
          createTableCell('사업자번호', true),
          createTableCell(company.businessNumber),
        ],
      }),
      new TableRow({
        children: [
          createTableCell('업종', true),
          new TableCell({
            borders: TABLE_BORDER,
            columnSpan: 3,
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: company.industry,
                    size: 20,
                    font: '맑은 고딕',
                  }),
                ],
                spacing: { before: 60, after: 60 },
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const afterTableSpacer = new Paragraph({ spacing: { after: 400 } });

  // ── 각 섹션 내용 ──
  const sectionChildren: (Paragraph | Table)[] = [];

  for (const section of sections) {
    const content = draftSections[section.id] ?? '';

    // 섹션 제목
    const sectionHeading = new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 480, after: 160 },
      children: [
        new TextRun({
          text: section.title,
          bold: true,
          size: 28, // 14pt
          font: '맑은 고딕',
          color: '1E3A5F',
        }),
      ],
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '2563EB' },
      },
    });

    sectionChildren.push(sectionHeading);
    sectionChildren.push(...contentToParagraphs(content));
  }

  // ── 문서 조립 ──
  const doc = new Document({
    creator: 'Z-GPS 사업계획서 작성 시스템',
    title: `${programName} 사업계획서`,
    description: `${company.name} - ${programName} 사업계획서`,
    styles: {
      default: {
        document: {
          run: {
            size: 20,
            font: '맑은 고딕',
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134,    // 20mm
              bottom: 1134, // 20mm
              left: 1417,   // 25mm
              right: 1417,  // 25mm
            },
          },
        },
        children: [
          titleParagraph,
          programNameParagraph,
          summaryTable,
          afterTableSpacer,
          ...sectionChildren,
        ],
      },
    ],
  });

  // ── 파일 생성 및 다운로드 ──
  const blob = await Packer.toBlob(doc);
  const safeFileName = programName.replace(/[/\\?%*:|"<>]/g, '_');
  saveAs(blob, `${safeFileName}_사업계획서.docx`);
}

// ─────────────────────────────────────────────
// HWP 내보내기 (미지원)
// ─────────────────────────────────────────────

/**
 * HWP 내보내기는 현재 지원하지 않습니다.
 * DOCX 형식을 사용해 주세요.
 */
export function exportToHwp(): never {
  throw new Error('HWP 내보내기는 현재 지원하지 않습니다. DOCX 형식을 사용해 주세요.');
}
