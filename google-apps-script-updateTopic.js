/**
 * ADD THIS TO YOUR GOOGLE APPS SCRIPT for the Voting app
 *
 * 1. Open your Apps Script (script.google.com or Extensions > Apps Script)
 * 2. Add the updateTopic() function below
 * 3. In your doPost() switch statement, add the 'updateTopic' case
 * 4. Re-deploy as a new version (Deploy > Manage deployments > New version)
 *
 * ---
 * Add this case inside your doPost() switch(data.action) block:
 *
 *   case 'updateTopic':
 *     result = updateTopic(data);
 *     break;
 *
 * ---
 */

function updateTopic(data) {
  var sheet = getTopicsSheet(); // replace with whatever function gets your topics sheet
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];

  // Build a header -> column index map
  var colMap = {};
  headers.forEach(function(h, i) { if (h) colMap[h] = i; });

  for (var i = 1; i < rows.length; i++) {
    var rowId = rows[i][0]; // assumes id is column A
    if (String(rowId) === String(data.topicId)) {
      var rowNum = i + 1; // 1-indexed

      // Update editable fields only — preserve votes, closed, totalMembers
      if (data.title !== undefined)       sheet.getRange(rowNum, (colMap['title']       || 1) + 1).setValue(data.title);
      if (data.description !== undefined) sheet.getRange(rowNum, (colMap['description'] || 2) + 1).setValue(data.description);
      if (data.submittedBy !== undefined) sheet.getRange(rowNum, (colMap['submittedBy'] || 5) + 1).setValue(data.submittedBy);
      if (data.dueDate !== undefined)     sheet.getRange(rowNum, (colMap['dueDate']     || 4) + 1).setValue(data.dueDate);
      if (data.fileUrl !== undefined)     sheet.getRange(rowNum, (colMap['fileUrl']     || 7) + 1).setValue(data.fileUrl);
      if (data.fileName !== undefined)    sheet.getRange(rowNum, (colMap['fileName']    || 8) + 1).setValue(data.fileName);

      return { updated: true, topicId: data.topicId };
    }
  }
  return { updated: false, topicId: data.topicId };
}
