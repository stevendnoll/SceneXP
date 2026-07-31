# Security Policy

Thank you for helping keep SceneXP and its visitors safe. Security reports are always welcome, and we are grateful for the time it takes to prepare one.

## Supported versions

SceneXP is a static site served from the latest commit on the `main` branch. Only the current `main` receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately rather than opening a public issue:

1. **GitHub private vulnerability reporting.** Use the "Report a vulnerability" button on this repository's Security tab.
2. **The site's contact page.** If you prefer email, request the address through the [contact page](https://www.scenexp.com/contact.html) and mention that your message concerns security.

Please include the affected page or file, steps to reproduce, and what you believe the impact is. A proof of concept is appreciated but not required.

## What to expect

We will acknowledge your report as quickly as we can, usually within a few days, and keep you informed while we investigate and fix the issue. If you would like credit once the fix ships, we are happy to thank you by name.

## Dependency hygiene

`npm audit` reports zero vulnerabilities at the time of writing. One pin helps keep it that way: `package.json` uses an npm override to hold `brace-expansion` (a transitive dependency of the test tooling) at its patched major version, verified by the full test and coverage runs. Please leave the override in place unless both still pass without it.

## Scope

This repository contains only client-side code. Every page ships a strict same-origin Content Security Policy, and the site sets no cookies and loads no third-party resources. Reports about the production servers that host www.scenexp.com are welcome through the same channels, though that infrastructure lives outside this repository.
