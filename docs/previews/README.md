# Application screenshots

Desktop screenshots of the Acme demo in light and dark mode. These captures show an earlier layout and illustrate the main pages and controls.

## Pages

| View                    | Light                                  | Dark                                 |
| ----------------------- | -------------------------------------- | ------------------------------------ |
| Welcome                 | [Light](acme-welcome-light.jpg)        | [Dark](acme-welcome-dark.jpg)        |
| Overview                | [Light](acme-overview-light.jpg)       | [Dark](acme-overview-dark.jpg)       |
| Projects                | [Light](acme-projects-light.jpg)       | [Dark](acme-projects-dark.jpg)       |
| Project details         | [Light](acme-project-detail-light.jpg) | [Dark](acme-project-detail-dark.jpg) |
| Components — Controls   | [Light](acme-controls-light.jpg)       | [Dark](acme-controls-dark.jpg)       |
| Components — Appearance | [Light](acme-appearance-light.jpg)     | [Dark](acme-appearance-dark.jpg)     |
| Session                 | [Light](acme-session-light.jpg)        | [Dark](acme-session-dark.jpg)        |

## Project forms, dialogs, and navigation

| View              | Light                                     | Dark                                    |
| ----------------- | ----------------------------------------- | --------------------------------------- |
| Create project    | [Light](acme-create-project-light.jpg)    | [Dark](acme-create-project-dark.jpg)    |
| Edit project      | [Light](acme-edit-project-light.jpg)      | [Dark](acme-edit-project-dark.jpg)      |
| Demo role chooser | [Light](acme-demo-dialog-light.jpg)       | [Dark](acme-demo-dialog-dark.jpg)       |
| Collapsed sidebar | [Light](acme-sidebar-collapsed-light.jpg) | [Dark](acme-sidebar-collapsed-dark.jpg) |

## Loading states

The captures show the loading layouts while GraphQL data is pending.

| State                             | Capture                                      |
| --------------------------------- | -------------------------------------------- |
| Initial session discovery — light | [Light](acme-loading.jpg)                    |
| Initial session discovery — dark  | [Dark](acme-loading-shell-dark.jpg)          |
| Overview data pending             | [Light](acme-loading-overview-light.jpg)     |
| Project results pending           | [Light](acme-loading-projects-light.jpg)     |
| Project details pending           | [Dark](acme-loading-project-detail-dark.jpg) |
| Session details pending           | [Dark](acme-loading-session-dark.jpg)        |

Loading views show the page's logo, navigation, headings, and controls. Placeholders cover unresolved values and rows. Session-dependent controls are disabled until the viewer is known. See [Static routing](../static-routing.md) for how the Go binary serves these layouts on direct visits.
