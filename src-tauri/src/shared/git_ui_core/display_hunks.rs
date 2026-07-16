use crate::types::GitFileDisplayHunk;

use super::selection::{
    parse_hunk_header, parse_zero_context_patch, parsed_patch_hunk_id, ParsedPatchHunk,
    SelectionLineType,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ParsedDisplayLineType {
    Add,
    Del,
    Context,
    Hunk,
    Meta,
}

#[derive(Debug, Clone)]
struct ParsedDisplayLine {
    line_type: ParsedDisplayLineType,
    old_line: Option<usize>,
    new_line: Option<usize>,
}

#[derive(Debug, Clone)]
struct ParsedDisplaySegment {
    lines: Vec<(usize, ParsedDisplayLine)>,
}

#[derive(Debug, Clone, Copy)]
struct DisplayLineRange {
    start: usize,
    end: usize,
}

#[derive(Debug, Clone, Copy)]
struct DisplayMatchRange {
    old_range: Option<DisplayLineRange>,
    new_range: Option<DisplayLineRange>,
}

fn parse_display_diff(diff: &str) -> Vec<ParsedDisplayLine> {
    let mut parsed = Vec::new();
    let mut old_line = 0usize;
    let mut new_line = 0usize;
    let mut in_hunk = false;

    for raw_line in diff.split('\n') {
        if let Some((old_start, _, new_start, _)) = parse_hunk_header(raw_line) {
            old_line = old_start;
            new_line = new_start;
            parsed.push(ParsedDisplayLine {
                line_type: ParsedDisplayLineType::Hunk,
                old_line: None,
                new_line: None,
            });
            in_hunk = true;
            continue;
        }

        if !in_hunk {
            continue;
        }

        if raw_line.starts_with('+') {
            parsed.push(ParsedDisplayLine {
                line_type: ParsedDisplayLineType::Add,
                old_line: None,
                new_line: Some(new_line),
            });
            new_line += 1;
            continue;
        }

        if raw_line.starts_with('-') {
            parsed.push(ParsedDisplayLine {
                line_type: ParsedDisplayLineType::Del,
                old_line: Some(old_line),
                new_line: None,
            });
            old_line += 1;
            continue;
        }

        if raw_line.starts_with(' ') {
            parsed.push(ParsedDisplayLine {
                line_type: ParsedDisplayLineType::Context,
                old_line: Some(old_line),
                new_line: Some(new_line),
            });
            old_line += 1;
            new_line += 1;
            continue;
        }

        if raw_line.starts_with('\\') {
            parsed.push(ParsedDisplayLine {
                line_type: ParsedDisplayLineType::Meta,
                old_line: None,
                new_line: None,
            });
        }
    }

    parsed
}

fn build_display_segments(parsed_lines: &[ParsedDisplayLine]) -> Vec<ParsedDisplaySegment> {
    let mut segments = Vec::new();
    let mut current: Vec<(usize, ParsedDisplayLine)> = Vec::new();

    for (index, line) in parsed_lines.iter().cloned().enumerate() {
        match line.line_type {
            ParsedDisplayLineType::Add | ParsedDisplayLineType::Del => current.push((index, line)),
            ParsedDisplayLineType::Meta => {
                if !current.is_empty() {
                    current.push((index, line));
                }
            }
            _ => {
                if !current.is_empty() {
                    segments.push(ParsedDisplaySegment { lines: current });
                    current = Vec::new();
                }
            }
        }
    }

    if !current.is_empty() {
        segments.push(ParsedDisplaySegment { lines: current });
    }

    segments
}

fn hunk_old_end(hunk: &ParsedPatchHunk) -> Option<usize> {
    if hunk.old_count == 0 {
        None
    } else {
        Some(hunk.old_start + hunk.old_count - 1)
    }
}

fn hunk_new_end(hunk: &ParsedPatchHunk) -> Option<usize> {
    if hunk.new_count == 0 {
        None
    } else {
        Some(hunk.new_start + hunk.new_count - 1)
    }
}

fn map_old_to_new_line_clamped(hunks: &[ParsedPatchHunk], old_line: usize) -> usize {
    let mut delta = 0isize;

    for hunk in hunks {
        if hunk.old_count == 0 {
            if old_line < hunk.old_start {
                break;
            }
            delta += hunk.new_count as isize;
            continue;
        }

        let old_end = hunk.old_start + hunk.old_count - 1;
        if old_line < hunk.old_start {
            break;
        }
        if old_line <= old_end {
            if hunk.new_count == 0 {
                return hunk.new_start;
            }
            let relative = old_line - hunk.old_start;
            return hunk.new_start + relative.min(hunk.new_count - 1);
        }

        delta += hunk.new_count as isize - hunk.old_count as isize;
    }

    ((old_line as isize) + delta).max(1) as usize
}

fn map_new_to_old_line_clamped(hunks: &[ParsedPatchHunk], new_line: usize) -> usize {
    let mut delta = 0isize;

    for hunk in hunks {
        if hunk.new_count == 0 {
            let insertion_point = hunk.new_start;
            if new_line < insertion_point {
                break;
            }
            delta += hunk.old_count as isize;
            continue;
        }

        let new_end = hunk.new_start + hunk.new_count - 1;
        if new_line < hunk.new_start {
            break;
        }
        if new_line <= new_end {
            if hunk.old_count == 0 {
                return hunk.old_start;
            }
            let relative = new_line - hunk.new_start;
            return hunk.old_start + relative.min(hunk.old_count - 1);
        }

        delta += hunk.old_count as isize - hunk.new_count as isize;
    }

    ((new_line as isize) + delta).max(1) as usize
}

fn display_match_range_for_staged_hunk(
    hunk: &ParsedPatchHunk,
    unstaged_hunks: &[ParsedPatchHunk],
) -> DisplayMatchRange {
    DisplayMatchRange {
        old_range: hunk_old_end(hunk).map(|end| DisplayLineRange {
            start: hunk.old_start,
            end,
        }),
        new_range: hunk_new_end(hunk).map(|end| DisplayLineRange {
            start: map_old_to_new_line_clamped(unstaged_hunks, hunk.new_start),
            end: map_old_to_new_line_clamped(unstaged_hunks, end),
        }),
    }
}

fn display_match_range_for_unstaged_hunk(
    hunk: &ParsedPatchHunk,
    staged_hunks: &[ParsedPatchHunk],
) -> DisplayMatchRange {
    DisplayMatchRange {
        old_range: hunk_old_end(hunk).map(|end| DisplayLineRange {
            start: map_new_to_old_line_clamped(staged_hunks, hunk.old_start),
            end: map_new_to_old_line_clamped(staged_hunks, end),
        }),
        new_range: hunk_new_end(hunk).map(|end| DisplayLineRange {
            start: hunk.new_start,
            end,
        }),
    }
}

fn range_contains(range: DisplayLineRange, line_number: Option<usize>) -> bool {
    matches!(line_number, Some(line_number) if line_number >= range.start && line_number <= range.end)
}

fn source_hunk_line_counts(hunk: &ParsedPatchHunk) -> (usize, usize) {
    hunk.lines
        .iter()
        .fold((0usize, 0usize), |(adds, dels), line| {
            if line.line_type == SelectionLineType::Add {
                (adds + 1, dels)
            } else {
                (adds, dels + 1)
            }
        })
}

fn find_display_hunk_span(
    segments: &[ParsedDisplaySegment],
    min_start_index: usize,
    display_range: DisplayMatchRange,
    expected_add_count: usize,
    expected_del_count: usize,
) -> Option<(usize, usize, usize)> {
    for segment in segments {
        let mut matched_indices = Vec::new();
        let mut add_count = 0usize;
        let mut del_count = 0usize;

        for (display_index, line) in &segment.lines {
            if *display_index < min_start_index {
                continue;
            }
            match line.line_type {
                ParsedDisplayLineType::Add => {
                    if display_range
                        .new_range
                        .is_some_and(|range| range_contains(range, line.new_line))
                    {
                        matched_indices.push(*display_index);
                        add_count += 1;
                    }
                }
                ParsedDisplayLineType::Del => {
                    if display_range
                        .old_range
                        .is_some_and(|range| range_contains(range, line.old_line))
                    {
                        matched_indices.push(*display_index);
                        del_count += 1;
                    }
                }
                _ => {}
            }
        }

        if add_count == expected_add_count && del_count == expected_del_count {
            let start = matched_indices.first().copied()?;
            let end = matched_indices.last().copied()?;
            return Some((start, end, matched_indices.len()));
        }
    }

    None
}

fn parse_source_hunks(diff: Option<&str>) -> Vec<ParsedPatchHunk> {
    diff.and_then(|diff| {
        if diff.trim().is_empty() {
            None
        } else {
            parse_zero_context_patch(diff).ok()
        }
    })
    .map(|parsed| parsed.hunks)
    .unwrap_or_default()
}

pub(super) fn build_display_hunks(
    diff: &str,
    staged_diff: Option<&str>,
    unstaged_diff: Option<&str>,
) -> Vec<GitFileDisplayHunk> {
    let parsed_display_lines = parse_display_diff(diff);
    if parsed_display_lines.is_empty() {
        return Vec::new();
    }
    let display_segments = build_display_segments(&parsed_display_lines);
    if display_segments.is_empty() {
        return Vec::new();
    }

    let staged_hunks = parse_source_hunks(staged_diff);
    let unstaged_hunks = parse_source_hunks(unstaged_diff);
    let mut display_hunks = Vec::new();

    let mut staged_min_start_index = 0usize;
    for hunk in &staged_hunks {
        let display_range = display_match_range_for_staged_hunk(hunk, &unstaged_hunks);
        let (expected_add_count, expected_del_count) = source_hunk_line_counts(hunk);
        let Some((start, end, line_count)) = find_display_hunk_span(
            &display_segments,
            staged_min_start_index,
            display_range,
            expected_add_count,
            expected_del_count,
        ) else {
            continue;
        };
        staged_min_start_index = end.saturating_add(1);
        display_hunks.push(GitFileDisplayHunk {
            id: parsed_patch_hunk_id("staged", hunk),
            source: "staged".to_string(),
            action: "unstage".to_string(),
            start_display_line_index: start,
            end_display_line_index: end,
            line_count,
        });
    }

    let mut unstaged_min_start_index = 0usize;
    for hunk in &unstaged_hunks {
        let display_range = display_match_range_for_unstaged_hunk(hunk, &staged_hunks);
        let (expected_add_count, expected_del_count) = source_hunk_line_counts(hunk);
        let Some((start, end, line_count)) = find_display_hunk_span(
            &display_segments,
            unstaged_min_start_index,
            display_range,
            expected_add_count,
            expected_del_count,
        ) else {
            continue;
        };
        unstaged_min_start_index = end.saturating_add(1);
        display_hunks.push(GitFileDisplayHunk {
            id: parsed_patch_hunk_id("unstaged", hunk),
            source: "unstaged".to_string(),
            action: "stage".to_string(),
            start_display_line_index: start,
            end_display_line_index: end,
            line_count,
        });
    }

    display_hunks.sort_by(|left, right| {
        left.start_display_line_index
            .cmp(&right.start_display_line_index)
            .then(
                left.end_display_line_index
                    .cmp(&right.end_display_line_index),
            )
            .then(left.action.cmp(&right.action))
            .then(left.id.cmp(&right.id))
    });

    display_hunks
}

#[cfg(test)]
mod display_hunk_tests {
    use super::build_display_hunks;

    #[test]
    fn build_display_hunks_preserves_file_order_for_mixed_disjoint_hunks() {
        let diff = "@@ -1,2 +1,4 @@\n line one\n+new staged line\n line two\n+new unstaged line";
        let staged_diff = concat!(
            "diff --git a/src/main.ts b/src/main.ts\n",
            "index 1111111..2222222 100644\n",
            "--- a/src/main.ts\n",
            "+++ b/src/main.ts\n",
            "@@ -1,0 +2,1 @@\n",
            "+new staged line\n"
        );
        let unstaged_diff = concat!(
            "diff --git a/src/main.ts b/src/main.ts\n",
            "index 2222222..3333333 100644\n",
            "--- a/src/main.ts\n",
            "+++ b/src/main.ts\n",
            "@@ -3,0 +4,1 @@\n",
            "+new unstaged line\n"
        );

        let display_hunks = build_display_hunks(diff, Some(staged_diff), Some(unstaged_diff));

        assert_eq!(display_hunks.len(), 2);
        assert_eq!(display_hunks[0].id, "staged:1:0:2:1");
        assert_eq!(display_hunks[0].start_display_line_index, 2);
        assert_eq!(display_hunks[0].end_display_line_index, 2);
        assert_eq!(display_hunks[1].id, "unstaged:3:0:4:1");
        assert_eq!(display_hunks[1].start_display_line_index, 4);
        assert_eq!(display_hunks[1].end_display_line_index, 4);
    }

    #[test]
    fn build_display_hunks_supports_overlapping_staged_and_unstaged_spans() {
        let diff = "@@ -1,1 +1,1 @@\n-old value\n+newer value";
        let staged_diff = concat!(
            "diff --git a/src/main.ts b/src/main.ts\n",
            "index 1111111..2222222 100644\n",
            "--- a/src/main.ts\n",
            "+++ b/src/main.ts\n",
            "@@ -1,1 +1,1 @@\n",
            "-old value\n",
            "+new value\n"
        );
        let unstaged_diff = concat!(
            "diff --git a/src/main.ts b/src/main.ts\n",
            "index 2222222..3333333 100644\n",
            "--- a/src/main.ts\n",
            "+++ b/src/main.ts\n",
            "@@ -1,1 +1,1 @@\n",
            "-new value\n",
            "+newer value\n"
        );

        let display_hunks = build_display_hunks(diff, Some(staged_diff), Some(unstaged_diff));

        assert_eq!(display_hunks.len(), 2);
        assert_eq!(display_hunks[0].start_display_line_index, 1);
        assert_eq!(display_hunks[0].end_display_line_index, 2);
        assert_eq!(display_hunks[1].start_display_line_index, 1);
        assert_eq!(display_hunks[1].end_display_line_index, 2);
    }

    #[test]
    fn build_display_hunks_maps_staged_and_unstaged_insertions_in_file_order() {
        let diff = concat!(
            "@@ -29,6 +29,17 @@ pub(crate) struct GitSelectionApplyResult {\n",
            "     pub(crate) warning: Option<String>,\n",
            " }\n",
            " \n",
            "+#[derive(Debug, Serialize, Deserialize, Clone)]\n",
            "+#[serde(rename_all = \"camelCase\")]\n",
            "+pub(crate) struct GitFileDisplayHunk {\n",
            "+    pub(crate) id: String,\n",
            "+    pub(crate) source: String,\n",
            "+    pub(crate) action: String,\n",
            "+    pub(crate) start_display_line_index: usize,\n",
            "+    pub(crate) end_display_line_index: usize,\n",
            "+    pub(crate) line_count: usize,\n",
            "+}\n",
            "+\n",
            " #[derive(Debug, Serialize, Deserialize, Clone)]\n",
            " pub(crate) struct GitFileDiff {\n",
            "     pub(crate) path: String,\n",
            "@@ -37,6 +48,8 @@ pub(crate) struct GitFileDiff {\n",
            "     pub(crate) staged_diff: Option<String>,\n",
            "     #[serde(default, rename = \"unstagedDiff\")]\n",
            "     pub(crate) unstaged_diff: Option<String>,\n",
            "+    #[serde(default, rename = \"displayHunks\")]\n",
            "+    pub(crate) display_hunks: Vec<GitFileDisplayHunk>,\n",
            "     #[serde(default, rename = \"oldLines\")]\n",
            "     pub(crate) old_lines: Option<Vec<String>>,\n",
            "     #[serde(default, rename = \"newLines\")]\n"
        );
        let staged_diff = concat!(
            "diff --git a/src-tauri/src/types.rs b/src-tauri/src/types.rs\n",
            "index dfcfa92..1277207 100644\n",
            "--- a/src-tauri/src/types.rs\n",
            "+++ b/src-tauri/src/types.rs\n",
            "@@ -31,0 +32,11 @@ pub(crate) struct GitSelectionApplyResult {\n",
            "+#[derive(Debug, Serialize, Deserialize, Clone)]\n",
            "+#[serde(rename_all = \"camelCase\")]\n",
            "+pub(crate) struct GitFileDisplayHunk {\n",
            "+    pub(crate) id: String,\n",
            "+    pub(crate) source: String,\n",
            "+    pub(crate) action: String,\n",
            "+    pub(crate) start_display_line_index: usize,\n",
            "+    pub(crate) end_display_line_index: usize,\n",
            "+    pub(crate) line_count: usize,\n",
            "+}\n",
            "+\n"
        );
        let unstaged_diff = concat!(
            "diff --git a/src-tauri/src/types.rs b/src-tauri/src/types.rs\n",
            "index 1277207..4d7914e 100644\n",
            "--- a/src-tauri/src/types.rs\n",
            "+++ b/src-tauri/src/types.rs\n",
            "@@ -50,0 +51,2 @@ pub(crate) struct GitFileDiff {\n",
            "+    #[serde(default, rename = \"displayHunks\")]\n",
            "+    pub(crate) display_hunks: Vec<GitFileDisplayHunk>,\n"
        );

        let display_hunks = build_display_hunks(diff, Some(staged_diff), Some(unstaged_diff));

        assert_eq!(display_hunks.len(), 2);
        assert_eq!(display_hunks[0].id, "staged:31:0:32:11");
        assert_eq!(display_hunks[0].source, "staged");
        assert_eq!(display_hunks[0].action, "unstage");
        assert_eq!(display_hunks[0].line_count, 11);
        assert!(
            display_hunks[0].start_display_line_index <= display_hunks[0].end_display_line_index
        );

        assert_eq!(display_hunks[1].id, "unstaged:50:0:51:2");
        assert_eq!(display_hunks[1].source, "unstaged");
        assert_eq!(display_hunks[1].action, "stage");
        assert_eq!(display_hunks[1].line_count, 2);
        assert!(
            display_hunks[1].start_display_line_index <= display_hunks[1].end_display_line_index
        );

        assert!(
            display_hunks[0].start_display_line_index < display_hunks[1].start_display_line_index
        );
    }

    #[test]
    fn build_display_hunks_maps_unstaged_hunks_after_staged_deletions() {
        let diff = concat!(
            "@@ -2,1 +2,0 @@\n",
            "-line two\n",
            "@@ -5,1 +4,1 @@\n",
            "-line five\n",
            "+line five updated\n"
        );
        let staged_diff = concat!(
            "diff --git a/example.txt b/example.txt\n",
            "index 1111111..2222222 100644\n",
            "--- a/example.txt\n",
            "+++ b/example.txt\n",
            "@@ -2,1 +2,0 @@\n",
            "-line two\n"
        );
        let unstaged_diff = concat!(
            "diff --git a/example.txt b/example.txt\n",
            "index 2222222..3333333 100644\n",
            "--- a/example.txt\n",
            "+++ b/example.txt\n",
            "@@ -4,1 +4,1 @@\n",
            "-line five\n",
            "+line five updated\n"
        );

        let display_hunks = build_display_hunks(diff, Some(staged_diff), Some(unstaged_diff));

        assert_eq!(display_hunks.len(), 2);
        assert_eq!(display_hunks[0].id, "staged:2:1:2:0");
        assert_eq!(display_hunks[1].id, "unstaged:4:1:4:1");
        assert_eq!(display_hunks[1].start_display_line_index, 3);
        assert_eq!(display_hunks[1].end_display_line_index, 4);
    }

    #[test]
    fn build_display_hunks_keeps_eof_no_newline_markers_in_one_segment() {
        let diff = concat!(
            "@@ -1 +1 @@\n",
            "-before\n",
            "\\ No newline at end of file\n",
            "+after\n",
            "\\ No newline at end of file\n"
        );
        let unstaged_diff = concat!(
            "diff --git a/example.txt b/example.txt\n",
            "index 1111111..2222222 100644\n",
            "--- a/example.txt\n",
            "+++ b/example.txt\n",
            "@@ -1,1 +1,1 @@\n",
            "-before\n",
            "\\ No newline at end of file\n",
            "+after\n",
            "\\ No newline at end of file\n"
        );

        let display_hunks = build_display_hunks(diff, None, Some(unstaged_diff));

        assert_eq!(display_hunks.len(), 1);
        assert_eq!(display_hunks[0].id, "unstaged:1:1:1:1");
        assert_eq!(display_hunks[0].start_display_line_index, 1);
        assert_eq!(display_hunks[0].end_display_line_index, 3);
    }
}
