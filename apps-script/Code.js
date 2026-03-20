var SPREADSHEET_ID = "14EkQwSheb8xPDu2Jsu4-YRv6tGWN3TJnGerXG8JW8IM";
var TOPICS_SHEET_NAME = "Topics";
var VOTES_SHEET_NAME = "Votes";
var UPLOAD_FOLDER_NAME = "Board Voting";

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var result;

    switch (data.action) {
      case "getTopics":
        result = getTopics();
        break;
      case "addTopic":
        result = addTopic(data);
        break;
      case "updateTopic":
        result = updateTopic(data);
        break;
      case "castVote":
        result = castVote(data);
        break;
      case "closeTopic":
        result = closeTopic(data);
        break;
      case "uploadFile":
        result = uploadFile(data);
        break;
      default:
        throw new Error("Unknown action: " + data.action);
    }

    return json_(result);
  } catch (err) {
    return json_({ error: err.message || String(err) });
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getTopicsSheet() {
  var sheet = getSpreadsheet_().getSheetByName(TOPICS_SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + TOPICS_SHEET_NAME + '" not found.');
  ensureTopicsHeaders_(sheet);
  return sheet;
}

function getVotesSheet() {
  var sheet = getSpreadsheet_().getSheetByName(VOTES_SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + VOTES_SHEET_NAME + '" not found.');
  ensureVotesHeaders_(sheet);
  return sheet;
}

function ensureTopicsHeaders_(sheet) {
  var headers = [
    "id",
    "title",
    "description",
    "dueDate",
    "closed",
    "submittedBy",
    "totalMembers",
    "fileUrl",
    "fileName",
    "overallConsensus",
    "stipulations",
    "nextSteps"
  ];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  var existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (existing[i] !== headers[i]) {
      sheet.getRange(1, i + 1).setValue(headers[i]);
    }
  }
}

function ensureVotesHeaders_(sheet) {
  var headers = [
    "topicId",
    "voter",
    "choice",
    "note",
    "timestamp"
  ];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function getHeaderMap_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  headers.forEach(function(h, i) {
    if (h) map[h] = i;
  });
  return map;
}

function toBool_(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function toNum_(value, fallback) {
  var n = Number(value);
  return isNaN(n) ? fallback : n;
}

function loadVotesByTopic_() {
  var sheet = getVotesSheet();
  if (sheet.getLastRow() < 2) return {};

  var rows = sheet.getDataRange().getValues();
  var colMap = getHeaderMap_(sheet);
  var byTopic = {};

  for (var i = 1; i < rows.length; i++) {
    var topicId = String(rows[i][colMap.topicId] || "");
    var voter = rows[i][colMap.voter] || "";
    if (!topicId || !voter) continue;

    if (!byTopic[topicId]) byTopic[topicId] = {};
    byTopic[topicId][voter] = {
      choice: rows[i][colMap.choice] || "",
      note: rows[i][colMap.note] || "",
      at: rows[i][colMap.timestamp] || ""
    };
  }

  return byTopic;
}

function getTopics() {
  var topicsSheet = getTopicsSheet();
  if (topicsSheet.getLastRow() < 2) return { topics: [] };

  var topicRows = topicsSheet.getDataRange().getValues();
  var topicCols = getHeaderMap_(topicsSheet);
  var votesByTopic = loadVotesByTopic_();
  var topics = [];

  for (var i = 1; i < topicRows.length; i++) {
    var row = topicRows[i];
    var id = String(row[topicCols.id] || "");
    if (!id) continue;

    topics.push({
      id: id,
      title: row[topicCols.title] || "",
      description: row[topicCols.description] || "",
      dueDate: row[topicCols.dueDate] || "",
      closed: toBool_(row[topicCols.closed]),
      submittedBy: row[topicCols.submittedBy] || "",
      totalMembers: toNum_(row[topicCols.totalMembers], 0),
      fileUrl: row[topicCols.fileUrl] || "",
      fileName: row[topicCols.fileName] || "",
      overallConsensus: row[topicCols.overallConsensus] || "",
      stipulations: row[topicCols.stipulations] || "",
      nextSteps: row[topicCols.nextSteps] || "",
      votes: votesByTopic[id] || {}
    });
  }

  return { topics: topics };
}

function addTopic(data) {
  if (!data.title) throw new Error("Title is required.");

  var sheet = getTopicsSheet();
  var colMap = getHeaderMap_(sheet);
  var row = new Array(sheet.getLastColumn()).fill("");
  var topicId = Utilities.getUuid();

  row[colMap.id] = topicId;
  row[colMap.title] = data.title || "";
  row[colMap.description] = data.description || "";
  row[colMap.dueDate] = data.dueDate || "";
  row[colMap.closed] = false;
  row[colMap.submittedBy] = data.submittedBy || "";
  row[colMap.totalMembers] = toNum_(data.totalMembers, 0);
  row[colMap.fileUrl] = data.fileUrl || "";
  row[colMap.fileName] = data.fileName || "";
  row[colMap.overallConsensus] = data.overallConsensus || "";
  row[colMap.stipulations] = data.stipulations || "";
  row[colMap.nextSteps] = data.nextSteps || "";

  sheet.appendRow(row);

  return { added: true, topicId: topicId };
}

function updateTopic(data) {
  var sheet = getTopicsSheet();
  var rows = sheet.getDataRange().getValues();
  var colMap = getHeaderMap_(sheet);

  for (var i = 1; i < rows.length; i++) {
    var rowId = rows[i][colMap.id];
    if (String(rowId) === String(data.topicId)) {
      var rowNum = i + 1;

      if (data.title !== undefined) sheet.getRange(rowNum, colMap.title + 1).setValue(data.title);
      if (data.description !== undefined) sheet.getRange(rowNum, colMap.description + 1).setValue(data.description);
      if (data.submittedBy !== undefined) sheet.getRange(rowNum, colMap.submittedBy + 1).setValue(data.submittedBy);
      if (data.dueDate !== undefined) sheet.getRange(rowNum, colMap.dueDate + 1).setValue(data.dueDate);
      if (data.fileUrl !== undefined) sheet.getRange(rowNum, colMap.fileUrl + 1).setValue(data.fileUrl);
      if (data.fileName !== undefined) sheet.getRange(rowNum, colMap.fileName + 1).setValue(data.fileName);
      if (data.overallConsensus !== undefined) sheet.getRange(rowNum, colMap.overallConsensus + 1).setValue(data.overallConsensus);
      if (data.stipulations !== undefined) sheet.getRange(rowNum, colMap.stipulations + 1).setValue(data.stipulations);
      if (data.nextSteps !== undefined) sheet.getRange(rowNum, colMap.nextSteps + 1).setValue(data.nextSteps);

      return { updated: true, topicId: data.topicId };
    }
  }

  return { updated: false, topicId: data.topicId };
}

function castVote(data) {
  if (!data.topicId) throw new Error("topicId is required.");
  if (!data.voter) throw new Error("voter is required.");
  if (!data.choice) throw new Error("choice is required.");

  var votesSheet = getVotesSheet();
  var voteRows = votesSheet.getDataRange().getValues();
  var voteCols = getHeaderMap_(votesSheet);
  var found = false;

  for (var i = 1; i < voteRows.length; i++) {
    var rowTopicId = String(voteRows[i][voteCols.topicId] || "");
    var rowVoter = String(voteRows[i][voteCols.voter] || "");

    if (rowTopicId === String(data.topicId) && rowVoter === String(data.voter)) {
      var rowNum = i + 1;
      votesSheet.getRange(rowNum, voteCols.choice + 1).setValue(data.choice);
      votesSheet.getRange(rowNum, voteCols.note + 1).setValue(data.note || "");
      votesSheet.getRange(rowNum, voteCols.timestamp + 1).setValue(new Date().toISOString());
      found = true;
      break;
    }
  }

  if (!found) {
    var row = new Array(votesSheet.getLastColumn()).fill("");
    row[voteCols.topicId] = data.topicId;
    row[voteCols.voter] = data.voter;
    row[voteCols.choice] = data.choice;
    row[voteCols.note] = data.note || "";
    row[voteCols.timestamp] = new Date().toISOString();
    votesSheet.appendRow(row);
  }

  maybeAutoCloseTopic_(data.topicId);
  return { saved: true, topicId: data.topicId, voter: data.voter };
}

function maybeAutoCloseTopic_(topicId) {
  var topicsSheet = getTopicsSheet();
  var topicRows = topicsSheet.getDataRange().getValues();
  var topicCols = getHeaderMap_(topicsSheet);
  var votesByTopic = loadVotesByTopic_();
  var topicVotes = votesByTopic[String(topicId)] || {};

  for (var i = 1; i < topicRows.length; i++) {
    if (String(topicRows[i][topicCols.id]) === String(topicId)) {
      var totalMembers = toNum_(topicRows[i][topicCols.totalMembers], 0);
      if (totalMembers > 0 && Object.keys(topicVotes).length >= totalMembers) {
        topicsSheet.getRange(i + 1, topicCols.closed + 1).setValue(true);
      }
      return;
    }
  }
}

function closeTopic(data) {
  if (!data.topicId) throw new Error("topicId is required.");

  var sheet = getTopicsSheet();
  var rows = sheet.getDataRange().getValues();
  var colMap = getHeaderMap_(sheet);

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][colMap.id]) === String(data.topicId)) {
      sheet.getRange(i + 1, colMap.closed + 1).setValue(true);
      return { closed: true, topicId: data.topicId };
    }
  }

  throw new Error("Topic not found: " + data.topicId);
}

function getUploadFolder_() {
  var folders = DriveApp.getFoldersByName(UPLOAD_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(UPLOAD_FOLDER_NAME);
}

function uploadFile(data) {
  if (!data.fileName) throw new Error("fileName is required.");
  if (!data.fileData) throw new Error("fileData is required.");

  var bytes = Utilities.base64Decode(data.fileData);
  var blob = Utilities.newBlob(bytes, data.mimeType || "application/octet-stream", data.fileName);
  var file = getUploadFolder_().createFile(blob);

  return {
    ok: true,
    name: file.getName(),
    url: file.getUrl(),
    id: file.getId()
  };
}
