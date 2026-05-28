import { describe, expect, it } from 'vitest';
import {
  activeFileReferenceQuery,
  applySelectedFileReference,
  completeFileReferenceLine,
  formatFileSuggestionLine,
  formatFileSuggestionRows,
  moveFileReferenceSelection,
  prepareSelectedFileReferenceInput,
  projectFilesCommand,
  scoreFiles,
  suggestFileReferences,
} from '../../src/utils/file-references';

describe('file reference matching', () => {
  it('filters the full project file list before limiting results', () => {
    const files = [
      ...Array.from({ length: 500 }, (_, index) => `src/noise/${index}.ts`),
      'app/biz/src/main/java/com/acme/ScoreCardRechargeBizServiceImpl.java',
    ];

    expect(scoreFiles(files, 'ScoreCard', 5)).toEqual([
      'app/biz/src/main/java/com/acme/ScoreCardRechargeBizServiceImpl.java',
    ]);
  });

  it('completes @ mentions while preserving the text before the token', () => {
    const files = ['src/domain/UserService.ts'];

    expect(completeFileReferenceLine('please inspect @User', files)).toEqual([
      'please inspect @src/domain/UserService.ts',
    ]);
  });

  it('does not replace a partial directory mention with the common prefix for multiple matches', () => {
    const files = [
      'app/web/pom.xml',
      'app/biz/pom.xml',
      'app/model/pom.xml',
    ];

    expect(completeFileReferenceLine('@app/', files)).toEqual([
      '@app/',
      '@app/web/pom.xml',
      '@app/biz/pom.xml',
      '@app/model/pom.xml',
    ]);
  });

  it('extracts the active @ query from the current input line', () => {
    expect(activeFileReferenceQuery('inspect @ScoreCard')).toEqual({
      prefix: 'ScoreCard',
      query: 'ScoreCard',
    });
    expect(activeFileReferenceQuery('inspect @file:ScoreCard')).toEqual({
      prefix: 'file:ScoreCard',
      query: 'ScoreCard',
    });
    expect(activeFileReferenceQuery('inspect @ScoreCard and continue')).toBeNull();
  });

  it('suggests files for the active @ query on each input change', () => {
    const files = [
      'app/biz/src/main/java/ScoreCardRechargeBizServiceImpl.java',
      'app/web/pom.xml',
    ];

    expect(suggestFileReferences('inspect @Score', files, 5)).toEqual({
      query: 'Score',
      suggestions: ['app/biz/src/main/java/ScoreCardRechargeBizServiceImpl.java'],
    });
  });

  it('moves selected file reference index with wraparound', () => {
    expect(moveFileReferenceSelection(0, 1, 3)).toBe(1);
    expect(moveFileReferenceSelection(0, -1, 3)).toBe(2);
    expect(moveFileReferenceSelection(2, 1, 3)).toBe(0);
  });

  it('applies the selected file reference to the active @ token', () => {
    expect(applySelectedFileReference('inspect @Sco', 'app/biz/ScoreCard.java')).toBe(
      'inspect @app/biz/ScoreCard.java'
    );
    expect(applySelectedFileReference('inspect @file:Sco', 'app/biz/ScoreCard.java')).toBe(
      'inspect @file:app/biz/ScoreCard.java'
    );
  });

  it('prepares selected file references without submitting when requested', () => {
    expect(prepareSelectedFileReferenceInput('inspect @Sco', 'app/biz/ScoreCard.java', false)).toEqual({
      line: 'inspect @app/biz/ScoreCard.java',
      shouldSubmit: false,
    });
  });

  it('formats live suggestions as one terminal-safe line with selection', () => {
    expect(formatFileSuggestionLine('Sco', [
      'app/web/pom.xml',
      'app/biz/src/main/java/ScoreCard.java',
    ], 1, 120)).toBe(
      '@ matches "Sco":  1 app/web/pom.xml  >2 app/biz/src/main/java/ScoreCard.java'
    );
  });

  it('keeps live suggestion lines within terminal width', () => {
    const line = formatFileSuggestionLine('Score', [
      'app/biz/src/main/java/com/ly/travel/mdsoil/account/biz/service/scorecard/biz/ScoreCardRechargeBizServiceImpl.java',
    ], 0, 64);

    expect(line.length).toBeLessThanOrEqual(64);
    expect(line).toContain('...');
    expect(line).toContain('>1');
  });

  it('formats live suggestions as a multi-row dropdown with selection', () => {
    expect(formatFileSuggestionRows('gift', [
      'dalgen/db/tables/giftcard_account_recharge_order.xml',
      'dalgen/db/tables/giftcard_account_expenditure_order.xml',
    ], 1, 120, 8)).toEqual([
      '@ matches "gift"',
      '  1 dalgen/db/tables/giftcard_account_recharge_order.xml',
      '> 2 dalgen/db/tables/giftcard_account_expenditure_order.xml',
    ]);
  });

  it('keeps every live suggestion dropdown row within terminal width', () => {
    const rows = formatFileSuggestionRows('Score', [
      'app/biz/src/main/java/com/ly/travel/mdsoil/account/biz/service/scorecard/biz/ScoreCardRechargeBizServiceImpl.java',
    ], 0, 48, 8);

    expect(rows.every((row) => row.length <= 48)).toBe(true);
    expect(rows[1]).toContain('...');
    expect(rows[1]).toContain('> 1');
  });

  it('lists project files without pre-truncating before filtering', () => {
    expect(projectFilesCommand()).not.toContain('head -n');
  });
});
