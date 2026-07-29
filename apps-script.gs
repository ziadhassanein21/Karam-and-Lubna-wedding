/**
 * Lubna & Karam Wedding - RSVP to Google Sheets
 * Google Apps Script (Web App)
 *
 * SETUP INSTRUCTIONS (one-time, ~5 minutes):
 *
 * 1. Open Google Sheets: https://sheets.google.com
 *    Create a new spreadsheet named "Lubna & Karam - RSVPs"
 *
 * 2. In the spreadsheet, open Extensions > Apps Script
 *
 * 3. Delete any existing code and paste the entire content of this file.
 *
 * 4. Click Save (Ctrl+S).
 *
 * 5. Click "Deploy" > "New deployment"
 *    - Type: "Web app"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 *    - Click "Deploy"
 *
 * 6. Copy the "Web app URL" that appears.
 *
 * 7. Open src/main.js in the wedding project, find:
 *      const GOOGLE_SCRIPT_URL = "YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
 *    Replace with your URL.
 *
 * 8. Save main.js - RSVP submissions will now go to your sheet!
 *
 * SHEET COLUMNS (auto-created on first submission):
 *   A: Timestamp | B: Name | C: Attendance | D: Food Notes | E: Event
 */

const SHEET_NAME = "RSVPs";

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(["Timestamp", "Name", "Attendance", "Food Notes", "Event"]);
      sheet.getRange(1, 1, 1, 5).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.name || "",
      data.attendance || "",
      data.food || "",
      data.event || "Lubna & Karam Wedding"
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ready" }))
    .setMimeType(ContentService.MimeType.JSON);
}
