# Measurements

### Analytics
- **Progress Calculation**: Automatic progress percentages
- **Milestone Tracking**: Achievement notifications
- **Trend Analysis**: Identify patterns and plateaus
- **Correlation Analysis**: Relationship between different metrics

## Lab Results
Track blood tests and other lab markers (HbA1c, LDL, vitamin D, and so on) over time in the mobile app, under **Library > Lab results**. Lab markers are custom measurements flagged as lab results, so they follow the same sharing permission as other check-in data (**Manage Check-in**).

- **Markers**: pick from a built-in list of common markers, or add your own with a unit and an optional reference range. Each marker keeps the unit you entered; values are not converted between units such as mg/dL and mmol/L.
- **Reference ranges**: the built-in ranges are general adult defaults, and use the sex set in your profile where the typical range differs by sex. Labs differ, so edit the range to match your report. Results show as Low, High or In range against it. This is not medical advice.
- **Charts**: each marker has a history chart with its reference range, and the Dashboard has an optional Lab Results card. On the web, **Reports > Lab Results** is its own tab that charts each marker over the selected date range with its reference range shaded, and the latest result's status; with no markers yet it points you at the mobile app. Lab markers are kept out of the daily Check-in form and the Custom Measurements charts. Adding results is done in the mobile app.
- **Import a report**: choose a PDF or a photo or screenshot of a lab report, and your AI provider reads it. You review the results, set the test date, and choose which to save; nothing is saved until you confirm, and the report itself is not stored. The report is sent to the AI provider you configured, so use a provider you are comfortable sharing health data with. A PDF must contain selectable text; for a scanned PDF, send a photo instead. The reference ranges printed on the report can replace your marker's range.
- **Deleting imports**: results saved from a report are tagged with that import. In Lab results, the menu's **Delete imported results** removes every imported result, and any marker left empty, and keeps the results you entered yourself. A marker's own screen has **Delete marker and all results**. Results imported before this existed are not tagged, so use the marker delete for those.
- **One result per day**: saving a second result for the same marker on the same day replaces the first.
The **Measurements** tab of the [Check-In](/features/check-in) page is where you log your body metrics. Everything you log here shows up as trend charts in [Reports](/features/reports).

## Built-in fields

For **Weight**, **Height**, **Neck**, **Waist**, **Hips**, and **Body Fat %**, a **Use Last** button appears whenever the field is empty and a previous value exists, so logging daily takes seconds:

| Field | Notes |
| --- | --- |
| **Weight** | In your preferred unit (kg or lbs) |
| **Height** | In cm or inches |
| **Steps** | Your daily step count |
| **Neck**, **Waist**, **Hips** | Tape measurements |
| **Body Fat %** | Enter it directly, or press **Calculate** to estimate it from your measurements (tick **Use Recent** to have the estimate fill missing fields with your latest values) |
| **Muscle Mass** | From a body-composition analyzer |
| **Bone Mass** | From a body-composition analyzer |
| **Body Water %** | From a body-composition analyzer |
| **BMR (kcal)** | Your resting metabolic rate, if you have a measured value |

Fill in whatever you have: you don't need to complete every field. Press **Save Check-In** when you're done.

## Custom categories

The built-in fields don't cover everything you track. Create your own categories under **Settings → Wellness → Custom Categories**:

- Give each category a name, a unit, and a type (**numeric** or **text**)
- Every category then appears on the Measurements tab with its own input (and a **Use Last** button when empty if a previous value exists)
- Numeric entries can carry a short note (for example, the machine or circumstances of the reading)
- Each custom category gets its own trend chart in Reports

## Recent measurements

Below the form, the **Recent Measurements** list shows your latest logged weight, body metrics, and custom-category entries. You can delete entries you logged by mistake.

## See your progress

- Open **Reports → Measurements** for a chart per metric, including every custom category
- Switch to the table view, pick **Body Measurements** (or a custom category), and use **Download (CSV)** to export the full history

> [!TIP]
> Weigh yourself on the same day and at the same time of day for the cleanest trend. Day-to-day noise is normal: the charts smooth it out over weeks.

## Related pages

- [Check-In](/features/check-in)
- [Reports](/features/reports)
- [User Settings](/features/user-settings)
- [Goals](/features/goals)
