# Security policy

## Reporting a vulnerability

Please do not report security vulnerabilities in a public issue or pull request.

Use [GitHub's private vulnerability reporting form](https://github.com/folkg/auto-coach/security/advisories/new). If the form is unavailable, contact the repository owner privately through GitHub and include `auto-coach security` in the subject.

Include, when possible:

- a description of the vulnerability and its impact;
- the affected commit, version, component, or workflow;
- reproducible steps or a proof of concept that does not access real user data;
- any required permissions or configuration; and
- a suggested mitigation.

The maintainer will acknowledge a report when practical, investigate it privately, and coordinate disclosure after a fix or mitigation is available. Please do not include production credentials, OAuth tokens, Yahoo refresh tokens, personal data, or live customer identifiers in a report.

## Scope and contributor safety

Auto Coach integrates with Firebase, Google Cloud, Yahoo Fantasy Sports, and SendGrid. These systems can contain user data or permit external mutations. Contributor code and pull requests must not:

- access production Firebase, Google Cloud, or SendGrid resources;
- use real Yahoo credentials or make live Yahoo mutations;
- send real email;
- commit credentials, tokens, service-account files, or personal data; or
- expose secrets to code running from a pull request.

Use Firebase emulators, mocks, fixtures, and synthetic accounts instead. Production deployment workflows run only from the protected `main` branch or an authorized manual dispatch and are not available to fork pull requests.

The Firebase browser API key in the public client configuration is not a server credential. It should still be restricted with Firebase and Google Cloud API-key controls. All other credentials must be treated as secret.

## Supported versions

The `main` branch is the supported development target. Security fixes are evaluated against the latest code on `main`; older releases are supported only when the maintainer explicitly announces support for them.
