# Visual Studio Code Copilot System Instructions

## 1. System Context & Environment
- **Stack:** Spring Boot (Java), Vanilla HTML, Vanilla JavaScript, CSS.
- **Frontend Architecture:** Static HTML files managed by DOM manipulation via dedicated JavaScript code-behind files. No monolithic frameworks (React/Angular) or template engines (Thymeleaf) are used.
- **Security & Identity:** Spring Security Filter Chain handling standard OpenID Connect (OIDC). Authentication is provider-agnostic. The app currently authenticates via OIDC but contains local database user structures to support an upcoming pluggable local-admin fallback provider.

## 2. DRY Code Guardrails & Architecture
- Do NOT generate inline utility logic for cross-cutting or repeated frontend/backend processes.
- **Frontend Logic:** All fetch mechanisms, HTTP header appending, global error alerting, and CSRF token extraction MUST route through centralized utility functions located in `api-client.js`. Never write inline `fetch` or CSRF token scraper routines inside individual code-behind scripts.
- **Backend Logic:** Cross-cutting backend concerns must live inside Spring Security filters, `@ControllerAdvice`, or `@Component` utilities. Never place manual authentication, validation loops, or context extraction directly into individual service or controller methods.
- Always check the workspace for existing utility classes or functions before writing any custom loop or helper wrapper.

## 3. Layout, Linefeeds, & Indentation Standards
- **Width Assumption:** Assume a modern wide-screen workspace layout of **120 characters or more**. 
- **Parameter Formatting:** DO NOT aggressively break lines or apply complex multi-line nested indentations to lists of arguments passed to functions or method signatures. Keep function arguments, parameters, and variable signatures unified on a single horizontal line unless a statement strictly breaches the 120-character ceiling.
- **File Structure:** Maintain the existing files' exact formatting and indentation choices (e.g., 4 spaces for Java, 2 spaces for JS/HTML).

## 4. Prompting & Token Constraints
- Keep code suggestions targeted, explicit, and minimized to the exact files requested. 
- Do not add conversational fluff or rewrite unedited boilerplate code blocks unless explicitly asked.
