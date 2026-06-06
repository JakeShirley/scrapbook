# Project Guidelines

## User-Facing Changes

All user-facing changes must be validated locally in a browser before the work is considered complete. Run the relevant dev server or preview, open the affected page or flow, and confirm the UI renders and behaves as intended.

In the final response, state what local browser validation was performed. If browser validation is not possible, explain why and describe the fallback verification used.

## Validate Changes Locally
Before submitting a pull request, ensure that all changes have been validated locally with the appropriate NPM scripts.

## Commit Messages
When writing commit messages, use conventional commit formatting.  You can use these types of commits:
- `feat`: A new user facing feature has been added.
- `fix`: A user facing bug has been fixed.
- `refactor`: Code has been refactored without adding features or fixing bugs.
- `chore`: Changes to build process, dependencies, or other non-user facing changes.

If you are working on a GitHub issue, make sure the first line includes "(fixes #<issue number>)" to automatically link the commit to the issue.

## Committing Changes
Do not automatically commit changes when working on items unless explicitly instructed to do so.