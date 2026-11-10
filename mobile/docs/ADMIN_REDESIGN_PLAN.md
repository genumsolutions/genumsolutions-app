# Admin dashboard and user preference redesign plan

## Goal

Make the admin console and user preferences easier to scan: fewer tabs, plain English labels, one record per project, and a clear path from a user to their projects.

## Tab layout (8 tabs)

1. Dashboard
2. Orders
3. Electronic Products
4. 3D Products
5. Projects
6. Content
7. Users (merged with the old Logs tab: user directory, project profiles, activity, diagnostics)
8. Settings (company information, customer messages, newsletter subscribers)

The website (`components/admin/admin-types.ts`) and the app (`src/config/adminTabs.ts`) must keep the same list and hints. Both parity tests enforce this.

## User and project profiles

- Show the project name first. Technical IDs, connection IDs and raw settings stay in a "Technical details" section.
- Each connected car/project keeps one stable identity (firmware board id, Bluetooth MAC, or Wi-Fi identity). Never show two identities for the same car.
- When the same board id appears under more than one transport key, the app merges those rows into one record keyed by the firmware board id.
- User preferences group devices by project, with rename, edit and forget actions in one place.
- Admin car/project profiles use the same plain-language labels as the app.

## Project categories

- Robo Car projects group every car kit.
- Drones, Smart Home, Smart City, Smart Farm, Smart Dustbin and Remote Controller stay as their own categories.

## Documentation rule

`docs/APP_WEBSITE_UI_COMPARISON.md` must stay identical in both repositories. Any admin or preference change updates both copies in the same change.
