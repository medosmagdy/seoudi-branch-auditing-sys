import { createElement } from 'react';
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportDocument } from '../components/report/ReportDocument';
import { auditExportFixture } from './__fixtures__/audit-export';
it('shows general and section deductions even without NCRs, excluding N/A sections', () => {
 const model = auditExportFixture();
 model.history = []; model.allPhotos = []; model.ncrs = [];
 model.generalDeductions = [{id:'g', reasonText:'خصم عام للتقرير', percentage:5}];
 model.sections[0]!.deductions = [{id:'s',reasonText:'خصم خاص بالقسم',percentage:2}];
 const html = renderToStaticMarkup(createElement(ReportDocument, {model}));
 expect(html).toContain('خصم عام للتقرير');
 expect(html).toContain('خصم خاص بالقسم');
 expect(html).toContain('إجمالي الخصومات العامة: 5%');
 expect(html).toContain('خصومات القسم');
});
