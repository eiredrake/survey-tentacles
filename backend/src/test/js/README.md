# Single Select checks

From `backend`, with Java 21:

```powershell
.\gradlew.bat test --tests '*SingleSelect*'
```

The focused Java tests use mocks and an isolated H2 database. They cover answer validation, completion, copying, option replacement, and deletion cascades.

From `backend/src/test/js`:

```powershell
npm ci
npm test
```

The DOM tests load the actual HTML and JavaScript with mocked API responses. They cover editing choices, radio exclusivity, restoring answers, required/optional submission, disabled controls, and read-only results. They do not test live PostgreSQL or OIDC login. The existing full application-startup test needs database and OAuth configuration.
