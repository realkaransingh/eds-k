# Form spreadsheet submit contract

## Authoring in Universal Editor

1. Add a **Form** block to the section.
2. Select the Form block and set **Properties**: Form ID, Submit Type (`rest` or `spreadsheet`), Submit URL, Spreadsheet Path.
3. Inside Form, add child items as needed:
   - **Form Text** — text, email, tel, textarea, date
   - **Form Options** — dropdown, radio, or checkbox (+ choices)
   - **Form Hidden** — name + value
   - **Form Button** — submit or reset (if omitted, a default Submit button is rendered)
4. Delete and re-add any Form / Form Field / Form Settings created with older definitions; then hard-refresh UE.

Field **Name** (`fieldName`) is used in the submission payload. For spreadsheet submit it must match the column header. Optional settings (required, placeholder, help, choices) use the Settings / Choices textarea on each item.

The browser never talks to AEM Author directly. It `POST`s JSON (no client `Authorization` header) to a **public proxy** (`submitUrl`). The proxy appends a row to an AEM Author spreadsheet.

Recommended proxy: [AEM Edge Functions](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/edge-functions) with the Author Bearer stored as a **Cloud Manager secret** (`edgeFunctions.yaml` → `secrets`), not in this EDS site repo.

## Target spreadsheet

| Property | Value |
|----------|--------|
| Author path | `/content/eds-k/test/form` |
| Example Author URL | `https://author-<p>-<e>.adobeaemcloud.com/content/eds-k/test/form.html` |
| Demo columns | `Name`, `Email`, `Phone` |

## Browser → proxy payload

```http
POST {submitUrl}
Content-Type: application/json
```

```json
{
  "data": {
    "Name": "Jane Doe",
    "Email": "jane@example.com",
    "Phone": "0210000000"
  },
  "meta": {
    "formId": "member-enquiry-sheet",
    "submitType": "spreadsheet",
    "spreadsheetPath": "/content/eds-k/test/form",
    "pagePath": "/drafts/form-spreadsheet-demo",
    "submittedAt": "2026-10-12T20:00:00.000Z"
  }
}
```

Expected proxy responses:

- `200` / `201` — success (form shows success message)
- `4xx` / `5xx` — failure (form shows error message)

## Proxy → AEM Author

Use the documented spreadsheet import API ([Managing tabular data](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/edge-delivery/wysiwyg-authoring/tabular-data)):

1. Build a one-row CSV whose **headers match the sheet columns exactly**.
2. Authenticate to Author with a service user / technical account (never expose credentials to the browser).
3. `POST` multipart to Author:

```bash
curl --request POST \
  --url "https://<author-host>/bin/asynccommand" \
  --header "Authorization: Bearer <token>" \
  --form file=@/tmp/submission.csv \
  --form spreadsheetPath=/content/eds-k/test/form \
  --form 'spreadsheetTitle=Form' \
  --form cmd=spreadsheetImport \
  --form operation=asyncSpreadsheetImport \
  --form _charset_=utf-8 \
  --form mode=append
```

4. Optionally poll the async job status using the returned job id.

### Example CSV for the demo sheet

```csv
Name,Email,Phone
Jane Doe,jane@example.com,0210000000
```

Map only columns that exist on the sheet. Extra `data` keys can be ignored or cause you to extend the sheet columns in Author first.

## Security notes

- Do **not** put IMS/Author Bearer tokens in `blocks/form/form.js` or any client-side code (GitHub push protection will block them; browsers can read them anyway).
- Do **not** call `/bin/asynccommand` from the published site with author credentials.
- Store the Author token on the proxy only (Cloud Manager secret for Edge Functions, or equivalent env secret for another backend).
- Restrict who can open `/content/eds-k/test/form` in Author (PII).
- Validate/sanitize field values in the proxy before import.
- Prefer rate limiting and bot protection on the public `submitUrl` (captcha can be added later).

## Local testing without a proxy

Draft demos point `submitUrl` at `https://httpbin.org/post` so you can confirm the JSON shape. Replace with your real proxy URL before production spreadsheet writes.
