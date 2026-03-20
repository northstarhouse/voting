function getTopicsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("No active spreadsheet is available.");
  }

  var candidates = ["Topics", "topics"];
  for (var i = 0; i < candidates.length; i++) {
    var namedSheet = ss.getSheetByName(candidates[i]);
    if (namedSheet) {
      return namedSheet;
    }
  }

  var sheets = ss.getSheets();
  if (sheets.length === 1) {
    return sheets[0];
  }

  throw new Error('Topics sheet not found. Rename your sheet to "Topics" or update getTopicsSheet().');
}

function updateTopic(data) {
  var sheet = getTopicsSheet();
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];

  // Build a header-to-column index map once so updates stay readable.
  var colMap = {};
  headers.forEach(function (h, i) {
    if (h) colMap[h] = i;
  });

  for (var i = 1; i < rows.length; i++) {
    var rowId = rows[i][0]; // assumes id is in column A
    if (String(rowId) === String(data.topicId)) {
      var rowNum = i + 1; // convert zero-based array index to sheet row number

      // Update editable fields only; preserve votes, closed, and totalMembers.
      if (data.title !== undefined) {
        sheet.getRange(rowNum, (colMap.title || 1) + 1).setValue(data.title);
      }
      if (data.description !== undefined) {
        sheet.getRange(rowNum, (colMap.description || 2) + 1).setValue(data.description);
      }
      if (data.submittedBy !== undefined) {
        sheet.getRange(rowNum, (colMap.submittedBy || 5) + 1).setValue(data.submittedBy);
      }
      if (data.dueDate !== undefined) {
        sheet.getRange(rowNum, (colMap.dueDate || 4) + 1).setValue(data.dueDate);
      }
      if (data.fileUrl !== undefined) {
        sheet.getRange(rowNum, (colMap.fileUrl || 7) + 1).setValue(data.fileUrl);
      }
      if (data.fileName !== undefined) {
        sheet.getRange(rowNum, (colMap.fileName || 8) + 1).setValue(data.fileName);
      }
      if (data.overallConsensus !== undefined && colMap.overallConsensus !== undefined) {
        sheet.getRange(rowNum, colMap.overallConsensus + 1).setValue(data.overallConsensus);
      }
      if (data.stipulations !== undefined && colMap.stipulations !== undefined) {
        sheet.getRange(rowNum, colMap.stipulations + 1).setValue(data.stipulations);
      }
      if (data.nextSteps !== undefined && colMap.nextSteps !== undefined) {
        sheet.getRange(rowNum, colMap.nextSteps + 1).setValue(data.nextSteps);
      }

      return { updated: true, topicId: data.topicId };
    }
  }

  return { updated: false, topicId: data.topicId };
}
