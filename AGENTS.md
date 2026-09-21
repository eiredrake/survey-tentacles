# Autonomous Agent Engineering Rules & Architecture Guardrails

## 1. Core Architecture & DRY Principles (Strict Enforcement)
- **Zero Tolerance for Duplication:** You must strictly adhere to the DRY (Don't Repeat Yourself) principle. Never write inline logic for cross-cutting or repetitive concerns.
- **Centralized Infrastructure:** All security, authentication, API communication, and session management logic MUST be centralized. 
  - **Backend (Spring Boot):** Cross-cutting concerns (e.g., CSRF validation, header extraction, logging, error handling) must use Spring Security Filters, `@ControllerAdvice`, or dedicated `@Component` utility classes. Do not handle these inside individual controllers or service methods.
  - **Frontend (Vanilla HTML/JS):** Cross-cutting concerns (e.g., fetching CSRF tokens, constructing HTTP headers, error alerting) must be routed through centralized utility functions located in the global JavaScript workspace or `api-client.js`. Do not rewrite raw `fetch` or token retrieval code inside individual code-behind scripts.
- **Discovery Directive:** Before implementing any new logic wrapper or data processing loop, you MUST scan the existing codebase for pre-existing utility functions. If a similar function exists, reuse or extend it rather than writing a new implementation.

## 2. Formatting & Visual Layout Constraints
- **Screen Width Target:** Code linefeeds, wraps, and indentation must assume a modern desktop screen target of **120 characters or more**. 
- **No Argument Line-Splitting:** Do not aggressively break lines or apply nested indents to lists of arguments passed to functions or method signatures, unless a single line strictly exceeds the 120-character ceiling. Keep function calls, parameters, and expressions horizontally unified where possible to maximize readability.
- **Indentation:** Adhere strictly to the existing indentation pattern found in the targeted file (e.g., 4 spaces for Java, 2 spaces for JS/HTML).

## 3. Pluggable Identity & Spring Security Guardrails
- **Native Spring Security Filter Chain:** All authentication and authorization rules must be managed natively within the standard Spring Security Filter Chain. Do not implement custom plain-Java interceptors, manual servlet filters, or ad-hoc security checks inside controllers.
- **Provider-Agnostic OIDC Architecture:** Current authentication is managed via standard OpenID Connect (OIDC) through an external IdP (Authentik). Rely on Spring Security's native `oauth2Login()` or OIDC mechanisms. Do not write custom code that expects Authentik-specific proxy headers.
- **Future Local Authentication Compatibility:** The database contains local user tables. The architecture must remain pluggable so that a database-backed user management system (e.g., for local admins) can eventually be registered as an alternate provider in the same Spring Security filter chain without requiring changes to business logic or controllers. Always extract the authenticated user identity via the `SecurityContextHolder` or `@AuthenticationPrincipal`.

## 4. Token Economy & Execution Constraints
- **Scope Limitation:** Do not perform sweeping, multi-file refactors or change unrelated directories unless explicitly commanded in the issue or prompt text.
- **Execution Budget Guardrail:** You are capped at a maximum of **3 autonomous correction loops** (e.g., fix -> fail test -> refix). If a task fails automated testing 3 consecutive times, stop execution immediately, print the raw stack trace/logs, and yield control to the developer. Do not burn the token budget on recursive guessing.
