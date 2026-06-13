# Development Rules

## Branching & Pull Requests

- Always work on a feature branch — never commit directly to `main`
- Branch naming: `feature/<short-description>` (e.g. `feature/version-display`)
- After pushing a feature branch, open a pull request on GitHub before merging

## Design Principles

Follow the SOLID principles in all code:

- **S**ingle Responsibility — each module/function has one reason to change
- **O**pen/Closed — open for extension, closed for modification
- **L**iskov Substitution — subtypes must be substitutable for their base types
- **I**nterface Segregation — no code should depend on interfaces it doesn't use
- **D**ependency Inversion — depend on abstractions, not concretions

## Versioning

- Use [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`)
- Version is the source of truth in `package.json`
- The running dashboard must display the version number, date of last change, and short git commit hash
