function updateTopic(data) {
  var sheet = getTopicsSheet(); // replace with your actual topics sheet accessor
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

      return { updated: true, topicId: data.topicId };
    }
  }

  return { updated: false, topicId: data.topicId };
}
